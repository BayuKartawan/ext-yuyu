# EMIS GTK - Ambil Kurikulum (Browser Extension)

Ekstensi browser untuk mengambil seluruh data **Mata Pelajaran / Kurikulum** dari halaman EMIS GTK secara otomatis, termasuk navigasi semua halaman pagination, dan ekspor ke **CSV** atau **JSON**.

---

## Fitur

- ✅ Deteksi otomatis halaman Mata Pelajaran EMIS GTK
- ✅ Preview data tabel halaman saat ini
- ✅ Ambil semua halaman sekaligus (auto-pagination)
- ✅ Progress bar real-time saat pengambilan data
- ✅ Export ke **CSV** (kompatibel Excel, dengan BOM UTF-8)
- ✅ Export ke **JSON**
- ✅ Salin data ke clipboard sebagai CSV

---

## Cara Install (Chrome / Edge)

1. Buka browser, pergi ke `chrome://extensions` (atau `edge://extensions`)
2. Aktifkan **Developer Mode** (pojok kanan atas)
3. Klik **Load unpacked**
4. Pilih folder ekstensi ini: `emisgtk - ambil kurikulum`
5. Ekstensi siap digunakan ✅

---

## Cara Pakai

1. Login ke EMIS GTK: `https://emisgtk.kemenag.go.id`
2. Navigasi ke menu **Madrasah → Mata Pelajaran**
3. Klik ikon ekstensi di toolbar browser
4. Popup akan menampilkan info jumlah data & preview
5. Klik **"Ambil Semua Data"** untuk mengambil semua halaman
6. Setelah selesai, klik **Unduh CSV** atau **Unduh JSON**

---

## Struktur File

```
emisgtk - ambil kurikulum/
├── manifest.json       # Konfigurasi ekstensi (Manifest V3)
├── content.js          # Script yang berjalan di halaman EMIS GTK
├── popup.html          # UI popup ekstensi
├── popup.css           # Styling popup
├── popup.js            # Logic popup (komunikasi, export)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## Kolom Data yang Diambil

| Kolom | Contoh |
|-------|--------|
| No | 1 |
| Kurikulum | Kurikulum Merdeka |
| Tingkat | Kelas 1 |
| Kode | 1001 |
| Peminatan | Umum |
| Nama Pelajaran | Pendidikan Agama dan Budi Pekerti |
| Singkatan | - |
| Maksimal Jam | 6 jam/minggu |

---

## Catatan Teknis

- Ekstensi menggunakan `credentials: 'include'` saat `fetch` sehingga memakai sesi login yang sama
- Setiap request antar halaman diberi jeda **300ms** agar tidak membebani server
- Data diambil dengan `per_page=100` untuk meminimalkan jumlah request
- Kompatibel dengan **Chrome 88+** dan **Edge 88+** (Manifest V3)
