/**
 * EMIS Data Siswa Scraper - Sidebar Logic (Auto-Record Concept)
 * Handles live student data reception, deduplication, storage, UI rendering, and export.
 */

// ==================== STATE ====================
let recordedStudents = [];
let currentTabId = null;

// ==================== DOM ELEMENTS ====================
const $ = (id) => document.getElementById(id);
const els = {
    connectionStatus: $('connectionStatus'),
    totalSiswa: $('totalSiswa'),
    lastStudentName: $('lastStudentName'),
    dataCount: $('dataCount'),
    btnManualRecord: $('btnManualRecord'),
    btnExport: $('btnExport'),
    btnClear: $('btnClear'),
    selectFormat: $('selectFormat'),
    searchInput: $('searchInput'),
    studentList: $('studentList'),
    logContainer: $('logContainer'),
    btnClearLog: $('btnClearLog'),
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadSavedData();
    checkConnection();
});

function initEventListeners() {
    els.btnManualRecord.addEventListener('click', manualRecordCurrentPage);
    els.btnExport.addEventListener('click', exportData);
    els.btnClear.addEventListener('click', confirmClearData);
    els.btnClearLog.addEventListener('click', clearLog);
    els.searchInput.addEventListener('input', renderStudentList);

    // Listen for messages from background / content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        handleIncomingMessage(message);
    });
}

// ==================== CONNECTION CHECK ====================
async function checkConnection() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && tab.url.includes('emis.kemenag.go.id')) {
            currentTabId = tab.id;
            setConnectionStatus('connected', 'Terhubung');
            addLog('success', 'Terhubung ke portal EMIS Kemenag');
        } else {
            setConnectionStatus('error', 'Bukan EMIS');
            addLog('warning', 'Silakan buka portal EMIS Kemenag di tab browser');
        }
    } catch (e) {
        setConnectionStatus('error', 'Error');
        addLog('error', 'Gagal memeriksa koneksi: ' + e.message);
    }
}

function setConnectionStatus(status, text) {
    els.connectionStatus.className = 'connection-status ' + status;
    els.connectionStatus.querySelector('.status-text').textContent = text;
}

// ==================== DATA RECORDING & DEDUPLICATION ====================
function handleIncomingMessage(message) {
    if (message.type === 'STUDENT_DATA' && message.data) {
        addStudentData(message.data);
    } else if (message.type === 'TAB_UPDATED') {
        checkConnection();
    }
}

function addStudentData(student) {
    if (!student || (!student.full_name && !student.nik)) return;

    // Deduplication check based on id, siswa_id, or nik
    const uniqueKey = student.id || student.siswa_id || student.nik;
    const existingIndex = recordedStudents.findIndex(s => {
        const key = s.id || s.siswa_id || s.nik;
        return key && key !== '-' && key === uniqueKey;
    });

    if (existingIndex >= 0) {
        // Update existing record with newer complete fields
        recordedStudents[existingIndex] = { ...recordedStudents[existingIndex], ...student };
        addLog('info', `Update data siswa: ${student.full_name}`);
    } else {
        // Add new record at beginning
        recordedStudents.unshift(student);
        addLog('success', `Berhasil merekam: ${student.full_name}`);
    }

    saveData();
    updateUI();
}

async function manualRecordCurrentPage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('emis.kemenag.go.id')) {
            addLog('error', 'Silakan buka halaman detail siswa di EMIS!');
            return;
        }

        currentTabId = tab.id;
        addLog('info', 'Mencoba merekam data dari halaman aktif...');

        chrome.tabs.sendMessage(currentTabId, { action: 'MANUAL_SCRAPE_CURRENT_PAGE' }, (response) => {
            if (chrome.runtime.lastError) {
                addLog('error', 'Gagal komunikasi dengan halaman: ' + chrome.runtime.lastError.message);
                return;
            }
            if (response && response.status === 'success' && response.data) {
                addStudentData(response.data);
            } else if (response && response.status === 'not_found') {
                addLog('warning', 'Pastikan Anda sedang membuka halaman detail siswa.');
            }
        });

    } catch (e) {
        addLog('error', 'Gagal merekam manual: ' + e.message);
    }
}

