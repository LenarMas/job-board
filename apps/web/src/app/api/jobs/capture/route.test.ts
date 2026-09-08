import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, createServices, type Services } from "@jobtrack/core";

let svc: Services;
vi.mock("@/lib/services", () => ({ getServices: () => svc }));

import { POST } from "./route";

function capture(body: Record<string, string>) {
  return POST(
    new Request("http://localhost:3000/api/jobs/capture", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost:3000" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  svc = createServices(createDb(":memory:"));
  svc.getOrCreateDefaultBoard();
});

describe("capture duplicate detection", () => {
  it("matches an existing job by exact URL", async () => {
    const existing = svc.createJob({
      title: "Cloud Engineer",
      company: "Populous",
      stageName: "applied",
      url: "https://www.linkedin.com/jobs/view/4409545477/",
    });
    const res = await capture({
      title: "Cloud Engineer",
      company: "Populous",
      stage: "wishlist",
      url: "https://www.linkedin.com/jobs/view/4409545477/",
    });
    const data = await res.json();
    expect(data.duplicate).toBe(true);
    expect(data.job.id).toBe(existing.id);
  });

  it("matches the same job re-posted under a different URL by company + title", async () => {
    // Regression: real postings turn up at several URLs — the ATS page vs the
    // LinkedIn listing, or a re-posted LinkedIn id — and exact-URL dedupe let
    // each variant create a new card.
    const existing = svc.createJob({
      title: "Cloud Engineer",
      company: "Populous",
      stageName: "applied",
      url: "https://www.linkedin.com/jobs/view/4409545477/",
    });
    const res = await capture({
      title: "Cloud Engineer",
      company: "Populous",
      stage: "wishlist",
      url: "https://www.linkedin.com/jobs/view/4455960466/",
    });
    const data = await res.json();
    expect(data.duplicate).toBe(true);
    expect(data.job.id).toBe(existing.id);
    expect(svc.listJobs()).toHaveLength(1);
    // The applied card must not be dragged back to the panel's default stage.
    expect(svc.getJob(existing.id)?.stage?.name).toBe("applied");
  });

  it("saves an applied capture with source applied-myself", async () => {
    // Capturing at apply time IS applying myself; the Source field on the
    // detail page must not come back empty.
    const res = await capture({
      title: "Cloud Engineer",
      company: "Populous",
      stage: "applied",
      url: "https://www.linkedin.com/jobs/view/4409545477/",
    });
    const { job } = await res.json();
    expect(svc.getJob(job.id)?.source).toBe("applied");
  });

  it("leaves source empty for a wishlist capture", async () => {
    const res = await capture({
      title: "Cloud Engineer",
      company: "Populous",
      stage: "wishlist",
      url: "https://www.linkedin.com/jobs/view/4409545477/",
    });
    const { job } = await res.json();
    expect(svc.getJob(job.id)?.source).toBeNull();
  });

  it("still creates a genuinely new job", async () => {
    svc.createJob({
      title: "Cloud Engineer",
      company: "Populous",
      stageName: "applied",
      url: "https://www.linkedin.com/jobs/view/4409545477/",
    });
    const res = await capture({
      title: "Senior Platform Engineer",
      company: "Mistfall Systems",
      stage: "wishlist",
      url: "https://www.linkedin.com/jobs/view/4455960466/",
    });
    expect(res.status).toBe(201);
    expect((await res.json()).duplicate).toBe(false);
    expect(svc.listJobs()).toHaveLength(2);
  });
});
