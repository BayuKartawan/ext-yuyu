/**
 * EMIS GTK - Ambil Kurikulum
 * Popup Script
 */

// ─── State ────────────────────────────────────────────────────────────────────
let collectedData = { headers: [], rows: [] };
let activeTabId = null;

// ─── Elemen DOM ───────────────────────────────────────────────────────────────
const elPageStatus      = document.getElementById('page-status');
const elStatusText      = document.getElementById('status-text');
const elInfoPanel       = document.getElementById('info-panel');
const elInfoTotal       = document.getElementById('info-total');
const elInfoPage        = document.getElementById('info-page');
const elInfoTotalPages  = document.getElementById('info-total-pages');
const elPreviewPanel    = document.getElementById('preview-panel');
const elPreviewCount    = document.getElementById('preview-count');
const elPreviewThead    = document.getElementById('preview-thead');
const elPreviewTbody    = document.getElementById('preview-tbody');
const elProgressPanel   = document.getElementById('progress-panel');
const elProgressText    = document.getElementById('progress-text');
const elProgressCount   = document.getElementById('progress-count');
const elProgressBar     = document.getElementById('progress-bar');
const elProgressDetail  = document.getElementById('progress-detail');
const elResultPanel     = document.getElementById('result-panel');
const elResultCount     = document.getElementById('result-count');
const elActionPanel     = document.getElementById('action-panel');
const elErrorPanel      = document.getElementById('error-panel');
const elErrorText       = document.getElementById('error-text');
const elBtnScrapeAll    = document.getElementById('btn-scrape-all');
const elBtnScrapeCurrent= document.getElementById('btn-scrape-current');
const elBtnDownloadCsv  = document.getElementById('btn-download-csv');
const elBtnDownloadJson = document.getElementById('btn-download-json');
const elBtnCopyCsv      = document.getElementById('btn-copy-csv');
const elBtnRetry        = document.getElementById('btn-retry');

// ─── Helper: show/hide panel ──────────────────────────────────────────────────
function showOnly(...panels) {
    [elInfoPanel, elPreviewPanel, elProgressPanel, elResultPanel, elActionPanel, elErrorPanel]
        .forEach(p => p.classList.add('hidden'));
    panels.forEach(p => p && p.classList.remove('hidden'));
}

function setStatus(type, text) {
    elPageStatus.className = 'status-card status-' + type;
    elStatusText.textContent = text;
}

// ─── Render preview tabel ─────────────────────────────────────────────────────
function renderPreview(headers, rows) {
    // Header
    const tr = document.createElement('tr');
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        tr.appendChild(th);
    });
    elPreviewThead.innerHTML = '';
    elPreviewThead.appendChild(tr);

    // Rows (maks 5 untuk preview)
    elPreviewTbody.innerHTML = '';
    const previewRows = rows.slice(0, 5);
    previewRows.forEach(cells => {
        const row = document.createElement('tr');
        cells.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell;
            td.title = cell;
            row.appendChild(td);
        });
        elPreviewTbody.appendChild(row);
    });

    elPreviewCount.textContent = rows.length + ' baris';
}

// ─── Inisiasi: cek halaman aktif ──────────────────────────────────────────────
async function init() {
    setStatus('checking', 'Memeriksa halaman...');
    showOnly();

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTabId = tab.id;

        // Pastikan content script sudah ter-inject (untuk halaman yang baru dibuka)
        await chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            files: ['content.js']
        }).catch(() => {}); // abaikan error jika sudah ter-inject

        const response = await chrome.tabs.sendMessage(activeTabId, { action: 'CHECK_PAGE' });

        if (!response || !response.isMapelPage) {
            setStatus('error', 'Halaman ini bukan halaman Mata Pelajaran EMIS GTK');
            showOnly();
            return;
        }

        // Halaman valid
        const { paginationInfo, currentData } = response;
        setStatus('ok', '✅ Halaman Mata Pelajaran terdeteksi');

        // Tampilkan info
        elInfoTotal.textContent      = paginationInfo.totalData.toLocaleString('id-ID') + ' data';
        elInfoPage.textContent       = 'Halaman ' + paginationInfo.currentPage;
        elInfoTotalPages.textContent = paginationInfo.totalPages + ' halaman';

        // Preview data halaman ini
        if (currentData && currentData.rows.length > 0) {
            renderPreview(currentData.headers, currentData.rows);
        }

        showOnly(elInfoPanel, elPreviewPanel, elActionPanel);

    } catch (err) {
        setStatus('error', 'Tidak dapat terhubung. Pastikan Anda ada di halaman EMIS GTK.');
        showOnly();
        console.error(err);
    }
}

