import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Regression: pages like coreweave.com contain frames the browser refuses to
 * inject into (sandboxed without allow-scripts, cross-origin trackers beyond
 * the activeTab grant, other extensions' frames). When the batched
 * allFrames injection rejects, the panel, scrape, and autofill must all fall
 * back to the frames we CAN reach instead of dying silently.
 */

type Injection = {
  target: { tabId: number; allFrames?: boolean };
  files?: string[];
  func?: (...args: unknown[]) => unknown;
  args?: unknown[];
};

const executeScript = vi.fn();
let onActionClicked: (tab: { id: number; url: string }) => void;
let onMessage: (
  message: unknown,
  sender: { tab?: { id: number } },
  sendResponse: (response: unknown) => void,
) => boolean | void;

beforeAll(async () => {
  vi.stubGlobal("chrome", {
    action: {
      onClicked: { addListener: (fn: typeof onActionClicked) => (onActionClicked = fn) },
      setBadgeText: vi.fn(),
    },
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: (fn: typeof onMessage) => (onMessage = fn) },
    },
    contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
    scripting: { executeScript },
  });
  await import("../src/background");
});

/** allFrames calls reject the way Chrome does on a hostile page. */
function rejectAllFramesInjections(perFrameResult: unknown) {
  executeScript.mockReset();
  executeScript.mockImplementation(async (injection: Injection) => {
    if (injection.target.allFrames) {
      throw new Error("Cannot access contents of the page");
    }
    return [{ result: perFrameResult }];
  });
}

async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("background survives pages with uninjectable frames", () => {
  it("still opens the panel when the allFrames injection rejects", async () => {
    rejectAllFramesInjections(true);
    onActionClicked({ id: 7, url: "https://example.com/careers/job?id=1" });
    await settle();

    const calls = executeScript.mock.calls.map((c) => c[0] as Injection);
    // content.js must reach the top frame even though the batch failed…
    expect(
      calls.some((c) => c.files?.includes("content.js") && !c.target.allFrames),
    ).toBe(true);
    // …and the toggle must still be invoked.
    expect(calls.some((c) => c.func && !c.target.allFrames && !c.files)).toBe(true);
  });

  it("falls back to the top frame for scraping", async () => {
    rejectAllFramesInjections({ title: "Platform Engineer" });
    const sendResponse = vi.fn();
    onMessage({ type: "jobtrack-scrape-frames" }, { tab: { id: 7 } }, sendResponse);
    await settle();

    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      results: [{ title: "Platform Engineer" }],
    });
  });

  it("falls back to the top frame for autofill", async () => {
    rejectAllFramesInjections({ filled: 3, resumeAttached: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ firstName: "Ada", email: "ada@example.com" }),
      })),
    );
    const sendResponse = vi.fn();
    onMessage({ type: "jobtrack-autofill" }, { tab: { id: 7 } }, sendResponse);
    await settle();

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, summary: expect.stringContaining("3 fields") }),
    );
  });
});
