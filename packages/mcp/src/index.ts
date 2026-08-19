/**
 * JobTrack MCP server (stdio). Exposes the board to Claude via the shared
 * service layer — same database and logic as the web app.
 *
 * Run: npx tsx packages/mcp/src/index.ts
 * DB path defaults to <repo>/data/jobtrack.db; override with JOBTRACK_DB.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { z } from "zod";
import {
  activityCategories,
  classifyInterviewTitle,
  contactRoles,
  createDb,
  createServices,
  DEFAULT_STAGES,
  jobSources,
} from "@jobtrack/core";

// MCP hosts launch the server from an arbitrary working directory, but the
// core package resolves the migrations folder (and the default DB path) by
// walking up from cwd. This file lives at packages/mcp/{src,dist}/index.*, so
// three levels up is the repo root — anchor the process there.
process.chdir(path.join(import.meta.dirname, "..", "..", ".."));

const dbPath =
  process.env.JOBTRACK_DB ?? path.join(process.cwd(), "data", "jobtrack.db");
const svc = createServices(createDb(dbPath));
svc.getOrCreateDefaultBoard();

const server = new McpServer({ name: "jobtrack", version: "0.1.0" });

const stageEnum = z.enum(DEFAULT_STAGES);

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

function fmtJobLine(j: {
  id: number;
  title: string;
  companyName?: string | null;
  location?: string | null;
}): string {
  const company = j.companyName ? ` @ ${j.companyName}` : "";
  const loc = j.location ? ` (${j.location})` : "";
  return `#${j.id} ${j.title}${company}${loc}`;
}

server.tool(
  "list_jobs",
  "List jobs on the board, optionally filtered by stage and/or a text query on title/company.",
  { stage: stageEnum.optional(), query: z.string().optional() },
  async ({ stage, query }) => {
    const jobs = svc.listJobs({ stageName: stage, query });
    if (jobs.length === 0) return text("No jobs found.");
    const board = svc.getOrCreateDefaultBoard();
    const stages = new Map(svc.listStages(board.id).map((s) => [s.id, s.name]));
    const lines = jobs.map(
      (j) => `${fmtJobLine(j)} [${stages.get(j.stageId)}]`,
    );
    return text(`${jobs.length} jobs:\n${lines.join("\n")}`);
  },
);

server.tool(
  "get_job",
  "Get full details for one job: fields, stage, company, activities, notes.",
  { id: z.number().int() },
  async ({ id }) => {
    const job = svc.getJob(id);
    if (!job) return text(`No job with id ${id}.`);
    const activities = svc.listActivities(id);
    const notes = svc.listNotes(id);
    const contacts = svc.listContactsForJob(id);
    const lines = [
      `#${job.id} ${job.title}`,
      `stage: ${job.stage?.name}`,
      `company: ${job.company?.name ?? "—"}`,
      `location: ${job.location ?? "—"}`,
      `salary: ${job.salary ?? "—"}`,
      `url: ${job.url ?? "—"}`,
      `source: ${job.source ?? "untagged"}`,
      `created: ${fmtDate(job.createdAt)}  applied: ${fmtDate(job.appliedAt)}  rejected: ${fmtDate(job.rejectedAt)}`,
    ];
    if (job.compMin != null || job.compMax != null) {
      lines.push(
        `comp: ${job.compMin ?? "?"}–${job.compMax ?? "?"} ${job.compUnit ?? ""} (${job.compBasis ?? "unknown basis"}, ${job.compSource ?? "unknown source"})`,
      );
    }
    if (job.externalId) lines.push(`requisition id: ${job.externalId}`);
    if (job.calendarEventUrl || job.calendarEventId) {
      lines.push(`calendar: ${job.calendarEventUrl ?? job.calendarEventId}`);
    }
    if (job.jdSourceUrl) lines.push(`jd captured from: ${job.jdSourceUrl}${job.jdCapturedAt ? ` on ${fmtDate(job.jdCapturedAt)}` : ""}`);
    if (job.sourceChannel || job.sourceMessageId) {
      lines.push(`came from: ${job.sourceChannel ?? "?"}${job.sourceMessageId ? ` (message ${job.sourceMessageId})` : ""}`);
    }
    if (job.resumePath) lines.push(`resume sent: ${job.resumePath}`);
    if (job.coverLetterPath) lines.push(`cover letter: ${job.coverLetterPath}`);
    if (activities.length > 0) {
      lines.push(`activities (${activities.length}):`);
      for (const a of activities.slice(0, 15)) {
        const status = a.completedAt
          ? `done ${fmtDate(a.completedAt)}`
          : a.dueAt
            ? `due ${fmtDate(a.dueAt)}`
            : "pending";
        let line = `  - #${a.id} [${a.category}] ${a.title} (${status})`;
        if (a.startsAt) {
          line += ` scheduled ${a.startsAt.toISOString()}${a.endsAt ? ` – ${a.endsAt.toISOString()}` : ""}${a.timezone ? ` ${a.timezone}` : ""}`;
        }
        if (a.interviewerName) line += ` with ${a.interviewerName}${a.interviewerTitle ? ` (${a.interviewerTitle})` : ""}`;
        if (a.meetingUrl) line += ` ${a.meetingUrl}`;
        lines.push(line);
      }
    }
    if (notes.length > 0) {
      lines.push(`notes (${notes.length}):`);
      for (const n of notes.slice(0, 5)) {
        lines.push(`  - ${fmtDate(n.createdAt)}: ${n.body.slice(0, 200)}`);
      }
    }
    if (contacts.length > 0) {
      lines.push(
        `contacts: ${contacts.map((c) => c.name + (c.title ? ` (${c.title})` : "")).join(", ")}`,
      );
    }
    return text(lines.join("\n"));
  },
);

server.tool(
  "add_job",
  "Add a job to the board.",
  {
    title: z.string(),
    company: z.string().optional(),
    stage: stageEnum.default("wishlist"),
    url: z.string().optional(),
    location: z.string().optional(),
    salary: z.string().optional(),
    description: z.string().optional(),
    source: z
      .enum(jobSources)
      .optional()
      .describe("How the opportunity originated: applied, reachout (recruiter contacted you), referral, other"),
    external_id: z.string().optional().describe("Employer requisition id — enables exact duplicate matching"),
  },
  async ({ title, company, stage, url, location, salary, description, source, external_id }) => {
    // Idempotent: matches an existing live job by url, requisition id, or
    // company+title instead of creating a duplicate.
    const res = svc.upsertJob({
      title,
      company,
      stageName: stage,
      url,
      location,
      salary,
      description,
      source,
      externalId: external_id,
    });
    if (res.created) {
      return text(`Created job #${res.job.id}: ${title} in ${stage}.`);
    }
    return text(
      `Matched existing job #${res.job.id} (${res.job.title}) by ${res.matchedOn} — no duplicate created. ` +
        `Empty fields were filled from your input; use update_job to change anything else.`,
    );
  },
);

server.tool(
  "upsert_job",
  "Create-or-update a job with its activities and notes in ONE atomic call (ideal for backfilling history). Matches an existing live job by url, requisition id, or company+title: on a match it fills only empty fields and appends the children; otherwise it creates. Reports created vs matched.",
  {
    title: z.string(),
    company: z.string().optional(),
    stage: stageEnum.optional(),
    url: z.string().optional(),
    location: z.string().optional(),
    salary: z.string().optional(),
    description: z.string().optional(),
    source: z.enum(jobSources).optional(),
    external_id: z.string().optional(),
    applied_at: z.string().optional().describe("ISO date"),
    activities: z
      .array(
        z.object({
          category: z.enum(activityCategories),
          title: z.string(),
          note: z.string().optional(),
          due_at: z.string().optional(),
          completed_at: z.string().optional(),
          starts_at: z.string().optional(),
          ends_at: z.string().optional(),
        }),
      )
      .optional(),
    notes: z.array(z.string()).optional(),
  },
  async ({ activities: acts, notes: noteBodies, applied_at, external_id, stage, ...rest }) => {
    const res = svc.upsertJob({
      ...rest,
      stageName: stage,
      externalId: external_id,
      appliedAt: applied_at ? new Date(applied_at) : undefined,
      activities: acts?.map((a) => ({
        category: a.category,
        title: a.title,
        note: a.note,
        dueAt: a.due_at ? new Date(a.due_at) : undefined,
        completedAt: a.completed_at ? new Date(a.completed_at) : undefined,
        startsAt: a.starts_at ? new Date(a.starts_at) : undefined,
        endsAt: a.ends_at ? new Date(a.ends_at) : undefined,
      })),
      notes: noteBodies,
    });
    return text(
      `${res.created ? "Created" : `Matched existing (by ${res.matchedOn})`} job #${res.job.id} (${res.job.title})` +
        ` with ${acts?.length ?? 0} activities and ${noteBodies?.length ?? 0} notes applied atomically.`,
    );
  },
);

server.tool(
  "find_duplicates",
  "Read-only: flag live job pairs that look like the same posting entered twice — same/fuzzy company plus similar title, or matching requisition id. Consolidate a pair with merge_jobs.",
  {},
  async () => {
    const pairs = svc.findDuplicates();
    if (pairs.length === 0) return text("No likely duplicates found.");
    const lines = pairs.map(
      (p) =>
        `#${p.a.id} "${p.a.title}" ⟷ #${p.b.id} "${p.b.title}" @ ${p.a.companyName ?? "?"} (${p.reason})`,
    );
    return text(`${pairs.length} likely duplicate pair(s):\n${lines.join("\n")}\nUse merge_jobs(source_id, target_id) to consolidate.`);
  },
);

server.tool(
  "list_stale",
  "Read-only follow-up list: live jobs (excluding wishlist and rejected) with no activity in N days, and incomplete activities past their due date.",
  { days: z.number().int().min(1).default(7) },
  async ({ days }) => {
    const { staleJobs, overdue } = svc.listStale(days);
    if (staleJobs.length === 0 && overdue.length === 0) {
      return text(`Nothing stale: every live job has activity within ${days} days and nothing is overdue.`);
    }
    const lines: string[] = [];
    if (staleJobs.length > 0) {
      lines.push(`${staleJobs.length} jobs quiet for ${days}+ days:`);
      for (const j of staleJobs.slice(0, 50)) {
        lines.push(`  #${j.id} ${j.title}${j.companyName ? ` @ ${j.companyName}` : ""} [${j.stageName}] last activity ${fmtDate(j.lastActivityAt)}`);
      }
    }
    if (overdue.length > 0) {
      lines.push(`${overdue.length} overdue activities:`);
      for (const a of overdue.slice(0, 50)) {
        lines.push(`  activity #${a.id} [${a.category}] ${a.title} — job #${a.jobId} ${a.jobTitle}${a.companyName ? ` @ ${a.companyName}` : ""} (due ${fmtDate(a.dueAt)})`);
      }
    }
    return text(lines.join("\n"));
  },
);

server.tool(
  "update_job",
  "Update a job's fields in place. Patch semantics: only the fields you provide change; everything else is untouched. Reversible by updating again. Company is matched or created by name.",
  {
    id: z.number().int(),
    title: z.string().optional(),
    company: z.string().optional(),
    location: z.string().optional(),
    salary: z.string().optional(),
    url: z.string().optional(),
    description: z.string().optional(),
    source: z.enum(jobSources).optional(),
    applied_at: z.string().optional().describe("ISO date, e.g. 2026-07-01; empty string clears it"),
    comp_min: z.number().optional().describe("Structured compensation lower bound (number only)"),
    comp_max: z.number().optional(),
    comp_unit: z.enum(["annual", "hourly"]).optional(),
    comp_basis: z.enum(["w2", "c2c", "1099", "unknown"]).optional(),
    comp_source: z.enum(["posted", "recruiter", "inferred"]).optional(),
    jd_source_url: z.string().optional().describe("Where the description/JD was captured from"),
    external_id: z.string().optional().describe("Employer requisition id, e.g. 210747612; unique per company"),
    calendar_event_id: z.string().optional(),
    calendar_event_url: z.string().optional(),
    source_channel: z.enum(["email", "linkedin", "referral", "board", "other"]).optional().describe("Where this card came from"),
    source_message_id: z.string().optional().describe("Id of the exact email/message it came from"),
    resume_path: z.string().optional().describe("Which resume file was sent for this application"),
    cover_letter_path: z.string().optional(),
  },
  async ({ id, applied_at, comp_min, comp_max, comp_unit, comp_basis, comp_source, jd_source_url, external_id, calendar_event_id, calendar_event_url, source_channel, source_message_id, resume_path, cover_letter_path, ...rest }) => {
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) patch[key] = value;
    }
    if (applied_at !== undefined) {
      patch.appliedAt = applied_at ? new Date(applied_at) : null;
    }
    if (comp_min !== undefined) patch.compMin = comp_min;
    if (comp_max !== undefined) patch.compMax = comp_max;
    if (comp_unit !== undefined) patch.compUnit = comp_unit;
    if (comp_basis !== undefined) patch.compBasis = comp_basis;
    if (comp_source !== undefined) patch.compSource = comp_source;
    if (jd_source_url !== undefined) patch.jdSourceUrl = jd_source_url || null;
    if (external_id !== undefined) patch.externalId = external_id || null;
    if (calendar_event_id !== undefined) patch.calendarEventId = calendar_event_id || null;
    if (calendar_event_url !== undefined) patch.calendarEventUrl = calendar_event_url || null;
    if (source_channel !== undefined) patch.sourceChannel = source_channel;
    if (source_message_id !== undefined) patch.sourceMessageId = source_message_id || null;
    if (resume_path !== undefined) patch.resumePath = resume_path || null;
    if (cover_letter_path !== undefined) patch.coverLetterPath = cover_letter_path || null;
    if (rest.description !== undefined) patch.jdCapturedAt = new Date();
    if (Object.keys(patch).length === 0) return text("Nothing to update.");
    const updated = svc.updateJob(id, patch);
    if (!updated) return text(`No job with id ${id}.`);
    return text(`Updated job #${id}. ${fmtJobLine({ ...updated, companyName: undefined })}`);
  },
);

server.tool(
  "archive_job",
  "Archive a job (reversible soft delete): it disappears from the board, search, and metrics but keeps all its activities and notes. Undo with restore_job. Use this to remove duplicates — there is no hard delete over MCP.",
  { id: z.number().int() },
  async ({ id }) => {
    const job = svc.getJob(id);
    if (!job) return text(`No job with id ${id}.`);
    svc.archiveJob(id);
    return text(`Archived job #${id} (${job.title}). Restore any time with restore_job.`);
  },
);

server.tool(
  "restore_job",
  "Restore an archived job to the board, fully intact. Reversible (archive again).",
  { id: z.number().int() },
  async ({ id }) => {
    const restored = svc.restoreJob(id);
    if (!restored) return text(`No job with id ${id}.`);
    return text(`Restored job #${id} (${restored.title}) to the board.`);
  },
);

server.tool(
  "list_archived",
  "List archived jobs (the ones hidden from the board and metrics). Read-only.",
  {},
  async () => {
    const rows = svc.listArchived();
    if (rows.length === 0) return text("No archived jobs.");
    const lines = rows.map(
      (j) =>
        `#${j.id} ${j.title}${j.companyName ? ` @ ${j.companyName}` : ""} (archived ${fmtDate(j.archivedAt)})`,
    );
    return text(`${rows.length} archived jobs:\n${lines.join("\n")}`);
  },
);

server.tool(
  "merge_jobs",
  "Consolidate a duplicate: moves ALL activities and notes from the source job to the target, keeps the target's stage, fills any empty target field (url, salary, location, description, source, applied date) from the source, records the merge as a note, and archives the source. Mostly reversible: the source can be restored, but moved activities and notes stay on the target. Refuses self-merges and archived participants.",
  { source_id: z.number().int(), target_id: z.number().int() },
  async ({ source_id, target_id }) => {
    try {
      const merged = svc.mergeJobs(source_id, target_id);
      return text(
        `Merged job #${source_id} into #${target_id} (${merged.title}). ` +
          `Source archived; activities and notes moved; target stage kept.`,
      );
    } catch (err) {
      return text(err instanceof Error ? err.message : "merge failed");
    }
  },
);

server.tool(
  "set_source",
  "Record how a job originated: applied (cold application), reachout (a recruiter contacted you, e.g. on LinkedIn), referral, or other. Drives the source breakdown in metrics.",
  { job_id: z.number().int(), source: z.enum(jobSources) },
  async ({ job_id, source }) => {
    if (!svc.getJob(job_id)) return text(`No job with id ${job_id}.`);
    svc.updateJob(job_id, { source });
    return text(`Job #${job_id} source set to ${source}.`);
  },
);

server.tool(
  "move_job",
  "Move a job to another stage (sets applied/rejected timestamps on first entry).",
  { id: z.number().int(), stage: stageEnum },
  async ({ id, stage }) => {
    try {
      svc.moveJob(id, { stageName: stage });
      return text(`Moved job #${id} to ${stage}.`);
    } catch (err) {
      return text(err instanceof Error ? err.message : "move failed");
    }
  },
);

server.tool(
  "log_activity",
  "Log an activity on a job. Categories: apply, screen (recruiter/screening call), interview (generic), hm (hiring manager round), technical (coding/system design), final (final/onsite round), follow_up, offer, other. Prefer the specific round categories — they feed the interview-rounds metrics.",
  {
    job_id: z.number().int(),
    category: z.enum(activityCategories),
    title: z.string(),
    note: z.string().optional(),
    due_at: z.string().optional().describe("ISO date, e.g. 2026-08-20"),
    completed: z.boolean().default(false),
    starts_at: z.string().optional().describe("Scheduled start, ISO datetime e.g. 2026-08-21T11:00:00-04:00"),
    ends_at: z.string().optional().describe("Scheduled end, ISO datetime"),
    timezone: z.string().optional().describe("IANA name; defaults to America/New_York when times are set"),
    meeting_url: z.string().optional(),
    meeting_id: z.string().optional(),
    meeting_passcode: z.string().optional(),
    interviewer_name: z.string().optional(),
    interviewer_title: z.string().optional(),
  },
  async ({ job_id, category, title, note, due_at, completed, starts_at, ends_at, timezone, meeting_url, meeting_id, meeting_passcode, interviewer_name, interviewer_title }) => {
    if (!svc.getJob(job_id)) return text(`No job with id ${job_id}.`);
    const activity = svc.createActivity({
      jobId: job_id,
      category,
      title,
      note,
      dueAt: due_at ? new Date(due_at) : undefined,
      completedAt: completed ? new Date() : undefined,
      startsAt: starts_at ? new Date(starts_at) : undefined,
      endsAt: ends_at ? new Date(ends_at) : undefined,
      timezone: timezone ?? (starts_at ? "America/New_York" : undefined),
      meetingUrl: meeting_url,
      meetingId: meeting_id,
      meetingPasscode: meeting_passcode,
      interviewerName: interviewer_name,
      interviewerTitle: interviewer_title,
    });
    let conflictNote = "";
    if (starts_at && ends_at) {
      const { overlaps } = svc.findConflicts(new Date(starts_at), new Date(ends_at));
      const hits = overlaps.filter((o) => o.a.id === activity.id || o.b.id === activity.id);
      if (hits.length > 0) {
        const other = hits.map((o) => (o.a.id === activity.id ? o.b : o.a));
        conflictNote =
          `\n⚠ CONFLICT: overlaps ` +
          other.map((x) => `activity #${x.id} (${x.title} — ${x.companyName ?? x.jobTitle})`).join(", ");
      }
    }
    return text(`Logged ${category} activity #${activity.id} on job #${job_id}.${conflictNote}`);
  },
);

server.tool(
  "list_activities",
  "List activities across the board (or one job). category filters exactly; category 'unclassified' returns generic interview activities that no round type can be derived for — the ones the metrics funnel reports as unclassified. Use update_activity to retag them.",
  {
    category: z.enum([...activityCategories, "unclassified"]).optional(),
    job_id: z.number().int().optional(),
  },
  async ({ category, job_id }) => {
    const rows = svc.listActivitiesAcrossJobs({
      jobId: job_id,
      category:
        category && category !== "unclassified"
          ? category
          : category === "unclassified"
            ? "interview"
            : undefined,
    });
    const filtered =
      category === "unclassified"
        ? rows.filter((r) => classifyInterviewTitle(r.title) === null)
        : rows;
    if (filtered.length === 0) return text("No matching activities.");
    const MAX = 200;
    const lines = filtered.slice(0, MAX).map((r) => {
      const status = r.completedAt
        ? `done ${fmtDate(r.completedAt)}`
        : r.dueAt
          ? `due ${fmtDate(r.dueAt)}`
          : fmtDate(r.createdAt);
      const company = r.companyName ? ` @ ${r.companyName}` : "";
      return `activity #${r.id} [${r.category}] ${r.title} — job #${r.jobId} ${r.jobTitle}${company} (${status})`;
    });
    const more =
      filtered.length > MAX ? `\n…and ${filtered.length - MAX} more (narrow the filter)` : "";
    return text(`${filtered.length} activities:\n${lines.join("\n")}${more}`);
  },
);

server.tool(
  "update_activity",
  "Update an existing activity in place: retag its category (apply, screen, interview, hm, technical, final, follow_up, offer, other), rename it, edit the note, change the due date, or mark it complete/incomplete.",
  {
    activity_id: z.number().int(),
    category: z.enum(activityCategories).optional(),
    title: z.string().optional(),
    note: z.string().optional(),
    due_at: z.string().optional().describe("ISO date, e.g. 2026-08-20"),
    completed: z.boolean().optional(),
    starts_at: z.string().optional().describe("Scheduled start, ISO datetime; empty string clears"),
    ends_at: z.string().optional().describe("Scheduled end, ISO datetime; empty string clears"),
    timezone: z.string().optional(),
    meeting_url: z.string().optional(),
    meeting_id: z.string().optional(),
    meeting_passcode: z.string().optional(),
    interviewer_name: z.string().optional(),
    interviewer_title: z.string().optional(),
  },
  async ({ activity_id, category, title, note, due_at, completed, starts_at, ends_at, timezone, meeting_url, meeting_id, meeting_passcode, interviewer_name, interviewer_title }) => {
    const patch: Record<string, unknown> = {};
    if (category !== undefined) patch.category = category;
    if (title !== undefined) patch.title = title;
    if (note !== undefined) patch.note = note;
    if (due_at !== undefined) patch.dueAt = due_at ? new Date(due_at) : null;
    if (completed !== undefined) patch.completedAt = completed ? new Date() : null;
    if (starts_at !== undefined) patch.startsAt = starts_at ? new Date(starts_at) : null;
    if (ends_at !== undefined) patch.endsAt = ends_at ? new Date(ends_at) : null;
    if (timezone !== undefined) patch.timezone = timezone || null;
    if (meeting_url !== undefined) patch.meetingUrl = meeting_url || null;
    if (meeting_id !== undefined) patch.meetingId = meeting_id || null;
    if (meeting_passcode !== undefined) patch.meetingPasscode = meeting_passcode || null;
    if (interviewer_name !== undefined) patch.interviewerName = interviewer_name || null;
    if (interviewer_title !== undefined) patch.interviewerTitle = interviewer_title || null;
    if (Object.keys(patch).length === 0) return text("Nothing to update.");
    const updated = svc.updateActivity(activity_id, patch);
    if (!updated) return text(`No activity with id ${activity_id}.`);
    return text(
      `Updated activity #${updated.id}: [${updated.category}] ${updated.title}` +
        (updated.completedAt ? ` (done ${fmtDate(updated.completedAt)})` : ""),
    );
  },
);

server.tool(
  "find_conflicts",
  "Scheduling check, read-only: within a time range, list activity pairs whose scheduled times overlap, and pairs closer together than gap_minutes. Only activities with starts_at/ends_at on live (non-archived) jobs are considered.",
  {
    from: z.string().describe("ISO datetime"),
    to: z.string().describe("ISO datetime"),
    gap_minutes: z.number().int().min(0).default(0).describe("Also flag pairs with less than this many minutes between them"),
  },
  async ({ from, to, gap_minutes }) => {
    const { overlaps, tight } = svc.findConflicts(new Date(from), new Date(to), gap_minutes);
    if (overlaps.length === 0 && tight.length === 0) return text("No conflicts in that range.");
    const fmt = (x: { id: number; title: string; startsAt: Date | null; endsAt: Date | null; companyName: string | null; jobTitle: string }) =>
      `#${x.id} ${x.title} (${x.companyName ?? x.jobTitle}) ${x.startsAt?.toISOString()}–${x.endsAt?.toISOString()}`;
    const lines = [
      ...overlaps.map((o) => `OVERLAP: ${fmt(o.a)}  ⟷  ${fmt(o.b)}`),
      ...tight.map((t) => `TIGHT (${Math.round(t.gapMinutes)}m gap): ${fmt(t.a)}  →  ${fmt(t.b)}`),
    ];
    return text(lines.join("\n"));
  },
);

server.tool(
  "add_availability",
  "Record a time window offered to a recruiter, so the same slot is never offered twice. Reversible context, not a booking.",
  {
    start: z.string().describe("ISO datetime"),
    end: z.string().describe("ISO datetime"),
    note: z.string().optional().describe("e.g. who it was offered to"),
  },
  async ({ start, end, note }) => {
    const w = svc.addAvailability(new Date(start), new Date(end), note);
    return text(`Recorded availability #${w.id}: ${w.startAt.toISOString()} – ${w.endAt.toISOString()}${note ? ` (${note})` : ""}.`);
  },
);

server.tool(
  "list_availability",
  "List offered availability windows in a range, with whether each is still free or already taken by a booked activity. Read-only.",
  { from: z.string(), to: z.string() },
  async ({ from, to }) => {
    const rows = svc.listAvailability(new Date(from), new Date(to));
    if (rows.length === 0) return text("No availability windows in that range.");
    const lines = rows.map(
      (w) =>
        `#${w.id} ${w.startAt.toISOString()} – ${w.endAt.toISOString()} ` +
        (w.takenByActivityId ? `TAKEN by activity #${w.takenByActivityId}` : "free") +
        (w.note ? ` (${w.note})` : ""),
    );
    return text(lines.join("\n"));
  },
);

server.tool(
  "mark_availability_taken",
  "Mark an offered availability window as consumed by a booked activity, so it is no longer offered elsewhere.",
  { id: z.number().int(), activity_id: z.number().int() },
  async ({ id, activity_id }) => {
    const w = svc.markAvailabilityTaken(id, activity_id);
    if (!w) return text(`No availability window with id ${id}.`);
    return text(`Window #${id} marked taken by activity #${activity_id}.`);
  },
);

server.tool(
  "add_contact",
  "Attach a person to a job with a role (recruiter, coordinator, interviewer, hiring_manager, agency, referrer). Reuses an existing contact matching the same name and email; re-adding the same person updates their role on that job.",
  {
    job_id: z.number().int(),
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    title: z.string().optional(),
    company: z.string().optional(),
    role: z.enum(contactRoles).optional(),
  },
  async ({ job_id, name, email, phone, title, company, role }) => {
    if (!svc.getJob(job_id)) return text(`No job with id ${job_id}.`);
    const c = svc.addContactToJob(job_id, { name, email, phone, title, company, role });
    return text(`Linked ${c.name}${role ? ` as ${role}` : ""} to job #${job_id} (contact #${c.id}).`);
  },
);

server.tool(
  "list_contacts",
  "List the people attached to a job with their roles and contact details. Read-only.",
  { job_id: z.number().int() },
  async ({ job_id }) => {
    const rows = svc.listContactsForJob(job_id);
    if (rows.length === 0) return text(`No contacts on job #${job_id}.`);
    const lines = rows.map(
      (c) =>
        `#${c.id} ${c.name}${c.role ? ` [${c.role}]` : ""}${c.title ? ` — ${c.title}` : ""}` +
        [c.email, c.phone].filter(Boolean).map((x) => ` · ${x}`).join(""),
    );
    return text(lines.join("\n"));
  },
);

server.tool(
  "delete_activity",
  "DESTRUCTIVE and irreversible: permanently deletes one activity (e.g. one logged by mistake). Prefer update_activity to correct instead of delete when the event actually happened.",
  { activity_id: z.number().int() },
  async ({ activity_id }) => {
    const existing = svc.listActivitiesAcrossJobs().find((a) => a.id === activity_id);
    if (!existing) return text(`No activity with id ${activity_id}.`);
    svc.deleteActivity(activity_id);
    return text(`Deleted activity #${activity_id} ([${existing.category}] ${existing.title}).`);
  },
);

server.tool(
  "update_note",
  "Replace a note's text in place. Reversible by updating again (the previous text is overwritten, so quote it back if you need to preserve it).",
  { note_id: z.number().int(), body: z.string() },
  async ({ note_id, body }) => {
    const updated = svc.updateNote(note_id, body);
    if (!updated) return text(`No note with id ${note_id}.`);
    return text(`Updated note #${note_id}.`);
  },
);

server.tool(
  "delete_note",
  "DESTRUCTIVE and irreversible: permanently deletes one note.",
  { note_id: z.number().int() },
  async ({ note_id }) => {
    svc.deleteNote(note_id);
    return text(`Deleted note #${note_id} (if it existed).`);
  },
);

server.tool(
  "add_note",
  "Add a note (markdown) to a job.",
  { job_id: z.number().int(), body: z.string() },
  async ({ job_id, body }) => {
    if (!svc.getJob(job_id)) return text(`No job with id ${job_id}.`);
    const note = svc.createNote({ jobId: job_id, body });
    return text(`Added note #${note.id} to job #${job_id}.`);
  },
);

server.tool(
  "search",
  "Search jobs by title, company, or location.",
  { query: z.string() },
  async ({ query }) => {
    const results = svc.search(query);
    if (results.length === 0) return text(`No matches for "${query}".`);
    const lines = results.map(
      (r) =>
        `#${r.id} ${r.title}${r.companyName ? ` @ ${r.companyName}` : ""} [${r.stageName}]`,
    );
    return text(`${results.length} matches:\n${lines.join("\n")}`);
  },
);

server.tool(
  "get_metrics",
  "Board metrics: totals per stage, weekly applications, conversion and response rates, average days in stage.",
  {},
  async () => {
    const m = svc.getMetrics();
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    const f = m.interviewFunnel;
    const lines = [
      "totals per stage:",
      ...m.totalsPerStage.map((t) => `  ${t.stage}: ${t.total}`),
      "source breakdown (companies / jobs):",
      ...m.sourceBreakdown.map((s) => `  ${s.source}: ${s.companies} / ${s.jobs}`),
      "interview rounds:",
      `  screening calls: ${f.screens}`,
      `  hiring manager rounds: ${f.hmRounds}`,
      `  technical rounds: ${f.technicalRounds}`,
      `  final rounds: ${f.finalRounds}`,
      `  offers: ${f.offers}`,
      `  unclassified interviews: ${f.unclassifiedInterviews}`,
      "conversion:",
      `  applied → interview: ${pct(m.conversionRates.appliedToInterview)}`,
      `  interview → offer: ${pct(m.conversionRates.interviewToOffer)}`,
      `  applied → offer: ${pct(m.conversionRates.appliedToOffer)}`,
      `response rate: ${pct(m.responseRate.rate)} (${m.responseRate.responded}/${m.responseRate.applied})`,
      "average days in stage:",
      ...m.averageDaysInStage.map((r) => `  ${r.stage}: ${r.avgDays.toFixed(1)}`),
      "applications per week (recent):",
      ...m.applicationsPerWeek.slice(-8).map((w) => `  ${w.week}: ${w.applications}`),
    ];
    return text(lines.join("\n"));
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
