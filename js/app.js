/**
 * app.js — Logika halaman tamu (index.html)
 * Bergantung pada: api.js, db.js, canvas.js
 * Semua operasi DB kini async (await).
 */

'use strict';

let currentKegiatan = null;

/* ── INIT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('year').textContent = Fmt.tahun();

  SignaturePad.init('sig-canvas', 'sig-wrap', 'sig-hint');
  document.getElementById('btn-clear-sig').addEventListener('click', () => SignaturePad.clear());
  document.getElementById('hadir-form').addEventListener('submit', onSubmit);
  document.getElementById('btn-hadir-lagi').addEventListener('click', resetForm);

  await loadPage();
});

/* ── LOAD PAGE ───────────────────────────────────────────── */
async function loadPage() {
  showLoading(true);
  try {
    DB.seedIfEmpty();

    const setting = await DB.getSetting();
    applyTheme(setting);
    applyLogo(setting);
    document.getElementById('header-title').textContent =
      setting.nama_sekolah || 'Daftar Hadir Digital';
    document.title = (setting.nama_sekolah || 'Daftar Hadir') + ' — Daftar Hadir';

    // Isi dropdown jabatan dari setting (dinamis)
    populateJabatan(setting);

    // Tampilkan badge mode
    renderModeBadge();

    currentKegiatan = await DB.getKegiatanAktif();
    renderKegiatan(currentKegiatan);

    if (currentKegiatan) {
      const hadir = await DB.getHadirByKegiatan(currentKegiatan.id);
      renderDaftarHadir(hadir);
      checkSudahAbsen();
    }
  } catch (e) {
    showToast('Gagal memuat data: ' + e.message, 'error');
    console.error(e);
  } finally {
    showLoading(false);
  }
}

/* ── POPULATE JABATAN DROPDOWN ───────────────────────────── */

// Fallback hardcode — dipakai jika setting.jabatan_list kosong / belum ada
const DEFAULT_JABATAN_LIST = [
  'Mabi Sako', 'Ketua Sako', 'Sekretaris Sako', 'Wakil Sekretaris',
  'Wakabidang', 'Anggota', 'Dewan Kerja'
];

/**
 * Isi <select id="input-jabatan"> dari setting.jabatan_list.
 * Format jabatan_list bisa berupa:
 *   - String newline-separated  : "Guru\nOperator\nKaryawan"
 *   - JSON array string         : '["Guru","Operator","Karyawan"]'
 *   - Array langsung            : ['Guru','Operator']
 * Jika kosong → pakai DEFAULT_JABATAN_LIST.
 * Jabatan berawalan "Wakabid" + "Pengawas/Ketua" → optgroup "Pimpinan".
 * Sisanya → optgroup "Anggota Pengurus".
 * Jika semua masuk satu bucket → tampilkan tanpa optgroup.
 */
function populateJabatan(setting) {
  const sel = document.getElementById('input-jabatan');
  if (!sel) return;

  // ── Parse jabatan_list dari berbagai format ──────────────
  let list = [];
  const raw = setting?.jabatan_list;

  if (Array.isArray(raw)) {
    list = raw.map(s => String(s).trim()).filter(Boolean);
  } else if (typeof raw === 'string' && raw.trim()) {
    const trimmed = raw.trim();
    // Coba parse sebagai JSON array
    if (trimmed.startsWith('[')) {
      try { list = JSON.parse(trimmed).map(s => String(s).trim()).filter(Boolean); } catch {}
    }
    // Newline-separated (termasuk \r\n dari Windows)
    if (!list.length) {
      list = trimmed.split(/\r?\n/).map(s => s.trim()).filter(s => s && !/^[-=]{3,}$/.test(s));
    }
  }

  // Fallback ke default jika masih kosong
  if (!list.length) list = [...DEFAULT_JABATAN_LIST];

  // ── Rebuild dropdown ─────────────────────────────────────
  sel.innerHTML = '<option value="">-- Pilih Jabatan --</option>';

  const grpPimpinan = [];
  const grpLainnya  = [];

  list.forEach(j => {
    if (j.startsWith('Wakabid') ||
        j === 'Pengawas Madrasah' ||
        j === 'Kepala Madrasah' ||
        j === 'Ketua' ||
        j === 'Mabi Sako' ||
        j === 'Ketua Sako' ||
        j === 'Sekretaris Sako' ||
        j === 'Wakil Sekretaris' ||
        j.startsWith('Wakabidang')) {
      grpPimpinan.push(j);
    } else {
      grpLainnya.push(j);
    }
  });

  if (grpPimpinan.length && grpLainnya.length) {
    // Ada 2 kelompok → pakai optgroup
    const g1 = document.createElement('optgroup');
    g1.label = 'Pimpinan';
    grpPimpinan.forEach(j => { const o = new Option(j, j); g1.appendChild(o); });
    sel.appendChild(g1);

    const g2 = document.createElement('optgroup');
    g2.label = 'Anggota Pengurus';
    grpLainnya.forEach(j => { const o = new Option(j, j); g2.appendChild(o); });
    sel.appendChild(g2);
  } else {
    // Satu kelompok saja → tanpa optgroup
    list.forEach(j => sel.appendChild(new Option(j, j)));
  }
}

