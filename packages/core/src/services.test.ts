import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "./db";
import { createServices, type Services } from "./services";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

let db: Db;
let svc: Services;

beforeEach(() => {
  db = createDb(":memory:");
  svc = createServices(db);
  svc.getOrCreateDefaultBoard();
});

describe("board setup", () => {
  it("creates the five default stages once", () => {
    const board = svc.getOrCreateDefaultBoard();
    const again = svc.getOrCreateDefaultBoard();
    expect(again.id).toBe(board.id);
    expect(svc.listStages(board.id).map((s) => s.name)).toEqual([
      "wishlist",
      "applied",
      "interview",
      "offer",
      "rejected",
    ]);
  });
});

describe("jobs and companies", () => {
  it("creates a job with a company, reusing companies by name", () => {
    const a = svc.createJob({ title: "SRE", company: "Acme", stageName: "applied" });
    const b = svc.createJob({ title: "DevOps", company: "Acme", stageName: "applied" });
    expect(a.companyId).toBe(b.companyId);
    expect(svc.listCompanies()).toHaveLength(1);
  });

  it("filters listJobs by stage and query", () => {
    svc.createJob({ title: "SRE", company: "Acme", stageName: "applied" });
    svc.createJob({ title: "Platform Engineer", company: "Beta", stageName: "wishlist" });
    expect(svc.listJobs({ stageName: "applied" })).toHaveLength(1);
    expect(svc.listJobs({ query: "platform" })).toHaveLength(1);
    expect(svc.listJobs({ query: "acme" })).toHaveLength(1);
    expect(svc.listJobs()).toHaveLength(2);
  });
});

describe("moveJob position handling", () => {
  it("appends to the bottom when no index is given", () => {
    const a = svc.createJob({ title: "A", stageName: "applied" });
    const b = svc.createJob({ title: "B", stageName: "applied" });
    const c = svc.createJob({ title: "C", stageName: "wishlist" });
    svc.moveJob(c.id, { stageName: "applied" });
    const ids = svc.listJobs({ stageName: "applied" }).map((j) => j.id);
    expect(ids).toEqual([a.id, b.id, c.id]);
  });

  it("inserts at the top with index 0", () => {
    const a = svc.createJob({ title: "A", stageName: "applied" });
    const b = svc.createJob({ title: "B", stageName: "applied" });
    svc.moveJob(b.id, { stageName: "applied", index: 0 });
    const ids = svc.listJobs({ stageName: "applied" }).map((j) => j.id);
    expect(ids).toEqual([b.id, a.id]);
  });

  it("inserts between neighbours at a middle index", () => {
    const a = svc.createJob({ title: "A", stageName: "applied" });
    const b = svc.createJob({ title: "B", stageName: "applied" });
    const c = svc.createJob({ title: "C", stageName: "applied" });
    svc.moveJob(c.id, { stageName: "applied", index: 1 });
    const ids = svc.listJobs({ stageName: "applied" }).map((j) => j.id);
    expect(ids).toEqual([a.id, c.id, b.id]);
  });

  it("survives repeated moves into the same slot (position renumbering)", () => {
    for (const t of ["A", "B", "C", "D"]) {
      svc.createJob({ title: t, stageName: "applied" });
    }
    // Repeatedly move the last job to index 1; this bisects the same interval
    // until it forces a renumber.
    for (let i = 0; i < 60; i++) {
      const list = svc.listJobs({ stageName: "applied" });
      svc.moveJob(list[list.length - 1]!.id, { stageName: "applied", index: 1 });
    }
    const list = svc.listJobs({ stageName: "applied" });
    expect(list).toHaveLength(4);
    const positions = list.map((j) => j.position);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
    expect(new Set(positions).size).toBe(4);
  });

  it("sets appliedAt / rejectedAt on first entry into those stages", () => {
    const job = svc.createJob({ title: "A", stageName: "wishlist" });
    const applied = new Date("2026-01-05T12:00:00Z");
    const rejected = new Date("2026-02-01T12:00:00Z");
    svc.moveJob(job.id, { stageName: "applied" }, applied);
    svc.moveJob(job.id, { stageName: "rejected" }, rejected);
    const loaded = svc.getJob(job.id)!;
    expect(loaded.appliedAt).toEqual(applied);
    expect(loaded.rejectedAt).toEqual(rejected);
    // Moving back through applied later must not overwrite the original date.
    svc.moveJob(job.id, { stageName: "applied" }, new Date());
    expect(svc.getJob(job.id)!.appliedAt).toEqual(applied);
  });

  it("records stage events only on stage changes", () => {
    const job = svc.createJob({ title: "A", stageName: "wishlist" });
    svc.moveJob(job.id, { stageName: "applied" });
    svc.moveJob(job.id, { stageName: "applied", index: 0 }); // reorder only
    svc.moveJob(job.id, { stageName: "interview" });
    const rows = db.get<{ n: number }>(
      sql`select count(*) as n from stage_events where job_id = ${job.id}`,
    );
    expect(rows.n).toBe(3); // create + 2 real stage changes
  });
});

