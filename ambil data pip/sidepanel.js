// sidepanel.js

const btnStart  = document.getElementById("btnStart");
const btnStop   = document.getElementById("btnStop");
const btnExport = document.getElementById("btnExport");
const btnCopy   = document.getElementById("btnCopy");
const btnClear  = document.getElementById("btnClear");
const btnDebug  = document.getElementById("btnDebug");

const statusDot  = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const totalBadge = document.getElementById("totalBadge");
const infoBox    = document.getElementById("infoBox");

const emptyState  = document.getElementById("emptyState");
const tableScroll = document.getElementById("tableScroll");
const tableBody   = document.getElementById("tableBody");
const debugScroll = document.getElementById("debugScroll");

const previewBox  = document.getElementById("previewBox");
const btnCopyAll  = document.getElementById("btnCopyAll");
const selFormat   = document.getElementById("selFormat");
const selRange    = document.getElementById("selRange");
const copyStatus  = document.getElementById("copyStatus");

// Data cache untuk preview
let cachedData = [];

// ============================================================
// Tab navigation
// ============================================================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab" + capitalize(btn.dataset.tab)).classList.add("active");
    if (btn.dataset.tab === "debug") refreshDebug();
    if (btn.dataset.tab === "pesan") renderPreview(cachedData);
  });
});

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ============================================================
// Init
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  refreshAll();
  // Auto-refresh setiap 2 detik saat sidebar terbuka
  setInterval(refreshAll, 2000);
});

function refreshAll() {
  chrome.runtime.sendMessage({ type: "GET_DATA" }, (resp) => {
    if (chrome.runtime.lastError || !resp) return;
    cachedData = resp.data || [];
    renderTable(cachedData);
    updateStatusUI(resp.isCapturing || false);
    renderDebug(resp.debugLog || []);
    // Update preview jika tab aktif
    const pesanTab = document.getElementById("tabPesan");
    if (pesanTab && pesanTab.classList.contains("active")) {
      renderPreview(cachedData);
    }
  });
}

// ============================================================
// Tombol Mulai
// ============================================================
btnStart.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "START_CAPTURE" }, () => {
    updateStatusUI(true);
    showInfo("✅ Capture aktif. Navigasi halaman PIP sekarang.", "success");
  });
});

// ============================================================
// Tombol Stop
// ============================================================
btnStop.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_CAPTURE" }, () => {
    updateStatusUI(false);
    showInfo("⏹ Capture dihentikan. Klik Export CSV untuk download.", "info");
    refreshAll();
  });
});

// ============================================================
// Tombol Export CSV
// ============================================================
btnExport.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "GET_DATA" }, (resp) => {
    if (!resp || !resp.data || resp.data.length === 0) {
      showInfo("⚠️ Tidak ada data untuk di-export.", "warning");
      return;
    }
    exportCSV(resp.data);
  });
});

// ============================================================
// Tombol Hapus
// ============================================================
btnClear.addEventListener("click", () => {
  if (!confirm("Hapus semua data yang sudah ditangkap?")) return;
  chrome.runtime.sendMessage({ type: "CLEAR_DATA" }, () => {
    cachedData = [];
    renderTable([]);
    renderDebug([]);
    renderPreview([]);
    showInfo("🗑 Data dihapus.", "info");
  });
});

// ============================================================
// Tombol Debug — switch ke tab debug
// ============================================================
btnDebug.addEventListener("click", () => {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  document.querySelector('[data-tab="debug"]').classList.add("active");
  document.getElementById("tabDebug").classList.add("active");
  refreshDebug();
});

// ============================================================
// Tombol Copy (shortcut — langsung copy, tidak pindah tab)
// ============================================================
btnCopy.addEventListener("click", () => {
  if (!cachedData.length) return;
  const text = buildMessageText(cachedData, selFormat.value, selRange.value);
  copyToClipboard(text, `📋 ${cachedData.length} data berhasil disalin ke clipboard!`);
});

