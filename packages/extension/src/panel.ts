import type { CapturedJob } from "./types";

/**
 * The in-page capture panel. Unlike an action popup, it lives in the page
 * (inside a shadow root, so site CSS can't touch it), which means clicking
 * the page to copy something no longer destroys the form — the panel stays,
 * saved or not, until you close it or navigate.
 */

const SOURCE_LABELS: Record<CapturedJob["source"], string> = {
  "json-ld": "Parsed from the page's JobPosting metadata — usually accurate.",
  "site-selectors": "Parsed with site-specific selectors — double-check the fields.",
  "page-fallback":
    "Could not parse this page — only title and site name were guessed. Fill in the rest.",
};

const FIELDS = ["title", "company", "location", "salary", "url", "description"] as const;
type Field = (typeof FIELDS)[number];

const CSS = `
  :host { all: initial; }
  .wrap {
    position: fixed; top: 12px; right: 12px; z-index: 2147483647;
    width: 400px; max-height: calc(100vh - 24px); overflow-y: auto;
    background: #f8fafc; color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px; line-height: 1.4;
    border: 1px solid #cbd5e1; border-radius: 10px;
    box-shadow: 0 8px 30px rgba(15, 23, 42, 0.18);
    padding: 14px;
  }
  h1 { font-size: 15px; margin: 0 0 2px; font-weight: 700; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; }
  .close {
    border: 0; background: none; cursor: pointer; color: #64748b;
    font-size: 16px; line-height: 1; padding: 2px 4px;
  }
  .source { font-size: 11px; color: #64748b; margin-bottom: 10px; }
  label { display: block; margin-bottom: 8px; color: #475569; }
  input, select, textarea {
    width: 100%; box-sizing: border-box; margin-top: 2px; padding: 5px 7px;
    font: inherit; color: #0f172a; border: 1px solid #cbd5e1;
    border-radius: 6px; background: #fff;
  }
  textarea { min-height: 110px; resize: vertical; }
  .row { display: flex; gap: 8px; }
  .row label { flex: 1; }
  .buttons { display: flex; gap: 8px; margin-top: 4px; }
  button.action {
    flex: 1; padding: 8px; font: inherit; font-weight: 600; cursor: pointer;
    border: 0; border-radius: 6px; color: #fff; background: #4f46e5;
  }
  button.action.secondary { background: #fff; color: #4f46e5; border: 1px solid #c7d2fe; }
  button.action:disabled { opacity: 0.5; cursor: default; }
  .status { margin-top: 8px; min-height: 18px; }
  .status.ok { color: #15803d; }
  .status.error { color: #b91c1c; white-space: pre-line; }
  .status a { color: #4f46e5; font-weight: 600; }
`;

const HTML = `
  <div class="wrap">
    <div class="head"><h1>Capture job</h1><button class="close" title="Close">✕</button></div>
    <div class="source">Reading page…</div>
    <form>
      <label>Job title<input name="title" required /></label>
      <label>Company<input name="company" /></label>
      <div class="row">
        <label>Location<input name="location" /></label>
        <label>Salary<input name="salary" /></label>
      </div>
      <label>Post URL<input name="url" /></label>
      <label>Stage
        <select name="stage">
          <option value="wishlist" selected>Wishlist</option>
          <option value="applied">Applied</option>
          <option value="interview">Interview</option>
          <option value="offer">Offer</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
      <label>Description<textarea name="description"></textarea></label>
      <div class="buttons">
        <button class="action" type="submit">Save to board</button>
        <button class="action secondary" type="button" data-autofill>Autofill application</button>
      </div>
    </form>
    <div class="status"></div>
  </div>
`;

export type PanelCallbacks = {
  onSave: (payload: Record<string, string>) => Promise<{
    ok: boolean;
    error?: string;
    job?: { id: number };
    duplicate?: boolean;
    appUrl?: string;
  }>;
  onAutofill: () => Promise<{ ok: boolean; error?: string; summary?: string }>;
};

export class CapturePanel {
  private host: HTMLDivElement;
  private root: ShadowRoot;

