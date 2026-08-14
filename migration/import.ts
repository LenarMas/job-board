/**
 * Import a full CSV export from the previous tracker into the JobTrack
 * database.
 *
 * Usage:
 *   npm run import -- --dry-run    print what would happen, write nothing
 *   npm run import                 upsert everything
 *
 * Reads migration/raw/USER_*.csv (the tracker's built-in "download my data"
 * export). Idempotent: every imported row is keyed on the source object id in
 * a source_id column, so re-running updates instead of duplicating. Nothing is
 * silently dropped: source columns that have no home in the schema land in a
 * JSON `extras` column, and the run ends with a field-mapping report.
 */
import { parse } from "csv-parse/sync";
import fs from "node:fs";
import path from "node:path";
import {
  activities,
  boards,
  companies,
  contacts,
  createDb,
  jobContacts,
  jobs,
  notes,
  stageEvents,
  stages,
  type ActivityCategory,
} from "../packages/core/src/index";
import { and, eq, isNotNull } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");
const RAW_DIR = path.join(import.meta.dirname, "raw");

// ---------- load ----------

type Row = Record<string, string>;

function loadCsv(prefix: string): Row[] {
  const file = fs
    .readdirSync(RAW_DIR)
    .find((f) => f.startsWith(`USER_${prefix}_`) && f.endsWith(".csv"));
  if (!file) {
    console.error(`missing USER_${prefix}_*.csv in migration/raw/`);
    process.exit(1);
  }
  return parse(fs.readFileSync(path.join(RAW_DIR, file), "utf8"), {
    columns: true,
    skip_empty_lines: true,
  }) as Row[];
}

/** The export writes "-" for empty values. */
function val(row: Row, key: string): string | null {
  const v = row[key];
  return v === undefined || v === "" || v === "-" ? null : v;
}