// ============================================================
// Tombol Copy All (di dalam tab Preview)
// ============================================================
btnCopyAll.addEventListener("click", () => {
  if (!cachedData.length) return;
  const text = buildMessageText(cachedData, selFormat.value, selRange.value);
  copyToClipboard(text, null);
  // Tampilkan status di dalam tab
  copyStatus.classList.add("show");
  setTimeout(() => copyStatus.classList.remove("show"), 2000);
});

// Re-render preview saat format / range diubah
selFormat.addEventListener("change", () => renderPreview(cachedData));
selRange.addEventListener("change",  () => renderPreview(cachedData));

function refreshDebug() {
  chrome.runtime.sendMessage({ type: "GET_DATA" }, (resp) => {
    if (!resp) return;
    renderDebug(resp.debugLog || []);
  });
}

// ============================================================
// Render tabel data
// ============================================================
function renderTable(data) {
  totalBadge.textContent = data.length;
  tableBody.innerHTML = "";

  if (data.length === 0) {
    emptyState.style.display  = "";
    tableScroll.style.display = "none";
    btnExport.disabled = true;
    btnCopy.disabled   = true;
    return;
  }

  emptyState.style.display  = "none";
  tableScroll.style.display = "";
  btnExport.disabled = false;
  btnCopy.disabled   = false;

  const frag = document.createDocumentFragment();
  data.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-no">${row.no}</td>
      <td class="col-nama" title="${esc(row.nama_siswa)}">${esc(row.nama_siswa)}</td>
      <td class="col-d">${esc(row.desil_kabupaten_kota)}</td>
      <td class="col-d">${esc(row.desil_provinsi)}</td>
      <td class="col-d">${esc(row.desil_nasional)}</td>
    `;
    frag.appendChild(tr);
  });
  tableBody.appendChild(frag);
}

// ============================================================
// Render debug panel
// ============================================================
// Field yang kita targetkan (untuk highlight "match")
const TARGET_FIELDS = {
  nama: ["nama_siswa","namaSiswa","nama_lengkap","namaLengkap","nama","NAMA",
         "name","student_name","studentName","nm_siswa","nm","NM","full_name","fullName"],
  kab:  ["desil_kabupaten_kota","desilKabupatenKota","desil_kab_kota","desilKabKota",
         "desil_kab","desilKab","desil_kabkota","DESIL_KAB_KOTA","desil_kota","desil_2","desil2"],
  prov: ["desil_provinsi","desilProvinsi","desil_prov","desilProv",
         "DESIL_PROVINSI","DESIL_PROV","desil_1","desil1"],
  nas:  ["desil_nasional","desilNasional","desil_nas","desilNas",
         "desil_national","DESIL_NASIONAL","DESIL_NAS","desil_0","desil0","desil"],
};

const ALL_TARGETS = Object.values(TARGET_FIELDS).flat();

function renderDebug(logs) {
  if (!logs || logs.length === 0) {
    debugScroll.innerHTML = `
      <div class="empty-state">
        <div class="big-icon">🔍</div>
        <p>Belum ada API request tertangkap.<br>
           Mulai capture lalu navigasi halaman PIP.</p>
      </div>`;
    return;
  }

  debugScroll.innerHTML = "";
  // Tampilkan dari yang terbaru
  [...logs].reverse().forEach((log, i) => {
    const fields = log.fields || [];
    const matchedFields = fields.filter(f => ALL_TARGETS.includes(f));

    const chipsHtml = fields.map(f => {
      const isHit = ALL_TARGETS.includes(f);
      return `<span class="field-chip ${isHit ? "hit" : ""}">${esc(f)}</span>`;
    }).join("");

    const sampleJson = JSON.stringify(log.sample || {}, null, 2);

    const div = document.createElement("div");
    div.className = "debug-item";
    div.innerHTML = `
      <div class="debug-header">
        <span class="debug-url">${esc(log.url)}</span>
        <span class="debug-time">${esc(log.time)} | ${log.recordsTotal} records</span>
      </div>
      <div class="debug-body">
        <div style="margin-bottom:4px; font-size:11px; color:#4a5568;">
          <strong>Fields (${fields.length}):</strong>
          ${matchedFields.length > 0
            ? `<span style="color:var(--green)">✅ ${matchedFields.length} field cocok</span>`
            : `<span style="color:var(--red)">⚠️ Tidak ada field yang cocok — lihat field di bawah</span>`
          }
        </div>
        <div>${chipsHtml}</div>
        <details style="margin-top:6px;">
          <summary style="cursor:pointer;font-size:11px;color:var(--blue);">Lihat sample data (1 record)</summary>
          <div class="debug-sample">${esc(sampleJson)}</div>
        </details>
      </div>
    `;
    debugScroll.appendChild(div);
  });
}

// ============================================================
// Preview & format pesan teks
// ============================================================
function renderPreview(data) {
  if (!data || data.length === 0) {
    previewBox.innerHTML = `<span style="color:#45475a;">— Belum ada data untuk dipreview —</span>`;
    btnCopyAll.disabled = true;
    return;
  }

  btnCopyAll.disabled = false;
  const text = buildMessageText(data, selFormat.value, selRange.value);

  // Render dengan highlight sintaks sederhana di preview box
  previewBox.textContent = text;
}

// Bangun teks pesan sesuai format
function buildMessageText(data, format, rangeStr) {
  const limit = rangeStr === "all" ? data.length : parseInt(rangeStr, 10);
  const subset = data.slice(0, limit);
  const now = new Date().toLocaleDateString("id-ID", {
    day: "2-digit", month: "long", year: "numeric"
  });

  if (format === "whatsapp") {
    return buildWhatsApp(subset, data.length, now);
  } else if (format === "numbered") {
    return buildNumbered(subset, data.length, now);
  } else {
    return buildPlain(subset, data.length, now);
  }
}

// ── Format WhatsApp / Telegram (pakai *bold* dan emoji) ──
function buildWhatsApp(data, totalAll, tgl) {
  const lines = [];
  lines.push(`🎓 *DATA DESIL SISWA PIP*`);
  lines.push(`📅 ekport ${tgl}`);
  lines.push(`📊 Total: *${data.length}* siswa${data.length < totalAll ? ` (dari ${totalAll})` : ""}`);
  lines.push(`https://pip.kemenag.go.id/`);
  lines.push(`${"─".repeat(35)}`);
  lines.push(``);

  data.forEach((r) => {
    lines.push(`*${r.no}. ${r.nama_siswa}*`);
    lines.push(`   🏘 Kab/Kota  : ${r.desil_kabupaten_kota}`);
    lines.push(`   🗺 Provinsi  : ${r.desil_provinsi}`);
    lines.push(`   🌐 Nasional  : ${r.desil_nasional}`);
    lines.push(``);
  });

  lines.push(`${"─".repeat(35)}`);
  lines.push(`_Diekstrak via PIP Data Extractor_`);

  return lines.join("\n");
}