/* ── MODE BADGE ──────────────────────────────────────────── */
function renderModeBadge() {
  const existing = document.getElementById('mode-badge');
  if (existing) existing.remove();

  const badge = document.createElement('div');
  badge.id    = 'mode-badge';

  if (DB.isGasMode()) {
    badge.style.cssText =
      'position:fixed;bottom:60px;right:14px;z-index:300;' +
      'background:#34a853;color:#fff;font-size:11px;font-weight:700;' +
      'padding:4px 10px;border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,.2);' +
      'display:flex;align-items:center;gap:5px;';
    badge.innerHTML =
      '<svg width="10" height="10" viewBox="0 0 24 24" fill="white">' +
      '<path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5C3.89 3 3 3.9 3 5L2.99 19A2 2 0 0 0 5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V1h-2z"/>' +
      '</svg> Terhubung ke Spreadsheet';
  } else {
    badge.style.cssText =
      'position:fixed;bottom:60px;right:14px;z-index:300;' +
      'background:#f29900;color:#111;font-size:11px;font-weight:700;' +
      'padding:4px 10px;border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,.2);' +
      'display:flex;align-items:center;gap:5px;';
    badge.innerHTML =
      '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">' +
      '<path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-7 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 14a7 7 0 0 1-7-7h14a7 7 0 0 1-7 7z"/>' +
      '</svg> Mode Lokal';
  }
  document.body.appendChild(badge);
}

/* ── THEME ───────────────────────────────────────────────── */
function applyTheme(setting) {
  if (setting?.warna_primer) {
    document.documentElement.style.setProperty('--clr-primary', setting.warna_primer);
    document.documentElement.style.setProperty(
      '--clr-primary-dk', darken(setting.warna_primer, 30)
    );
  }
}

/* ── LOGO ────────────────────────────────────────────────── */
function applyLogo(setting) {
  const LOGO_DEFAULT = 'https://i.ibb.co.com/8Dp1r5wm/sako-Maarif-NU-logo.png';
  const url = (setting?.logo_url || '').trim() || LOGO_DEFAULT;
  const img = document.getElementById('header-logo-img');
  const svg = document.getElementById('header-logo-fallback');
  if (!img) return;
  img.src = url;
  img.style.display = '';
  if (svg) svg.style.display = 'none';
}

