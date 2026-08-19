import { and, asc, count, desc, eq, gt, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import type { Db } from "./db";
import {
  activities,
  availability,
  boards,
  companies,
  contacts,
  documents,
  jobContacts,
  jobs,
  notes,
  profile,
  stageEvents,
  stages,
  type ActivityCategory,
  type ContactRole,
  type DocumentKind,
} from "./schema";

export const DEFAULT_STAGES = [
  "wishlist",
  "applied",
  "interview",
  "offer",
  "rejected",
] as const;

const POSITION_GAP = 1024;

/**
 * Classify an interview-ish activity title into a round type. Used by the
 * metrics funnel and by tooling that filters for the activities the funnel
 * reports as unclassified.
 */
const ROUND_PATTERNS = {
  screen: /phone screen|phone interview|screening|recruiter (call|screen|chat)|intro call/i,
  hm: /hiring manager|\bhm\b/i,
  technical: /technical|coding|system design|pair programming|take[- ]home|architecture/i,
  final: /final|onsite|on-site|panel/i,
} as const;

export function classifyInterviewTitle(
  title: string,
): "screen" | "hm" | "technical" | "final" | null {
  for (const key of ["screen", "hm", "technical", "final"] as const) {
    if (ROUND_PATTERNS[key].test(title)) return key;
  }
  return null;
}

export function createServices(db: Db) {
  // ---- boards / stages ----

  function getOrCreateDefaultBoard(name = "Job Search") {
    const existing = db.select().from(boards).limit(1).all()[0];
    if (existing) return existing;
    const board = db.insert(boards).values({ name }).returning().get();
    DEFAULT_STAGES.forEach((stageName, i) => {
      db.insert(stages)
        .values({ boardId: board.id, name: stageName, position: i })
        .run();
    });
    return board;
  }

  function listStages(boardId: number) {
    return db
      .select()
      .from(stages)
      .where(eq(stages.boardId, boardId))
      .orderBy(asc(stages.position))
      .all();
  }

  function getStageByName(boardId: number, name: string) {
    return db
      .select()
      .from(stages)
      .where(and(eq(stages.boardId, boardId), eq(stages.name, name)))
      .get();
  }

  // ---- companies ----

  function findOrCreateCompany(name: string) {
    const trimmed = name.trim();
    const existing = db
      .select()
      .from(companies)
      .where(eq(companies.name, trimmed))
      .get();
    if (existing) return existing;
    return db.insert(companies).values({ name: trimmed }).returning().get();
  }

  function updateCompany(id: number, patch: Partial<typeof companies.$inferInsert>) {
    return db
      .update(companies)
      .set(patch)
      .where(eq(companies.id, id))
      .returning()
      .get();
  }

  function getCompany(id: number) {
    return db.select().from(companies).where(eq(companies.id, id)).get();
  }

  function listCompanies() {
    return db.select().from(companies).orderBy(asc(companies.name)).all();
  }

  // ---- jobs ----

  function nextPositionInStage(stageId: number): number {
    const row = db
      .select({ max: sql<number | null>`max(${jobs.position})` })
      .from(jobs)
      .where(eq(jobs.stageId, stageId))
      .get();
    return (row?.max ?? 0) + POSITION_GAP;
  }

  type CreateJobInput = {
    title: string;
    company?: string;
    stageId?: number;
    stageName?: string;
    location?: string;
    url?: string;
    salary?: string;
    color?: string;
    description?: string;
    deadline?: Date;
    createdAt?: Date;
    appliedAt?: Date;
    rejectedAt?: Date;
    sourceId?: string;
    extras?: unknown;
  };

  function createJob(input: CreateJobInput) {
    const board = getOrCreateDefaultBoard();
    let stageId = input.stageId;
    if (!stageId) {
      const stage = getStageByName(board.id, input.stageName ?? "wishlist");
      if (!stage) throw new Error(`unknown stage: ${input.stageName}`);
      stageId = stage.id;
    }
    const companyId = input.company
      ? findOrCreateCompany(input.company).id
      : undefined;
    const job = db
      .insert(jobs)
      .values({
        boardId: board.id,
        stageId,
        title: input.title,
        companyId,
        location: input.location,
        url: input.url,
        salary: input.salary,
        color: input.color,
        description: input.description,
        deadline: input.deadline,
        position: nextPositionInStage(stageId),
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
        appliedAt: input.appliedAt,
        rejectedAt: input.rejectedAt,
        sourceId: input.sourceId,
        extras: input.extras,
      })
      .returning()
      .get();
    db.insert(stageEvents)
      .values({
        jobId: job.id,
        toStageId: stageId,
        movedAt: input.createdAt ?? job.createdAt,
      })
      .run();
    return job;
  }

  function getJob(id: number) {
    const job = db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!job) return undefined;
    const company = job.companyId ? getCompany(job.companyId) : undefined;
    const stage = db.select().from(stages).where(eq(stages.id, job.stageId)).get();
    return { ...job, company, stage };
  }

  function updateJob(id: number, patch: Partial<typeof jobs.$inferInsert> & { company?: string }) {
    const { company, ...rest } = patch;
    const values: Partial<typeof jobs.$inferInsert> = { ...rest };
    if (company !== undefined) {
      values.companyId = company ? findOrCreateCompany(company).id : null;
    }
    return db.update(jobs).set(values).where(eq(jobs.id, id)).returning().get();
  }

  function deleteJob(id: number) {
    db.delete(jobs).where(eq(jobs.id, id)).run();
  }

  function findJobByUrl(url: string) {
    // Archived jobs don't count as duplicates — recapturing a posting whose
    // old card was archived starts a fresh card.
    return db
      .select()
      .from(jobs)
      .where(and(eq(jobs.url, url), isNull(jobs.archivedAt)))
      .get();
  }

  // ---- archive / merge ----

  /** Reversible soft delete: hides the job everywhere, keeps its children. */
  function archiveJob(id: number) {
    return db
      .update(jobs)
      .set({ archivedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning()
      .get();
  }

  function restoreJob(id: number) {
    return db
      .update(jobs)
      .set({ archivedAt: null })
      .where(eq(jobs.id, id))
      .returning()
      .get();
  }

  function listArchived() {
    return db
      .select({
        id: jobs.id,
        title: jobs.title,
        companyName: companies.name,
        stageId: jobs.stageId,
        url: jobs.url,
        archivedAt: jobs.archivedAt,
      })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(isNotNull(jobs.archivedAt))
      .orderBy(desc(jobs.archivedAt))
      .all();
  }

  /**
   * Consolidate a duplicate: move all activities and notes from source to
   * target, fill target fields that are empty from source (url, salary,
   * location, description, source, appliedAt), record the merge as a note on
   * target, keep target's stage, and archive source (reversible). Throws a
   * descriptive Error on invalid input.
   */
  function mergeJobs(sourceId: number, targetId: number) {
    return db.transaction(() => {
      if (sourceId === targetId) {
        throw new Error(`cannot merge job #${sourceId} into itself`);
      }
      const source = db.select().from(jobs).where(eq(jobs.id, sourceId)).get();
      const target = db.select().from(jobs).where(eq(jobs.id, targetId)).get();
      if (!source) throw new Error(`source job #${sourceId} does not exist`);
      if (!target) throw new Error(`target job #${targetId} does not exist`);
      if (source.archivedAt) throw new Error(`source job #${sourceId} is archived — restore it first`);
      if (target.archivedAt) throw new Error(`target job #${targetId} is archived — restore it first`);

      db.update(activities).set({ jobId: targetId }).where(eq(activities.jobId, sourceId)).run();
      db.update(notes).set({ jobId: targetId }).where(eq(notes.jobId, sourceId)).run();

      const fill: Partial<typeof jobs.$inferInsert> = {};
      for (const key of ["url", "salary", "location", "description", "source", "appliedAt"] as const) {
        if (!target[key] && source[key]) {
          (fill as Record<string, unknown>)[key] = source[key];
        }
      }
      if (Object.keys(fill).length > 0) {
        db.update(jobs).set(fill).where(eq(jobs.id, targetId)).run();
      }

      const company = source.companyId ? getCompany(source.companyId)?.name : null;
      db.insert(notes)
        .values({
          jobId: targetId,
          body:
            `Merged job #${sourceId} "${source.title}"${company ? ` (${company})` : ""} ` +
            `into this card on ${new Date().toISOString().slice(0, 10)}. ` +
            `Its activities and notes were moved here; the source card was archived.`,
        })
        .run();

      db.update(jobs).set({ archivedAt: new Date() }).where(eq(jobs.id, sourceId)).run();
      return db.select().from(jobs).where(eq(jobs.id, targetId)).get()!;
    });
  }

  type ListJobsFilter = { stageId?: number; stageName?: string; query?: string };

  function listJobs(filter: ListJobsFilter = {}) {
    const board = getOrCreateDefaultBoard();
    let stageId = filter.stageId;
    if (!stageId && filter.stageName) {
      stageId = getStageByName(board.id, filter.stageName)?.id;
      if (!stageId) return [];
    }
    const conditions = [eq(jobs.boardId, board.id), isNull(jobs.archivedAt)];
    if (stageId) conditions.push(eq(jobs.stageId, stageId));
    if (filter.query) {
      const pattern = `%${filter.query}%`;
      conditions.push(
        or(like(jobs.title, pattern), like(companies.name, pattern))!,
      );
    }
    return db
      .select({
        id: jobs.id,
        title: jobs.title,
        stageId: jobs.stageId,
        companyId: jobs.companyId,
        companyName: companies.name,
        companyWebsite: companies.website,
        location: jobs.location,
        url: jobs.url,
        salary: jobs.salary,
        color: jobs.color,
        deadline: jobs.deadline,
        position: jobs.position,
        createdAt: jobs.createdAt,
        appliedAt: jobs.appliedAt,
        rejectedAt: jobs.rejectedAt,
      })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(and(...conditions))
      .orderBy(asc(jobs.stageId), asc(jobs.position))
      .all();
  }

  /**
   * Move a job to a stage, placing it before the job currently at `index`
   * (0 = top). Omitting `index` appends to the bottom. Updates position,
   * stage timestamps, and the stage-event history in one transaction.
   */
  function moveJob(
    id: number,
    target: { stageId?: number; stageName?: string; index?: number },
    movedAt: Date = new Date(),
  ) {
    return db.transaction(() => {
      const job = db.select().from(jobs).where(eq(jobs.id, id)).get();
      if (!job) throw new Error(`job ${id} not found`);
      let stageId = target.stageId;
      if (!stageId) {
        const stage = getStageByName(job.boardId, target.stageName ?? "");
        if (!stage) throw new Error(`unknown stage: ${target.stageName}`);
        stageId = stage.id;
      }
      const siblings = db
        .select({ id: jobs.id, position: jobs.position })
        .from(jobs)
        .where(and(eq(jobs.stageId, stageId), sql`${jobs.id} != ${id}`))
        .orderBy(asc(jobs.position))
        .all();

      let position: number;
      const index = target.index;
      if (index === undefined || index >= siblings.length) {
        position = (siblings[siblings.length - 1]?.position ?? 0) + POSITION_GAP;
      } else if (index <= 0) {
        position = (siblings[0]?.position ?? POSITION_GAP * 2) / 2;
      } else {
        const before = siblings[index - 1]!.position;
        const after = siblings[index]!.position;
        position = (before + after) / 2;
        if (after - before < 1e-6) {
          // Positions too dense to bisect; renumber the stage.
          siblings.forEach((s, i) => {
            db.update(jobs)
              .set({ position: (i + 1) * POSITION_GAP })
              .where(eq(jobs.id, s.id))
              .run();
          });
          position = index * POSITION_GAP + POSITION_GAP / 2;
        }
      }

      const values: Partial<typeof jobs.$inferInsert> = { stageId, position };
      if (stageId !== job.stageId) {
        const stage = db.select().from(stages).where(eq(stages.id, stageId)).get();
        if (stage?.name === "applied" && !job.appliedAt) values.appliedAt = movedAt;
        if (stage?.name === "rejected" && !job.rejectedAt) values.rejectedAt = movedAt;
        db.insert(stageEvents)
          .values({ jobId: id, fromStageId: job.stageId, toStageId: stageId, movedAt })
          .run();
      }
      return db.update(jobs).set(values).where(eq(jobs.id, id)).returning().get();
    });
  }

  /** Everything the board page needs in one call. */
  function boardSnapshot() {
    const board = getOrCreateDefaultBoard();
    const stageList = listStages(board.id);
    const jobList = listJobs();
    const pending = db
      .select({ jobId: activities.jobId, n: count() })
      .from(activities)
      .where(isNull(activities.completedAt))
      .groupBy(activities.jobId)
      .all();
    const pendingByJob = new Map(pending.map((p) => [p.jobId, p.n]));
    return {
      board,
      stages: stageList.map((stage) => ({
        ...stage,
        jobs: jobList
          .filter((j) => j.stageId === stage.id)
          .map((j) => ({ ...j, pendingActivities: pendingByJob.get(j.id) ?? 0 })),
      })),
    };
  }

  // ---- activities ----

  function listActivities(jobId: number) {
    return db
      .select()
      .from(activities)
      .where(eq(activities.jobId, jobId))
      .orderBy(desc(activities.createdAt))
      .all();
  }

  /** Activities across the whole board, with job and company context. */
  function listActivitiesAcrossJobs(
    filter: { jobId?: number; category?: ActivityCategory } = {},
  ) {
    const conditions = [isNull(jobs.archivedAt)];
    if (filter.jobId) conditions.push(eq(activities.jobId, filter.jobId));
    if (filter.category) conditions.push(eq(activities.category, filter.category));
    return db
      .select({
        id: activities.id,
        jobId: activities.jobId,
        category: activities.category,
        title: activities.title,
        note: activities.note,
        dueAt: activities.dueAt,
        completedAt: activities.completedAt,
        createdAt: activities.createdAt,
        jobTitle: jobs.title,
        companyName: companies.name,
      })
      .from(activities)
      .innerJoin(jobs, eq(activities.jobId, jobs.id))
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(activities.createdAt))
      .all();
  }

  function createActivity(input: {
    jobId: number;
    category: ActivityCategory;
    title: string;
    note?: string;
    dueAt?: Date;
    completedAt?: Date;
    startsAt?: Date;
    endsAt?: Date;
    timezone?: string;
    meetingUrl?: string;
    meetingId?: string;
    meetingPasscode?: string;
    interviewerName?: string;
    interviewerTitle?: string;
    createdAt?: Date;
    sourceId?: string;
    extras?: unknown;
  }) {
    return db.insert(activities).values(input).returning().get();
  }

  function updateActivity(
    id: number,
    patch: Partial<typeof activities.$inferInsert>,
  ) {
    return db
      .update(activities)
      .set(patch)
      .where(eq(activities.id, id))
      .returning()
      .get();
  }

  function deleteActivity(id: number) {
    db.delete(activities).where(eq(activities.id, id)).run();
  }

  /**
   * Scheduling sanity check over activities that carry real times (on live
   * jobs only). Returns pairs that overlap outright and pairs closer
   * together than gapMinutes.
   */
  function findConflicts(from: Date, to: Date, gapMinutes = 0) {
    const rows = db
      .select({
        id: activities.id,
        title: activities.title,
        startsAt: activities.startsAt,
        endsAt: activities.endsAt,
        jobId: activities.jobId,
        jobTitle: jobs.title,
        companyName: companies.name,
      })
      .from(activities)
      .innerJoin(jobs, and(eq(activities.jobId, jobs.id), isNull(jobs.archivedAt)))
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(and(isNotNull(activities.startsAt), isNotNull(activities.endsAt)))
      .all()
      .filter((a) => a.endsAt! > from && a.startsAt! < to)
      .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime());

    const overlaps: { a: (typeof rows)[number]; b: (typeof rows)[number] }[] = [];
    const tight: { a: (typeof rows)[number]; b: (typeof rows)[number]; gapMinutes: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i]!;
        const b = rows[j]!;
        if (b.startsAt! < a.endsAt!) {
          overlaps.push({ a, b });
        } else {
          const gap = (b.startsAt!.getTime() - a.endsAt!.getTime()) / 60_000;
          if (gapMinutes > 0 && gap < gapMinutes) tight.push({ a, b, gapMinutes: gap });
        }
      }
    }
    return { overlaps, tight };
  }

  // ---- availability windows ----

  function addAvailability(startAt: Date, endAt: Date, note?: string) {
    return db.insert(availability).values({ startAt, endAt, note }).returning().get();
  }

  function listAvailability(from: Date, to: Date) {
    return db
      .select()
      .from(availability)
      .all()
      .filter((w) => w.endAt > from && w.startAt < to)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }

  function markAvailabilityTaken(id: number, activityId: number) {
    return db
      .update(availability)
      .set({ takenByActivityId: activityId })
      .where(eq(availability.id, id))
      .returning()
      .get();
  }

  // ---- notes ----

  function listNotes(jobId: number) {
    return db
      .select()
      .from(notes)
      .where(eq(notes.jobId, jobId))
      .orderBy(desc(notes.createdAt))
      .all();
  }

  function createNote(input: {
    jobId: number;
    body: string;
    createdAt?: Date;
    sourceId?: string;
  }) {
    return db.insert(notes).values(input).returning().get();
  }

  function updateNote(id: number, body: string) {
    return db.update(notes).set({ body }).where(eq(notes.id, id)).returning().get();
  }

  function deleteNote(id: number) {
    db.delete(notes).where(eq(notes.id, id)).run();
  }

  // ---- contacts ----

  function listContacts() {
    return db.select().from(contacts).orderBy(asc(contacts.name)).all();
  }

  function listContactsForJob(jobId: number) {
    return db
      .select({
        id: contacts.id,
        name: contacts.name,
        title: contacts.title,
        companyId: contacts.companyId,
        email: contacts.email,
        phone: contacts.phone,
        linkedin: contacts.linkedin,
        notes: contacts.notes,
        role: jobContacts.role,
      })
      .from(contacts)
      .innerJoin(jobContacts, eq(jobContacts.contactId, contacts.id))
      .where(eq(jobContacts.jobId, jobId))
      .all();
  }

  /**
   * Create a contact and link it to a job with a role in one step (or attach
   * a role to an existing link). Matches an existing contact by exact name +
   * email to avoid duplicating people who appear on several jobs.
   */
  function addContactToJob(
    jobId: number,
    input: {
      name: string;
      email?: string;
      phone?: string;
      title?: string;
      company?: string;
      role?: ContactRole;
    },
  ) {
    return db.transaction(() => {
      const existing = db
        .select()
        .from(contacts)
        .where(eq(contacts.name, input.name))
        .all()
        .find((c) => (input.email ? c.email === input.email : true));
      const contact =
        existing ??
        db
          .insert(contacts)
          .values({
            name: input.name,
            email: input.email,
            phone: input.phone,
            title: input.title,
            companyId: input.company ? findOrCreateCompany(input.company).id : undefined,
          })
          .returning()
          .get();
      db.insert(jobContacts)
        .values({ jobId, contactId: contact.id, role: input.role })
        .onConflictDoUpdate({
          target: [jobContacts.jobId, jobContacts.contactId],
          set: { role: input.role },
        })
        .run();
      return { ...contact, role: input.role ?? null };
    });
  }

  function createContact(input: typeof contacts.$inferInsert) {
    return db.insert(contacts).values(input).returning().get();
  }

  function updateContact(id: number, patch: Partial<typeof contacts.$inferInsert>) {
    return db
      .update(contacts)
      .set(patch)
      .where(eq(contacts.id, id))
      .returning()
      .get();
  }

  function deleteContact(id: number) {
    db.delete(contacts).where(eq(contacts.id, id)).run();
  }

  function linkContact(jobId: number, contactId: number) {
    db.insert(jobContacts)
      .values({ jobId, contactId })
      .onConflictDoNothing()
      .run();
  }

  function unlinkContact(jobId: number, contactId: number) {
    db.delete(jobContacts)
      .where(and(eq(jobContacts.jobId, jobId), eq(jobContacts.contactId, contactId)))
      .run();
  }

  // ---- documents ----

  function listDocuments(jobId: number) {
    return db
      .select()
      .from(documents)
      .where(eq(documents.jobId, jobId))
      .orderBy(desc(documents.createdAt))
      .all();
  }

  function createDocument(input: {
    jobId: number;
    kind: DocumentKind;
    filename: string;
    path?: string;
    createdAt?: Date;
    sourceId?: string;
  }) {
    return db.insert(documents).values(input).returning().get();
  }

  function getDocument(id: number) {
    return db.select().from(documents).where(eq(documents.id, id)).get();
  }

  function deleteDocument(id: number) {
    const doc = db.select().from(documents).where(eq(documents.id, id)).get();
    db.delete(documents).where(eq(documents.id, id)).run();
    return doc;
  }

  // ---- profile (single row, id = 1) ----

  function getProfile() {
    const row = db.select().from(profile).where(eq(profile.id, 1)).get();
    return row ?? db.insert(profile).values({ id: 1 }).returning().get();
  }

  function saveProfile(patch: Partial<Omit<typeof profile.$inferInsert, "id">>) {
    getProfile(); // ensure the row exists
    return db
      .update(profile)
      .set(patch)
      .where(eq(profile.id, 1))
      .returning()
      .get();
  }

  // ---- search ----

  function search(query: string) {
    const pattern = `%${query}%`;
    return db
      .select({
        id: jobs.id,
        title: jobs.title,
        companyName: companies.name,
        stageName: stages.name,
        location: jobs.location,
      })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .innerJoin(stages, eq(jobs.stageId, stages.id))
      .where(
        and(
          isNull(jobs.archivedAt),
          or(
            like(jobs.title, pattern),
            like(companies.name, pattern),
            like(jobs.location, pattern),
          ),
        ),
      )
      .limit(50)
      .all();
  }

  // ---- metrics ----

  const DAY_MS = 24 * 60 * 60 * 1000;

  function totalsPerStage() {
    const board = getOrCreateDefaultBoard();
    return db
      .select({ stageId: stages.id, stage: stages.name, total: count(jobs.id) })
      .from(stages)
      .leftJoin(jobs, and(eq(jobs.stageId, stages.id), isNull(jobs.archivedAt)))
      .where(eq(stages.boardId, board.id))
      .groupBy(stages.id)
      .orderBy(asc(stages.position))
      .all();
  }

  /** Monday-based week start for a given date. */
  function weekStart(d: Date): string {
    const date = new Date(d);
    const day = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - day);
    return date.toISOString().slice(0, 10);
  }

  function applicationsPerWeek(weeks = 26) {
    const since = new Date(Date.now() - weeks * 7 * DAY_MS);
    const rows = db
      .select({ appliedAt: jobs.appliedAt })
      .from(jobs)
      .where(
        and(
          isNotNull(jobs.appliedAt),
          gt(jobs.appliedAt, since),
          isNull(jobs.archivedAt),
        ),
      )
      .all();
    const buckets = new Map<string, number>();
    for (const row of rows) {
      const key = weekStart(row.appliedAt!);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, applications]) => ({ week, applications }));
  }

  /** Jobs that have ever been in each stage, from the stage-event history. */
  function everInStageCounts(): Map<string, number> {
    const rows = db
      .select({
        stage: stages.name,
        n: sql<number>`count(distinct ${stageEvents.jobId})`,
      })
      .from(stageEvents)
      .innerJoin(stages, eq(stageEvents.toStageId, stages.id))
      .innerJoin(jobs, and(eq(stageEvents.jobId, jobs.id), isNull(jobs.archivedAt)))
      .groupBy(stages.name)
      .all();
    return new Map(rows.map((r) => [r.stage, r.n]));
  }

  function conversionRates() {
    const ever = everInStageCounts();
    const applied = ever.get("applied") ?? 0;
    const interview = ever.get("interview") ?? 0;
    const offer = ever.get("offer") ?? 0;
    const rate = (num: number, den: number) => (den === 0 ? 0 : num / den);
    return {
      appliedToInterview: rate(interview, applied),
      interviewToOffer: rate(offer, interview),
      appliedToOffer: rate(offer, applied),
    };
  }

  /**
   * Average days a job spends in each stage, from stage-event history.
   * Open intervals (job still in the stage) are excluded.
   */
  function averageDaysInStage() {
    const events = db
      .select({
        jobId: stageEvents.jobId,
        toStageId: stageEvents.toStageId,
        movedAt: stageEvents.movedAt,
      })
      .from(stageEvents)
      .innerJoin(jobs, and(eq(stageEvents.jobId, jobs.id), isNull(jobs.archivedAt)))
      .orderBy(asc(stageEvents.jobId), asc(stageEvents.movedAt))
      .all();
    const stageById = new Map(
      db.select().from(stages).all().map((s) => [s.id, s.name]),
    );
    const durations = new Map<string, { totalMs: number; n: number }>();
    for (let i = 0; i < events.length; i++) {
      const cur = events[i]!;
      const next = events[i + 1];
      if (!next || next.jobId !== cur.jobId) continue;
      const name = stageById.get(cur.toStageId);
      if (!name) continue;
      const bucket = durations.get(name) ?? { totalMs: 0, n: 0 };
      bucket.totalMs += next.movedAt.getTime() - cur.movedAt.getTime();
      bucket.n += 1;
      durations.set(name, bucket);
    }
    return [...durations.entries()].map(([stage, { totalMs, n }]) => ({
      stage,
      avgDays: totalMs / n / DAY_MS,
    }));
  }

  /**
   * Share of applied jobs that got any response: moved on to interview/offer
   * or were rejected.
   */
  function responseRate() {
    const applied = db
      .select({ n: count() })
      .from(jobs)
      .where(and(isNotNull(jobs.appliedAt), isNull(jobs.archivedAt)))
      .get()!.n;
    if (applied === 0) return { applied, responded: 0, rate: 0 };
    // A job can be both interviewed and later rejected; count distinct jobs.
    const respondedRows = db
      .select({ n: sql<number>`count(distinct ${jobs.id})` })
      .from(jobs)
      .leftJoin(stageEvents, eq(stageEvents.jobId, jobs.id))
      .leftJoin(stages, eq(stageEvents.toStageId, stages.id))
      .where(
        and(
          isNotNull(jobs.appliedAt),
          isNull(jobs.archivedAt),
          or(
            isNotNull(jobs.rejectedAt),
            eq(stages.name, "interview"),
            eq(stages.name, "offer"),
          ),
        ),
      )
      .get()!.n;
    return { applied, responded: respondedRows, rate: respondedRows / applied };
  }

  /**
   * Classify interview activities into rounds. Tagged categories win; for
   * data imported with a bare "interview" category, fall back to keywords in
   * the title. Whatever can't be classified is reported as such rather than
   * guessed.
   */
  function interviewFunnel() {
    const rows = db
      .select({ category: activities.category, title: activities.title })
      .from(activities)
      .innerJoin(jobs, and(eq(activities.jobId, jobs.id), isNull(jobs.archivedAt)))
      .all();
    const funnel = { screens: 0, hmRounds: 0, technicalRounds: 0, finalRounds: 0, unclassifiedInterviews: 0, offers: 0 };
    for (const row of rows) {
      if (row.category === "apply" || row.category === "follow_up") continue;
      if (row.category === "offer") { funnel.offers++; continue; }
      if (row.category === "screen") { funnel.screens++; continue; }
      if (row.category === "hm") { funnel.hmRounds++; continue; }
      if (row.category === "technical") { funnel.technicalRounds++; continue; }
      if (row.category === "final") { funnel.finalRounds++; continue; }
      // Generic "interview" (or interview-looking "other"): classify by title.
      const round = classifyInterviewTitle(row.title);
      if (round === "screen") funnel.screens++;
      else if (round === "hm") funnel.hmRounds++;
      else if (round === "technical") funnel.technicalRounds++;
      else if (round === "final") funnel.finalRounds++;
      else if (row.category === "interview") funnel.unclassifiedInterviews++;
      // an unmatched "other" is not an interview — skip it
    }
    return funnel;
  }

  /**
   * Where opportunities came from, counted in jobs and distinct companies.
   * An untagged job that has an applied date is assumed to be a cold
   * application (that's what creates an applied date); untagged jobs without
   * one are reported as untagged, never guessed.
   */
  function sourceBreakdown() {
    const rows = db
      .select({ source: jobs.source, appliedAt: jobs.appliedAt, companyId: jobs.companyId })
      .from(jobs)
      .where(isNull(jobs.archivedAt))
      .all();
    const buckets = new Map<string, { jobs: number; companies: Set<number | null> }>();
    for (const row of rows) {
      const key = row.source ?? (row.appliedAt ? "applied" : "untagged");
      const bucket = buckets.get(key) ?? { jobs: 0, companies: new Set() };
      bucket.jobs++;
      bucket.companies.add(row.companyId);
      buckets.set(key, bucket);
    }
    const order = ["applied", "reachout", "referral", "other", "untagged"];
    return order
      .filter((key) => buckets.has(key))
      .map((key) => ({
        source: key,
        jobs: buckets.get(key)!.jobs,
        companies: buckets.get(key)!.companies.size,
      }));
  }

  /**
   * Remove one stage change from a job's history (e.g. an accidental move),
   * splicing the chain so the following event's "from" points at the stage
   * before the deleted one. All history-derived metrics recompute from the
   * corrected chain.
   */
  function deleteStageEvent(id: number) {
    db.transaction(() => {
      const event = db.select().from(stageEvents).where(eq(stageEvents.id, id)).get();
      if (!event) return;
      const next = db
        .select()
        .from(stageEvents)
        .where(
          and(
            eq(stageEvents.jobId, event.jobId),
            eq(stageEvents.fromStageId, event.toStageId),
            sql`${stageEvents.movedAt} >= ${event.movedAt.getTime()}`,
            sql`${stageEvents.id} != ${event.id}`,
          ),
        )
        .orderBy(asc(stageEvents.movedAt))
        .limit(1)
        .all()[0];
      if (next) {
        db.update(stageEvents)
          .set({ fromStageId: event.fromStageId })
          .where(eq(stageEvents.id, next.id))
          .run();
      }
      db.delete(stageEvents).where(eq(stageEvents.id, id)).run();
    });
  }

  /** Stage-change history for one job, with stage names, newest first. */
  function listStageEvents(jobId: number) {
    const stageById = new Map(db.select().from(stages).all().map((s) => [s.id, s.name]));
    return db
      .select()
      .from(stageEvents)
      .where(eq(stageEvents.jobId, jobId))
      .orderBy(desc(stageEvents.movedAt))
      .all()
      .map((e) => ({
        id: e.id,
        from: e.fromStageId ? (stageById.get(e.fromStageId) ?? null) : null,
        to: stageById.get(e.toStageId) ?? "?",
        movedAt: e.movedAt,
      }));
  }

  function getMetrics() {
    return {
      totalsPerStage: totalsPerStage(),
      applicationsPerWeek: applicationsPerWeek(),
      conversionRates: conversionRates(),
      averageDaysInStage: averageDaysInStage(),
      responseRate: responseRate(),
      interviewFunnel: interviewFunnel(),
      sourceBreakdown: sourceBreakdown(),
    };
  }

  return {
    getOrCreateDefaultBoard,
    listStages,
    getStageByName,
    findOrCreateCompany,
    updateCompany,
    getCompany,
    listCompanies,
    createJob,
    getJob,
    updateJob,
    deleteJob,
    archiveJob,
    restoreJob,
    listArchived,
    mergeJobs,
    findJobByUrl,
    listJobs,
    moveJob,
    boardSnapshot,
    listActivities,
    listActivitiesAcrossJobs,
    createActivity,
    updateActivity,
    deleteActivity,
    findConflicts,
    addAvailability,
    listAvailability,
    markAvailabilityTaken,
    addContactToJob,
    listNotes,
    createNote,
    updateNote,
    deleteNote,
    listContacts,
    listContactsForJob,
    createContact,
    updateContact,
    deleteContact,
    linkContact,
    unlinkContact,
    listDocuments,
    createDocument,
    getDocument,
    deleteDocument,
    getProfile,
    saveProfile,
    search,
    getMetrics,
    interviewFunnel,
    sourceBreakdown,
    listStageEvents,
    deleteStageEvent,
    totalsPerStage,
    applicationsPerWeek,
    conversionRates,
    averageDaysInStage,
    responseRate,
  };
}

export type Services = ReturnType<typeof createServices>;
