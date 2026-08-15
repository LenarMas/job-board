import { siteFor } from "./sites";
import type { CapturedJob } from "./types";

/**
 * Pure parsing logic, testable against fixture HTML. Order of preference:
 *  1. JSON-LD JobPosting (LinkedIn, Greenhouse, Lever, Ashby all emit it)
 *  2. Per-site DOM selectors from sites.ts
 *  3. Page title + og:site_name
 * The popup always shows the result for review before saving, so a partial
 * parse is acceptable — silently wrong data is not, which is why the source
 * is reported alongside the fields.
 */
export function parseJobPosting(doc: Document, pageUrl: string): CapturedJob {
  const fromJsonLd = parseJsonLd(doc);
  if (fromJsonLd) return { ...fromJsonLd, url: canonicalUrl(doc, pageUrl) };

  const fromSite = parseSiteSelectors(doc, pageUrl);
  if (fromSite) return { ...fromSite, url: canonicalUrl(doc, pageUrl) };

  return {
    title: doc.title.trim(),
    company: metaContent(doc, "og:site_name") ?? "",
    location: "",
    salary: "",
    description: "",
    url: canonicalUrl(doc, pageUrl),
    source: "page-fallback",
  };
}

// ---------- JSON-LD ----------

type JsonLdNode = Record<string, unknown>;

export function parseJsonLd(doc: Document): Omit<CapturedJob, "url"> | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    const posting = findJobPosting(data);
    if (!posting) continue;
    const title = str(posting["title"]);
    if (!title) continue;
    return {
      title,
      company: orgName(posting["hiringOrganization"]),
      location: jobLocation(posting["jobLocation"]),
      salary: baseSalary(posting["baseSalary"]),
      description: htmlToText(str(posting["description"]) ?? ""),
      source: "json-ld",
    };
  }
  return null;
}

function findJobPosting(data: unknown): JsonLdNode | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const node = data as JsonLdNode;
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.includes("JobPosting")) return node;
  if (node["@graph"]) return findJobPosting(node["@graph"]);
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function orgName(org: unknown): string {
  if (typeof org === "string") return org.trim();
  if (typeof org === "object" && org !== null) {
    return str((org as JsonLdNode)["name"]) ?? "";
  }
  return "";
}

function jobLocation(loc: unknown): string {
  const first = Array.isArray(loc) ? loc[0] : loc;
  if (typeof first === "string") return first.trim();
  if (typeof first !== "object" || first === null) return "";
  const node = first as JsonLdNode;
  const address = node["address"];
  if (typeof address === "string") return address.trim();
  if (typeof address === "object" && address !== null) {
    const a = address as JsonLdNode;
    const parts = [a["addressLocality"], a["addressRegion"], a["addressCountry"]]
      .map((p) =>
        typeof p === "object" && p !== null ? str((p as JsonLdNode)["name"]) : str(p),
      )
      .filter(Boolean);
    return parts.join(", ");
  }
  return str(node["name"]) ?? "";
}

function baseSalary(salary: unknown): string {
  if (typeof salary !== "object" || salary === null) return str(salary) ?? "";
  const node = salary as JsonLdNode;
  const currency = str(node["currency"]) ?? "";
  const value = node["value"];
  if (typeof value === "object" && value !== null) {
    const v = value as JsonLdNode;
    const unit = str(v["unitText"]);
    const exact = num(v["value"]);
    const min = num(v["minValue"]);
    const max = num(v["maxValue"]);
    let amount = "";
    if (exact) amount = exact;
    else if (min && max) amount = `${min}–${max}`;
    else amount = min ?? max ?? "";
    if (!amount) return "";
    return [currency, amount, unit ? `per ${unit.toLowerCase()}` : ""]
      .filter(Boolean)
      .join(" ");
  }
  return [currency, num(value)].filter(Boolean).join(" ");
}

function num(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  return str(v);
}

// ---------- site selectors ----------

function parseSiteSelectors(
  doc: Document,
  pageUrl: string,
): Omit<CapturedJob, "url"> | null {
  let hostname: string;
  try {
    hostname = new URL(pageUrl).hostname;
  } catch {
    return null;
  }
  const site = siteFor(hostname);
  if (!site) return null;
  const pick = (selectors?: string[]): string => {
    for (const sel of selectors ?? []) {
      const el = doc.querySelector(sel);
      const text = el?.textContent?.trim();
      if (text) return text.replace(/\s+/g, " ");
    }
    return "";
  };
  const title = pick(site.title);
  if (!title) return null;
  const descriptionEl = (site.description ?? [])
    .map((sel) => doc.querySelector(sel))
    .find(Boolean);
  return {
    title,
    company: pick(site.company) || metaContent(doc, "og:site_name") || "",
    location: pick(site.location),
    salary: pick(site.salary),
    description: descriptionEl ? elementToText(descriptionEl) : "",
    source: "site-selectors",
  };
}

// ---------- shared helpers ----------

function metaContent(doc: Document, property: string): string | null {
  const el = doc.querySelector(
    `meta[property="${property}"], meta[name="${property}"]`,
  );
  return el?.getAttribute("content")?.trim() || null;
}

function canonicalUrl(doc: Document, pageUrl: string): string {
  const canonical = doc
    .querySelector('link[rel="canonical"]')
    ?.getAttribute("href");
  return canonical?.trim() || pageUrl;
}

/** Render an HTML string (e.g. a JSON-LD description) as readable plain text. */
export function htmlToText(html: string): string {
  if (!html) return "";
  const container = new DOMParser().parseFromString(html, "text/html").body;
  return elementToText(container);
}

function elementToText(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  for (const el of clone.querySelectorAll("br")) el.replaceWith("\n");
  for (const el of clone.querySelectorAll("p, div, li, h1, h2, h3, h4, ul, ol")) {
    el.append("\n");
  }
  return (clone.textContent ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
