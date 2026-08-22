function sendToggle(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "BTB_TOGGLE_PANEL" }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || await sendToggle(tab.id)) return;
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["styles.css"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await sendToggle(tab.id);
  } catch {
    // Chrome internal pages and other protected pages do not allow injection.
  }
});
