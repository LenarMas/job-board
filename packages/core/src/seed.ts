/**
 * Seed the database with fictional demo data so the app runs out of the box.
 * All companies, jobs, and people here are invented.
 *
 * Usage: npm run seed   (from the repo root; wipes data/jobtrack.db first)
 *
 * Refuses to wipe a database containing imported (non-demo) data unless
 * called with --force.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import { createDb, defaultDbPath } from "./db";
import { createServices } from "./services";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

const dbPath = defaultDbPath();
if (fs.existsSync(dbPath)) {
  let importedCount = 0;
  const probe = new Database(dbPath, { readonly: true });
  try {
    const row = probe
      .prepare("select count(*) as n from jobs where source_id is not null")
      .get() as { n: number };
    importedCount = row.n;
  } catch {
    // no jobs table — nothing to protect
  } finally {
    probe.close();
  }
  if (importedCount > 0 && !process.argv.includes("--force")) {
    console.error(
      `${dbPath} contains ${importedCount} imported jobs — refusing to wipe it.\n` +
        "Re-run with --force to overwrite with demo data (a fresh import can restore it).",
    );
    process.exit(1);
  }
  fs.rmSync(dbPath);
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(dbPath + suffix)) fs.rmSync(dbPath + suffix);
  }
}
const db = createDb(dbPath);
const svc = createServices(db);
svc.getOrCreateDefaultBoard();

type SeedJob = {
  title: string;
  company: string;
  stage: "wishlist" | "applied" | "interview" | "offer" | "rejected";
  location: string;
  salary?: string;
  createdDaysAgo: number;
  appliedDaysAgo?: number;
  rejectedDaysAgo?: number;
  interviewDaysAgo?: number;
};

const seedJobs: SeedJob[] = [
  { title: "Platform Engineer", company: "Northwind Cloud", stage: "wishlist", location: "Remote, US", createdDaysAgo: 3 },
  { title: "Senior DevOps Engineer", company: "Acme Analytics", stage: "applied", location: "New York, NY", salary: "$170k–$190k", createdDaysAgo: 21, appliedDaysAgo: 20 },
  { title: "Site Reliability Engineer", company: "Blue Harbor Health", stage: "applied", location: "Boston, MA", createdDaysAgo: 14, appliedDaysAgo: 14 },
  { title: "Infrastructure Engineer", company: "Copperline Robotics", stage: "applied", location: "Austin, TX", createdDaysAgo: 10, appliedDaysAgo: 9 },
  { title: "Cloud Engineer", company: "Juniper Freight", stage: "applied", location: "Chicago, IL", createdDaysAgo: 7, appliedDaysAgo: 7 },
  { title: "Staff Platform Engineer", company: "Lakeview Fintech", stage: "interview", location: "Remote, US", salary: "$200k", createdDaysAgo: 30, appliedDaysAgo: 28, interviewDaysAgo: 12 },
  { title: "DevOps Engineer", company: "Orchard Media", stage: "interview", location: "Seattle, WA", createdDaysAgo: 25, appliedDaysAgo: 24, interviewDaysAgo: 6 },
  { title: "Senior SRE", company: "Granite Games", stage: "offer", location: "Remote, US", salary: "$185k", createdDaysAgo: 45, appliedDaysAgo: 44, interviewDaysAgo: 20 },
  { title: "Kubernetes Engineer", company: "Seabright Logistics", stage: "rejected", location: "Denver, CO", createdDaysAgo: 40, appliedDaysAgo: 39, rejectedDaysAgo: 15 },
  { title: "Cloud Infrastructure Engineer", company: "Foxglove Biotech", stage: "rejected", location: "San Diego, CA", createdDaysAgo: 35, appliedDaysAgo: 34, rejectedDaysAgo: 10 },
];

for (const s of seedJobs) {
  const job = svc.createJob({
    title: s.title,
    company: s.company,
    stageName: "wishlist",
    location: s.location,
    salary: s.salary,
    createdAt: daysAgo(s.createdDaysAgo),
  });
  if (s.appliedDaysAgo !== undefined) {
    svc.moveJob(job.id, { stageName: "applied" }, daysAgo(s.appliedDaysAgo));
    svc.createActivity({
      jobId: job.id,
      category: "apply",
      title: "Applied",
      completedAt: daysAgo(s.appliedDaysAgo),
      createdAt: daysAgo(s.appliedDaysAgo),
    });
  }
  if (s.interviewDaysAgo !== undefined) {
    svc.moveJob(job.id, { stageName: "interview" }, daysAgo(s.interviewDaysAgo));
    svc.createActivity({
      jobId: job.id,
      category: "interview",
      title: "Phone screen",
      completedAt: daysAgo(s.interviewDaysAgo),
      createdAt: daysAgo(s.interviewDaysAgo),
    });
  }
  if (s.stage === "offer") {
    svc.moveJob(job.id, { stageName: "offer" }, daysAgo(5));
    svc.createActivity({ jobId: job.id, category: "offer", title: "Offer received", completedAt: daysAgo(5), createdAt: daysAgo(5) });
  }
  if (s.rejectedDaysAgo !== undefined) {
    svc.moveJob(job.id, { stageName: "rejected" }, daysAgo(s.rejectedDaysAgo));
  }
}

// A couple of notes, a contact, and a pending follow-up on the first interview job.
const interviewJob = svc.listJobs({ stageName: "interview" })[0];
if (interviewJob) {
  svc.createNote({
    jobId: interviewJob.id,
    body: "Recruiter said the team runs **EKS + Terraform**. Panel is 4 rounds.",
  });
  const contact = svc.createContact({
    name: "Jordan Reyes",
    title: "Technical Recruiter",
    email: "jordan.reyes@example.com",
  });
  svc.linkContact(interviewJob.id, contact.id);
  svc.createActivity({
    jobId: interviewJob.id,
    category: "follow_up",
    title: "Send thank-you note",
    dueAt: daysAgo(-2),
  });
}

const totals = svc.totalsPerStage();
console.log(`Seeded ${dbPath}`);
for (const t of totals) console.log(`  ${t.stage}: ${t.total}`);
