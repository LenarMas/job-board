import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const id = () => integer("id").primaryKey({ autoIncrement: true });
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const boards = sqliteTable("boards", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
  sourceId: text("source_id").unique(),
});

export const stages = sqliteTable(
  "stages",
  {
    id: id(),
    boardId: integer("board_id")
      .notNull()
      .references(() => boards.id),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    sourceId: text("source_id").unique(),
  },
  (t) => [index("stages_board_idx").on(t.boardId)],
);

export const companies = sqliteTable("companies", {
  id: id(),
  name: text("name").notNull(),
  website: text("website"),
  type: text("type"),
  address: text("address"),
  country: text("country"),
  notes: text("notes"),
  sourceId: text("source_id").unique(),
  extras: text("extras", { mode: "json" }),
});

export const jobSources = ["applied", "reachout", "referral", "other"] as const;
export type JobSource = (typeof jobSources)[number];

export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    boardId: integer("board_id")
      .notNull()
      .references(() => boards.id),
    stageId: integer("stage_id")
      .notNull()
      .references(() => stages.id),
    title: text("title").notNull(),
    companyId: integer("company_id").references(() => companies.id),
    location: text("location"),
    url: text("url"),
    salary: text("salary"),
    color: text("color"),
    description: text("description"),
    deadline: integer("deadline", { mode: "timestamp_ms" }),
    position: real("position").notNull().default(0),
    createdAt: createdAt(),
    appliedAt: integer("applied_at", { mode: "timestamp_ms" }),
    rejectedAt: integer("rejected_at", { mode: "timestamp_ms" }),
    // How the opportunity originated (cold application vs recruiter reachout
    // vs referral); null means untagged.
    source: text("source", { enum: jobSources }),
    sourceId: text("source_id").unique(),
    extras: text("extras", { mode: "json" }),
  },
  (t) => [
    index("jobs_stage_idx").on(t.stageId, t.position),
    index("jobs_company_idx").on(t.companyId),
  ],
);

export const activityCategories = [
  "apply",
  "screen",
  "interview",
  "hm",
  "technical",
  "final",
  "follow_up",
  "offer",
  "other",
] as const;
export type ActivityCategory = (typeof activityCategories)[number];

export const activities = sqliteTable(
  "activities",
  {
    id: id(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    category: text("category", { enum: activityCategories })
      .notNull()
      .default("other"),
    title: text("title").notNull(),
    note: text("note"),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    sourceId: text("source_id").unique(),
    extras: text("extras", { mode: "json" }),
  },
  (t) => [index("activities_job_idx").on(t.jobId)],
);

export const notes = sqliteTable(
  "notes",
  {
    id: id(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    sourceId: text("source_id").unique(),
  },
  (t) => [index("notes_job_idx").on(t.jobId)],
);

export const contacts = sqliteTable("contacts", {
  id: id(),
  name: text("name").notNull(),
  title: text("title"),
  companyId: integer("company_id").references(() => companies.id),
  email: text("email"),
  phone: text("phone"),
  linkedin: text("linkedin"),
  notes: text("notes"),
  sourceId: text("source_id").unique(),
  extras: text("extras", { mode: "json" }),
});

export const jobContacts = sqliteTable(
  "job_contacts",
  {
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.contactId] })],
);

export const documentKinds = ["resume", "cover_letter", "other"] as const;
export type DocumentKind = (typeof documentKinds)[number];

export const documents = sqliteTable(
  "documents",
  {
    id: id(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: documentKinds }).notNull().default("other"),
    filename: text("filename").notNull(),
    path: text("path"),
    createdAt: createdAt(),
    sourceId: text("source_id").unique(),
  },
  (t) => [index("documents_job_idx").on(t.jobId)],
);

// One row per stage change; drives time-in-stage and conversion metrics.
export const stageEvents = sqliteTable(
  "stage_events",
  {
    id: id(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    fromStageId: integer("from_stage_id").references(() => stages.id),
    toStageId: integer("to_stage_id")
      .notNull()
      .references(() => stages.id),
    movedAt: integer("moved_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    sourceId: text("source_id").unique(),
  },
  (t) => [index("stage_events_job_idx").on(t.jobId, t.movedAt)],
);

export type Board = typeof boards.$inferSelect;
export type Stage = typeof stages.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type StageEvent = typeof stageEvents.$inferSelect;