describe("activities, notes, contacts, documents", () => {
  it("round-trips an activity with completion", () => {
    const job = svc.createJob({ title: "A", stageName: "applied" });
    const act = svc.createActivity({
      jobId: job.id,
      category: "interview",
      title: "Phone screen",
      dueAt: daysAgo(-1),
    });
    expect(svc.listActivities(job.id)).toHaveLength(1);
    svc.updateActivity(act.id, { completedAt: new Date() });
    expect(svc.listActivities(job.id)[0]!.completedAt).not.toBeNull();
  });

  it("links and unlinks contacts", () => {
    const job = svc.createJob({ title: "A", stageName: "applied" });
    const contact = svc.createContact({ name: "Sam Doe" });
    svc.linkContact(job.id, contact.id);
    svc.linkContact(job.id, contact.id); // idempotent
    expect(svc.listContactsForJob(job.id)).toHaveLength(1);
    svc.unlinkContact(job.id, contact.id);
    expect(svc.listContactsForJob(job.id)).toHaveLength(0);
  });

  it("stores document metadata", () => {
    const job = svc.createJob({ title: "A", stageName: "applied" });
    svc.createDocument({ jobId: job.id, kind: "resume", filename: "resume.pdf" });
    expect(svc.listDocuments(job.id)).toHaveLength(1);
  });

  it("cascades deletes from job to children", () => {
    const job = svc.createJob({ title: "A", stageName: "applied" });
    svc.createNote({ jobId: job.id, body: "hi" });
    svc.createActivity({ jobId: job.id, category: "other", title: "x" });
    svc.deleteJob(job.id);
    const notesLeft = db.get<{ n: number }>(sql`select count(*) as n from notes`);
    expect(notesLeft.n).toBe(0);
  });
});

