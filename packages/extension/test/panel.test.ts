import { describe, expect, it } from "vitest";
import { CapturePanel } from "../src/panel";

const callbacks = {
  onSave: async () => ({ ok: true }),
  onAutofill: async () => ({ ok: true }),
};

const JOB = {
  title: "Platform Engineer",
  company: "Mistfall Systems",
  location: "Remote, US",
  salary: "",
  url: "https://example.test/jobs/1",
  description: "Run the platform.",
  source: "json-ld",
} as const;

// The shadow root is closed, so tests reach the select the way the panel does.
function stageSelect(panel: CapturePanel): HTMLSelectElement {
  return panel["q"]<HTMLSelectElement>('[name="stage"]');
}

describe("stage default", () => {
  it("defaults to applied — cards are captured at apply time", () => {
    const panel = new CapturePanel(callbacks);
    expect(stageSelect(panel).value).toBe("applied");
  });

  it("a stage the user picked survives later scrape updates", () => {
    const panel = new CapturePanel(callbacks);
    const select = stageSelect(panel);
    select.value = "interview";
    select.dispatchEvent(new Event("change"));
    panel.applyScrape({ ...JOB });
    expect(select.value).toBe("interview");
  });
});

describe("capture panel visibility", () => {
  it("is born hidden, so the creating click's toggle shows it", () => {
    // Regression: the toggle inverts `visible`; a panel constructed visible
    // was hidden by the very click that created it, forcing a second click.
    const panel = new CapturePanel(callbacks);
    expect(panel.connected).toBe(true);
    expect(panel.visible).toBe(false);
  });

  it("show and hide flip visibility", () => {
    const panel = new CapturePanel(callbacks);
    panel.show();
    expect(panel.visible).toBe(true);
    panel.hide();
    expect(panel.visible).toBe(false);
  });
});
