import { describe, expect, it } from "vitest";
import { CapturePanel } from "../src/panel";

const callbacks = {
  onSave: async () => ({ ok: true }),
  onAutofill: async () => ({ ok: true }),
};

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