// ==================== STORAGE ====================
function saveData() {
    try {
        chrome.storage.local.set({ recordedStudents: recordedStudents }, () => {
            if (chrome.runtime.lastError) {
                console.error('Save error:', chrome.runtime.lastError);
            }
        });
    } catch (e) {
        console.error('Storage error:', e);
    }
}

function loadSavedData() {
    chrome.storage.local.get(['recordedStudents'], (result) => {
        if (result.recordedStudents && Array.isArray(result.recordedStudents)) {
            recordedStudents = result.recordedStudents;
            updateUI();
            if (recordedStudents.length > 0) {
                addLog('info', `Dimuat ${recordedStudents.length} data tersimpan`);
            }
        }
    });
}

function confirmClearData() {
    if (recordedStudents.length === 0) return;
    if (confirm(`Apakah Anda yakin ingin menghapus semua (${recordedStudents.length}) data terekam?`)) {
        recordedStudents = [];
        saveData();
        updateUI();
        addLog('warning', 'Semua data terekam telah dibersihkan');
    }
}

// ==================== UI RENDERING ====================
function updateUI() {
    const total = recordedStudents.length;
    els.totalSiswa.textContent = total;
    els.dataCount.textContent = total;
    els.btnExport.disabled = total === 0;

    if (total > 0) {
        const last = recordedStudents[0];
        els.lastStudentName.textContent = last.full_name || '-';
    } else {
        els.lastStudentName.textContent = '-';
    }

    renderStudentList();
}

