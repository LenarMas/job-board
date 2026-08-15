// Service worker: registers the context menu. The toolbar button opens the
// popup directly (default_popup in the manifest); the menu item routes to the
// same popup so both entry points share one review-and-save flow.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "jobtrack-capture",
    title: "Capture job posting",
    contexts: ["page", "selection", "link"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "jobtrack-capture") return;
  try {
    await chrome.action.openPopup();
  } catch {
    // openPopup needs Chrome 127+; fall back to a small window that targets
    // the tab the menu was opened on.
    chrome.windows.create({
      url: chrome.runtime.getURL(`popup.html?tabId=${tab?.id ?? ""}`),
      type: "popup",
      width: 440,
      height: 660,
    });
  }
});