describe("archive and merge", () => {
  it("archive hides the job from board, search, and metrics; restore returns it intact", () => {
    const keep = svc.createJob({ title: "Keeper", company: "Acme", stageName: "applied", appliedAt: daysAgo(5) });
    const dupe = svc.createJob({
      title: "Duplicate Engineer",
      company: "Beta Corp",
      stageName: "applied",
      appliedAt: daysAgo(3),
      url: "https://example.test/dupe",
      salary: "$100k",
    });
    svc.createActivity({ jobId: dupe.id, category: "screen", title: "Phone screen" });
    svc.createNote({ jobId: dupe.id, body: "note stays" });
    void keep;

    svc.archiveJob(dupe.id);
    expect(svc.listJobs().map((j) => j.id)).not.toContain(dupe.id);
    expect(svc.boardSnapshot().stages.flatMap((s) => s.jobs.map((j) => j.id))).not.toContain(dupe.id);
    expect(svc.search("Duplicate").length).toBe(0);
    const totals = Object.fromEntries(svc.totalsPerStage().map((t) => [t.stage, t.total]));
    expect(totals.applied).toBe(1); // only the keeper
    expect(svc.responseRate().applied).toBe(1);
    expect(svc.interviewFunnel().screens).toBe(0); // archived job's activity excluded
    expect(svc.sourceBreakdown().reduce((n, r) => n + r.jobs, 0)).toBe(1);
    expect(svc.applicationsPerWeek().reduce((n, w) => n + w.applications, 0)).toBe(1);
    expect(svc.findJobByUrl("https://example.test/dupe")).toBeUndefined();
    expect(svc.listArchived().map((j) => j.id)).toContain(dupe.id);

    svc.restoreJob(dupe.id);
    const restored = svc.getJob(dupe.id)!;
    expect(restored.title).toBe("Duplicate Engineer");
    expect(restored.salary).toBe("$100k");
    expect(restored.appliedAt).not.toBeNull();
    expect(svc.listActivities(dupe.id)).toHaveLength(1);
    expect(svc.listNotes(dupe.id)).toHaveLength(1);
    expect(svc.listJobs().map((j) => j.id)).toContain(dupe.id);
    expect(svc.interviewFunnel().screens).toBe(1);
  });

  it("merge moves all children to target with no orphans and fills empty fields", () => {
    const target = svc.createJob({ title: "SRE", company: "Acme", stageName: "interview" });
    const source = svc.createJob({
      title: "SRE (dup)",
      company: "Acme",
      stageName: "applied",
      url: "https://example.test/sre",
      salary: "$150k",
      appliedAt: daysAgo(10),
    });
    svc.createActivity({ jobId: source.id, category: "apply", title: "Applied" });
    svc.createActivity({ jobId: source.id, category: "screen", title: "Recruiter call" });
    svc.createNote({ jobId: source.id, body: "from the duplicate" });

    const merged = svc.mergeJobs(source.id, target.id);
    expect(merged.id).toBe(target.id);
    expect(merged.stageId).toBe(target.stageId); // stage kept
    expect(merged.url).toBe("https://example.test/sre"); // filled from source
    expect(merged.salary).toBe("$150k");
    expect(merged.appliedAt).not.toBeNull();
    // children moved, none orphaned on the source
    expect(svc.listActivities(source.id)).toHaveLength(0);
    expect(svc.listActivities(target.id)).toHaveLength(2);
    const targetNotes = svc.listNotes(target.id);
    expect(targetNotes.some((n) => n.body === "from the duplicate")).toBe(true);
    expect(targetNotes.some((n) => n.body.startsWith("Merged job #"))).toBe(true);
    expect(svc.listNotes(source.id)).toHaveLength(0);
    // source archived, not deleted
    expect(svc.getJob(source.id)).toBeDefined();
    expect(svc.listArchived().map((j) => j.id)).toContain(source.id);
  });

  it("merge refuses self-merge and archived participants with clear errors", () => {
    const a = svc.createJob({ title: "A", stageName: "applied" });
    const b = svc.createJob({ title: "B", stageName: "applied" });
    expect(() => svc.mergeJobs(a.id, a.id)).toThrow(/into itself/);
    svc.archiveJob(b.id);
    expect(() => svc.mergeJobs(b.id, a.id)).toThrow(/archived/);
    expect(() => svc.mergeJobs(a.id, b.id)).toThrow(/archived/);
    expect(() => svc.mergeJobs(a.id, 99999)).toThrow(/does not exist/);
  });

  it("updateJob patches only the provided fields", () => {
    const job = svc.createJob({
      title: "Original",
      company: "Acme",
      stageName: "applied",
      location: "NYC",
      salary: "$1",
      url: "https://example.test/orig",
    });
    svc.updateJob(job.id, { salary: "$180k", appliedAt: new Date("2026-07-01T00:00:00Z") });
    const after = svc.getJob(job.id)!;
    expect(after.salary).toBe("$180k");
    expect(after.appliedAt).toEqual(new Date("2026-07-01T00:00:00Z"));
    expect(after.title).toBe("Original");
    expect(after.location).toBe("NYC");
    expect(after.url).toBe("https://example.test/orig");
    expect(after.company?.name).toBe("Acme");
  });
});