function renderStudentList() {
    const query = els.searchInput.value.toLowerCase().trim();
    const filtered = recordedStudents.filter(s => {
        if (!query) return true;
        return (
            (s.full_name && s.full_name.toLowerCase().includes(query)) ||
            (s.nik && s.nik.toLowerCase().includes(query)) ||
            (s.nisn && s.nisn.toLowerCase().includes(query)) ||
            (s.study_group_name && s.study_group_name.toLowerCase().includes(query))
        );
    });

    if (filtered.length === 0) {
        els.studentList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">${query ? '🔍' : '📂'}</div>
                <p>${query ? 'Tidak ditemukan data yang cocok' : 'Belum ada data siswa yang terekam.'}</p>
                <span class="empty-hint">${query ? 'Coba kata kunci lain' : 'Buka detail siswa di EMIS atau klik "Rekam Halaman Ini".'}</span>
            </div>
        `;
        return;
    }

    els.studentList.innerHTML = filtered.map((s, idx) => {
        const isMale = s.gender && s.gender.toLowerCase().includes('laki');
        const badgeClass = isMale ? 'badge-gender-l' : 'badge-gender-p';
        const genderText = s.gender && s.gender !== '-' ? s.gender : (isMale ? 'Laki-laki' : 'Perempuan');
        const formattedTime = s.timestamp ? new Date(s.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
        const ortuName = s.father_full_name && s.father_full_name !== '-' ? s.father_full_name
            : s.mother_full_name && s.mother_full_name !== '-' ? s.mother_full_name
            : s.wali_full_name && s.wali_full_name !== '-' ? s.wali_full_name : '-';

        return `
            <div class="student-card">
                <div class="student-name-row">
                    <div class="student-name">${escapeHtml(s.full_name)}</div>
                    <span class="student-badge ${badgeClass}">${escapeHtml(genderText)}</span>
                </div>
                <div class="student-details">
                    <div class="detail-item">NIK: <span>${escapeHtml(s.nik)}</span></div>
                    <div class="detail-item">NISN: <span>${escapeHtml(s.nisn)}</span></div>
                    <div class="detail-item">Rombel: <span>${escapeHtml(s.study_group_name)}</span></div>
                    <div class="detail-item">Ortu/Wali: <span>${escapeHtml(ortuName)}</span></div>
                </div>
                <div class="student-footer">
                    <span>📍 ${escapeHtml(s.sub_district && s.sub_district !== '-' ? s.sub_district : (s.city && s.city !== '-' ? s.city : s.address))}</span>
                    <span>🕒 ${formattedTime}</span>
                </div>
            </div>
        `;
    }).join('');
}

function addLog(type, message) {
    const time = new Date().toLocaleTimeString('id-ID');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${time}] ${message}`;
    els.logContainer.appendChild(entry);
    els.logContainer.scrollTop = els.logContainer.scrollHeight;
}

function clearLog() {
    els.logContainer.innerHTML = '';
}

function escapeHtml(str) {
    if (!str) return '-';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==================== EXPORT DATA ====================
function exportData() {
    if (recordedStudents.length === 0) {
        alert('Belum ada data untuk diekspor!');
        return;
    }

    const format = els.selectFormat.value;
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `EMIS_Data_Siswa_${dateStr}.${format === 'json' ? 'json' : format === 'xlsx' ? 'xls' : 'csv'}`;

    if (format === 'json') {
        exportJSON(fileName);
    } else if (format === 'xlsx') {
        exportExcelHTML(fileName);
    } else {
        exportCSV(fileName);
    }
}

function getExportColumns() {
    return [
        { label: 'No', key: 'no' },
        { label: 'ID Siswa', key: 'id' },
        { label: 'Siswa UUID', key: 'siswa_id' },
        { label: 'Nama Lengkap', key: 'full_name' },
        { label: 'NIK', key: 'nik' },
        { label: 'NISN', key: 'nisn' },
        { label: 'Local NIS', key: 'local_nis' },
        { label: 'Jenis Kelamin', key: 'gender' },
        { label: 'Tempat Lahir', key: 'birth_place' },
        { label: 'Tanggal Lahir', key: 'birth_date' },
        { label: 'Agama', key: 'religion' },
        { label: 'Cita-Cita', key: 'life_goal' },
        { label: 'Hobi', key: 'hobby' },
        { label: 'Anak Ke', key: 'child_of_num' },
        { label: 'Jumlah Saudara', key: 'siblings_num' },
        { label: 'Yang Membiayai Sekolah', key: 'fund_source' },
        { label: 'Kebutuhan Disabilitas', key: 'disability' },
        { label: 'Kebutuhan Khusus', key: 'special_need' },
        { label: 'Alamat Jalan', key: 'address' },
        { label: 'Alamat Lengkap', key: 'full_address' },
        { label: 'Status Tempat Tinggal', key: 'residence_status' },
        { label: 'Jarak ke Sekolah', key: 'residence_distance' },
        { label: 'Waktu Tempuh', key: 'interval_time' },
        { label: 'Transportasi', key: 'transportation' },
        { label: 'No Handphone', key: 'handphone' },
        { label: 'Email', key: 'email' },
        { label: 'No. KIP', key: 'nomor_kip' },
        { label: 'No. KK', key: 'kk_num' },
        { label: 'Kepala Keluarga', key: 'family_head_name' },
        { label: 'RT', key: 'rt' },
        { label: 'RW', key: 'rw' },
        { label: 'Kode Pos', key: 'postal_code' },
        { label: 'Provinsi', key: 'province' },
        { label: 'Kabupaten/Kota', key: 'city' },
        { label: 'Kecamatan', key: 'district' },
        { label: 'Kelurahan/Desa', key: 'sub_district' },
        
        { label: 'Tahun Ajaran', key: 'academic_year' },
        { label: 'Tanggal Masuk', key: 'admission_date' },
        { label: 'NSM & Lembaga', key: 'nsm_lembaga' },
        { label: 'Rombel / Kelas', key: 'study_group_name' },
        { label: 'Ruang Kelas', key: 'room_name' },
        { label: 'Tingkat', key: 'level' },
        { label: 'Jurusan', key: 'major' },
        { label: 'Status Siswa', key: 'student_status' },
        { label: 'Keterangan Status', key: 'status_description' },
        { label: 'Wali Kelas', key: 'teacher_name' },
        { label: 'No. Absen', key: 'absent_number' },
        
        { label: 'Ayah - Nama', key: 'father_full_name' },
        { label: 'Ayah - NIK', key: 'father_nik' },
        { label: 'Ayah - Tempat Lahir', key: 'father_birth_place' },
        { label: 'Ayah - Tanggal Lahir', key: 'father_birth_date' },
        { label: 'Ayah - Status', key: 'father_life_status' },
        { label: 'Ayah - Pendidikan', key: 'father_last_education' },
        { label: 'Ayah - Pekerjaan', key: 'father_job' },
        { label: 'Ayah - Domisili', key: 'father_domicile' },
        { label: 'Ayah - Penghasilan', key: 'father_income' },
        { label: 'Ayah - No Telp', key: 'father_phone' },
        { label: 'Ayah - Alamat', key: 'father_address' },
        { label: 'Ayah - Status Tempat Tinggal', key: 'father_residence_status' },
        
        { label: 'Ibu - Nama', key: 'mother_full_name' },
        { label: 'Ibu - NIK', key: 'mother_nik' },
        { label: 'Ibu - Tempat Lahir', key: 'mother_birth_place' },
        { label: 'Ibu - Tanggal Lahir', key: 'mother_birth_date' },
        { label: 'Ibu - Status', key: 'mother_life_status' },
        { label: 'Ibu - Pendidikan', key: 'mother_last_education' },
        { label: 'Ibu - Pekerjaan', key: 'mother_job' },
        { label: 'Ibu - Domisili', key: 'mother_domicile' },
        { label: 'Ibu - Penghasilan', key: 'mother_income' },
        { label: 'Ibu - No Telp', key: 'mother_phone' },
        { label: 'Ibu - Alamat', key: 'mother_address' },
        { label: 'Ibu - Status Tempat Tinggal', key: 'mother_residence_status' },
        
        { label: 'Wali - Nama', key: 'wali_full_name' },
        { label: 'Wali - NIK', key: 'wali_nik' },
        { label: 'Wali - Tempat Lahir', key: 'wali_birth_place' },
        { label: 'Wali - Tanggal Lahir', key: 'wali_birth_date' },
        { label: 'Wali - Status', key: 'wali_life_status' },
        { label: 'Wali - Pendidikan', key: 'wali_last_education' },
        { label: 'Wali - Pekerjaan', key: 'wali_job' },
        { label: 'Wali - Domisili', key: 'wali_domicile' },
        { label: 'Wali - Penghasilan', key: 'wali_income' },
        { label: 'Wali - No Telp', key: 'wali_phone' },
        { label: 'Wali - Alamat', key: 'wali_address' },
        { label: 'Wali - Status Tempat Tinggal', key: 'wali_residence_status' },
        
        { label: 'Waktu Terekam', key: 'timestamp' }
    ];
}

function exportExcelHTML(filename) {
    const columns = getExportColumns();
    let table = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    table += '<head><meta charset="utf-8"/><style>table{border-collapse:collapse;} th,td{border:1px solid #ccc;padding:5px;} th{background:#4f46e5;color:#fff;}</style></head><body>';
    table += '<table><thead><tr>';
    
    columns.forEach(col => {
        table += `<th>${col.label}</th>`;
    });
    table += '</tr></thead><tbody>';

    recordedStudents.forEach((s, idx) => {
        table += '<tr>';
        columns.forEach(col => {
            let val = col.key === 'no' ? (idx + 1) : (s[col.key] !== undefined ? s[col.key] : '-');
            // Format NIK/KK as text to prevent Excel scientific notation
            if (['nik', 'nisn', 'local_nis', 'kk_num', 'father_nik', 'mother_nik', 'wali_nik', 'postal_code'].includes(col.key)) {
                table += `<td style="mso-number-format:'\\@';">${escapeHtml(val)}</td>`;
            } else {
                table += `<td>${escapeHtml(val)}</td>`;
            }
        });
        table += '</tr>';
    });

    table += '</tbody></table></body></html>';

    downloadBlob(table, filename, 'application/vnd.ms-excel;charset=utf-8');
    addLog('success', `Ekspor Excel (${recordedStudents.length} siswa) berhasil.`);
}

function exportCSV(filename) {
    const columns = getExportColumns();
    const headers = columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(';');
    const rows = recordedStudents.map((s, idx) => {
        return columns.map(col => {
            let val = col.key === 'no' ? (idx + 1) : (s[col.key] !== undefined ? s[col.key] : '-');
            return `"${String(val).replace(/"/g, '""')}"`;
        }).join(';');
    });

    // Add UTF-8 BOM so Excel opens indonesian special chars correctly
    const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
    downloadBlob(csvContent, filename, 'text/csv;charset=utf-8');
    addLog('success', `Ekspor CSV (${recordedStudents.length} siswa) berhasil.`);
}

function exportJSON(filename) {
    const jsonStr = JSON.stringify(recordedStudents, null, 2);
    downloadBlob(jsonStr, filename, 'application/json;charset=utf-8');
    addLog('success', `Ekspor JSON (${recordedStudents.length} siswa) berhasil.`);
}

function downloadBlob(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}
