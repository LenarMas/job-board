import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeLinkedInUrl, parseJobPosting, parseJsonLd, salaryFromText } from "../src/parse";

function loadFixture(name: string): Document {
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures", `${name}.html`),
    "utf8",
  );
  return new DOMParser().parseFromString(html, "text/html");
}

describe("JSON-LD JobPosting parsing", () => {
  it("parses a LinkedIn-style posting, skipping a malformed JSON-LD block", () => {
    const doc = loadFixture("linkedin");
    const job = parseJobPosting(doc, "https://www.linkedin.com/jobs/view/000000001/");
    expect(job.source).toBe("json-ld");
    expect(job.title).toBe("Senior Platform Engineer");
    expect(job.company).toBe("Orbit Dynamics");
    expect(job.location).toBe("Portland, OR, US");
    expect(job.salary).toBe("USD 150000–185000 per year");
    expect(job.description).toContain("deployment platform");
    expect(job.description).toContain("Kubernetes and Terraform");
    expect(job.description).not.toContain("<p>");
    expect(job.url).toBe("https://www.linkedin.com/jobs/view/000000001/");
  });

  it("parses a Greenhouse-style posting nested in @graph, first location wins", () => {
    const doc = loadFixture("greenhouse");
    const job = parseJobPosting(doc, "https://boards.greenhouse.io/meadowlarklabs/jobs/000001");
    expect(job.source).toBe("json-ld");
    expect(job.title).toBe("Data Infrastructure Engineer");
    expect(job.company).toBe("Meadowlark Labs");
    expect(job.location).toBe("Chicago, IL");
    // canonical link overrides the page URL
    expect(job.url).toBe("https://boards.example-ats.io/meadowlarklabs/jobs/000001");
  });

  it("parses a Lever-style posting in a top-level array with exact salary and string org", () => {
    const doc = loadFixture("lever");
    const job = parseJobPosting(doc, "https://jobs.lever.co/halcyongrid/000002");
    expect(job.source).toBe("json-ld");
    expect(job.title).toBe("Site Reliability Engineer");
    expect(job.company).toBe("Halcyon Grid");
    expect(job.location).toBe("Denver, CO, US");
    expect(job.salary).toBe("USD 165000 per year");
  });

  it("parses an Ashby-style posting with a plain-string address", () => {
    const doc = loadFixture("ashby");
    const job = parseJobPosting(doc, "https://jobs.ashbyhq.com/copperfield/000003");
    expect(job.source).toBe("json-ld");
    expect(job.title).toBe("Staff Backend Engineer");
    expect(job.company).toBe("Copperfield Systems");
    expect(job.location).toBe("Remote, United States");
    expect(job.salary).toBe("");
  });

  it("returns null when no JobPosting exists", () => {
    expect(parseJsonLd(loadFixture("fallback"))).toBeNull();
    expect(parseJsonLd(loadFixture("workday"))).toBeNull();
  });
});

describe("site-selector fallback", () => {
  it("parses a Workday page via data-automation-id selectors", () => {
    const doc = loadFixture("workday");
    const job = parseJobPosting(
      doc,
      "https://bramblewood.wd5.myworkdayjobs.com/en-US/careers/job/000004",
    );
    expect(job.source).toBe("site-selectors");
    expect(job.title).toBe("Cloud Security Engineer");
    expect(job.company).toBe("Bramblewood Insurance Careers"); // og:site_name fallback
    expect(job.location).toBe("Hartford, CT (Hybrid)");
    expect(job.description).toContain("harden our AWS estate");
    expect(job.description).toContain("IAM policy review");
  });

  it("parses an Indeed page including the salary snippet", () => {
    const doc = loadFixture("indeed");
    const job = parseJobPosting(doc, "https://www.indeed.com/viewjob?jk=0000000000000005");
    expect(job.source).toBe("site-selectors");
    expect(job.title).toBe("DevOps Engineer");
    expect(job.company).toBe("Tidepool Logistics");
    expect(job.location).toBe("Savannah, GA");
    expect(job.salary).toBe("$120,000 - $140,000 a year");
    expect(job.description).toContain("fleet-routing platform");
  });

  it("does not use selectors for unknown hosts", () => {
    const doc = loadFixture("indeed");
    const job = parseJobPosting(doc, "https://jobs.unknown-board.example/000006");
    expect(job.source).toBe("page-fallback");
  });
});

