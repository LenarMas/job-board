import { siteFor } from "./sites";
import type { CapturedJob } from "./types";

/**
 * Pure parsing logic, testable against fixture HTML. Order of preference:
 *  1. JSON-LD JobPosting (public/guest views of the big boards emit it)
 *  2. Site-specific structural parsers (authenticated LinkedIn strips all
 *     metadata and hashes its class names, so it needs its own logic)
 *  3. Per-site DOM selectors from sites.ts
 *  4. Page title + whatever company hints the page still carries
 * The popup always shows the result for review before saving, so a partial
 * parse is acceptable — silently wrong data is not, which is why the source
 * is reported alongside the fields.
 */
export function parseJobPosting(doc: Document, pageUrl: string): CapturedJob {
  const url = canonicalUrl(doc, pageUrl);

  let job: CapturedJob;
  const fromJsonLd = parseJsonLd(doc);
  const fromLinkedIn =
    !fromJsonLd && isLinkedInHost(pageUrl) ? parseLinkedInApp(doc) : null;
  const fromSite =
    !fromJsonLd && !fromLinkedIn ? parseSiteSelectors(doc, pageUrl) : null;
  if (fromJsonLd) job = { ...fromJsonLd, url };
  else if (fromLinkedIn) job = { ...fromLinkedIn, url };
  else if (fromSite) job = { ...fromSite, url };
  else {
    job = {
      title: cleanDocumentTitle(doc.title),
      company: fallbackCompany(doc),
      location: "",
      salary: "",
      description: "",
      url,
      source: "page-fallback",
    };
  }

  // Boards like Greenhouse put the range only in the description prose and
  // the company only in the page title — recover both rather than showing
  // empty fields (the user reviews everything before saving anyway).
  if (!job.salary && job.description) {
    job.salary = salaryFromText(job.description) ?? "";
  }
  if (!job.company) job.company = fallbackCompany(doc);
  return job;
}