describe("scheduling", () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 7, 21, h, m));

  it("find_conflicts catches a real overlap and tight gaps, ignoring archived jobs", () => {
    const a = svc.createJob({ title: "A", company: "Acme", stageName: "interview" });
    const b = svc.createJob({ title: "B", company: "Beta", stageName: "interview" });
    const c = svc.createJob({ title: "C", company: "Gamma", stageName: "interview" });
    // 11:00–11:45 overlaps the 10:00–13:30 window
    svc.createActivity({ jobId: a.id, category: "hm", title: "HM round", startsAt: at(11), endsAt: at(11, 45) });
    svc.createActivity({ jobId: b.id, category: "screen", title: "Agency block", startsAt: at(10), endsAt: at(13, 30) });
    // 14:00–14:30 is only 30 minutes after the block ends
    svc.createActivity({ jobId: c.id, category: "technical", title: "Tech round", startsAt: at(14), endsAt: at(14, 30) });

    const { overlaps, tight } = svc.findConflicts(at(0), at(23), 45);
    expect(overlaps).toHaveLength(1);
    expect([overlaps[0]!.a.title, overlaps[0]!.b.title].sort()).toEqual(["Agency block", "HM round"]);
    expect(tight).toHaveLength(1);
    expect(tight[0]!.gapMinutes).toBe(30);

    // archiving the agency job removes its block from conflict checks
    svc.archiveJob(b.id);
    expect(svc.findConflicts(at(0), at(23), 45).overlaps).toHaveLength(0);
  });

  it("find_conflicts reports coverage: what was examined and what was skipped untimed", () => {
    const job = svc.createJob({ title: "A", company: "Acme", stageName: "interview" });
    svc.createActivity({ jobId: job.id, category: "hm", title: "Timed", startsAt: at(11), endsAt: at(11, 45) });
    // due date only — pre-Tier-2 shape, invisible to the overlap check
    svc.createActivity({ jobId: job.id, category: "screen", title: "Untimed screen", dueAt: at(12) });
    // start but no end — also not checkable
    svc.createActivity({ jobId: job.id, category: "technical", title: "Half-timed", startsAt: at(15) });

    const res = svc.findConflicts(at(0), at(23));
    expect(res.considered).toBe(1);
    expect(res.overlaps).toHaveLength(0);
    expect(res.skippedUntimed.map((a) => a.title).sort()).toEqual(["Half-timed", "Untimed screen"]);
  });

  it("list_untimed returns due-dated activities with no start time, in range", () => {
    const job = svc.createJob({ title: "A", company: "Acme", stageName: "interview" });
    svc.createActivity({ jobId: job.id, category: "screen", title: "Needs a time", dueAt: at(12) });
    svc.createActivity({ jobId: job.id, category: "hm", title: "Already timed", dueAt: at(13), startsAt: at(13), endsAt: at(13, 45) });
    svc.createActivity({ jobId: job.id, category: "final", title: "Out of range", dueAt: new Date(Date.UTC(2026, 8, 30)) });
    const rows = svc.listUntimed(at(0), at(23));
    expect(rows.map((a) => a.title)).toEqual(["Needs a time"]);
    // archived jobs drop out here too
    svc.archiveJob(job.id);
    expect(svc.listUntimed(at(0), at(23))).toHaveLength(0);
  });

  it("availability windows can be listed and marked taken", () => {
    const w = svc.addAvailability(at(10), at(13, 30), "offered to agency");
    const job = svc.createJob({ title: "A", stageName: "interview" });
    const act = svc.createActivity({ jobId: job.id, category: "hm", title: "HM", startsAt: at(11), endsAt: at(11, 45) });
    expect(svc.listAvailability(at(9), at(14))).toHaveLength(1);
    expect(svc.listAvailability(at(14), at(18))).toHaveLength(0);
    const taken = svc.markAvailabilityTaken(w.id, act.id);
    expect(taken.takenByActivityId).toBe(act.id);
  });

  it("contacts attach to a job with a role, deduped by name+email", () => {
    const job = svc.createJob({ title: "A", company: "Acme", stageName: "interview" });
    svc.addContactToJob(job.id, { name: "Pat Doe", email: "pat@agency.example", role: "agency" });
    svc.addContactToJob(job.id, { name: "Kim Roe", email: "kim@acme.example", title: "Coordinator", role: "coordinator" });
    // same person again with a new role updates the link, no duplicate contact
    svc.addContactToJob(job.id, { name: "Pat Doe", email: "pat@agency.example", role: "recruiter" });
    const linked = svc.listContactsForJob(job.id);
    expect(linked).toHaveLength(2);
    expect(linked.find((c) => c.name === "Pat Doe")?.role).toBe("recruiter");
    expect(linked.find((c) => c.name === "Kim Roe")?.role).toBe("coordinator");
    expect(svc.listContacts()).toHaveLength(2);
  });
});

