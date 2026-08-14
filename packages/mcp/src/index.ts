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
  createDb,
  createServices,
  DEFAULT_STAGES,
} from "@jobtrack/core";

// Resolve the DB relative to this file, not cwd — MCP hosts launch the server
// from an arbitrary working directory.
const dbPath =
  process.env.JOBTRACK_DB ??
  path.join(import.meta.dirname, "..", "..", "..", "data", "jobtrack.db");
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
      `created: ${fmtDate(job.createdAt)}  applied: ${fmtDate(job.appliedAt)}  rejected: ${fmtDate(job.rejectedAt)}`,
    ];
    if (activities.length > 0) {
      lines.push(`activities (${activities.length}):`);
      for (const a of activities.slice(0, 15)) {
        const status = a.completedAt
          ? `done ${fmtDate(a.completedAt)}`
          : a.dueAt
            ? `due ${fmtDate(a.dueAt)}`
            : "pending";
        lines.push(`  - [${a.category}] ${a.title} (${status})`);
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
  },
  async ({ title, company, stage, url, location, salary, description }) => {
    const job = svc.createJob({
      title,
      company,
      stageName: stage,
      url,
      location,
      salary,
      description,
    });
    return text(`Created job #${job.id}: ${title} in ${stage}.`);
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
  "Log an activity on a job (apply, interview, follow_up, offer, other).",
  {
    job_id: z.number().int(),
    category: z.enum(activityCategories),
    title: z.string(),
    note: z.string().optional(),
    due_at: z.string().optional().describe("ISO date, e.g. 2026-08-20"),
    completed: z.boolean().default(false),
  },
  async ({ job_id, category, title, note, due_at, completed }) => {
    if (!svc.getJob(job_id)) return text(`No job with id ${job_id}.`);
    const activity = svc.createActivity({
      jobId: job_id,
      category,
      title,
      note,
      dueAt: due_at ? new Date(due_at) : undefined,
      completedAt: completed ? new Date() : undefined,
    });
    return text(`Logged ${category} activity #${activity.id} on job #${job_id}.`);
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
    const lines = [
      "totals per stage:",
      ...m.totalsPerStage.map((t) => `  ${t.stage}: ${t.total}`),
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