// ─── Tombol: Ambil Semua Halaman ──────────────────────────────────────────────
elBtnScrapeAll.addEventListener('click', async () => {
    setStatus('checking', '⏳ Sedang mengambil data semua halaman...');
    showOnly(elProgressPanel);

    elProgressText.textContent   = 'Menginisialisasi...';
    elProgressCount.textContent  = '0 baris';
    elProgressBar.style.width    = '5%';
    elProgressDetail.textContent = 'Menghubungi server...';

    // Kirim perintah scrape ke content script
    await chrome.tabs.sendMessage(activeTabId, { action: 'SCRAPE_ALL' });
});

// ─── Tombol: Ambil Halaman Ini Saja ──────────────────────────────────────────
elBtnScrapeCurrent.addEventListener('click', async () => {
    const response = await chrome.tabs.sendMessage(activeTabId, { action: 'CHECK_PAGE' });
    if (!response || !response.currentData) return;

    collectedData = {
        headers: response.currentData.headers,
        rows: response.currentData.rows
    };

    elResultCount.textContent = collectedData.rows.length;
    setStatus('ok', '✅ Data halaman ini berhasil diambil');
    showOnly(elInfoPanel, elResultPanel);
});

// ─── Listener: pesan dari content script (progress & done) ───────────────────
chrome.runtime.onMessage.addListener((message) => {

    if (message.action === 'SCRAPE_PROGRESS') {
        const { page, rowsCollected } = message;
        elProgressText.textContent   = 'Mengambil data...';
        elProgressCount.textContent  = rowsCollected.toLocaleString('id-ID') + ' baris';
        elProgressDetail.textContent = `Halaman ${page} selesai diproses`;

        // Animasi bar (indeterminate karena total tidak pasti)
        const pct = Math.min(5 + (rowsCollected / 5), 90);
        elProgressBar.style.width = pct + '%';
        return;
    }

    if (message.action === 'SCRAPE_DONE') {
        collectedData = { headers: message.headers, rows: message.rows };

        elProgressBar.style.width = '100%';
        setTimeout(() => {
            elResultCount.textContent = message.totalRows.toLocaleString('id-ID');
            setStatus('ok', `✅ Selesai! ${message.totalRows.toLocaleString('id-ID')} data berhasil diambil`);
            showOnly(elInfoPanel, elResultPanel);
        }, 400);
        return;
    }

    if (message.action === 'SCRAPE_ERROR') {
        elErrorText.textContent = 'Error: ' + message.error;
        setStatus('error', 'Gagal mengambil data');
        showOnly(elErrorPanel);
        return;
    }
});

// ─── Export: CSV ──────────────────────────────────────────────────────────────
function buildCsvContent() {
    const escape = val => {
        const s = String(val ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [];
    lines.push(collectedData.headers.map(escape).join(','));
    collectedData.rows.forEach(row => {
        lines.push(row.map(escape).join(','));
    });
    return '\uFEFF' + lines.join('\r\n'); // BOM untuk Excel
}

elBtnDownloadCsv.addEventListener('click', () => {
    const csv = buildCsvContent();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapel-emisgtk-${dateStamp()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
});

// ─── Export: JSON ─────────────────────────────────────────────────────────────
elBtnDownloadJson.addEventListener('click', () => {
    const headers = collectedData.headers;
    const objects = collectedData.rows.map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
        return obj;
    });
    const json = JSON.stringify({ data: objects, total: objects.length }, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapel-emisgtk-${dateStamp()}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

// ─── Export: Copy ke Clipboard ────────────────────────────────────────────────
elBtnCopyCsv.addEventListener('click', async () => {
    const csv = buildCsvContent();
    try {
        await navigator.clipboard.writeText(csv);
        elBtnCopyCsv.textContent = '✅ Tersalin!';
        setTimeout(() => { elBtnCopyCsv.textContent = '📋 Salin ke Clipboard (CSV)'; }, 2000);
    } catch {
        elBtnCopyCsv.textContent = '❌ Gagal menyalin';
    }
});

// ─── Retry ────────────────────────────────────────────────────────────────────
elBtnRetry.addEventListener('click', init);

// ─── Helper: date stamp ───────────────────────────────────────────────────────
function dateStamp() {
    const d = new Date();
    return d.getFullYear()
        + String(d.getMonth() + 1).padStart(2, '0')
        + String(d.getDate()).padStart(2, '0')
        + '_'
        + String(d.getHours()).padStart(2, '0')
        + String(d.getMinutes()).padStart(2, '0');
}

// ─── Jalankan saat popup dibuka ───────────────────────────────────────────────
init();