/** Find a compensation range like "$160,000 - $260,000 USD" in prose. */
export function salaryFromText(text: string): string | null {
  const match = text.match(
    /[$€£]\s?\d{1,3}(?:[,.]\d{3})+(?:\.\d+)?(?:\s?[kK])?\s*(?:-|–|—|to)\s*[$€£]?\s?\d{1,3}(?:[,.]\d{3})+(?:\.\d+)?(?:\s?[kK])?(?:\s*(?:USD|EUR|GBP|CAD|per\s+\w+|\/\s*\w+))?/,
  );
  return match ? match[0].replace(/\s+/g, " ").trim() : null;
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

// ---------- authenticated LinkedIn ----------
//
// The logged-in app renders no JSON-LD, no <h1>, no og: metas, and hashes its
// CSS class names per build, so neither schema parsing nor class selectors
// can work. The anchors below are the only stable ones:
//   - document.title is "Job Title | Company | LinkedIn" on /jobs/view/ pages
//   - the top card links the company via a[href*="/company/"]
//   - a <p> holds "Location · N weeks ago · N people clicked apply"
//   - the description section is headed by the literal text "About the job"

function isLinkedInHost(pageUrl: string): boolean {
  try {
    const host = new URL(pageUrl).hostname;
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

export function parseLinkedInApp(doc: Document): Omit<CapturedJob, "url"> | null {
  const titleParts = cleanDocumentTitle(doc.title).split(" | ");
  const scope = doc.querySelector("main") ?? doc.body;

  let title = "";
  let company = "";
  if (titleParts.length >= 3 && titleParts[titleParts.length - 1] === "LinkedIn") {
    title = titleParts.slice(0, -2).join(" | ").trim();
    company = titleParts[titleParts.length - 2]!.trim();
  }
  if (!company) company = linkedInCompanyAnchor(scope);
  if (!title) return null;

  // "United States · 2 weeks ago · Over 100 people clicked apply" — require
  // the activity words so "Promoted by hirer · …" style lines never match.
  // The whole top card also matches these filters (its text merges company,
  // title, and this line), so sort candidates by text length and take the
  // shortest: that's the innermost element holding just the metadata line.
  let location = "";
  const metaLines = [...scope.querySelectorAll("p, div, span")]
    .filter(
      (el) =>
        el.childElementCount <= 8 &&
        el.textContent !== null &&
        el.textContent.length < 250 &&
        el.textContent.includes("·") &&
        /\bago\b|applicant|people clicked|viewed/i.test(el.textContent),
    )
    .sort((a, b) => a.textContent!.length - b.textContent!.length);
  for (const line of metaLines) {
    const first = line.textContent!.split("·")[0]!.replace(/\s+/g, " ").trim();
    if (
      first &&
      first.length < 80 &&
      !/\bago\b|applicant|clicked|viewed|promoted/i.test(first) &&
      !(title && first.includes(title))
    ) {
      location = first;
      break;
    }
  }

  // Salary chips look like "$120K/yr - $140K/yr".
  let salary = "";
  for (const el of scope.querySelectorAll("span, div, p")) {
    const text = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (
      el.childElementCount === 0 &&
      text.length < 60 &&
      /[$€£]\s?\d[\d,.]*\s*[Kk]?/.test(text) &&
      /\/\s*(yr|hr|year|hour|mo)|[Kk]\b|,\d{3}/.test(text)
    ) {
      salary = text;
      break;
    }
  }

  // Description: the section headed by the literal "About the job".
  let description = "";
  const aboutHeading = [...scope.querySelectorAll("*")].find(
    (el) =>
      el.childElementCount === 0 &&
      el.textContent?.replace(/\s+/g, " ").trim().toLowerCase() === "about the job",
  );
  if (aboutHeading) {
    let container: Element = aboutHeading;
    while (
      container.parentElement &&
      (container.textContent?.length ?? 0) < 500
    ) {
      container = container.parentElement;
    }
    description = elementToText(container)
      .replace(/^about the job\s*/i, "")
      .trim();
  }

  return { title, company, location, salary, description, source: "site-selectors" };
}

function linkedInCompanyAnchor(scope: Element | Document): string {
  for (const a of scope.querySelectorAll('a[href*="/company/"]')) {
    const text = a.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (text && text.length < 80 && !/^follow\b|^view\b/i.test(text)) return text;
  }
  return "";
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

export function canonicalUrl(doc: Document, pageUrl: string): string {
  const canonical = doc
    .querySelector('link[rel="canonical"]')
    ?.getAttribute("href");
  const url = canonical?.trim() || pageUrl;
  return normalizeLinkedInUrl(url);
}

/**
 * LinkedIn buries the job id in tracking noise. Reduce every variant —
 * /jobs/view/<id>/?trk=…&refId=…, /jobs/search/?currentJobId=<id>&… — to the
 * canonical https://www.linkedin.com/jobs/view/<id>/ so URL dedupe works.
 */
export function normalizeLinkedInUrl(url: string): string {
  if (!isLinkedInHost(url)) return url;
  try {
    const parsed = new URL(url);
    const viewMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)/);
    const id = viewMatch?.[1] ?? parsed.searchParams.get("currentJobId");
    if (id && /^\d+$/.test(id)) {
      return `https://www.linkedin.com/jobs/view/${id}/`;
    }
    return url;
  } catch {
    return url;
  }
}

/** Strip the "(3) " unread-count prefix LinkedIn puts on document.title. */
function cleanDocumentTitle(title: string): string {
  return title.replace(/^\(\d+\)\s*/, "").trim();
}

/**
 * Last-resort company lookup for the page fallback: og: metas first, then a
 * company profile link, then the middle segment of an "X | Company | Site"
 * page title. The user reviews everything before saving, so a good guess
 * beats an empty field.
 */
function fallbackCompany(doc: Document): string {
  const fromMeta = metaContent(doc, "og:site_name");
  if (fromMeta) return fromMeta;
  const fromAnchor = linkedInCompanyAnchor(doc);
  if (fromAnchor) return fromAnchor;
  const title = cleanDocumentTitle(doc.title);
  const parts = title.split(" | ");
  if (parts.length >= 3) return parts[parts.length - 2]!.trim();
  // Greenhouse-style titles: "Job Application for <role> at <Company>"
  const atMatch = title.match(/\bat ([^|–—]+)$/);
  if (atMatch) return atMatch[1]!.trim();
  return "";
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
