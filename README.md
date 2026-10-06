# 📋 Daftar Hadir Digital

Formulir daftar hadir berbasis web dengan fitur tanda tangan digital.
Dibangun dengan HTML, CSS, dan JavaScript murni — tanpa framework, tanpa server.

**Demo:** `https://<username>.github.io/<repo-name>/`
**Admin:** `https://<username>.github.io/<repo-name>/admin.html`

---

## ✨ Fitur

- Tanda tangan digital (canvas) — mendukung sentuh (HP) & mouse (PC)
- Mode tamu: langsung tampil kegiatan aktif terbaru
- Mode admin: kelola kegiatan, lihat statistik, export CSV
- Responsif: mobile, tablet, desktop
- Dark mode otomatis
- Backup & restore data (JSON)
- Export daftar hadir ke CSV
- Tidak butuh server — data tersimpan di localStorage browser

---

## 🚀 Deploy ke GitHub Pages

### 1. Fork / Upload repositori ini

```bash
git clone https://github.com/<username>/<repo>.git
cd <repo>
# salin semua file ke sini, lalu:
git add .
git commit -m "Initial commit"
git push
```

### 2. Aktifkan GitHub Pages

1. Buka repositori di GitHub
2. **Settings** → **Pages**
3. Source: **Deploy from a branch**
4. Branch: `main` / `master` → folder: `/ (root)`
5. Klik **Save**
6. Tunggu ~1 menit → URL akan muncul

### 3. Buka aplikasi

| URL | Halaman |
|-----|---------|
| `https://<user>.github.io/<repo>/` | Halaman tamu |
| `https://<user>.github.io/<repo>/admin.html` | Panel admin |

---

## 🔑 Login Admin

Password default: **`admin123`**

Ganti melalui: **Panel Admin → Pengaturan → Password Admin Baru**

---

## 🗂️ Struktur File

```
├── index.html          ← Halaman tamu (formulir daftar hadir)
├── admin.html          ← Panel admin
├── css/
│   └── style.css       ← Stylesheet responsif
├── js/
│   ├── db.js           ← Database (localStorage)
│   ├── canvas.js       ← Modul tanda tangan digital
│   ├── app.js          ← Logika halaman tamu
│   └── admin.js        ← Logika panel admin
├── .nojekyll           ← Menonaktifkan prosesor Jekyll GitHub
└── README.md
```

---

## 💾 Tentang Penyimpanan Data

Data disimpan di **localStorage** browser pengguna. Artinya:

- Data **persisten** selama browser tidak dibersihkan
- Data **tidak tersinkron** antar perangkat/browser yang berbeda
- Lakukan **backup rutin** dari Panel Admin → Pengaturan → Unduh Backup

### Cocok untuk:

- Satu perangkat/komputer yang selalu digunakan untuk absensi
- Kioskmode (1 tablet/PC khusus di pintu masuk)
- Penggunaan offline

---

## 📤 Export Data

Dari **Panel Admin → Detail Kegiatan** → klik **Unduh CSV**

Format kolom: No, Nama, Jabatan, Waktu Absen, Kegiatan, Tanggal Kegiatan

---

## 🛠️ Kustomisasi

| Kebutuhan | Cara |
|-----------|------|
| Ganti nama instansi | Admin → Pengaturan |
| Ganti warna tema | Admin → Pengaturan → Warna Tema |
| Tambah pilihan jabatan | Edit `<select id="input-jabatan">` di `index.html` |
| Logo | Ganti SVG di `<div class="header-logo-wrap">` di `index.html` |

---

## 📄 Lisensi

MIT — bebas digunakan dan dimodifikasi.
