/**
 * EMIS GTK - Ambil Kurikulum
 * Background Service Worker
 * Membuka side panel saat ikon ekstensi diklik
 */
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});
