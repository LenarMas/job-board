import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
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
    // Soft delete: archived jobs keep their children but drop out of the
    // board, search, and metrics unless explicitly requested.
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    // Structured compensation, comparable across cards ("$55-62/hr W2" vs
    // "$145k-165k" both become numbers + unit + basis).
    compMin: real("comp_min"),
    compMax: real("comp_max"),
    compUnit: text("comp_unit", { enum: ["annual", "hourly"] }),
    compBasis: text("comp_basis", { enum: ["w2", "c2c", "1099", "unknown"] }),
    compSource: text("comp_source", { enum: ["posted", "recruiter", "inferred"] }),
    // description is the JD text; these record where and when it was captured.
    jdSourceUrl: text("jd_source_url"),
    jdCapturedAt: integer("jd_captured_at", { mode: "timestamp_ms" }),
    // Employer requisition id — often the only reliable way to tell two
    // similarly titled postings apart. Unique per company (NULLs exempt).
    externalId: text("external_id"),
    calendarEventId: text("calendar_event_id"),
    calendarEventUrl: text("calendar_event_url"),
    // How the opportunity originated (cold application vs recruiter reachout
    // vs referral); null means untagged.
    source: text("source", { enum: jobSources }),
    sourceId: text("source_id").unique(),
    extras: text("extras", { mode: "json" }),
  },
  (t) => [
    index("jobs_stage_idx").on(t.stageId, t.position),
    index("jobs_company_idx").on(t.companyId),
    uniqueIndex("jobs_company_external_idx").on(t.companyId, t.externalId),
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
    // Real scheduling data for interviews, so times can be queried and
    // checked for conflicts instead of living in note prose.
    startsAt: integer("starts_at", { mode: "timestamp_ms" }),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }),
    timezone: text("timezone"), // IANA name; app default America/New_York
    meetingUrl: text("meeting_url"),
    meetingId: text("meeting_id"),
    meetingPasscode: text("meeting_passcode"),
    interviewerName: text("interviewer_name"),
    interviewerTitle: text("interviewer_title"),
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

export const contactRoles = [
  "recruiter",
  "coordinator",
  "interviewer",
  "hiring_manager",
  "agency",
  "referrer",
] as const;
export type ContactRole = (typeof contactRoles)[number];

export const jobContacts = sqliteTable(
  "job_contacts",
  {
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    // What this person is to THIS job (the same recruiter can be the agency
    // contact on one card and the referrer on another).
    role: text("role", { enum: contactRoles }),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.contactId] })],
);

/**
 * Interview slots offered to recruiters, so the same window is never offered
 * twice and a booking can be checked against what is genuinely free.
 */
export const availability = sqliteTable("availability", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startAt: integer("start_at", { mode: "timestamp_ms" }).notNull(),
  endAt: integer("end_at", { mode: "timestamp_ms" }).notNull(),
  note: text("note"),
  takenByActivityId: integer("taken_by_activity_id").references(() => activities.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Availability = typeof availability.$inferSelect;

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

// Single-row table (id = 1): the owner's applicant profile, used by the
// browser extension to autofill application forms. The resume file itself
// lives under uploads/.
export const profile = sqliteTable("profile", {
  id: integer("id").primaryKey(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  location: text("location"),
  linkedin: text("linkedin"),
  github: text("github"),
  website: text("website"),
  resumeFilename: text("resume_filename"),
  resumePath: text("resume_path"),
});

export type Profile = typeof profile.$inferSelect;

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
