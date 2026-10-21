/**
 * EMIS Data Siswa Scraper - Background Service Worker
 * Handles extension action clicks, side panel opening, and message routing.
 */

// Enable open panel on action icon click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Listen for tab updates to communicate state if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('emis.kemenag.go.id')) {
    chrome.runtime.sendMessage({
      type: 'TAB_UPDATED',
      url: tab.url,
      tabId: tabId
    }).catch(() => {
      // Ignore if sidebar is not open/listening
    });
  }
});

// Relay messages between content script and sidepanel if direct runtime messaging is used
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // If message comes from content script, forward to side panel UI
  if (sender.tab) {
    chrome.runtime.sendMessage({
      ...message,
      senderTabId: sender.tab.id
    }).catch(() => {
      // Sidebar might be closed
    });
  }
  return true;
});
