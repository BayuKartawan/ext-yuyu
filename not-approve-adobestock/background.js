// background.js - Service worker for Adobe Stock Rejected Downloader
chrome.runtime.onInstalled.addListener(() => {
  console.log('Adobe Stock Rejected Filename Downloader installed successfully.');
});

// Update badge when items are collected
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'UPDATE_BADGE') {
    const count = message.count || 0;
    const tabId = sender.tab ? sender.tab.id : undefined;

    if (count > 0) {
      chrome.action.setBadgeText({
        text: count > 999 ? '999+' : String(count),
        tabId: tabId
      });
      chrome.action.setBadgeBackgroundColor({
        color: '#2563eb',
        tabId: tabId
      });
    } else {
      chrome.action.setBadgeText({
        text: '',
        tabId: tabId
      });
    }
    sendResponse({ ok: true });
  }
  return true;
});