describe("duplicates, upsert, staleness", () => {
  it("upsert does not create a second row and reports the match", () => {
    const first = svc.upsertJob({
      title: "Platform Engineer",
      company: "JPMorgan Chase & Co.",
      stageName: "applied",
      externalId: "210747612",
    });
    expect(first.created).toBe(true);

    // same requisition at a differently-written company name
    const again = svc.upsertJob({
      title: "Platform Engineer II",
      company: "JPMorganChase",
      externalId: "210747612",
      url: "https://example.test/jpmc/210747612",
      notes: ["recruiter pinged"],
    });
    expect(again.created).toBe(false);
    expect(again.matchedOn).toBe("external_id");
    expect(again.job.id).toBe(first.job.id);
    expect(again.job.url).toBe("https://example.test/jpmc/210747612"); // empty field filled
    expect(svc.listNotes(first.job.id)).toHaveLength(1);

    // company+title match, and by url
    const byTitle = svc.upsertJob({ title: "platform engineer", company: "JPMorgan Chase & Co." });
    expect(byTitle.created).toBe(false);
    expect(byTitle.matchedOn).toBe("company+title");
    const byUrl = svc.upsertJob({ title: "X", url: "https://example.test/jpmc/210747612" });
    expect(byUrl.created).toBe(false);
    expect(byUrl.matchedOn).toBe("url");

    expect(svc.listJobs()).toHaveLength(1); // still one row
  });

  it("upsert applies children atomically on create", () => {
    const res = svc.upsertJob({
      title: "SRE",
      company: "Acme",
      stageName: "interview",
      appliedAt: daysAgo(10),
      activities: [
        { category: "apply", title: "Applied", completedAt: daysAgo(10) },
        { category: "screen", title: "Phone screen", completedAt: daysAgo(5) },
      ],
      notes: ["backfilled from history"],
    });
    expect(res.created).toBe(true);
    expect(res.job.stage?.name).toBe("interview");
    expect(svc.listActivities(res.job.id)).toHaveLength(2);
    expect(svc.listNotes(res.job.id)).toHaveLength(1);
  });

  it("find_duplicates flags fuzzy company + similar title and requisition matches", () => {
    svc.createJob({ title: "Senior Platform Engineer", company: "JPMorgan Chase & Co.", stageName: "applied" });
    svc.createJob({ title: "Senior Platform Engineer", company: "JPMorganChase", stageName: "wishlist" });
    svc.createJob({ title: "Data Analyst", company: "Beta", stageName: "applied" });
    const pairs = svc.findDuplicates();
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.reason).toContain("similar title");
    // archived cards stop being flagged
    svc.archiveJob(pairs[0]!.b.id);
    expect(svc.findDuplicates()).toHaveLength(0);
  });

  it("search covers notes and the description", () => {
    const job = svc.createJob({
      title: "SRE",
      company: "Acme",
      stageName: "applied",
      description: "Kubernetes fleet with Karpenter autoscaling",
    });
    svc.createNote({ jobId: job.id, body: "Recruiter mentioned Datadog migration" });
    expect(svc.search("Karpenter").map((r) => r.id)).toContain(job.id);
    expect(svc.search("Datadog").map((r) => r.id)).toContain(job.id);
    expect(svc.search("nonexistent-term")).toHaveLength(0);
  });

  it("list_stale finds quiet jobs and overdue activities", () => {
    const quiet = svc.createJob({ title: "Quiet", company: "Acme", stageName: "applied", createdAt: daysAgo(30) });
    svc.createActivity({ jobId: quiet.id, category: "apply", title: "Applied", createdAt: daysAgo(20) });
    const active = svc.createJob({ title: "Active", company: "Beta", stageName: "interview", createdAt: daysAgo(30) });
    svc.createActivity({ jobId: active.id, category: "screen", title: "Screen", createdAt: daysAgo(1) });
    svc.createActivity({ jobId: active.id, category: "follow_up", title: "Chase them", dueAt: daysAgo(3) });
    const wishlistOnly = svc.createJob({ title: "Someday", stageName: "wishlist", createdAt: daysAgo(60) });
    void wishlistOnly;

    const { staleJobs, overdue } = svc.listStale(7);
    expect(staleJobs.map((j) => j.title)).toEqual(["Quiet"]); // wishlist and active excluded
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.title).toBe("Chase them");
  });
});

