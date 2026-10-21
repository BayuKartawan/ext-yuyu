/**
 * EMIS GTK - Ambil Kurikulum
 * Side Panel Script v1.3
 * Tambahan: filter by kode & nama mapel dengan checklist
 */

// ── State ─────────────────────────────────────────────────────────────────────
let collectedData   = { headers: [], rows: [] }; // semua data mentah
let activeTabId     = null;
let totalPagesKnown = 1;

// State filter: Set berisi key "kode||nama" yang sedang dicentang
let checkedKeys = new Set();
// Indeks kolom (ditentukan setelah header diterima)
let colKode = -1;
let colNama = -1;

// ── Shorthand DOM ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const elStatus          = $('page-status');
const elStatusText      = $('status-text');
const elInfoPanel       = $('info-panel');
const elInfoTotal       = $('info-total');
const elInfoPage        = $('info-page');
const elInfoTotalPages  = $('info-total-pages');
const elActionPanel     = $('action-panel');
const elProgressPanel   = $('progress-panel');
const elProgressLabel   = $('progress-label');
const elProgressCount   = $('progress-count');
const elProgressFill    = $('progress-fill');
const elProgressPages   = $('progress-pages');
const elProgressPct     = $('progress-pct');
const elFilterPanel     = $('filter-panel');
const elFilterSearch    = $('filter-search');
const elFilterSearchClr = $('filter-search-clear');
const elFilterList      = $('filter-list');
const elFilterSelCount  = $('filter-selected-count');
const elFilterMatchInfo = $('filter-match-info');
const elPreviewPanel    = $('preview-panel');
const elPreviewCount    = $('preview-count');
const elPreviewThead    = $('preview-thead');
const elPreviewTbody    = $('preview-tbody');
const elResultPanel     = $('result-panel');
const elResultCount     = $('result-count');
const elErrorPanel      = $('error-panel');
const elErrorText       = $('error-text');

// ── Panel visibility ──────────────────────────────────────────────────────────
const ALL_PANELS = [
    elInfoPanel, elActionPanel, elProgressPanel,
    elFilterPanel, elPreviewPanel, elResultPanel, elErrorPanel
];

function showOnly(...active) {
    ALL_PANELS.forEach(p => p.classList.add('hidden'));
    active.forEach(p => p && p.classList.remove('hidden'));
}

function setStatus(type, text) {
    elStatus.className = 'status-card status-' + type;
    elStatusText.textContent = text;
}

// ── Cari indeks kolom dari header ─────────────────────────────────────────────
function resolveColumnIndices(headers) {
    colKode = headers.findIndex(h => /kode/i.test(h));
    colNama = headers.findIndex(h => /nama.*(pelajaran|mapel)/i.test(h) || /pelajaran/i.test(h));
    // Fallback: cari kolom ke-3 dan ke-5 (urutan tabel EMIS GTK)
    if (colKode === -1) colKode = 3;
    if (colNama === -1) colNama = 5;
}

// ── Buat key unik per baris berdasarkan kode + nama ───────────────────────────
function rowKey(row) {
    const kode = String(row[colKode] ?? '').trim();
    const nama = String(row[colNama] ?? '').trim();
    return `${kode}||${nama}`;
}

// ── Ambil baris yang lolos filter ─────────────────────────────────────────────
function getFilteredRows() {
    if (checkedKeys.size === 0) return collectedData.rows; // tidak ada filter → semua
    return collectedData.rows.filter(row => checkedKeys.has(rowKey(row)));
}