function darken(hex, amt) {
  if (!hex || !hex.startsWith('#')) return hex;
  const num = parseInt(hex.slice(1), 16);
  const r   = Math.max(0, (num >> 16) - amt);
  const g   = Math.max(0, ((num >> 8) & 0xff) - amt);
  const b   = Math.max(0, (num & 0xff) - amt);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/* ── RENDER KEGIATAN ─────────────────────────────────────── */
function renderKegiatan(kg) {
  const infoEl = document.getElementById('kg-info');
  const formEl = document.getElementById('form-card');
  const listEl = document.getElementById('list-card');

  if (!kg) {
    infoEl.innerHTML =
      '<div class="no-data">📋 Belum ada kegiatan aktif.<br>' +
      'Hubungi admin untuk membuat kegiatan.</div>';
    formEl.style.display = 'none';
    listEl.style.display = 'none';
    return;
  }

  infoEl.innerHTML = `
    <div class="kg-badge${kg.status !== 'Aktif' ? ' inactive' : ''}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10"/>
      </svg>
      ${esc(kg.status)}
    </div>
    <div class="kg-title">${esc(kg.judul)}</div>
    <div class="kg-meta">
      <div class="kg-meta-row"><span class="lbl">📅 Tanggal</span><span>${esc(Fmt.tanggalHari(kg.tanggal))}</span></div>
      <div class="kg-meta-row"><span class="lbl">🕐 Waktu</span><span>${kg.waktu ? esc(Fmt.waktu(kg.waktu)) : '-'}</span></div>
      ${kg.lokasi     ? `<div class="kg-meta-row"><span class="lbl">📍 Lokasi</span><span>${esc(kg.lokasi)}</span></div>` : ''}
      ${kg.keterangan ? `<div class="kg-meta-row"><span class="lbl">📝 Ket.</span><span>${esc(kg.keterangan)}</span></div>` : ''}
    </div>`;

  // Blokir form jika status Nonaktif
  const isAktif  = kg.status === 'Aktif';
  const banner   = document.getElementById('form-nonaktif-banner');
  const formEl2  = document.getElementById('hadir-form');
  const btnSubmit = document.getElementById('btn-submit');

  formEl.style.display = 'block';
  listEl.style.display = 'block';

  if (banner) banner.style.display = isAktif ? 'none' : 'flex';
  if (formEl2) {
    // Nonaktifkan semua input dan tombol submit jika bukan Aktif
    Array.from(formEl2.elements).forEach(el => { el.disabled = !isAktif; });
  }
  if (btnSubmit) btnSubmit.disabled = !isAktif;
}

/* ── RENDER DAFTAR HADIR ─────────────────────────────────── */
function renderDaftarHadir(list) {
  const el    = document.getElementById('hadir-list');
  const count = document.getElementById('hadir-count');
  count.textContent = list.length;

  if (!list.length) {
    el.innerHTML = '<div class="no-data">Belum ada yang hadir saat ini.</div>';
    return;
  }

  el.innerHTML = list.map(h => {
    const initial = (h.nama || '?').charAt(0).toUpperCase();
    const jam     = Fmt.waktu(h.waktuAbsen || '');
    return `
      <div class="hadir-item">
        <div class="avatar">${initial}</div>
        <div class="hadir-info">
          <div class="hadir-nama">${esc(h.nama)}</div>
          <div class="hadir-jabatan">${esc(h.jabatan)}</div>
        </div>
        <div class="hadir-ttd">
          ${h.ttd ? `<img src="${h.ttd}" alt="ttd ${esc(h.nama)}">` : ''}
        </div>
        <div class="hadir-time">${jam}</div>
      </div>`;
  }).join('');
}

/* ── SUBMIT ──────────────────────────────────────────────── */
async function onSubmit(e) {
  e.preventDefault();

  const nama       = document.getElementById('input-nama').value.trim();
  const jabatan    = document.getElementById('input-jabatan').value;
  const keterangan = document.getElementById('input-keterangan').value.trim();
  const ttd        = SignaturePad.getDataURL();

  if (!ttd) { SignaturePad.setError(); return; }
  if (!currentKegiatan) {
    showToast('Tidak ada kegiatan aktif.', 'error');
    return;
  }
  if (currentKegiatan.status !== 'Aktif') {
    showToast('Kegiatan sudah Nonaktif — pengisian ditutup.', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit');
  setButtonLoading(btn, true, 'Menyimpan…');

  try {
    const result = await DB.simpanHadir({
      idKegiatan: currentKegiatan.id,
      nama, jabatan, keterangan, ttd
    });

    if (!result.ok) {
      // Penolakan khusus: sudah absen
      if (result.sudahAbsen) {
        showAlreadyAbsen(result.msg);
        return;
      }
      showToast(result.msg, 'error');
      return;
    }

    // Tampil sukses
    document.getElementById('success-nama').textContent      = nama;
    document.getElementById('success-kegiatan').textContent  = currentKegiatan.judul;
    document.getElementById('success-jabatan').textContent   = jabatan;
    document.getElementById('success-mode').textContent      =
      DB.isGasMode() ? '✓ Tersimpan di Google Spreadsheet' : '✓ Tersimpan di perangkat ini';

    document.getElementById('form-card').style.display    = 'none';
    document.getElementById('success-card').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('✓ Daftar hadir berhasil disimpan!', 'success');

    // Refresh daftar
    const hadir = await DB.getHadirByKegiatan(currentKegiatan.id);
    renderDaftarHadir(hadir);
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    setButtonLoading(btn, false,
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="white">' +
      '<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>' +
      '</svg> Kirim Daftar Hadir'
    );
  }
}

/* ── RESET ───────────────────────────────────────────────── */
function resetForm() {
  document.getElementById('hadir-form').reset();
  SignaturePad.clear();
  document.getElementById('success-card').style.display     = 'none';
  document.getElementById('already-absen-card').style.display = 'none';
  document.getElementById('form-card').style.display        = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── SUDAH ABSEN ─────────────────────────────────────────── */
function showAlreadyAbsen(msg) {
  // Sembunyikan form, tampilkan kartu penolakan
  document.getElementById('form-card').style.display        = 'none';
  document.getElementById('success-card').style.display     = 'none';
  document.getElementById('already-absen-card').style.display = 'block';
  document.getElementById('already-absen-msg').textContent  = msg;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── CEK APAKAH SUDAH ABSEN (saat halaman dimuat) ────────── */
function checkSudahAbsen() {
  if (!currentKegiatan) return;
  const key = 'dh_sudah_absen_' + currentKegiatan.id;
  const namaTersimpan = localStorage.getItem(key);
  if (namaTersimpan) {
    showAlreadyAbsen(
      'Anda sudah mengisi daftar hadir untuk kegiatan ini ' +
      '(tercatat atas nama: ' + namaTersimpan + '). ' +
      'Setiap peserta hanya dapat absen satu kali.'
    );
  }
}

/* ── UTILS ───────────────────────────────────────────────── */
function showLoading(show) {
  const el = document.getElementById('loading-overlay');
  el.classList.toggle('hidden', !show);
}

function showToast(msg, type = '') {
  const wrap = document.getElementById('toast-container');
  const div  = document.createElement('div');
  div.className   = 'toast ' + type;
  div.textContent = msg;
  wrap.appendChild(div);
  setTimeout(() => div.remove(), 3300);
}

function setButtonLoading(btn, loading, html) {
  btn.disabled  = loading;
  btn.innerHTML = loading
    ? '<span class="spinner" style="width:18px;height:18px;border-width:3px;"></span> ' + html
    : html;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