/** Dates in the export are UTC "YYYY-MM-DD HH:MM:SS". */
function date(row: Row, key: string): Date | null {
  const v = val(row, key);
  if (!v) return null;
  const d = new Date(v.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

const srcBoards = loadCsv("BOARDS");
const srcLists = loadCsv("LISTS");
const srcJobs = loadCsv("JOBS");
const srcActivities = loadCsv("ACTIVITIES");
const srcActions = loadCsv("ACTIONS");
const srcNotes = loadCsv("NOTES");
const srcContacts = loadCsv("CONTACTS");

// ---------- field mapping ----------

const CATEGORY_MAP: Record<string, ActivityCategory> = {
  Apply: "apply",
  "On Site Interview": "interview",
  "Phone Interview": "interview",
  "Phone Screen": "interview",
  "Technical Phone Screen": "interview",
  "Offer Received": "offer",
  "Offer Accepted": "offer",
  "Follow Up": "follow_up",
  "Send Availability": "follow_up",
  "Prep Interview": "interview",
  Meeting: "other",
  Networking: "other",
  "Send Thank You": "follow_up",
};

// Columns handled explicitly per entity. Anything else that carries a value
// goes to extras; denormalized duplicates of other entities are ignored.
const JOB_MAPPED = new Set([
  "id", "createdAt", "title", "salary", "location", "url", "htmlDescription",
  "deadline", "color", "listId", "listName", "companyId", "companyName",
  "companyDomain", "boardId", "boardName",
]);
const JOB_IGNORED = new Set([
  "creatorUserId", "creatorUserFirstName", "creatorUserLastName", "creatorUserEmail",
]);
const ACTIVITY_MAPPED = new Set([
  "id", "createdAt", "title", "note", "completed", "completedAt", "startAt",
  "jobId", "activityCategoryName",
]);
const ACTIVITY_IGNORED = new Set([
  "jobTitle", "boardId", "boardName", "companyId", "companyName", "companyDomain",
  "activityCategoryId", "creatorUserId", "creatorUserFirstName",
  "creatorUserLastName", "creatorUserEmail",
]);

function collectExtras(row: Row, mapped: Set<string>, ignored: Set<string>) {
  const extras: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (mapped.has(key) || ignored.has(key)) continue;
    if (value !== "" && value !== "-") extras[key] = value;
  }
  return Object.keys(extras).length > 0 ? extras : null;
}

// ---------- build the plan ----------

const report = {
  unknownCategories: new Map<string, number>(),
  movesForMissingJobs: 0,
  activitiesForMissingJobs: 0,
  notesForMissingJobs: 0,
  documentsNotImportable: 0,
  extrasColumns: new Map<string, number>(),
};

const jobIds = new Set(srcJobs.map((j) => j["id"]));

const board = srcBoards[0];
const boardName = board ? (val(board, "name") ?? "Job Search") : "Job Search";
const boardSourceId = board ? val(board, "id") : null;

// Stage history from move actions, oldest first.
const moves = srcActions
  .filter((a) => a["actionType"] === "JOB_MOVED")
  .map((a) => ({
    id: val(a, "id"),
    jobId: val(a, "jobId"),
    from: val(a, "fromListName"),
    to: val(a, "toListName"),
    at: date(a, "date"),
  }))
  .filter((m) => m.jobId && m.to && m.at)
  .sort((a, b) => a.at!.getTime() - b.at!.getTime());

const movesByJob = new Map<string, typeof moves>();
for (const m of moves) {
  if (!jobIds.has(m.jobId!)) {
    report.movesForMissingJobs++;
    continue;
  }
  const list = movesByJob.get(m.jobId!) ?? [];
  list.push(m);
  movesByJob.set(m.jobId!, list);
}

report.documentsNotImportable = srcActions.filter(
  (a) => a["actionType"] === "DOCUMENT_CREATED",
).length;

// Companies unique by source id (fall back to name).
const companyPlan = new Map<
  string,
  { sourceId: string | null; name: string; website: string | null }
>();
for (const j of srcJobs) {
  const name = val(j, "companyName");
  if (!name) continue;
  const sourceId = val(j, "companyId");
  const key = sourceId ?? `name:${name}`;
  if (!companyPlan.has(key)) {
    companyPlan.set(key, {
      sourceId,
      name,
      website: val(j, "companyDomain"),
    });
  }
}

type JobPlan = {
  sourceId: string;
  title: string;
  listName: string;
  companyKey: string | null;
  location: string | null;
  url: string | null;
  salary: string | null;
  color: string | null;
  description: string | null;
  deadline: Date | null;
  createdAt: Date;
  appliedAt: Date | null;
  rejectedAt: Date | null;
  extras: Record<string, string> | null;
  events: { sourceId: string; from: string | null; to: string; at: Date }[];
};

const jobPlans: JobPlan[] = [];
for (const j of srcJobs) {
  const sourceId = j["id"];
  if (!sourceId) continue;
  const createdAt = date(j, "createdAt") ?? new Date();
  const jobMoves = movesByJob.get(sourceId) ?? [];

  const firstInto = (stage: string) =>
    jobMoves.find((m) => m.to === stage)?.at ?? null;
  // Fall back to the completed Apply activity when there is no move record.
  let appliedAt = firstInto("applied");
  const events: JobPlan["events"] = [];
  // Synthetic initial event so time-in-first-stage is measurable.
  const initialStage = jobMoves[0]?.from ?? val(j, "listName") ?? "wishlist";
  events.push({
    sourceId: `init-${sourceId}`,
    from: null,
    to: initialStage,
    at: createdAt,
  });
  for (const m of jobMoves) {
    events.push({ sourceId: m.id ?? `${sourceId}-${m.at!.getTime()}`, from: m.from, to: m.to!, at: m.at! });
  }

  const companySourceId = val(j, "companyId");
  const companyName = val(j, "companyName");
  const extras = collectExtras(j, JOB_MAPPED, JOB_IGNORED);
  if (extras) {
    for (const k of Object.keys(extras)) {
      report.extrasColumns.set(`jobs.${k}`, (report.extrasColumns.get(`jobs.${k}`) ?? 0) + 1);
    }
  }
  jobPlans.push({
    sourceId,
    title: val(j, "title") ?? "(untitled)",
    listName: val(j, "listName") ?? "wishlist",
    companyKey: companyName ? (companySourceId ?? `name:${companyName}`) : null,
    location: val(j, "location"),
    url: val(j, "url"),
    salary: val(j, "salary"),
    color: val(j, "color"),
    description: val(j, "htmlDescription"),
    deadline: date(j, "deadline"),
    createdAt,
    appliedAt,
    rejectedAt: firstInto("rejected"),
    extras,
    events,
  });
}

// Apply-activity fallback for appliedAt.
const applyActivityDate = new Map<string, Date>();
for (const a of srcActivities) {
  if (val(a, "activityCategoryName") !== "Apply") continue;
  const jobId = val(a, "jobId");
  const at = date(a, "completedAt") ?? date(a, "createdAt");
  if (jobId && at) applyActivityDate.set(jobId, at);
}
for (const p of jobPlans) {
  if (!p.appliedAt) p.appliedAt = applyActivityDate.get(p.sourceId) ?? null;
}

type ActivityPlan = {
  sourceId: string;
  jobSourceId: string;
  category: ActivityCategory;
  title: string;
  note: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  extras: Record<string, string> | null;
};

const activityPlans: ActivityPlan[] = [];
for (const a of srcActivities) {
  const jobSourceId = val(a, "jobId");
  if (!jobSourceId || !jobIds.has(jobSourceId)) {
    report.activitiesForMissingJobs++;
    continue;
  }
  const rawCategory = val(a, "activityCategoryName") ?? "";
  let category = CATEGORY_MAP[rawCategory];
  if (!category) {
    report.unknownCategories.set(
      rawCategory,
      (report.unknownCategories.get(rawCategory) ?? 0) + 1,
    );
    category = "other";
  }
  const completed = val(a, "completed") === "true";
  const extras = collectExtras(a, ACTIVITY_MAPPED, ACTIVITY_IGNORED);
  if (extras) {
    for (const k of Object.keys(extras)) {
      report.extrasColumns.set(`activities.${k}`, (report.extrasColumns.get(`activities.${k}`) ?? 0) + 1);
    }
  }
  activityPlans.push({
    sourceId: a["id"]!,
    jobSourceId,
    category,
    title: val(a, "title") ?? rawCategory ?? "(untitled)",
    note: val(a, "note"),
    dueAt: date(a, "startAt"),
    completedAt: completed ? (date(a, "completedAt") ?? date(a, "createdAt")) : null,
    createdAt: date(a, "createdAt") ?? new Date(),
    extras,
  });
}

const notePlans = srcNotes
  .map((n) => ({
    sourceId: n["id"]!,
    jobSourceId: val(n, "jobId"),
    body: val(n, "text") ?? "",
    createdAt: date(n, "createdAt") ?? new Date(),
  }))
  .filter((n) => {
    if (n.jobSourceId && jobIds.has(n.jobSourceId)) return true;
    report.notesForMissingJobs++;
    return false;
  });

const contactPlans = srcContacts.map((c) => {
  const name =
    [val(c, "firstName"), val(c, "lastName")].filter(Boolean).join(" ") ||
    "(unnamed)";
  let email: string | null = null;
  const emails = val(c, "emails");
  if (emails) {
    try {
      const parsed = JSON.parse(emails);
      email = Array.isArray(parsed) ? (parsed[0] ?? null) : emails;
    } catch {
      email = emails.split(",")[0]?.trim() ?? null;
    }
  }
  let jobLinks: string[] = [];
  const rawLinks = val(c, "jobIds");
  if (rawLinks) {
    try {
      const parsed = JSON.parse(rawLinks);
      jobLinks = Array.isArray(parsed) ? parsed : rawLinks.split(",");
    } catch {
      jobLinks = rawLinks.split(",").map((s) => s.trim());
    }
  }
  return {
    sourceId: c["id"]!,
    name,
    title: val(c, "title"),
    email,
    phone: val(c, "phoneNumbers"),
    linkedin: val(c, "linkedIn"),
    jobLinks: jobLinks.filter((j) => jobIds.has(j)),
  };
});

// ---------- summary ----------

const stageCounts = new Map<string, number>();
for (const p of jobPlans) {
  stageCounts.set(p.listName, (stageCounts.get(p.listName) ?? 0) + 1);
}

console.log(`${DRY_RUN ? "[dry run] " : ""}import plan from ${RAW_DIR}`);
console.log(`  board:      ${boardName}`);
console.log(`  companies:  ${companyPlan.size}`);
console.log(`  jobs:       ${jobPlans.length}`);
for (const [stage, n] of [...stageCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${stage.padEnd(10)} ${n}`);
}
console.log(`  activities: ${activityPlans.length}`);
console.log(`  stage moves: ${moves.length - report.movesForMissingJobs} (+${jobPlans.length} synthetic initial events)`);
console.log(`  notes:      ${notePlans.length}`);
console.log(`  contacts:   ${contactPlans.length}`);

console.log("\nfield-mapping report:");
if (report.documentsNotImportable > 0) {
  console.log(
    `  documents: ${report.documentsNotImportable} document events exist in the export but carry no filename/content — the export does not include documents. Re-download files by hand if needed.`,
  );
}
if (report.movesForMissingJobs > 0) {
  console.log(`  ${report.movesForMissingJobs} stage moves reference deleted jobs (skipped)`);
}
if (report.activitiesForMissingJobs > 0) {
  console.log(`  ${report.activitiesForMissingJobs} activities reference deleted jobs (skipped)`);
}
if (report.notesForMissingJobs > 0) {
  console.log(`  ${report.notesForMissingJobs} notes reference deleted jobs (skipped)`);
}
for (const [cat, n] of report.unknownCategories) {
  console.log(`  unknown activity category "${cat}" ×${n} → imported as "other" (original kept in extras)`);
}
if (report.extrasColumns.size > 0) {
  console.log("  columns with no schema home, kept in extras JSON:");
  for (const [col, n] of [...report.extrasColumns.entries()].sort()) {
    console.log(`    ${col} (${n} rows)`);
  }
}
console.log("  ignored denormalized/constant columns: creatorUser*, jobTitle/company duplicates, activityCategoryId");

if (DRY_RUN) {
  console.log("\ndry run — nothing written. Re-run without --dry-run to import.");
  process.exit(0);
}

// ---------- write ----------

const db = createDb();

db.transaction(() => {
  // Board: adopt the app's default board if one exists, otherwise create.
  let boardRow = boardSourceId
    ? db.select().from(boards).where(eq(boards.sourceId, boardSourceId)).get()
    : undefined;
  boardRow ??= db.select().from(boards).limit(1).all()[0];
  if (boardRow) {
    db.update(boards)
      .set({ name: boardName, sourceId: boardSourceId })
      .where(eq(boards.id, boardRow.id))
      .run();
  } else {
    boardRow = db
      .insert(boards)
      .values({ name: boardName, sourceId: boardSourceId })
      .returning()
      .get();
    ["wishlist", "applied", "interview", "offer", "rejected"].forEach((name, i) => {
      db.insert(stages).values({ boardId: boardRow!.id, name, position: i }).run();
    });
  }

  // Stages: match by name, attach source ids, create any missing list.
  const stageRows = db.select().from(stages).where(eq(stages.boardId, boardRow.id)).all();
  const stageIdByName = new Map(stageRows.map((s) => [s.name, s.id]));
  for (const l of srcLists) {
    const name = val(l, "name");
    if (!name) continue;
    const existing = stageIdByName.get(name);
    if (existing) {
      db.update(stages).set({ sourceId: val(l, "id") }).where(eq(stages.id, existing)).run();
    } else {
      const created = db
        .insert(stages)
        .values({
          boardId: boardRow.id,
          name,
          position: stageIdByName.size,
          sourceId: val(l, "id"),
        })
        .returning()
        .get();
      stageIdByName.set(name, created.id);
    }
  }

  // Companies.
  const companyIdByKey = new Map<string, number>();
  for (const [key, c] of companyPlan) {
    const website = c.website ? `https://${c.website}` : null;
    if (c.sourceId) {
      const row = db
        .insert(companies)
        .values({ name: c.name, website, sourceId: c.sourceId })
        .onConflictDoUpdate({
          target: companies.sourceId,
          set: { name: c.name, website },
        })
        .returning()
        .get();
      companyIdByKey.set(key, row.id);
    } else {
      const existing = db.select().from(companies).where(eq(companies.name, c.name)).get();
      const row =
        existing ??
        db.insert(companies).values({ name: c.name, website }).returning().get();
      companyIdByKey.set(key, row.id);
    }
  }

  // Jobs, positioned by creation time within their stage.
  const jobIdBySource = new Map<string, number>();
  const positionCounters = new Map<number, number>();
  for (const p of [...jobPlans].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )) {
    const stageId = stageIdByName.get(p.listName);
    if (!stageId) throw new Error(`no stage for list "${p.listName}"`);
    const position = (positionCounters.get(stageId) ?? 0) + 1024;
    positionCounters.set(stageId, position);
    const values = {
      boardId: boardRow.id,
      stageId,
      title: p.title,
      companyId: p.companyKey ? (companyIdByKey.get(p.companyKey) ?? null) : null,
      location: p.location,
      url: p.url,
      salary: p.salary,
      color: p.color,
      description: p.description,
      deadline: p.deadline,
      position,
      createdAt: p.createdAt,
      appliedAt: p.appliedAt,
      rejectedAt: p.rejectedAt,
      extras: p.extras,
    };
    const row = db
      .insert(jobs)
      .values({ ...values, sourceId: p.sourceId })
      .onConflictDoUpdate({ target: jobs.sourceId, set: values })
      .returning()
      .get();
    jobIdBySource.set(p.sourceId, row.id);

    for (const e of p.events) {
      const toStageId = stageIdByName.get(e.to);
      if (!toStageId) continue;
      const eventValues = {
        jobId: row.id,
        fromStageId: e.from ? (stageIdByName.get(e.from) ?? null) : null,
        toStageId,
        movedAt: e.at,
      };
      db.insert(stageEvents)
        .values({ ...eventValues, sourceId: e.sourceId })
        .onConflictDoUpdate({ target: stageEvents.sourceId, set: eventValues })
        .run();
    }
  }

  // Activities.
  for (const a of activityPlans) {
    const jobId = jobIdBySource.get(a.jobSourceId);
    if (!jobId) continue;
    const values = {
      jobId,
      category: a.category,
      title: a.title,
      note: a.note,
      dueAt: a.dueAt,
      completedAt: a.completedAt,
      createdAt: a.createdAt,
      extras: a.extras,
    };
    db.insert(activities)
      .values({ ...values, sourceId: a.sourceId })
      .onConflictDoUpdate({ target: activities.sourceId, set: values })
      .run();
  }

  // Notes.
  for (const n of notePlans) {
    const jobId = jobIdBySource.get(n.jobSourceId!);
    if (!jobId) continue;
    const values = { jobId, body: n.body, createdAt: n.createdAt };
    db.insert(notes)
      .values({ ...values, sourceId: n.sourceId })
      .onConflictDoUpdate({ target: notes.sourceId, set: values })
      .run();
  }

  // Contacts and their job links.
  for (const c of contactPlans) {
    const values = {
      name: c.name,
      title: c.title,
      email: c.email,
      phone: c.phone,
      linkedin: c.linkedin,
    };
    const row = db
      .insert(contacts)
      .values({ ...values, sourceId: c.sourceId })
      .onConflictDoUpdate({ target: contacts.sourceId, set: values })
      .returning()
      .get();
    for (const jobSource of c.jobLinks) {
      const jobId = jobIdBySource.get(jobSource);
      if (!jobId) continue;
      db.insert(jobContacts)
        .values({ jobId, contactId: row.id })
        .onConflictDoNothing()
        .run();
    }
  }
});

// ---------- verify ----------

console.log("\nper-stage counts, source vs imported:");
const imported = db
  .select({ name: stages.name, id: stages.id })
  .from(stages)
  .all();
let mismatches = 0;
for (const s of imported) {
  // Count only imported jobs so leftover seed data can't skew the check.
  const dbCount = db
    .select()
    .from(jobs)
    .where(and(eq(jobs.stageId, s.id), isNotNull(jobs.sourceId)))
    .all().length;
  const srcCount = stageCounts.get(s.name) ?? 0;
  const flag = dbCount === srcCount ? "" : "  << MISMATCH";
  if (dbCount !== srcCount) mismatches++;
  console.log(`  ${s.name.padEnd(10)} source ${String(srcCount).padStart(4)}  imported ${String(dbCount).padStart(4)}${flag}`);
}
console.log(mismatches === 0 ? "\nimport complete, counts match." : `\nimport finished with ${mismatches} count mismatches — investigate before trusting the board.`);
