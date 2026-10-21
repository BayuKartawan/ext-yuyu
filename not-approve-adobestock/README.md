# Adobe Stock Rejected Assets Filename Downloader (Chrome Extension)

Ekstensi browser Chrome / Edge / Brave untuk mengambil dan mengunduh daftar **nama file asli (original filename)** dari aset yang tidak diterima (*Not Accepted / Rejected*) pada portal **Adobe Stock Contributor**.

---

## 🚀 Masalah yang Diselesaikan
Pada halaman **Not Accepted** di Adobe Stock Contributor:
- Tidak ada tombol bawaan untuk mengunduh daftar nama file aset yang ditolak.
- Informasi `Original name` dan `File ID` baru muncul di sidebar sebelah kanan hanya jika item aset tersebut diklik satu per satu.
- Jika memiliki puluhan atau ratusan file yang ditolak, mengklik satu per satu secara manual sangat memakan waktu.

**Solusi Ekstensi Ini:**
1. **Otomatisasi Klik & Ekstraksi**: Mengeklik setiap kartu aset secara berurutan, membaca nama file dari sidebar dalam hitungan milidetik, dan mengumpulkannya.
2. **Auto Pagination**: Otomatis berpindah ke halaman berikutnya (*Next page*) hingga semua file terkumpul.
3. **Format Unduhan Sesuai Kebutuhan**:
   - 📄 **TXT (Hanya Nama File)**: 1 baris untuk 1 nama file (misal: `christmas-holiday-border-frame-animation-copy-space-20261017-124433.mp4`), sangat praktis untuk script pencarian/penghapusan lokal.
   - 📋 **Salin ke Clipboard**: Sekali klik untuk langsung paste ke Notepad / Excel.
   - 📊 **CSV Lengkap**: Kolom `No`, `File ID`, `Original Name`, `Rejection Reason`.
4. **Floating Widget di Halaman**: Bar kontrol elegan langsung muncul di pojok kanan bawah halaman Adobe Stock Contributor, lengkap dengan status progress dan tombol kontrol (Mulai, Jeda, Stop).

---

## 📦 Cara Memasang (Install) di Browser

Ekstensi ini berbasis **Manifest V3** dan dapat langsung dipasang tanpa perlu build/compile:

1. Buka browser **Google Chrome**, **Microsoft Edge**, atau **Brave**.
2. Buka halaman ekstensi:
   - Di Chrome: ketik `chrome://extensions` di address bar lalu tekan Enter.
   - Di Edge: ketik `edge://extensions` di address bar lalu tekan Enter.
3. Aktifkan **Developer mode** (Mode Pengembang) di pojok kanan atas halaman.
4. Klik tombol **Load unpacked** (Muat yang belum dibongkar) di pojok kiri atas.
5. Pilih folder ini:
   ```
   D:\0 BAYU DEV\extensi\not-approve-adobestock
   ```
6. Ekstensi **Adobe Stock Rejected Filename Downloader** akan langsung aktif! Pin ekstensi ke toolbar browser untuk kemudahan akses.

---

## 🎯 Cara Menggunakan

1. Buka halaman aset ditolak di Adobe Stock Contributor:
   ```
   https://contributor.stock.adobe.com/en/uploads/rejected
   ```
   *(Atau tab **Not accepted** di menu Uploads).*
2. Di pojok kanan bawah layar, Anda akan melihat widget mengambang **Adobe Stock Rejected Files**.
3. Klik tombol **▶ Mulai Ambil**:
   - Ekstensi akan mulai mengeklik aset satu per satu secara otomatis.
   - Sidebar akan terbuka dan nama file asli (`Original name`) akan otomatis dibaca dan disimpan.
   - Anda dapat melihat progress bar dan jumlah file yang sudah terkumpul secara *real-time*.
4. Jika opsi **Auto Lanjut ke Halaman Berikutnya** dicentang, ekstensi akan otomatis mengeklik tombol **Next** setelah halaman selesai dan melanjutkan ke halaman berikutnya.
5. Setelah selesai (atau kapan pun Anda mau):
   - Klik **Unduh TXT (Hanya Nama File)** untuk mendapatkan file `.txt` berisi daftar nama file.
   - Atau klik **Salin Nama** untuk langsung menyalin semua nama file ke clipboard.
   - Atau klik **Unduh CSV** jika Anda juga membutuhkan `File ID` dan alasan penolakan (`Rejection Reason`).

---

## ⚙️ Pengaturan & Fitur Tambahan

- **Pilihan Kecepatan Klik**:
  - `⚡ Kilat (60ms)`: Untuk koneksi sangat cepat.
  - `⚡ Normal (120ms)`: Kecepatan seimbang & optimal (disarankan).
  - `🛡️ Aman (250ms)`: Kecepatan stabil jika koneksi internet sedang lambat.
  - `🐢 Santai (450ms)`: Mode paling aman.
- **Penyimpanan Lokal (Persistence)**:
  - Data yang terkumpul disimpan di `chrome.storage.local`. Jika halaman tidak sengaja di-refresh atau berpindah tab, data yang sudah terkumpul tidak akan hilang.
- **Live Search / Preview**:
  - Klik **Lihat Daftar Nama File** pada widget untuk membuka panel pratinjau dan mencari nama file tertentu.
- **Minimize Widget**:
  - Klik tombol minus (`-`) pada widget untuk mengecilkannya menjadi pill kecil agar tidak menutupi tampilan kerja Anda.

---

## 📁 Struktur File Ekstensi

```
not-approve-adobestock/
├── manifest.json         # Konfigurasi Chrome Extension Manifest V3
├── background.js         # Service worker untuk badge counter & routing
├── icons/                # Ikon ekstensi (16x16, 32x32, 48x48, 128x128)
├── content/
│   ├── pageWorld.js      # Interceptor API/Network di execution context halaman
│   ├── content.js        # Mesin otomatisasi klik & ekstraktor sidebar
│   └── content.css       # Desain antarmuka widget mengambang
├── popup/
│   ├── popup.html        # Tampilan popup ekstensi
│   ├── popup.css         # Styling popup tema gelap modern
│   └── popup.js          # Controller interaksi popup
└── README.md             # Panduan lengkap
```