describe("authenticated LinkedIn app", () => {
  const TRACKING_URL =
    "https://www.linkedin.com/jobs/view/4000000001/?alternateChannel=search&trk=d_flagship3_search_srp_jobs&refId=NotAvailable&trackingId=Uxxxx";

  it("parses the logged-in view, which has no JSON-LD, no h1, and hashed classes", () => {
    const doc = loadFixture("linkedin-auth");
    const job = parseJobPosting(doc, TRACKING_URL);
    expect(job.source).toBe("site-selectors");
    expect(job.title).toBe("Platform Reliability Engineer"); // "(2) " prefix stripped
    expect(job.company).toBe("Mistfall Systems");
    expect(job.location).toBe("Remote, US");
    expect(job.salary).toBe("$130K/yr - $155K/yr");
    expect(job.description).toContain("routing software for regional freight carriers");
    expect(job.description).toContain("Run and upgrade our GKE clusters");
    expect(job.description).not.toMatch(/^About the job/i);
  });

  it("strips tracking params down to the canonical /jobs/view/<id> URL", () => {
    const doc = loadFixture("linkedin-auth");
    const job = parseJobPosting(doc, TRACKING_URL);
    expect(job.url).toBe("https://www.linkedin.com/jobs/view/4000000001/");
  });

  it("canonicalizes search-pane URLs via currentJobId", () => {
    expect(
      normalizeLinkedInUrl(
        "https://www.linkedin.com/jobs/search/?currentJobId=4000000001&keywords=platform&origin=SWITCH",
      ),
    ).toBe("https://www.linkedin.com/jobs/view/4000000001/");
    // non-LinkedIn URLs pass through untouched
    expect(normalizeLinkedInUrl("https://boards.example-ats.io/x/jobs/1?gh_src=abc")).toBe(
      "https://boards.example-ats.io/x/jobs/1?gh_src=abc",
    );
  });

  it("never picks the 'Promoted by hirer' line as the location", () => {
    const doc = loadFixture("linkedin-auth");
    const job = parseJobPosting(doc, TRACKING_URL);
    expect(job.location).not.toMatch(/promoted/i);
  });

  it("never picks the merged top-card container text as the location", () => {
    // Regression: the top card's wrapper div also contains "·" and the
    // activity words; its first segment is "<company><title> <location>".
    const doc = loadFixture("linkedin-auth");
    const job = parseJobPosting(doc, TRACKING_URL);
    expect(job.location).toBe("Remote, US");
    expect(job.location).not.toContain("Mistfall");
    expect(job.location).not.toContain("Platform Reliability Engineer");
  });
});

describe("greenhouse job-boards design (no JSON-LD, no og metas)", () => {
  const URL = "https://job-boards.eu.greenhouse.io/glenharborcompute/jobs/000007?gh_src=abc";

  it("recovers company from the page title and salary from the description", () => {
    const doc = loadFixture("greenhouse-eu");
    const job = parseJobPosting(doc, URL);
    expect(job.source).toBe("site-selectors");
    expect(job.title).toBe("Staff Telemetry Platform Engineer");
    expect(job.company).toBe("Glenharbor Compute"); // "…at <Company>" title pattern
    expect(job.location).toBe("US");
    expect(job.salary).toBe("$150,000 - $240,000 USD");
    expect(job.description).toContain("metrics, logs, and traces");
  });

  it("extracts salary ranges from prose", () => {
    expect(salaryFromText("The range is $150,000 - $240,000 USD annually")).toBe(
      "$150,000 - $240,000 USD",
    );
    expect(salaryFromText("base of €80,000 to €95,000 for this role")).toBe(
      "€80,000 to €95,000",
    );
    expect(salaryFromText("no numbers here")).toBeNull();
    // plain years/counts must not look like salaries
    expect(salaryFromText("founded in 2004, 10 to 50 employees")).toBeNull();
  });
});

describe("page fallback", () => {
  it("falls back to page title and og:site_name and never fabricates fields", () => {
    const doc = loadFixture("fallback");
    const job = parseJobPosting(doc, "https://foxfire-robotics.example/careers");
    expect(job.source).toBe("page-fallback");
    expect(job.title).toBe("Careers at Foxfire Robotics — Firmware Engineer");
    expect(job.company).toBe("Foxfire Robotics");
    expect(job.location).toBe("");
    expect(job.salary).toBe("");
    expect(job.description).toBe("");
    expect(job.url).toBe("https://foxfire-robotics.example/careers");
  });
});