describe("metrics", () => {
  function seedPipeline() {
    // 4 applied total: 1 still applied, 2 interviewed (1 of those got an
    // offer), 1 rejected without response... rejected counts as a response.
    const a = svc.createJob({ title: "A", stageName: "wishlist", createdAt: daysAgo(30) });
    svc.moveJob(a.id, { stageName: "applied" }, daysAgo(28));

    const b = svc.createJob({ title: "B", stageName: "wishlist", createdAt: daysAgo(30) });
    svc.moveJob(b.id, { stageName: "applied" }, daysAgo(26));
    svc.moveJob(b.id, { stageName: "interview" }, daysAgo(20));

    const c = svc.createJob({ title: "C", stageName: "wishlist", createdAt: daysAgo(40) });
    svc.moveJob(c.id, { stageName: "applied" }, daysAgo(38));
    svc.moveJob(c.id, { stageName: "interview" }, daysAgo(30));
    svc.moveJob(c.id, { stageName: "offer" }, daysAgo(10));

    const d = svc.createJob({ title: "D", stageName: "wishlist", createdAt: daysAgo(15) });
    svc.moveJob(d.id, { stageName: "applied" }, daysAgo(14));
    svc.moveJob(d.id, { stageName: "rejected" }, daysAgo(7));
    return { a, b, c, d };
  }

  it("totals per stage", () => {
    seedPipeline();
    const totals = Object.fromEntries(
      svc.totalsPerStage().map((t) => [t.stage, t.total]),
    );
    expect(totals).toEqual({
      wishlist: 0,
      applied: 1,
      interview: 1,
      offer: 1,
      rejected: 1,
    });
  });

  it("conversion rates from stage history", () => {
    seedPipeline();
    const rates = svc.conversionRates();
    expect(rates.appliedToInterview).toBeCloseTo(2 / 4);
    expect(rates.interviewToOffer).toBeCloseTo(1 / 2);
    expect(rates.appliedToOffer).toBeCloseTo(1 / 4);
  });

  it("response rate counts interviews and rejections once per job", () => {
    seedPipeline();
    const rr = svc.responseRate();
    expect(rr.applied).toBe(4);
    expect(rr.responded).toBe(3); // B (interview), C (offer), D (rejected)
    expect(rr.rate).toBeCloseTo(3 / 4);
  });

  it("average days in stage uses closed intervals only", () => {
    const job = svc.createJob({ title: "A", stageName: "wishlist", createdAt: daysAgo(10) });
    svc.moveJob(job.id, { stageName: "applied" }, daysAgo(8)); // 2 days wishlist
    svc.moveJob(job.id, { stageName: "interview" }, daysAgo(2)); // 6 days applied
    const byStage = Object.fromEntries(
      svc.averageDaysInStage().map((r) => [r.stage, r.avgDays]),
    );
    expect(byStage.wishlist).toBeCloseTo(2, 1);
    expect(byStage.applied).toBeCloseTo(6, 1);
    expect(byStage.interview).toBeUndefined(); // still open
  });

  it("classifies interview rounds by category first, then title keywords", () => {
    const job = svc.createJob({ title: "A", stageName: "interview" });
    // tagged categories
    svc.createActivity({ jobId: job.id, category: "screen", title: "Recruiter chat" });
    svc.createActivity({ jobId: job.id, category: "hm", title: "Manager conversation" });
    svc.createActivity({ jobId: job.id, category: "technical", title: "Round 2" });
    svc.createActivity({ jobId: job.id, category: "final", title: "Wrap-up" });
    // imported-style: generic category, meaning lives in the title
    svc.createActivity({ jobId: job.id, category: "interview", title: "Phone Screen" });
    svc.createActivity({ jobId: job.id, category: "interview", title: "Hiring manager round" });
    svc.createActivity({ jobId: job.id, category: "interview", title: "System design interview" });
    svc.createActivity({ jobId: job.id, category: "interview", title: "Final onsite" });
    svc.createActivity({ jobId: job.id, category: "interview", title: "interview" }); // unclassifiable
    svc.createActivity({ jobId: job.id, category: "offer", title: "Offer Received" });
    svc.createActivity({ jobId: job.id, category: "other", title: "Meeting" }); // not an interview
    svc.createActivity({ jobId: job.id, category: "apply", title: "Applied" });
    const funnel = svc.interviewFunnel();
    expect(funnel).toEqual({
      screens: 2,
      hmRounds: 2,
      technicalRounds: 2,
      finalRounds: 2,
      unclassifiedInterviews: 1,
      offers: 1,
    });
  });

  it("breaks down sources, assuming applied for untagged jobs with an applied date", () => {
    const a = svc.createJob({ title: "A", company: "Acme", stageName: "applied", appliedAt: new Date() });
    void a;
    svc.createJob({ title: "B", company: "Acme", stageName: "applied", appliedAt: new Date() });
    const c = svc.createJob({ title: "C", company: "Beta", stageName: "interview" });
    svc.updateJob(c.id, { source: "reachout" });
    svc.createJob({ title: "D", company: "Gamma", stageName: "wishlist" }); // untagged, never applied
    const rows = Object.fromEntries(svc.sourceBreakdown().map((r) => [r.source, r]));
    expect(rows.applied).toMatchObject({ jobs: 2, companies: 1 });
    expect(rows.reachout).toMatchObject({ jobs: 1, companies: 1 });
    expect(rows.untagged).toMatchObject({ jobs: 1, companies: 1 });
  });

  it("deleting a stage event splices the chain and updates conversions", () => {
    const job = svc.createJob({ title: "A", stageName: "wishlist", createdAt: daysAgo(10) });
    svc.moveJob(job.id, { stageName: "applied" }, daysAgo(8));
    svc.moveJob(job.id, { stageName: "offer" }, daysAgo(4)); // accidental click
    svc.moveJob(job.id, { stageName: "rejected" }, daysAgo(2));
    expect(svc.conversionRates().appliedToOffer).toBeGreaterThan(0);
    const accidental = svc.listStageEvents(job.id).find((e) => e.to === "offer")!;
    svc.deleteStageEvent(accidental.id);
    const events = svc.listStageEvents(job.id);
    expect(events.map((e) => e.to)).toEqual(["rejected", "applied", "wishlist"]);
    expect(events[0]!.from).toBe("applied"); // spliced past the deleted move
    expect(svc.conversionRates().appliedToOffer).toBe(0);
  });

  it("lists stage events with names, newest first", () => {
    const job = svc.createJob({ title: "A", stageName: "wishlist", createdAt: daysAgo(5) });
    svc.moveJob(job.id, { stageName: "applied" }, daysAgo(3));
    svc.moveJob(job.id, { stageName: "interview" }, daysAgo(1));
    const events = svc.listStageEvents(job.id);
    expect(events.map((e) => e.to)).toEqual(["interview", "applied", "wishlist"]);
    expect(events[0]!.from).toBe("applied");
    expect(events[2]!.from).toBeNull();
  });

  it("applications per week buckets by Monday-based week", () => {
    const job = svc.createJob({ title: "A", stageName: "wishlist" });
    svc.moveJob(job.id, { stageName: "applied" }, daysAgo(1));
    const weeks = svc.applicationsPerWeek(4);
    expect(weeks.reduce((s, w) => s + w.applications, 0)).toBe(1);
  });
});