// ── Render daftar filter (checkbox list) ──────────────────────────────────────
function renderFilterList(searchTerm = '') {
    const q = searchTerm.trim().toLowerCase();

    // Kumpulkan entri unik: Map<key, { kode, nama, count }>
    const map = new Map();
    for (const row of collectedData.rows) {
        const kode  = String(row[colKode] ?? '').trim();
        const nama  = String(row[colNama] ?? '').trim();
        const key   = `${kode}||${nama}`;
        if (!map.has(key)) map.set(key, { kode, nama, count: 0 });
        map.get(key).count++;
    }

    // Filter berdasarkan pencarian
    const entries = [...map.entries()].filter(([, v]) => {
        if (!q) return true;
        return v.kode.toLowerCase().includes(q) || v.nama.toLowerCase().includes(q);
    });

    // Update match info
    elFilterMatchInfo.textContent = q
        ? `${entries.length} hasil` : '';

    // Render
    elFilterList.innerHTML = '';

    if (entries.length === 0) {
        elFilterList.innerHTML = '<p class="filter-empty">Tidak ada mapel yang cocok.</p>';
        return;
    }

    entries.forEach(([key, { kode, nama, count }]) => {
        const item = document.createElement('label');
        item.className = 'filter-item' + (checkedKeys.has(key) ? ' checked' : '');

        const cb = document.createElement('input');
        cb.type    = 'checkbox';
        cb.checked = checkedKeys.has(key);
        cb.addEventListener('change', () => {
            if (cb.checked) checkedKeys.add(key);
            else            checkedKeys.delete(key);
            item.classList.toggle('checked', cb.checked);
            updateFilterMeta();
            refreshPreviewAndResult();
        });

        const textWrap = document.createElement('span');
        textWrap.className = 'filter-item-text';

        const nameEl = document.createElement('span');
        nameEl.className = 'filter-item-name';
        nameEl.textContent = nama || '(tanpa nama)';

        const metaEl = document.createElement('span');
        metaEl.className = 'filter-item-meta';
        metaEl.textContent = kode ? `Kode: ${kode}` : 'Tanpa kode';

        textWrap.append(nameEl, metaEl);
        item.append(cb, textWrap);

        // Badge jumlah data
        const badge = document.createElement('span');
        badge.className = 'filter-item-badge';
        badge.textContent = count;
        item.appendChild(badge);

        elFilterList.appendChild(item);
    });
}

// ── Update chip counter "X dipilih" ──────────────────────────────────────────
function updateFilterMeta() {
    const total   = collectedData.rows.length;
    const selRows = getFilteredRows().length;
    const selKeys = checkedKeys.size;

    if (selKeys === 0) {
        elFilterSelCount.textContent = 'Semua (' + total + ')';
        elFilterSelCount.className   = 'chip chip-slate';
    } else {
        elFilterSelCount.textContent = selRows + ' baris dipilih';
        elFilterSelCount.className   = 'chip chip-teal';
    }
}

// ── Refresh preview tabel dan counter result ──────────────────────────────────
function refreshPreviewAndResult() {
    const rows = getFilteredRows();
    renderPreview(collectedData.headers, rows);

    // Update counter di result panel
    elResultCount.textContent = rows.length.toLocaleString('id-ID');
}

// ── Render preview tabel ──────────────────────────────────────────────────────
function renderPreview(headers, rows) {
    const htr = document.createElement('tr');
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        htr.appendChild(th);
    });
    elPreviewThead.innerHTML = '';
    elPreviewThead.appendChild(htr);

    elPreviewTbody.innerHTML = '';
    rows.slice(0, 10).forEach(cells => {
        const tr = document.createElement('tr');
        cells.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell;
            td.title = cell;
            tr.appendChild(td);
        });
        elPreviewTbody.appendChild(tr);
    });

    elPreviewCount.textContent = rows.length.toLocaleString('id-ID') + ' baris';
}

// ── Tampilkan filter + preview + result setelah data siap ─────────────────────
function showDataPanels() {
    resolveColumnIndices(collectedData.headers);

    // Default: semua dicentang
    checkedKeys.clear();
    // (kosong = semua tampil)

    renderFilterList('');
    updateFilterMeta();
    refreshPreviewAndResult();

    const selRows = getFilteredRows();
    elResultCount.textContent = selRows.length.toLocaleString('id-ID');

    showOnly(elInfoPanel, elFilterPanel, elPreviewPanel, elResultPanel);
}

// ── Update progress bar ───────────────────────────────────────────────────────
function updateProgress(page, totalPages, rowsCollected, totalData) {
    totalPagesKnown = totalPages || totalPagesKnown;
    const pct = totalPagesKnown > 0
        ? Math.round((page / totalPagesKnown) * 100) : 0;

    elProgressFill.style.width  = Math.max(4, pct) + '%';
    elProgressCount.textContent = rowsCollected.toLocaleString('id-ID') + ' baris';
    elProgressPages.textContent = `Halaman ${page} / ${totalPagesKnown}`;
    elProgressPct.textContent   = pct + '%';
    elProgressLabel.textContent = `Mengambil data...${totalData ? ' (' + totalData.toLocaleString('id-ID') + ' total)' : ''}`;
}

