/**
 * EMIS GTK - Ambil Kurikulum
 * Content Script — berjalan di halaman EMIS GTK
 *
 * Perbaikan v1.1:
 * - Scrape "ambil semua" sekarang menggunakan totalData dari halaman pertama
 *   untuk menghitung totalPages secara akurat (per_page=100).
 * - Loop berhenti ketika sudah mencapai halaman terakhir, bukan hanya
 *   mengandalkan rows.length === 0 (yang bisa false-positive).
 */

// ─── Baca data tabel dari dokumen yang diberikan ──────────────────────────────
function parseTableFromDoc(doc) {
    const table = doc.querySelector('table.table');
    if (!table) return { headers: [], rows: [] };

    const headers = [];
    table.querySelectorAll('thead th').forEach(th => {
        headers.push(th.textContent.trim());
    });

    const rows = [];
    table.querySelectorAll('tbody tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('td').forEach(td => cells.push(td.textContent.trim()));
        if (cells.length > 0) rows.push(cells);
    });

    return { headers, rows };
}

// ─── Baca data tabel dari halaman saat ini ────────────────────────────────────
function scrapeCurrentPage() {
    return parseTableFromDoc(document);
}

// ─── Baca info pagination dari dokumen yang diberikan ────────────────────────
function parsePaginationFromDoc(doc) {
    // Total data: "Menampilkan X-Y dari Z data"
    let totalData = 0;
    const infoEl = doc.querySelector('.my-3 p.text-sm');
    if (infoEl) {
        // Hapus titik ribuan sebelum parse, e.g. "1.234" → "1234"
        const m = infoEl.textContent.match(/dari\s+([\d.,]+)\s+data/);
        if (m) totalData = parseInt(m[1].replace(/[.,]/g, ''), 10);
    }

    // Halaman aktif
    let currentPage = 1;
    const activeEl = doc.querySelector('.pagination-nav span[aria-current="page"]');
    if (activeEl) currentPage = parseInt(activeEl.textContent.trim(), 10) || 1;

    // Total halaman: tombol Last paling andal
    let totalPages = 1;
    const lastBtn = doc.querySelector('.pagination-nav a[title="Last"]');
    if (lastBtn) {
        const m = lastBtn.getAttribute('href').match(/page=(\d+)/);
        if (m) totalPages = parseInt(m[1], 10);
    } else {
        // Fallback: cari nomor halaman terbesar dari semua link angka
        doc.querySelectorAll('.pagination-nav a[href*="page="]').forEach(a => {
            const m = a.getAttribute('href').match(/page=(\d+)/);
            if (m) { const p = parseInt(m[1], 10); if (p > totalPages) totalPages = p; }
        });
    }

    const urlParams = new URLSearchParams(doc.location ? doc.location.search : window.location.search);
    const perPage = parseInt(urlParams.get('per_page') || '10', 10);

    return { currentPage, totalPages, totalData, perPage };
}

// ─── Fetch satu halaman, kembalikan { rows, totalData } ───────────────────────
async function fetchPage(baseUrl, pageNum) {
    const url = new URL(baseUrl);
    url.searchParams.set('page', pageNum);
    url.searchParams.set('per_page', '100');

    const res = await fetch(url.toString(), {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} pada halaman ${pageNum}`);

    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const { rows } = parseTableFromDoc(doc);
    const pagination = parsePaginationFromDoc(doc);

    return { rows, totalData: pagination.totalData, totalPages: pagination.totalPages };
}

// ─── Listener pesan dari side panel ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // ── CHECK_PAGE ──────────────────────────────────────────────────────────
    if (request.action === 'CHECK_PAGE') {
        const isMapelPage = !!document.querySelector('table.table');
        if (!isMapelPage) {
            sendResponse({ isMapelPage: false });
            return true;
        }
        const paginationInfo = parsePaginationFromDoc(document);
        const currentData    = scrapeCurrentPage();
        sendResponse({ isMapelPage: true, paginationInfo, currentData });
        return true;
    }

    // ── SCRAPE_ALL ──────────────────────────────────────────────────────────
    if (request.action === 'SCRAPE_ALL') {
        sendResponse({ status: 'started' }); // ack segera agar tidak timeout

        (async () => {
            try {
                // URL dasar: hapus page, paksa per_page=100
                const baseUrl = new URL(window.location.href);
                baseUrl.searchParams.delete('page');
                baseUrl.searchParams.set('per_page', '100');

                // ── Halaman 1 ─────────────────────────────────────────────
                const page1 = await fetchPage(baseUrl.toString(), 1);
                const headers = scrapeCurrentPage().headers; // header dari DOM (selalu ada)
                let allRows   = [...page1.rows];
                const totalData  = page1.totalData;
                // Hitung total halaman berdasarkan totalData & per_page=100
                const totalPages = page1.totalPages || Math.ceil(totalData / 100) || 1;

                chrome.runtime.sendMessage({
                    action: 'SCRAPE_PROGRESS',
                    page: 1, totalPages, rowsCollected: allRows.length, totalData
                });

                // ── Halaman 2 s/d totalPages ──────────────────────────────
                for (let page = 2; page <= totalPages; page++) {
                    const result = await fetchPage(baseUrl.toString(), page);

                    // Berhenti jika tidak ada data (halaman melebihi yang ada)
                    if (result.rows.length === 0) break;

                    allRows = allRows.concat(result.rows);

                    chrome.runtime.sendMessage({
                        action: 'SCRAPE_PROGRESS',
                        page, totalPages, rowsCollected: allRows.length, totalData
                    });

                    // Jeda kecil agar tidak membebani server
                    await new Promise(r => setTimeout(r, 250));
                }

                chrome.runtime.sendMessage({
                    action: 'SCRAPE_DONE',
                    headers,
                    rows: allRows,
                    totalRows: allRows.length
                });

            } catch (err) {
                chrome.runtime.sendMessage({
                    action: 'SCRAPE_ERROR',
                    error: err.message
                });
            }
        })();

        return true;
    }
});
