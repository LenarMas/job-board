export type CapturedJob = {
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string;
  description: string;
  /** How the data was obtained, shown in the popup so the user knows how much to trust it. */
  source: "json-ld" | "site-selectors" | "page-fallback";
};

export type ScrapeRequest = { type: "jobtrack-scrape" };
export type ScrapeResponse = { ok: true; job: CapturedJob } | { ok: false; error: string };
