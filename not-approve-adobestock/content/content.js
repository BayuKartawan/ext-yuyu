// content.js - Injected content script on contributor.stock.adobe.com
(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__ADOBE_STOCK_REJECTED_LOADED__) return;
  window.__ADOBE_STOCK_REJECTED_LOADED__ = true;

  // State Management
  const state = {
    isScraping: false,
    isPaused: false,
    autoNextPage: true,
    delayMs: 350, // Default to a safe human-paced delay (350ms + random jitter)
    blockAnalytics: true, // Mute Adobe VisitorAPI / Sentry spam during bot run
    collectedMap: new Map(), // key: fileId || originalName -> item object
    totalOnPage: 0,
    currentIndex: 0,
    searchQuery: '',
    isMinimized: false,
    showPreview: false
  };

  // Restore stored items and settings from chrome.storage.local
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['adobe_rejected_items', 'adobe_rejected_settings'], (res) => {
      if (res && res.adobe_rejected_items && Array.isArray(res.adobe_rejected_items)) {
        res.adobe_rejected_items.forEach(item => {
          if (item && item.originalName) {
            const key = item.fileId || item.originalName;
            state.collectedMap.set(key, item);
          }
        });
      }
      if (res && res.adobe_rejected_settings) {
        state.autoNextPage = res.adobe_rejected_settings.autoNextPage ?? true;
        state.delayMs = res.adobe_rejected_settings.delayMs ?? 350;
        state.blockAnalytics = res.adobe_rejected_settings.blockAnalytics ?? true;
      }
      // Inform pageWorld about analytics blocking preference
      window.postMessage({ type: 'ADOBE_STOCK_SET_BLOCK_ANALYTICS', enabled: state.blockAnalytics }, '*');
      updateUI();
    });
  }

  // Listen for messages from pageWorld.js (network / Redux / Fiber interceptor)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ADOBE_STOCK_PAGE_ITEMS' && Array.isArray(event.data.items)) {
      let added = 0;
      event.data.items.forEach(item => {
        if (item.originalName) {
          const key = item.fileId || item.originalName;
          if (!state.collectedMap.has(key)) {
            state.collectedMap.set(key, item);
            added++;
          }
        }
      });
      if (added > 0) {
        persistItems();
        updateUI();
        showToast(`⚡ ${added} file langsung terdeteksi dari memori! (0 Klik)`);
      }
    }
  });

  // Listen for messages from popup.js
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
      if (req.action === 'GET_STATUS') {
        sendResponse({
          isScraping: state.isScraping,
          isPaused: state.isPaused,
          totalCollected: state.collectedMap.size,
          totalOnPage: state.totalOnPage,
          currentIndex: state.currentIndex,
          autoNextPage: state.autoNextPage,
          delayMs: state.delayMs,
          blockAnalytics: state.blockAnalytics,
          items: Array.from(state.collectedMap.values())
        });
      } else if (req.action === 'START_SCRAPING') {
        startScraping();
        sendResponse({ success: true });
      } else if (req.action === 'PAUSE_SCRAPING') {
        pauseScraping();
        sendResponse({ success: true });
      } else if (req.action === 'STOP_SCRAPING') {
        stopScraping();
        sendResponse({ success: true });
      } else if (req.action === 'INSTANT_SCAN') {
        instantScan();
        sendResponse({ success: true });
      } else if (req.action === 'CLEAR_DATA') {
        clearData();
        sendResponse({ success: true });
      } else if (req.action === 'DOWNLOAD_TXT') {
        downloadTxt();
        sendResponse({ success: true });
      } else if (req.action === 'DOWNLOAD_CSV') {
        downloadCsv();
        sendResponse({ success: true });
      } else if (req.action === 'COPY_CLIPBOARD') {
        copyToClipboard();
        sendResponse({ success: true });
      }
      return true;
    });
  }

  // Check if current URL is the rejected tab
  function isRejectedPage() {
    const path = window.location.pathname.toLowerCase();
    const hasRejectedUrl = path.includes('/rejected') || window.location.href.includes('rejected');
    const hasRejectedActiveTab = !!document.querySelector('a.nav__link.active[href*="rejected"]');
    return hasRejectedUrl || hasRejectedActiveTab;
  }

  // DOM Elements for Floating Widget
  let widgetRoot = null;

  function createWidget() {
    if (document.getElementById('as-rejected-collector-widget')) return;

    widgetRoot = document.createElement('div');
    widgetRoot.id = 'as-rejected-collector-widget';

    widgetRoot.innerHTML = `
      <!-- Minimized Pill -->
      <div class="as-minimized-pill" id="as-pill-trigger" style="display: none;">
        <span class="as-pulse-dot idle" id="as-pill-dot"></span>
        <span style="font-weight: 600; font-size: 12.5px;">📥 Ambil Nama File Ditolak</span>
        <span class="as-pill-badge" id="as-pill-counter">0</span>
      </div>

      <!-- Main Widget Card -->
      <div class="as-main-card" id="as-main-card">
        <div class="as-card-header">
          <div class="as-header-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Adobe Stock Rejected Files</span>
          </div>
          <div class="as-header-actions">
            <button class="as-icon-btn" id="as-btn-minimize" title="Perkecil Widget">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
        </div>

        <div class="as-card-body">
          <div class="as-toast" id="as-toast">✓ Pesan notifikasi</div>

          <!-- Stats Row -->
          <div class="as-stats-row">
            <div class="as-stat-box">
              <div class="as-stat-label">Terkumpul</div>
              <div class="as-stat-value">
                <span id="as-stat-collected">0</span>
                <span class="as-stat-sub">file</span>
              </div>
            </div>
            <div class="as-stat-box">
              <div class="as-stat-label">Halaman Ini</div>
              <div class="as-stat-value">
                <span id="as-stat-current">0</span>
                <span class="as-stat-sub">/ <span id="as-stat-total">0</span></span>
              </div>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="as-progress-wrapper">
            <div class="as-progress-meta">
              <span id="as-status-text">Siap untuk mengambil</span>
              <span id="as-progress-percent">0%</span>
            </div>
            <div class="as-progress-track">
              <div class="as-progress-bar" id="as-progress-bar"></div>
            </div>
          </div>

          <!-- Controls Buttons -->
          <div class="as-controls-row">
            <button class="as-btn as-btn-primary" id="as-btn-start">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Mulai Ambil</span>
            </button>
            <button class="as-btn as-btn-warning" id="as-btn-pause" style="display: none;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
              <span>Jeda</span>
            </button>
            <button class="as-btn as-btn-danger" id="as-btn-stop" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16"></rect></svg>
              <span>Stop</span>
            </button>
            <button class="as-btn as-btn-secondary" id="as-btn-instant-scan" title="Ekstrak langsung dari memori Redux / React (0 Klik, 100% Bersih)">
              <span>⚡ Scan Instan</span>
            </button>
          </div>

          <!-- Options Box -->
          <div class="as-options-box">
            <div class="as-option-item">
              <label class="as-checkbox-label">
                <input type="checkbox" id="as-chk-autonext" checked>
                <span>Auto Lanjut ke Halaman Berikutnya</span>
              </label>
            </div>
            <div class="as-option-item">
              <label class="as-checkbox-label" title="Mencegah browser mengirim ratusan request analytics (VisitorAPI/Sentry) saat mengklik">
                <input type="checkbox" id="as-chk-block-analytics" checked>
                <span style="color: #34d399; font-weight: 600;">🛡️ Blokir Spam Analytics Saat Bot Jalan</span>
              </label>
            </div>
            <div class="as-option-item" style="margin-top: 6px;">
              <span style="font-size: 11.5px; color: var(--as-text-muted);">Kecepatan Klik (Aman):</span>
              <select class="as-speed-select" id="as-sel-speed">
                <option value="150">⚡ Cepat (150ms)</option>
                <option value="350" selected>🛡️ Aman + Jitter Alami (350ms)</option>
                <option value="600">🐢 Santai Manusiawi (600ms)</option>
                <option value="1000">🚶 Sangat Lambat (1000ms)</option>
              </select>
            </div>
          </div>

          <!-- Export Actions Box -->
          <div class="as-export-box">
            <div class="as-export-title">Unduh & Ekspor Data</div>
            <div class="as-export-grid">
              <button class="as-btn as-btn-success as-btn-full" id="as-btn-download-txt" title="Unduh file TXT hanya berisi nama file (1 nama per baris)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                <span>Unduh TXT (Hanya Nama File)</span>
              </button>
              <button class="as-btn as-btn-secondary" id="as-btn-copy" title="Salin semua nama file langsung ke clipboard">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span>Salin Nama</span>
              </button>
              <button class="as-btn as-btn-secondary" id="as-btn-download-csv" title="Unduh tabel lengkap dalam format CSV">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path></svg>
                <span>Unduh CSV</span>
              </button>
            </div>

            <!-- Preview Toggle -->
            <button class="as-preview-toggle-btn" id="as-btn-toggle-preview">
              <span id="as-preview-toggle-text">Lihat Daftar Nama File (0) ▼</span>
            </button>

            <!-- Preview Drawer -->
            <div class="as-preview-drawer" id="as-preview-drawer" style="display: none;">
              <input type="text" class="as-preview-search" id="as-preview-search" placeholder="Cari nama file...">
              <div class="as-preview-list" id="as-preview-list">
                <div class="as-preview-empty">Belum ada file yang diambil.</div>
              </div>
            </div>

            <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
              <button class="as-icon-btn" id="as-btn-clear" title="Reset / Hapus Semua Data Terkumpul" style="font-size: 11px; width: auto; padding: 2px 8px; color: var(--as-text-dim);">
                Reset Data
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(widgetRoot);
    attachWidgetEvents();
    updateUI();
  }

  function attachWidgetEvents() {
    const pill = document.getElementById('as-pill-trigger');
    const mainCard = document.getElementById('as-main-card');
    const btnMin = document.getElementById('as-btn-minimize');
    const btnStart = document.getElementById('as-btn-start');
    const btnPause = document.getElementById('as-btn-pause');
    const btnStop = document.getElementById('as-btn-stop');
    const btnInstant = document.getElementById('as-btn-instant-scan');
    const chkAutoNext = document.getElementById('as-chk-autonext');
    const chkBlockAnalytics = document.getElementById('as-chk-block-analytics');
    const selSpeed = document.getElementById('as-sel-speed');
    const btnDownloadTxt = document.getElementById('as-btn-download-txt');
    const btnDownloadCsv = document.getElementById('as-btn-download-csv');
    const btnCopy = document.getElementById('as-btn-copy');
    const btnTogglePreview = document.getElementById('as-btn-toggle-preview');
    const searchInput = document.getElementById('as-preview-search');
    const btnClear = document.getElementById('as-btn-clear');

    // Minimize & Restore
    btnMin.addEventListener('click', () => {
      state.isMinimized = true;
      mainCard.style.display = 'none';
      pill.style.display = 'flex';
    });

    pill.addEventListener('click', () => {
      state.isMinimized = false;
      pill.style.display = 'none';
      mainCard.style.display = 'block';
    });

    // Start / Pause / Stop / Instant
    btnStart.addEventListener('click', () => {
      if (state.isPaused) {
        resumeScraping();
      } else {
        startScraping();
      }
    });

    btnPause.addEventListener('click', pauseScraping);
    btnStop.addEventListener('click', stopScraping);
    btnInstant.addEventListener('click', instantScan);

    // Settings
    chkAutoNext.addEventListener('change', (e) => {
      state.autoNextPage = e.target.checked;
      saveSettings();
    });

    chkBlockAnalytics.addEventListener('change', (e) => {
      state.blockAnalytics = e.target.checked;
      window.postMessage({ type: 'ADOBE_STOCK_SET_BLOCK_ANALYTICS', enabled: state.blockAnalytics }, '*');
      saveSettings();
      showToast(state.blockAnalytics ? '🛡️ Blokir analytics aktif' : '⚠️ Blokir analytics nonaktif');
    });

    selSpeed.addEventListener('change', (e) => {
      state.delayMs = parseInt(e.target.value, 10) || 350;
      saveSettings();
    });

    // Exports
    btnDownloadTxt.addEventListener('click', downloadTxt);
    btnDownloadCsv.addEventListener('click', downloadCsv);
    btnCopy.addEventListener('click', copyToClipboard);

    // Toggle Preview Drawer
    btnTogglePreview.addEventListener('click', () => {
      state.showPreview = !state.showPreview;
      const drawer = document.getElementById('as-preview-drawer');
      const text = document.getElementById('as-preview-toggle-text');
      if (state.showPreview) {
        drawer.style.display = 'flex';
        text.innerText = `Sembunyikan Daftar (${state.collectedMap.size}) ▲`;
        renderPreviewList();
      } else {
        drawer.style.display = 'none';
        text.innerText = `Lihat Daftar Nama File (${state.collectedMap.size}) ▼`;
      }
    });

    // Search inside preview
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      renderPreviewList();
    });

    // Clear data
    btnClear.addEventListener('click', () => {
      if (confirm('Hapus semua data nama file yang terkumpul?')) {
        clearData();
      }
    });
  }

  function saveSettings() {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        adobe_rejected_settings: {
          autoNextPage: state.autoNextPage,
          delayMs: state.delayMs,
          blockAnalytics: state.blockAnalytics
        }
      });
    }
  }

  function persistItems() {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        adobe_rejected_items: Array.from(state.collectedMap.values())
      });
    }
    // Update badge in background
    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'UPDATE_BADGE',
        count: state.collectedMap.size
      }).catch(() => { });
    }
  }

  function clearData() {
    state.collectedMap.clear();
    state.currentIndex = 0;
    persistItems();
    updateUI();
    showToast('Data berhasil di-reset');
  }

  function showToast(message) {
    const toast = document.getElementById('as-toast');
    if (!toast) return;
    toast.innerText = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // Instant Scan from memory without clicking!
  function instantScan() {
    showToast('⚡ Memindai memori Redux / React...');
    window.postMessage({ type: 'ADOBE_STOCK_TRIGGER_SCAN' }, '*');
  }

  // Find all item tiles on current page
  function getPageTiles() {
    const tiles = Array.from(document.querySelectorAll('.upload-tile, [role="option"][title="Content tile"]'));
    const distinctTiles = [];
    const seenWrappers = new Set();
    tiles.forEach(t => {
      const wrapper = t.querySelector('.upload-tile__wrapper') || t;
      if (!seenWrappers.has(wrapper)) {
        seenWrappers.add(wrapper);
        distinctTiles.push(t);
      }
    });
    return distinctTiles;
  }

  // Extract expected File ID from thumbnail image src (e.g. 220_F_2226867777_hash.jpg)
  function getExpectedFileId(tile) {
    const img = tile.querySelector('img');
    if (!img) return null;
    const src = img.src || img.getAttribute('src') || '';
    const match = src.match(/220_F_(\d+)_/);
    return match ? match[1] : null;
  }

  // Extract File ID and Original name from the active sidebar
  function extractSidebarInfo() {
    const sidebar = document.querySelector('.content-side-panel, .content-rejected-page__content__content-side-panel, .content-tagger__form--content');
    if (!sidebar) return null;

    const text = sidebar.innerText || sidebar.textContent || '';

    // File ID
    let fileId = null;
    const idMatch = text.match(/File ID:\s*(\d+)/i);
    if (idMatch) fileId = idMatch[1].trim();

    // Original Name
    let originalName = null;
    const nameMatch = text.match(/Original name:\s*([^\r\n<]+)/i);
    if (nameMatch) {
      originalName = nameMatch[1].trim();
    } else {
      const allDivs = sidebar.querySelectorAll('div');
      for (const div of allDivs) {
        if (div.textContent.includes('Original name:')) {
          originalName = div.textContent.replace('Original name:', '').trim();
          break;
        }
      }
    }

    // Rejection Reason
    let reason = '';
    const reasonEl = sidebar.querySelector('[data-t="rejection-reason-title"]');
    if (reasonEl) {
      reason = reasonEl.innerText.trim();
    }

    return { fileId, originalName, reason };
  }

  // Simulate user click on tile
  function clickTile(tile) {
    const clickable = tile.querySelector('[role="option"]') || tile.querySelector('.upload-tile__wrapper') || tile.querySelector('img') || tile;
    clickable.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const mouseEvents = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    mouseEvents.forEach(evtName => {
      const evt = new MouseEvent(evtName, {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1
      });
      clickable.dispatchEvent(evt);
    });
  }

  // Wait for sidebar to update
  function waitForSidebarUpdate(expectedId, maxWaitMs = 1200) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      function check() {
        const info = extractSidebarInfo();
        if (info && info.originalName) {
          if (!expectedId || info.fileId === expectedId) {
            return resolve(info);
          }
        }

        if (Date.now() - startTime >= maxWaitMs) {
          return resolve(info && info.originalName ? info : null);
        }

        setTimeout(check, 30);
      }

      check();
    });
  }

  // Sleep utility
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Main Scraping Process
  async function startScraping() {
    if (state.isScraping) return;

    // First try instant scan from memory!
    instantScan();
    await sleep(100);

    const tiles = getPageTiles();
    if (tiles.length === 0) {
      showToast('⚠️ Tidak ada item aset yang ditemukan di halaman ini.');
      return;
    }

    state.isScraping = true;
    state.isPaused = false;
    state.currentIndex = 0;
    state.totalOnPage = tiles.length;

    updateUI();
    showToast(`Mulai mengambil ${tiles.length} aset...`);

    await runScrapeLoop();
  }

  function pauseScraping() {
    if (!state.isScraping) return;
    state.isPaused = true;
    updateUI();
    showToast('Proses dijeda ⏸');
  }

  function resumeScraping() {
    if (!state.isScraping || !state.isPaused) return;
    state.isPaused = false;
    updateUI();
    showToast('Melanjutkan proses ▶');
    runScrapeLoop();
  }

  function stopScraping() {
    state.isScraping = false;
    state.isPaused = false;
    updateUI();
    showToast('Proses dihentikan ⏹');
  }

  async function runScrapeLoop() {
    const tiles = getPageTiles();
    state.totalOnPage = tiles.length;

    while (state.currentIndex < tiles.length) {
      if (!state.isScraping) return;
      if (state.isPaused) return;

      const tile = tiles[state.currentIndex];
      const expectedId = getExpectedFileId(tile);

      // Click the tile to open the sidebar
      clickTile(tile);

      // Wait for sidebar to reflect the clicked asset
      const info = await waitForSidebarUpdate(expectedId, 1200);

      if (info && info.originalName) {
        const fileId = info.fileId || expectedId || `item_${Date.now()}`;
        state.collectedMap.set(fileId, {
          fileId: fileId,
          originalName: info.originalName,
          reason: info.reason || '',
          timestamp: new Date().toISOString()
        });
        persistItems();
      }

      state.currentIndex++;
      updateUI();

      // Human-like Jitter Delay: base delay + random 50-150ms variation
      const randomJitter = Math.floor(Math.random() * 120);
      const totalWait = (state.delayMs || 350) + randomJitter;
      await sleep(totalWait);
    }

    // Completed all tiles on this page!
    if (state.autoNextPage && state.isScraping) {
      const hasNext = await goToNextPage();
      if (hasNext) {
        showToast('Memuat halaman berikutnya...');
        // Generous natural pause between pages (2.2 seconds)
        await sleep(2200);
        state.currentIndex = 0;
        await runScrapeLoop();
        return;
      }
    }

    // Finished entirely
    state.isScraping = false;
    state.isPaused = false;
    updateUI();
    showToast(`🎉 Selesai! Total ${state.collectedMap.size} nama file berhasil diambil.`);
  }

  // Handle Pagination Next Page
  async function goToNextPage() {
    const paginationLinks = Array.from(document.querySelectorAll('.the-paginator-list a, a.grey.dove-text, ul.pagination a'));
    const nextBtn = paginationLinks.find(a => {
      const text = a.textContent.trim().toLowerCase();
      return text === 'next' || text === 'selanjutnya' || text === '>';
    });

    if (nextBtn) {
      nextBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      nextBtn.click();
      return true;
    }
    return false;
  }

  // Update UI Elements
  function updateUI() {
    const totalCollected = state.collectedMap.size;
    const tiles = getPageTiles();
    state.totalOnPage = tiles.length;

    const statCollected = document.getElementById('as-stat-collected');
    const statCurrent = document.getElementById('as-stat-current');
    const statTotal = document.getElementById('as-stat-total');
    const pillCounter = document.getElementById('as-pill-counter');
    const pillDot = document.getElementById('as-pill-dot');

    if (statCollected) statCollected.innerText = totalCollected;
    if (statCurrent) statCurrent.innerText = state.currentIndex;
    if (statTotal) statTotal.innerText = state.totalOnPage;
    if (pillCounter) pillCounter.innerText = totalCollected;

    if (pillDot) {
      pillDot.className = 'as-pulse-dot ' + (state.isScraping ? (state.isPaused ? 'paused' : 'running') : 'idle');
    }

    const progressBar = document.getElementById('as-progress-bar');
    const progressPercent = document.getElementById('as-progress-percent');
    const statusText = document.getElementById('as-status-text');

    const percent = state.totalOnPage > 0 ? Math.min(100, Math.round((state.currentIndex / state.totalOnPage) * 100)) : 0;
    if (progressBar) progressBar.style.width = percent + '%';
    if (progressPercent) progressPercent.innerText = percent + '%';

    if (statusText) {
      if (state.isScraping) {
        statusText.innerText = state.isPaused ? 'Dijeda ⏸' : `Mengambil aset ${state.currentIndex + 1} / ${state.totalOnPage}...`;
      } else if (state.currentIndex > 0 && state.currentIndex >= state.totalOnPage) {
        statusText.innerText = 'Selesai di halaman ini ✓';
      } else {
        statusText.innerText = 'Siap untuk mengambil';
      }
    }

    const btnStart = document.getElementById('as-btn-start');
    const btnPause = document.getElementById('as-btn-pause');
    const btnStop = document.getElementById('as-btn-stop');

    if (btnStart && btnPause && btnStop) {
      if (state.isScraping) {
        btnStop.disabled = false;
        if (state.isPaused) {
          btnStart.style.display = 'inline-flex';
          btnStart.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Lanjutkan</span>`;
          btnPause.style.display = 'none';
        } else {
          btnStart.style.display = 'none';
          btnPause.style.display = 'inline-flex';
        }
      } else {
        btnStart.style.display = 'inline-flex';
        btnStart.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Mulai Ambil</span>`;
        btnPause.style.display = 'none';
        btnStop.disabled = true;
      }
    }

    const previewToggleText = document.getElementById('as-preview-toggle-text');
    if (previewToggleText) {
      previewToggleText.innerText = state.showPreview
        ? `Sembunyikan Daftar (${totalCollected}) ▲`
        : `Lihat Daftar Nama File (${totalCollected}) ▼`;
    }

    if (state.showPreview) {
      renderPreviewList();
    }
  }

  function renderPreviewList() {
    const listEl = document.getElementById('as-preview-list');
    if (!listEl) return;

    const items = Array.from(state.collectedMap.values());
    const query = state.searchQuery;
    const filtered = query
      ? items.filter(it => it.originalName.toLowerCase().includes(query) || (it.fileId && it.fileId.includes(query)))
      : items;

    if (filtered.length === 0) {
      listEl.innerHTML = query
        ? `<div class="as-preview-empty">Tidak ada hasil cocok "${query}"</div>`
        : `<div class="as-preview-empty">Belum ada file yang diambil.</div>`;
      return;
    }

    listEl.innerHTML = filtered.map((it, idx) => `
      <div class="as-preview-item" title="File ID: ${it.fileId || '-'} &#10;Alasan: ${it.reason || '-'}">
        <span style="color: var(--as-text-dim); margin-right: 4px;">${idx + 1}.</span> ${escapeHtml(it.originalName)}
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  // Export 1: TXT (Hanya Nama File, 1 per baris)
  function downloadTxt() {
    const items = Array.from(state.collectedMap.values());
    if (items.length === 0) {
      showToast('⚠️ Belum ada file yang diambil.');
      return;
    }

    const textContent = items.map(it => it.originalName).join('\n');
    triggerDownload(textContent, 'text/plain', `adobe-stock-rejected-filenames-${getTimestamp()}.txt`);
    showToast(`✓ TXT diunduh (${items.length} file)`);
  }

  // Export 2: Copy to Clipboard
  function copyToClipboard() {
    const items = Array.from(state.collectedMap.values());
    if (items.length === 0) {
      showToast('⚠️ Belum ada file yang diambil.');
      return;
    }

    const textContent = items.map(it => it.originalName).join('\n');
    navigator.clipboard.writeText(textContent).then(() => {
      showToast(`✓ ${items.length} nama file disalin ke clipboard!`);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = textContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(`✓ ${items.length} nama file disalin ke clipboard!`);
    });
  }

  // Export 3: CSV
  function downloadCsv() {
    const items = Array.from(state.collectedMap.values());
    if (items.length === 0) {
      showToast('⚠️ Belum ada file yang diambil.');
      return;
    }

    const header = ['No', 'File ID', 'Original Name', 'Rejection Reason'];
    const rows = items.map((it, idx) => [
      idx + 1,
      `"${(it.fileId || '').replace(/"/g, '""')}"`,
      `"${(it.originalName || '').replace(/"/g, '""')}"`,
      `"${(it.reason || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    triggerDownload(csvContent, 'text/csv;charset=utf-8;', `adobe-stock-rejected-data-${getTimestamp()}.csv`);
    showToast(`✓ CSV diunduh (${items.length} baris)`);
  }

  function triggerDownload(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function getTimestamp() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  // Periodic checker to ensure widget is shown when on rejected page
  setInterval(() => {
    if (isRejectedPage()) {
      if (!document.getElementById('as-rejected-collector-widget')) {
        createWidget();
      }
    }
  }, 1000);

  // Initial check
  if (isRejectedPage()) {
    createWidget();
  }
})();
