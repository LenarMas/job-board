/**
 * Application-form autofill. Field recognition lives in one rules table so a
 * new ATS quirk is a one-line fix. Values are set through the native setters
 * and followed by input/change events so React-controlled forms (Greenhouse,
 * Lever, Ashby, Workday are all SPAs) accept them.
 */

export type AutofillProfile = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin?: string | null;
  github?: string | null;
  website?: string | null;
};

type Rule = {
  key: keyof AutofillProfile | "fullName";
  /** Matched against the field's label, name, id, placeholder, aria-label. */
  pattern: RegExp;
  /** Matched against the autocomplete attribute, if present. */
  autocomplete?: string[];
};

// Order matters: more specific rules first ("first name" must win over "name").
export const FIELD_RULES: Rule[] = [
  { key: "firstName", pattern: /first[\s_-]?name|given[\s_-]?name/i, autocomplete: ["given-name"] },
  { key: "lastName", pattern: /last[\s_-]?name|family[\s_-]?name|surname/i, autocomplete: ["family-name"] },
  { key: "email", pattern: /e-?mail/i, autocomplete: ["email"] },
  { key: "phone", pattern: /phone|mobile|\btel\b/i, autocomplete: ["tel"] },
  { key: "linkedin", pattern: /linked[\s_-]?in/i },
  { key: "github", pattern: /git[\s_-]?hub/i },
  { key: "website", pattern: /website|portfolio|personal site/i, autocomplete: ["url"] },
  { key: "location", pattern: /location|city|current address/i, autocomplete: ["address-level2"] },
  { key: "fullName", pattern: /full[\s_-]?name|your[\s_-]?name|^name$/i, autocomplete: ["name"] },
];

type Fillable = HTMLInputElement | HTMLTextAreaElement;

/** Everything that might describe a field, concatenated for matching. */
function descriptor(el: Fillable): string {
  const parts = [el.name, el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label")];
  if (el.id) {
    const label = [...el.ownerDocument.querySelectorAll("label")].find(
      (l) => l.htmlFor === el.id,
    );
    if (label) parts.push(label.textContent);
  }
  const wrapping = el.closest("label");
  if (wrapping) parts.push(wrapping.textContent);
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ");
}

function valueFor(key: Rule["key"], profile: AutofillProfile): string {
  if (key === "fullName") {
    return [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  }
  return profile[key]?.trim() ?? "";
}

/** Set a value the way a user would, so framework-controlled inputs keep it. */
function setNativeValue(el: Fillable, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const SKIP_TYPES = new Set(["hidden", "checkbox", "radio", "file", "submit", "button", "password"]);

export function fillApplication(
  doc: Document,
  profile: AutofillProfile,
): { filled: number; keys: string[] } {
  const keys: string[] = [];
  const fields = [...doc.querySelectorAll<Fillable>("input, textarea")].filter(
    (el) =>
      !(el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) &&
      !el.disabled &&
      !el.readOnly,
  );
  for (const el of fields) {
    if (el.value.trim()) continue; // never overwrite what's already there
    const auto = el.getAttribute("autocomplete")?.toLowerCase();
    const desc = descriptor(el);
    const rule = FIELD_RULES.find(
      (r) =>
        (auto && r.autocomplete?.includes(auto)) ||
        (el instanceof HTMLInputElement && el.type === "email" && r.key === "email") ||
        (el instanceof HTMLInputElement && el.type === "tel" && r.key === "phone") ||
        r.pattern.test(desc),
    );
    if (!rule) continue;
    const value = valueFor(rule.key, profile);
    if (!value) continue;
    setNativeValue(el, value);
    keys.push(rule.key);
  }
  return { filled: keys.length, keys };
}

/** Attach the saved resume to the page's resume/CV file input, if any. */
export function attachResume(doc: Document, file: File): boolean {
  if (typeof DataTransfer === "undefined") return false;
  const inputs = [...doc.querySelectorAll<HTMLInputElement>('input[type="file"]')];
  const target =
    inputs.find((el) => /resume|\bcv\b/i.test(descriptor(el))) ?? inputs[0];
  if (!target) return false;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  target.files = transfer.files;
  target.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}
