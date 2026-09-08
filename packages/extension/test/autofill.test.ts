import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fillApplication, type AutofillProfile } from "../src/autofill";

const PROFILE: AutofillProfile = {
  firstName: "Avery",
  lastName: "Quill",
  email: "avery.quill@example.com",
  phone: "+1 555 0100",
  location: "Portland, OR",
  linkedin: "https://www.linkedin.com/in/example-avery",
  github: "https://github.com/example-avery",
  website: "https://avery.example",
};

function loadForm(): Document {
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures", "greenhouse-eu.html"),
    "utf8",
  );
  return new DOMParser().parseFromString(html, "text/html");
}

const val = (doc: Document, sel: string) =>
  doc.querySelector<HTMLInputElement>(sel)!.value;

describe("application autofill", () => {
  it("fills a Greenhouse-style form by labels, types, and ids", () => {
    const doc = loadForm();
    const result = fillApplication(doc, PROFILE);
    expect(val(doc, "#first_name")).toBe("Avery");
    expect(val(doc, "#last_name")).toBe("Quill");
    expect(val(doc, "#email")).toBe("avery.quill@example.com");
    expect(val(doc, "#phone")).toBe("+1 555 0100");
    expect(val(doc, "#candidate-location")).toBe("Portland, OR");
    expect(val(doc, "#question_1")).toBe("https://www.linkedin.com/in/example-avery");
    expect(result.filled).toBe(6);
  });

  it("never overwrites a field that already has a value", () => {
    const doc = loadForm();
    fillApplication(doc, PROFILE);
    expect(val(doc, "#question_2")).toBe("https://prefilled.example");
  });

  it("uses a combined name for single full-name fields and skips missing data", () => {
    const doc = new DOMParser().parseFromString(
      `<form>
        <label>Full Name <input id="n" type="text" /></label>
        <label>GitHub <input id="g" type="text" /></label>
        <input id="auto" autocomplete="email" type="text" />
      </form>`,
      "text/html",
    );
    const result = fillApplication(doc, {
      firstName: "Avery",
      lastName: "Quill",
      email: "avery.quill@example.com",
    });
    expect(val(doc, "#n")).toBe("Avery Quill");
    expect(val(doc, "#auto")).toBe("avery.quill@example.com"); // autocomplete attr wins
    expect(val(doc, "#g")).toBe(""); // no github in profile → untouched
    expect(result.filled).toBe(2);
  });
});
