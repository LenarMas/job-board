import type { CapturedJob, ScrapeResponse } from "./types";

const APP_URL = "http://localhost:3000";

const SOURCE_LABELS: Record<CapturedJob["source"], string> = {
  "json-ld": "Parsed from the page's JobPosting metadata — usually accurate.",
  "site-selectors": "Parsed with site-specific selectors — double-check the fields.",
  "page-fallback": "Could not parse this page — only title and site name were guessed. Fill in the rest.",
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fields = ["title", "company", "location", "salary", "url", "description"] as const;

function setStatus(kind: "ok" | "error" | "", text: string, jobId?: number) {
  const el = $<HTMLDivElement>("status");
  el.className = kind;
  el.textContent = text;
  if (jobId !== undefined) {
    el.append(" ");
    const link = document.createElement("a");
    link.href = `${APP_URL}/jobs/${jobId}`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Open in JobTrack ↗";
    el.append(link);
  }
}

async function targetTab(): Promise<chrome.tabs.Tab> {
  const fromQuery = new URLSearchParams(window.location.search).get("tabId");
  if (fromQuery) return chrome.tabs.get(Number(fromQuery));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  return tab;
}

async function scrape(): Promise<void> {
  try {
    const tab = await targetTab();
    // Content scripts can't run on chrome://, the Web Store, or file previews.
    // Bail out cleanly instead of letting executeScript log an error. (An
    // undefined url just means no permission to read it — still try.)
    if (tab.url && !/^https?:/.test(tab.url)) {
      $<HTMLDivElement>("source").textContent =
        "This page can't be captured (only regular web pages work). Fill the form in manually.";
      return;
    }
    const tabId = tab.id!;
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    $<HTMLDivElement>("source").textContent = "Reading page…";
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
    if (duplicate) {
      // Leave the popup open so the user can jump to the existing card.
      setStatus("ok", `Already on your board (#${job.id}).`, job.id);
    } else {
      setStatus("ok", `Saved to ${stage} (#${job.id}).`, job.id);
      // Job done — close the popup the way a save should feel.
      setTimeout(() => window.close(), 1200);
    }
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