// ── Format Teks Biasa (tanpa markup) ──
function buildPlain(data, totalAll, tgl) {
  const SEP = "=".repeat(40);
  const sep = "-".repeat(40);
  const lines = [];

  lines.push(SEP);
  lines.push(`DATA SISWA PIP`);
  lines.push(`Tanggal : ${tgl}`);
  lines.push(`Total   : ${data.length} siswa${data.length < totalAll ? ` (dari ${totalAll})` : ""}`);
  lines.push(SEP);
  lines.push("");

  data.forEach((r) => {
    lines.push(`${String(r.no).padStart(3, " ")}. ${r.nama_siswa}`);
    lines.push(`     Kab/Kota  : ${r.desil_kabupaten_kota}`);
    lines.push(`     Provinsi  : ${r.desil_provinsi}`);
    lines.push(`     Nasional  : ${r.desil_nasional}`);
    lines.push(sep);
  });

  return lines.join("\n");
}

// ── Format Bernomor Rapi (tabel teks) ──
function buildNumbered(data, totalAll, tgl) {
  const lines = [];

  // Hitung lebar kolom dinamis
  const maxNama = Math.max(10, ...data.map(r => r.nama_siswa.length));
  const namaCap = Math.min(maxNama, 30); // batas 30 char agar tidak terlalu lebar

  lines.push(`DATA SISWA PIP — ${tgl}`);
  lines.push(`Total: ${data.length} siswa${data.length < totalAll ? ` (dari ${totalAll})` : ""}`);
  lines.push("");

  // Header
  const hNo   = "No ";
  const hNama = padR("Nama Siswa", namaCap);
  const hKab  = padR("Kab/Kota", 8);
  const hProv = padR("Prov", 6);
  const hNas  = "Nasional";
  lines.push(`${hNo}  ${hNama}  ${hKab}  ${hProv}  ${hNas}`);
  lines.push(`${"─".repeat(hNo.length + namaCap + hKab.length + hProv.length + hNas.length + 8)}`);

  data.forEach((r) => {
    const no   = String(r.no).padStart(3, " ");
    const nama = padR(truncate(r.nama_siswa, namaCap), namaCap);
    const kab  = padR(r.desil_kabupaten_kota, 8);
    const prov = padR(r.desil_provinsi, 6);
    const nas  = r.desil_nasional;
    lines.push(`${no}  ${nama}  ${kab}  ${prov}  ${nas}`);
  });

  lines.push("");
  lines.push(`Diekstrak via PIP Data Extractor`);

  return lines.join("\n");
}

