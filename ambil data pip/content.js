// content.js
// Berjalan di ISOLATED WORLD — tidak bisa patch XHR/fetch halaman langsung.
// Solusi: inject script tag ke DOM (page world), komunikasi via postMessage.

(function () {
  if (document.__pipBridgeInjected) return;
  document.__pipBridgeInjected = true;

  // ============================================================
  // 1. Inject interceptor ke PAGE WORLD via <script> tag
  // ============================================================
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected.js");
  script.onload = function () { this.remove(); };
  (document.head || document.documentElement).appendChild(script);

  // ============================================================
  // 2. Terima data dari injected.js via postMessage
  //    lalu teruskan ke background service worker
  // ============================================================
  window.addEventListener("message", function (event) {
    // Hanya proses pesan dari halaman yang sama
    if (event.source !== window) return;
    if (!event.data || event.data.__pipSource !== "injected") return;

    const payload = event.data.payload;
    if (!payload) return;

    chrome.runtime.sendMessage(
      { type: "API_DATA_RECEIVED", data: payload.json, url: payload.url },
      function () {
        void chrome.runtime.lastError; // suppress error jika background sleep
      }
    );
  });

  console.log("[PIP Extractor] Bridge content script aktif");
})();