// ── Init: periksa halaman aktif ───────────────────────────────────────────────
async function init() {
    setStatus('checking', 'Memeriksa halaman...');
    showOnly();
    collectedData = { headers: [], rows: [] };
    checkedKeys.clear();
    elFilterSearch.value = '';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTabId = tab.id;

        await chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            files: ['content.js']
        }).catch(() => {});

        const res = await chrome.tabs.sendMessage(activeTabId, { action: 'CHECK_PAGE' });

        if (!res || !res.isMapelPage) {
            setStatus('error', 'Buka halaman Mata Pelajaran di EMIS GTK terlebih dahulu');
            showOnly();
            return;
        }

        const { paginationInfo } = res;
        setStatus('ok', 'Halaman Mata Pelajaran terdeteksi');

        elInfoTotal.textContent      = (paginationInfo.totalData || 0).toLocaleString('id-ID') + ' data';
        elInfoPage.textContent       = 'Halaman ' + paginationInfo.currentPage;
        elInfoTotalPages.textContent = paginationInfo.totalPages + ' halaman';

        showOnly(elInfoPanel, elActionPanel);

    } catch (err) {
        setStatus('error', 'Tidak dapat terhubung ke halaman. Pastikan Anda berada di EMIS GTK.');
        showOnly();
        console.error('[EMIS GTK ext]', err);
    }
}

// ── Tombol: Ambil Semua ───────────────────────────────────────────────────────
$('btn-scrape-all').addEventListener('click', async () => {
    setStatus('checking', 'Sedang mengambil semua data...');
    showOnly(elProgressPanel);

    elProgressFill.style.width  = '4%';
    elProgressCount.textContent = '0 baris';
    elProgressPages.textContent = 'Halaman 0 / ?';
    elProgressPct.textContent   = '0%';
    elProgressLabel.textContent = 'Menghubungi server...';

    await chrome.tabs.sendMessage(activeTabId, { action: 'SCRAPE_ALL' });
});

// ── Tombol: Halaman Ini Saja ──────────────────────────────────────────────────
$('btn-scrape-current').addEventListener('click', async () => {
    const res = await chrome.tabs.sendMessage(activeTabId, { action: 'CHECK_PAGE' });
    if (!res || !res.currentData) return;

    collectedData = {
        headers: res.currentData.headers,
        rows:    res.currentData.rows
    };

    setStatus('ok', 'Data halaman ini berhasil diambil');
    showDataPanels();
});

// ── Listener: progress & done dari content script ─────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'SCRAPE_PROGRESS') {
        updateProgress(msg.page, msg.totalPages, msg.rowsCollected, msg.totalData);
        return;
    }

    if (msg.action === 'SCRAPE_DONE') {
        collectedData = { headers: msg.headers, rows: msg.rows };
        elProgressFill.style.width  = '100%';
        elProgressPct.textContent   = '100%';
        elProgressLabel.textContent = 'Selesai!';

        setTimeout(() => {
            setStatus('ok', `Selesai — ${msg.totalRows.toLocaleString('id-ID')} data dikumpulkan`);
            showDataPanels();
        }, 500);
        return;
    }

    if (msg.action === 'SCRAPE_ERROR') {
        elErrorText.textContent = msg.error || 'Terjadi kesalahan tidak diketahui.';
        setStatus('error', 'Gagal mengambil data');
        showOnly(elErrorPanel);
        return;
    }
});

// ── Filter: pencarian ─────────────────────────────────────────────────────────
elFilterSearch.addEventListener('input', () => {
    const q = elFilterSearch.value;
    elFilterSearchClr.classList.toggle('hidden', q === '');
    renderFilterList(q);
});

elFilterSearchClr.addEventListener('click', () => {
    elFilterSearch.value = '';
    elFilterSearchClr.classList.add('hidden');
    renderFilterList('');
    elFilterSearch.focus();
});