// Helpers format
function padR(str, len) {
  const s = String(str ?? "");
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}
function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// ============================================================
// Copy ke clipboard
// ============================================================
function copyToClipboard(text, successMsg) {
  navigator.clipboard.writeText(text).then(() => {
    if (successMsg) showInfo(successMsg, "success");
  }).catch(() => {
    // Fallback untuk browser yang restrict clipboard di extension
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    if (successMsg) showInfo(successMsg, "success");
  });
}

// ============================================================
// Export CSV
// ============================================================
function exportCSV(data) {
  const headers = ["No", "Nama Siswa", "Desil Kab/Kota", "Desil Provinsi", "Desil Nasional"];

  const rows = data.map((r) => [
    r.no,
    csvCell(r.nama_siswa),
    csvCell(r.desil_kabupaten_kota),
    csvCell(r.desil_provinsi),
    csvCell(r.desil_nasional),
  ]);

  const BOM = "\uFEFF";
  const csv = BOM + headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const ts   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  chrome.downloads.download({
    url,
    filename: `data_pip_${ts}.csv`,
    saveAs: false,
  }, () => {
    showInfo(`✅ Export ${data.length} data berhasil → data_pip_${ts}.csv`, "success");
  });
}

// ============================================================
// Update UI status
// ============================================================
function updateStatusUI(capturing) {
  if (capturing) {
    statusDot.className    = "dot active";
    statusText.textContent = "Capturing...";
    btnStart.disabled = true;
    btnStop.disabled  = false;
  } else {
    statusDot.className    = "dot stopped";
    statusText.textContent = "Tidak aktif";
    btnStart.disabled = false;
    btnStop.disabled  = true;
  }
}

// ============================================================
// Helpers
// ============================================================
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csvCell(val) {
  return `"${String(val ?? "").replace(/"/g, '""')}"`;
}

function showInfo(msg, type = "info") {
  infoBox.className = "info-box" + (type !== "info" ? ` ${type}` : "");
  infoBox.innerHTML = msg;
}
