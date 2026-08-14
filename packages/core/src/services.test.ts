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

  it("applications per week buckets by Monday-based week", () => {
    const job = svc.createJob({ title: "A", stageName: "wishlist" });
    svc.moveJob(job.id, { stageName: "applied" }, daysAgo(1));
    const weeks = svc.applicationsPerWeek(4);
    expect(weeks.reduce((s, w) => s + w.applications, 0)).toBe(1);
  });
});
