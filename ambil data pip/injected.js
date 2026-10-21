// injected.js
// Berjalan di PAGE WORLD — bisa patch XHR & fetch asli halaman web.
// Kirim hasil ke content.js via window.postMessage.

(function () {
  if (window.__pipInjected) return;
  window.__pipInjected = true;

  // ============================================================
  // Kirim data ke content.js
  // ============================================================
  function sendToExtension(url, json) {
    window.postMessage(
      {
        __pipSource: "injected",
        payload: { url: url, json: json },
      },
      "*"
    );
  }

  // ============================================================
  // Validasi: apakah response JSON ini dari API PIP?
  // Cukup cek struktur DataTables saja, tanpa filter field ketat
  // ============================================================
  function isDataTablesResponse(json) {
    return (
      json &&
      typeof json === "object" &&
      Array.isArray(json.data) &&
      json.data.length > 0 &&
      (
        "recordsTotal"    in json ||
        "recordsFiltered" in json ||
        "draw"            in json
      )
    );
  }

  function tryProcess(url, text) {
    if (!text || text.length < 10) return;
    // Harus JSON object
    const t = text.trimStart();
    if (t[0] !== "{") return;

    let json;
    try { json = JSON.parse(text); }
    catch (_) { return; }

    if (!isDataTablesResponse(json)) return;

    sendToExtension(url, json);
  }

  // ============================================================
  // Patch XMLHttpRequest
  // ============================================================
  const OrigXHR = window.XMLHttpRequest;

  class PatchedXHR extends OrigXHR {
    open(method, url) {
      this.__pip_url = (typeof url === "string") ? url : String(url);
      return super.open(...arguments);
    }

    send() {
      this.addEventListener("load", () => {
        if (this.status >= 200 && this.status < 300) {
          tryProcess(this.__pip_url || "", this.responseText);
        }
      });
      return super.send(...arguments);
    }
  }

  window.XMLHttpRequest = PatchedXHR;

  // ============================================================
  // Patch Fetch API
  // ============================================================
  const origFetch = window.fetch;

  window.fetch = function (input, init) {
    let url = "";
    if (typeof input === "string")       url = input;
    else if (input instanceof URL)       url = input.href;
    else if (input && input.url)         url = input.url;

    return origFetch.call(this, input, init).then(function (response) {
      try {
        response.clone().text().then(function (text) {
          tryProcess(url, text);
        }).catch(function () {});
      } catch (_) {}
      return response;
    });
  };

  console.log("[PIP Extractor] injected.js aktif — XHR & Fetch ter-patch di page world");
})();