// ── Filter: select all / none (hanya yang tampil saat ini) ───────────────────
$('btn-filter-all').addEventListener('click', () => {
    const q = elFilterSearch.value.trim().toLowerCase();
    // Kumpulkan key yang sedang tampil (sesuai filter teks)
    const visible = getVisibleKeys(q);
    visible.forEach(k => checkedKeys.add(k));
    renderFilterList(q);
    updateFilterMeta();
    refreshPreviewAndResult();
});

$('btn-filter-none').addEventListener('click', () => {
    const q = elFilterSearch.value.trim().toLowerCase();
    const visible = getVisibleKeys(q);
    visible.forEach(k => checkedKeys.delete(k));
    renderFilterList(q);
    updateFilterMeta();
    refreshPreviewAndResult();
});

// Ambil semua key yang muncul di filter list saat ini
function getVisibleKeys(q) {
    const map = new Map();
    for (const row of collectedData.rows) {
        const kode = String(row[colKode] ?? '').trim();
        const nama = String(row[colNama] ?? '').trim();
        const key  = `${kode}||${nama}`;
        if (!map.has(key)) map.set(key, { kode, nama });
    }
    return [...map.entries()]
        .filter(([, v]) => {
            if (!q) return true;
            return v.kode.toLowerCase().includes(q) || v.nama.toLowerCase().includes(q);
        })
        .map(([k]) => k);
}

// ── Export: ambil baris yang aktif (filtered) ─────────────────────────────────
function getExportData() {
    return {
        headers: collectedData.headers,
        rows:    getFilteredRows()
    };
}

// ── Export Excel (.xlsx) ──────────────────────────────────────────────────────
function downloadXlsx() {
    const { headers, rows } = getExportData();
    if (rows.length === 0) { alert('Tidak ada data yang dipilih untuk diunduh.'); return; }

    const sheetData = [headers, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    const colWidths = headers.map((h, ci) => {
        const maxLen = sheetData.reduce((acc, row) => {
            return Math.max(acc, String(row[ci] ?? '').length);
        }, h.length);
        return { wch: Math.min(maxLen + 2, 50) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Mata Pelajaran');
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob  = new Blob([wbOut], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    triggerDownload(blob, `mapel-emisgtk-${dateStamp()}.xlsx`);
}

// ── Export JSON ───────────────────────────────────────────────────────────────
function downloadJson() {
    const { headers, rows } = getExportData();
    if (rows.length === 0) { alert('Tidak ada data yang dipilih untuk diunduh.'); return; }

    const objects = rows.map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
        return obj;
    });
    const json = JSON.stringify({ total: objects.length, data: objects }, null, 2);
    triggerDownload(
        new Blob([json], { type: 'application/json;charset=utf-8;' }),
        `mapel-emisgtk-${dateStamp()}.json`
    );
}

// ── Salin TSV ─────────────────────────────────────────────────────────────────
function buildTsv() {
    const { headers, rows } = getExportData();
    const esc = v => String(v ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    const lines = [headers.map(esc).join('\t')];
    rows.forEach(r => lines.push(r.map(esc).join('\t')));
    return lines.join('\r\n');
}

async function copyTsv() {
    const { rows } = getExportData();
    if (rows.length === 0) { alert('Tidak ada data yang dipilih untuk disalin.'); return; }

    const btn = $('btn-copy-tsv');
    try {
        await navigator.clipboard.writeText(buildTsv());
        btn.textContent = '✅ Tersalin! (paste ke Excel/Sheets)';
        setTimeout(() => {
            btn.innerHTML = svgClipboard + ' Salin sebagai TSV';
        }, 2500);
    } catch {
        btn.textContent = '❌ Gagal menyalin';
    }
}

const svgClipboard = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="2.5"
     stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
</svg>`;

// ── Pasang event listener tombol export ───────────────────────────────────────
$('btn-download-xlsx').addEventListener('click', downloadXlsx);
$('btn-download-json').addEventListener('click', downloadJson);
$('btn-copy-tsv').addEventListener('click', copyTsv);
$('btn-scrape-again').addEventListener('click', init);
$('btn-retry').addEventListener('click', init);
$('btn-refresh').addEventListener('click', init);

// ── Helpers ───────────────────────────────────────────────────────────────────
function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function dateStamp() {
    const d = new Date();
    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
        '_',
        String(d.getHours()).padStart(2, '0'),
        String(d.getMinutes()).padStart(2, '0')
    ].join('');
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
