// popup.js - Controller for extension popup UI
document.addEventListener('DOMContentLoaded', () => {
  const statusBadge = document.getElementById('status-badge');
  const pageAlert = document.getElementById('page-alert');
  const statTotal = document.getElementById('stat-total');
  const statPage = document.getElementById('stat-page');
  const progressStatus = document.getElementById('progress-status');
  const progressPct = document.getElementById('progress-pct');
  const progressFill = document.getElementById('progress-fill');

  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnDownloadTxt = document.getElementById('btn-download-txt');
  const btnDownloadCsv = document.getElementById('btn-download-csv');
  const btnCopy = document.getElementById('btn-copy');
  const btnClearAll = document.getElementById('btn-clear-all');
  const popupToast = document.getElementById('popup-toast');

  let activeTabId = null;

  function showToast(text) {
    popupToast.innerText = text;
    popupToast.style.display = 'block';
    setTimeout(() => {
      popupToast.style.display = 'none';
    }, 2200);
  }

  function sendMessageToActiveTab(msg, callback) {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, msg, (res) => {
      if (chrome.runtime.lastError) {
        // Tab might not have content script running
        pageAlert.style.display = 'flex';
      } else {
        pageAlert.style.display = 'none';
        if (callback && res) callback(res);
      }
    });
  }

  function updateStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const tab = tabs[0];
      activeTabId = tab.id;

      const isAdobe = tab.url && tab.url.includes('contributor.stock.adobe.com');
      if (!isAdobe) {
        pageAlert.style.display = 'flex';
        statusBadge.innerText = 'Bukan Adobe Stock';
        statusBadge.className = 'badge';
        btnStart.disabled = true;
        btnDownloadTxt.disabled = true;
        btnDownloadCsv.disabled = true;
        btnCopy.disabled = true;
        return;
      }

      sendMessageToActiveTab({ action: 'GET_STATUS' }, (res) => {
        if (!res) return;

        statTotal.innerText = res.totalCollected || 0;
        statPage.innerText = `${res.currentIndex || 0} / ${res.totalOnPage || 0}`;

        const pct = res.totalOnPage > 0 ? Math.min(100, Math.round((res.currentIndex / res.totalOnPage) * 100)) : 0;
        progressFill.style.width = pct + '%';
        progressPct.innerText = pct + '%';

        if (res.isScraping) {
          btnStop.disabled = false;
          if (res.isPaused) {
            statusBadge.innerText = 'Dijeda';
            statusBadge.className = 'badge paused';
            progressStatus.innerText = 'Dijeda ⏸';
            btnStart.style.display = 'inline-flex';
            btnStart.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Lanjutkan</span>`;
            btnPause.style.display = 'none';
          } else {
            statusBadge.innerText = 'Berjalan';
            statusBadge.className = 'badge running';
            progressStatus.innerText = `Mengambil item ${res.currentIndex + 1}...`;
            btnStart.style.display = 'none';
            btnPause.style.display = 'inline-flex';
          }
        } else {
          statusBadge.innerText = res.totalCollected > 0 ? 'Siap' : 'Idle';
          statusBadge.className = 'badge';
          progressStatus.innerText = res.totalCollected > 0 ? 'Selesai ✓' : 'Siap mengambil';
          btnStart.style.display = 'inline-flex';
          btnStart.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Mulai Ambil</span>`;
          btnPause.style.display = 'none';
          btnStop.disabled = true;
        }

        btnDownloadTxt.disabled = !res.totalCollected;
        btnDownloadCsv.disabled = !res.totalCollected;
        btnCopy.disabled = !res.totalCollected;
      });
    });
  }

  // Button actions
  btnStart.addEventListener('click', () => {
    sendMessageToActiveTab({ action: 'START_SCRAPING' }, () => {
      showToast('Memulai pengambilan...');
      setTimeout(updateStatus, 300);
    });
  });

  btnPause.addEventListener('click', () => {
    sendMessageToActiveTab({ action: 'PAUSE_SCRAPING' }, () => {
      showToast('Dijeda ⏸');
      setTimeout(updateStatus, 300);
    });
  });

  btnStop.addEventListener('click', () => {
    sendMessageToActiveTab({ action: 'STOP_SCRAPING' }, () => {
      showToast('Dihentikan ⏹');
      setTimeout(updateStatus, 300);
    });
  });

  btnDownloadTxt.addEventListener('click', () => {
    sendMessageToActiveTab({ action: 'DOWNLOAD_TXT' }, () => {
      showToast('✓ File TXT diunduh!');
    });
  });

  btnDownloadCsv.addEventListener('click', () => {
    sendMessageToActiveTab({ action: 'DOWNLOAD_CSV' }, () => {
      showToast('✓ File CSV diunduh!');
    });
  });

  btnCopy.addEventListener('click', () => {
    sendMessageToActiveTab({ action: 'COPY_CLIPBOARD' }, () => {
      showToast('✓ Disalin ke clipboard!');
    });
  });

  btnClearAll.addEventListener('click', () => {
    if (confirm('Reset dan hapus semua data nama file yang terkumpul?')) {
      sendMessageToActiveTab({ action: 'CLEAR_DATA' }, () => {
        showToast('Data di-reset');
        setTimeout(updateStatus, 300);
      });
    }
  });

  // Initial call and interval poll
  updateStatus();
  setInterval(updateStatus, 1000);
});
