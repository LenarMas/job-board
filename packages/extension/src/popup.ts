import type { CapturedJob, ScrapeResponse } from "./types";

const APP_URL = "http://localhost:3000";

const SOURCE_LABELS: Record<CapturedJob["source"], string> = {
  "json-ld": "Parsed from the page's JobPosting metadata — usually accurate.",
  "site-selectors": "Parsed with site-specific selectors — double-check the fields.",
  "page-fallback": "Could not parse this page — only title and site name were guessed. Fill in the rest.",
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fields = ["title", "company", "location", "salary", "url", "description"] as const;

function setStatus(kind: "ok" | "error" | "", text: string) {
  const el = $<HTMLDivElement>("status");
  el.className = kind;
  el.textContent = text;
}

async function targetTabId(): Promise<number> {
  const fromQuery = new URLSearchParams(window.location.search).get("tabId");
  if (fromQuery) return Number(fromQuery);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  return tab.id;
}

async function scrape(): Promise<void> {
  try {
    const tabId = await targetTabId();
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    const response: ScrapeResponse = await chrome.tabs.sendMessage(tabId, {
      type: "jobtrack-scrape",
    });
    if (!response.ok) throw new Error(response.error);
    const job = response.job;
    for (const field of fields) {
      $<HTMLInputElement>(field).value = job[field];
    }
    $<HTMLDivElement>("source").textContent = SOURCE_LABELS[job.source];
  } catch (err) {
    $<HTMLDivElement>("source").textContent =
      "Could not read this page (browser pages and PDFs can't be captured). Fill the form in manually.";
    console.error(err);
  }
}

async function save(event: Event): Promise<void> {
  event.preventDefault();
  const button = $<HTMLButtonElement>("save");
  button.disabled = true;
  setStatus("", "Saving…");
  const payload = Object.fromEntries(
    fields.map((f) => [f, $<HTMLInputElement>(f).value.trim()]),
  );
  const stage = $<HTMLSelectElement>("stage").value;
  try {
    const res = await fetch(`${APP_URL}/api/jobs/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, stage }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `JobTrack responded with ${res.status}`);
    }
    const { job, duplicate } = await res.json();
    setStatus(
      "ok",
      duplicate
        ? `Already on your board (#${job.id}) — nothing saved.`
        : `Saved to ${stage} (#${job.id}).`,
    );
  } catch (err) {
    // Keep the form contents — nothing the user captured is lost.
    const detail = err instanceof Error ? err.message : String(err);
    setStatus(
      "error",
      `Could not reach JobTrack at ${APP_URL}.\n` +
        `Is the app running? (npm run dev)\n${detail}`,
    );
  } finally {
    button.disabled = false;
  }
}

document.getElementById("form")!.addEventListener("submit", save);
void scrape();