  constructor(private callbacks: PanelCallbacks) {
    this.host = document.createElement("div");
    this.host.id = "jobtrack-capture-panel";
    // Born hidden: the toggle inverts `visible`, so a panel created visible
    // would be hidden by the very click that created it.
    this.host.style.display = "none";
    this.root = this.host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    this.root.append(style);
    const container = document.createElement("div");
    container.innerHTML = HTML;
    this.root.append(container.firstElementChild!);
    document.documentElement.append(this.host);

    this.q<HTMLButtonElement>(".close").addEventListener("click", () => this.hide());
    this.q<HTMLFormElement>("form").addEventListener("submit", (e) => {
      e.preventDefault();
      void this.save();
    });
    this.q<HTMLButtonElement>("[data-autofill]").addEventListener("click", () => {
      void this.autofill();
    });
  }

  private q<T extends Element>(sel: string): T {
    return this.root.querySelector(sel) as T;
  }

  private field(name: Field | "stage"): HTMLInputElement {
    return this.q<HTMLInputElement>(`[name="${name}"]`);
  }

  get connected(): boolean {
    return this.host.isConnected;
  }

  get visible(): boolean {
    return this.connected && this.host.style.display !== "none";
  }

  show(): void {
    if (!this.connected) document.documentElement.append(this.host);
    this.host.style.display = "";
  }

  hide(): void {
    this.host.style.display = "none";
  }

  setSourceNote(text: string): void {
    this.q<HTMLDivElement>(".source").textContent = text;
  }

  // The last value this panel wrote into each field. A field still holding
  // that value hasn't been touched by the user and may be improved by a later
  // parse; anything else is a user edit and is never overwritten.
  private lastAuto: Partial<Record<Field, string>> = {};

  applyScrape(job: CapturedJob): void {
    for (const name of FIELDS) {
      const input = this.field(name);
      const untouched =
        !input.value.trim() || input.value === this.lastAuto[name];
      if (untouched) {
        input.value = job[name];
        this.lastAuto[name] = job[name];
      }
    }
    this.setSourceNote(SOURCE_LABELS[job.source]);
  }

  private setStatus(kind: "ok" | "error" | "", text: string, link?: { href: string; label: string }) {
    const el = this.q<HTMLDivElement>(".status");
    el.className = `status ${kind}`;
    el.textContent = text;
    if (link) {
      el.append(" ");
      const a = document.createElement("a");
      a.href = link.href;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = link.label;
      el.append(a);
    }
  }

  private async save(): Promise<void> {
    const button = this.q<HTMLButtonElement>("button[type=submit]");
    button.disabled = true;
    this.setStatus("", "Saving…");
    const payload: Record<string, string> = { stage: this.field("stage").value };
    for (const name of FIELDS) payload[name] = this.field(name).value.trim();
    try {
      const res = await this.callbacks.onSave(payload);
      if (!res.ok) throw new Error(res.error ?? "save failed");
      const link = {
        href: `${res.appUrl}/jobs/${res.job!.id}`,
        label: "Open in JobTrack ↗",
      };
      // No auto-hide: the status link ("Open in JobTrack") must stay
      // clickable until the user closes the panel themselves.
      if (res.duplicate) {
        this.setStatus("ok", `Already on your board (#${res.job!.id}).`, link);
      } else {
        this.setStatus("ok", `Saved to ${payload.stage} (#${res.job!.id}).`, link);
      }
    } catch (err) {
      this.setStatus("error", err instanceof Error ? err.message : String(err));
    } finally {
      button.disabled = false;
    }
  }

  private async autofill(): Promise<void> {
    const button = this.q<HTMLButtonElement>("[data-autofill]");
    button.disabled = true;
    this.setStatus("", "Filling application…");
    try {
      const res = await this.callbacks.onAutofill();
      if (!res.ok) throw new Error(res.error ?? "autofill failed");
      this.setStatus("ok", res.summary ?? "Done.");
    } catch (err) {
      this.setStatus("error", err instanceof Error ? err.message : String(err));
    } finally {
      button.disabled = false;
    }
  }
}
