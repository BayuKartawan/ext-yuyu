// background.js - Service Worker

let collectedData = [];
let isCapturing   = false;
let debugLog      = [];

// ============================================================
// Buka sidebar saat ikon diklik
// ============================================================
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ============================================================
// Listener pesan
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "START_CAPTURE") {
    collectedData = [];
    debugLog      = [];
    isCapturing   = true;
    sendResponse({ status: "ok" });
    return true;
  }

  if (message.type === "STOP_CAPTURE") {
    isCapturing = false;
    sendResponse({ status: "ok" });
    return true;
  }

  if (message.type === "GET_DATA") {
    sendResponse({
      status     : "ok",
      data       : collectedData,
      total      : collectedData.length,
      isCapturing: isCapturing,
      debugLog   : debugLog.slice(-20),
    });
    return true;
  }

  if (message.type === "CLEAR_DATA") {
    collectedData = [];
    debugLog      = [];
    sendResponse({ status: "ok" });
    return true;
  }

  if (message.type === "API_DATA_RECEIVED") {
    if (!isCapturing) {
      sendResponse({ status: "skip" });
      return true;
    }

    const apiResponse = message.data;
    const url         = message.url || "";

    // ── Simpan ke debugLog (selalu, capturing atau tidak) ──
    if (apiResponse && Array.isArray(apiResponse.data) && apiResponse.data.length > 0) {
      const sample     = apiResponse.data[0];
      const fieldNames = Object.keys(sample);
      debugLog.push({
        time        : new Date().toLocaleTimeString("id-ID"),
        url         : url.split("?")[0],
        fields      : fieldNames,
        sample      : sample,
        recordsTotal: apiResponse.recordsTotal || apiResponse.data.length,
      });
    }

    const rows = parseApiData(apiResponse);
    let added  = 0;

    rows.forEach((row) => {
      // Duplikasi: sama persis nama + desil_nasional (kecuali keduanya "-")
      const dup = collectedData.some(
        (ex) =>
          ex.nama_siswa    === row.nama_siswa &&
          ex.desil_nasional === row.desil_nasional &&
          row.nama_siswa   !== "-"
      );
      if (!dup) { collectedData.push(row); added++; }
    });

    // Re-index nomor urut
    collectedData = collectedData.map((item, idx) => ({ ...item, no: idx + 1 }));

    sendResponse({ status: "ok", added, total: collectedData.length });
    return true;
  }

  return true;
});

// ============================================================
// Parse data dari response API
// ============================================================
function parseApiData(apiResponse) {
  const rows = [];
  if (!apiResponse || !Array.isArray(apiResponse.data)) return rows;

  apiResponse.data.forEach((item, index) => {
    // Skip baris yang bukan object (null, array kosong, dll)
    if (!item || typeof item !== "object" || Array.isArray(item)) return;

    rows.push({
      no                  : index + 1,
      nama_siswa          : pickField(item, FIELD_NAMA),
      desil_kabupaten_kota: pickField(item, FIELD_DESIL_KAB),
      desil_provinsi      : pickField(item, FIELD_DESIL_PROV),
      desil_nasional      : pickField(item, FIELD_DESIL_NAS),
    });
  });

  return rows;
}

// Ambil nilai field pertama yang ditemukan & tidak kosong/null
function pickField(obj, candidates) {
  for (const key of candidates) {
    if (
      Object.prototype.hasOwnProperty.call(obj, key) &&
      obj[key] !== null &&
      obj[key] !== undefined &&
      String(obj[key]).trim() !== ""
    ) {
      return String(obj[key]).trim();
    }
  }
  return "-";
}

// ============================================================
// Field mapping — berdasarkan struktur API PIP yang diketahui
// (field pakai snake_case, confirmed dari sample JSON)
// ============================================================

const FIELD_NAMA = [
  // Confirmed dari pola API PIP
  "nama_siswa",
  "nama_lengkap",
  "nama",
  // Fallback camelCase / variasi lain
  "namaSiswa", "namaLengkap",
  "student_name", "studentName",
  "nm_siswa", "nmSiswa",
  "full_name", "fullName",
  "NAMA", "NM",
];

const FIELD_DESIL_KAB = [
  // Confirmed snake_case PIP
  "desil_kabupaten_kota",
  "desil_kab_kota",
  "desil_kab",
  "desil_kota",
  // Variasi lain
  "desilKabupatenKota", "desilKabKota", "desilKab",
  "desil_kabkota", "desil_kotakab",
  "DESIL_KAB_KOTA", "DESIL_KAB",
  "desil_2", "desil2",
];

const FIELD_DESIL_PROV = [
  // Confirmed snake_case PIP
  "desil_provinsi",
  "desil_prov",
  // Variasi lain
  "desilProvinsi", "desilProv",
  "DESIL_PROVINSI", "DESIL_PROV",
  "desil_1", "desil1",
];

const FIELD_DESIL_NAS = [
  // Confirmed snake_case PIP
  "desil_nasional",
  "desil_nas",
  // Variasi lain
  "desilNasional", "desilNas",
  "desil_national", "desilNational",
  "DESIL_NASIONAL", "DESIL_NAS",
  "desil_0", "desil0",
  "desil",
];
