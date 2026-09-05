/**
 * admin.js — Logika panel admin (admin.html)
 * Bergantung pada: api.js, db.js
 * Semua operasi DB kini async (await).
 */

'use strict';

/* ── STATE ───────────────────────────────────────────────── */
const AdminState = {
  loggedIn:    false,
  password:    '',        // disimpan di memory selama sesi
  confirmCb:   null,
  allKegiatan: []
};

/* ── INIT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('year').textContent = Fmt.tahun();

  initTabs();
  setDefaultDate();
  bindStaticEvents();

  showLoading(true);

  // Isi URL GAS yang tersimpan
  const savedUrl = GasAPI.getUrl();
  if (savedUrl) {
    document.getElementById('input-gas-url').value = savedUrl;
    updateUrlStatus(savedUrl);
  }

  // Cek session
  const sessPass = sessionStorage.getItem('dh_admin_pass');
  if (sessPass) {
    // Verifikasi ulang password ke sumber yang aktif
    try {
      const ok = await DB.login(sessPass);
      if (ok) {
        AdminState.password  = sessPass;
        AdminState.loggedIn  = true;
        await unlockAdmin();
        showLoading(false);
        return;
      }
    } catch {}
    sessionStorage.removeItem('dh_admin_pass');
  }

  showLoading(false);
  openModal('modal-login');
});

/* ── STATIC EVENTS ───────────────────────────────────────── */
function bindStaticEvents() {
  // Login
  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('input-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', doLogout);

  // GAS URL
  document.getElementById('btn-save-url').addEventListener('click', saveGasUrl);
  document.getElementById('btn-test-url').addEventListener('click', testGasUrl);
  document.getElementById('input-gas-url').addEventListener('input', function () {
    updateUrlStatus(this.value.trim());
  });

  // Refresh kegiatan
  document.getElementById('btn-refresh').addEventListener('click', loadKegiatan);

  // Tambah kegiatan
  document.getElementById('form-tambah').addEventListener('submit', onTambahKegiatan);

  // Setting
  document.getElementById('form-setting').addEventListener('submit', onSaveSetting);

  // Color picker sync
  document.getElementById('setting-warna').addEventListener('input', function () {
    document.getElementById('setting-warna-hex').value = this.value;
  });
  document.getElementById('setting-warna-hex').addEventListener('input', function () {
    if (/^#[0-9a-fA-F]{6}$/.test(this.value)) {
      document.getElementById('setting-warna').value = this.value;
    }
  });

  // Setup GAS spreadsheet
  document.getElementById('btn-setup-gas').addEventListener('click', doSetupGas);

  // Backup / restore
  document.getElementById('btn-backup').addEventListener('click', () => DB.exportBackup());
  document.getElementById('btn-restore').addEventListener('click', () => {
    document.getElementById('input-restore').click();
  });
  document.getElementById('input-restore').addEventListener('change', onRestore);

  // Confirm modal
  document.getElementById('btn-confirm-ok').addEventListener('click', () => {
    closeModal('modal-confirm');
    if (AdminState.confirmCb) { AdminState.confirmCb(); AdminState.confirmCb = null; }
  });
  document.getElementById('btn-confirm-cancel').addEventListener('click', () => {
    closeModal('modal-confirm');
    AdminState.confirmCb = null;
  });

  // Detail modal
  document.getElementById('btn-close-detail').addEventListener('click', () =>
    closeModal('modal-detail'));
  document.getElementById('modal-detail').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('modal-detail');
  });

  // Edit modal
  document.getElementById('btn-close-edit').addEventListener('click', () =>
    closeModal('modal-edit'));
  document.getElementById('btn-batal-edit').addEventListener('click', () =>
    closeModal('modal-edit'));
  document.getElementById('modal-edit').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('modal-edit');
  });
  document.getElementById('form-edit').addEventListener('submit', onSimpanEdit);

  // Logo URL preview
  document.getElementById('setting-logo').addEventListener('input', function () {
    const prev = document.getElementById('setting-logo-preview');
    if (prev) prev.src = this.value.trim() || 'https://i.ibb.co.com/B2KQmpM1/logoMI-R.png';
  });
}

/* ── GAS URL ─────────────────────────────────────────────── */
function saveGasUrl() {
  const url = document.getElementById('input-gas-url').value.trim();
  if (!url) {
    GasAPI.setUrl('');
    updateUrlStatus('');
    showToast('URL API dikosongkan. Mode lokal aktif.', 'warn');
    renderModeBadge();
    return;
  }
  if (!url.startsWith('https://script.google.com/macros/')) {
    showToast('URL GAS tidak valid. Harus diawali https://script.google.com/macros/', 'error');
    return;
  }
  GasAPI.setUrl(url);
  updateUrlStatus(url);
  renderModeBadge();
  showToast('✓ URL API disimpan. Mode: Google Spreadsheet.', 'success');
}

async function testGasUrl() {
  const url = document.getElementById('input-gas-url').value.trim();
  if (!url) { showToast('Masukkan URL GAS terlebih dulu.', 'warn'); return; }

  const btn = document.getElementById('btn-test-url');
  btn.disabled = true;
  btn.textContent = 'Menguji…';

  // Simpan sementara untuk test
  const prevUrl = GasAPI.getUrl();
  GasAPI.setUrl(url);

  try {
    const res = await GasAPI.ping();
    if (res.ok) {
      showToast('✓ Koneksi ke GAS berhasil! Server: ' + (res.message || 'OK'), 'success');
      updateUrlStatus(url, true);
    } else {
      throw new Error('Response tidak OK');
    }
  } catch (e) {
    showToast('✗ Koneksi gagal: ' + e.message, 'error');
    updateUrlStatus(url, false, true);
    GasAPI.setUrl(prevUrl); // rollback
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Koneksi';
  }
}

function updateUrlStatus(url, success, failed) {
  const el  = document.getElementById('url-status');
  const bar = document.getElementById('koneksi-status-bar');
  const dot = document.getElementById('koneksi-dot');

  // Reset kelas bar
  if (bar) bar.className = '';

  if (!url) {
    if (el) { el.textContent = 'Mode lokal — data tersimpan di browser ini.'; el.style.color = 'var(--clr-warn)'; }
    if (bar) bar.classList.add('local');
    if (dot) dot.style.background = '#f29900';
    _setStatusText('Mode Lokal', 'Data tersimpan di browser ini.');
    return;
  }
  if (failed) {
    if (el) { el.textContent = '✗ Tidak dapat terhubung ke GAS. Periksa URL dan deployment.'; el.style.color = 'var(--clr-danger)'; }
    if (bar) bar.classList.add('disconnected');
    if (dot) dot.style.background = 'var(--clr-danger)';
    _setStatusText('Koneksi Gagal', 'Tidak dapat terhubung ke Google Apps Script.');
    return;
  }
  if (success) {
    if (el) { el.textContent = '✓ Terhubung ke Google Apps Script.'; el.style.color = 'var(--clr-green)'; }
    if (bar) bar.classList.add('connected');
    if (dot) dot.style.background = 'var(--clr-green)';
    _setStatusText('Terhubung ✓', 'Data disimpan ke Google Spreadsheet.');
    return;
  }
  if (url.startsWith('https://script.google.com/macros/')) {
    if (el) { el.textContent = 'URL valid. Klik "Test Koneksi" untuk memverifikasi.'; el.style.color = 'var(--clr-muted)'; }
    if (bar) bar.classList.add('local');
    if (dot) dot.style.background = '#f29900';
    _setStatusText('Belum Diverifikasi', 'URL tersimpan, test koneksi untuk konfirmasi.');
  } else {
    if (el) { el.textContent = 'URL tidak valid.'; el.style.color = 'var(--clr-danger)'; }
    if (bar) bar.classList.add('disconnected');
    if (dot) dot.style.background = 'var(--clr-danger)';
    _setStatusText('URL Tidak Valid', 'Harus diawali https://script.google.com/macros/');
  }
}

function _setStatusText(label, detail) {
  const txt = document.getElementById('koneksi-status-text');
  if (txt) txt.textContent = label + ' — ' + detail;
}

/* ── THEME ADMIN ─────────────────────────────────────────── */
function applyThemeAdmin(setting) {
  if (!setting?.warna_primer) return;
  document.documentElement.style.setProperty('--clr-primary', setting.warna_primer);
  const dk = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    return '#' + [Math.max(0,(n>>16)-amt), Math.max(0,((n>>8)&0xff)-amt), Math.max(0,(n&0xff)-amt)]
      .map(v => v.toString(16).padStart(2,'0')).join('');
  };
  document.documentElement.style.setProperty('--clr-primary-dk', dk(setting.warna_primer, 30));
  document.getElementById('header-title').textContent = setting.nama_sekolah || 'Panel Admin';
}

function renderModeBadge() {
  const existing = document.getElementById('mode-badge');
  if (existing) existing.remove();
  const hdr  = document.querySelector('.header-texts');
  const span = document.createElement('div');
  span.id    = 'mode-badge';
  span.style.cssText = 'font-size:10px;font-weight:700;margin-top:1px;';
  span.textContent   = DB.isGasMode() ? '● Google Spreadsheet' : '● Mode Lokal (localStorage)';
  span.style.color   = DB.isGasMode() ? '#86efac' : '#fcd34d';
  hdr.appendChild(span);
}

/* ── LOGO ────────────────────────────────────────────────── */
function applyLogo(setting) {
  const LOGO_DEFAULT = 'https://i.ibb.co.com/B2KQmpM1/logoMI-R.png';
  const url = (setting?.logo_url || '').trim() || LOGO_DEFAULT;
  const img = document.getElementById('header-logo-img');
  const svg = document.getElementById('header-logo-fallback');
  if (!img) return;
  img.src = url;
  img.style.display = '';
  if (svg) svg.style.display = 'none';
}

/* ── LOGIN ───────────────────────────────────────────────── */
async function doLogin() {
  const pass  = document.getElementById('input-password').value;
  const errEl = document.getElementById('login-error');
  if (!pass) { showToast('Masukkan password', 'warn'); return; }

  const btn = document.getElementById('btn-login');
  btn.disabled    = true;
  btn.textContent = 'Memverifikasi…';

  try {
    const ok = await DB.login(pass);
    if (ok) {
      AdminState.password = pass;
      AdminState.loggedIn = true;
      sessionStorage.setItem('dh_admin_pass', pass);
      errEl.style.display = 'none';
      closeModal('modal-login');
      await unlockAdmin();
      showToast('Selamat datang, Admin! 👋', 'success');
    } else {
      errEl.style.display = 'block';
      document.getElementById('input-password').value = '';
      document.getElementById('input-password').focus();
    }
  } catch (e) {
    showToast('Error login: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML =
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="white">' +
      '<path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z"/>' +
      '</svg> Masuk';
  }
}

function doLogout() {
  AdminState.loggedIn = false;
  AdminState.password = '';
  sessionStorage.removeItem('dh_admin_pass');
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('input-password').value = '';
  document.getElementById('login-error').style.display = 'none';
  openModal('modal-login');
  showToast('Berhasil logout.', 'success');
}

/* ── UNLOCK ADMIN ────────────────────────────────────────── */
async function unlockAdmin() {
  document.getElementById('admin-panel').style.display = 'block';
  renderModeBadge();
  const setting = await DB.getSetting();
  applyThemeAdmin(setting);
  applyLogo(setting);
  await loadKegiatan();
  await loadSettingForm();
}

/* ── TABS ────────────────────────────────────────────────── */
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      this.classList.add('active');
      document.getElementById('pane-' + this.dataset.tab).classList.add('active');
    });
  });
}

function setDefaultDate() {
  const el = document.getElementById('input-tanggal');
  if (!el) return;
  const d  = new Date();
  el.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ── KEGIATAN ────────────────────────────────────────────── */
async function loadKegiatan() {
  document.getElementById('kegiatan-list').innerHTML =
    '<div class="no-data">Memuat data…</div>';
  try {
    const list = await DB.getAllKegiatan();
    AdminState.allKegiatan = list;
    renderKegiatanList(list);
  } catch (e) {
    document.getElementById('kegiatan-list').innerHTML =
      `<div class="no-data" style="color:var(--clr-danger);">Gagal memuat: ${esc(e.message)}</div>`;
  }
}

function renderKegiatanList(list) {
  const el = document.getElementById('kegiatan-list');
  if (!list.length) {
    el.innerHTML =
      '<div class="no-data">Belum ada kegiatan.<br>' +
      'Tambahkan lewat tab "Tambah Baru".</div>';
    return;
  }

  el.innerHTML = list.map(k => {
    const badge = k.status === 'Aktif'
      ? '<span class="badge badge-aktif">Aktif</span>'
      : '<span class="badge badge-nonaktif">Nonaktif</span>';

    const toggleBtn = k.status === 'Aktif'
      ? `<button class="btn btn-warn btn-sm" onclick="doToggleStatus('${k.id}','Nonaktif')">Nonaktifkan</button>`
      : `<button class="btn btn-primary btn-sm" onclick="doToggleStatus('${k.id}','Aktif')">Aktifkan</button>`;

    return `
      <div class="kg-admin-item">
        <div class="kg-admin-left">
          <div class="kg-admin-title">${esc(k.judul)}</div>
          <div class="kg-admin-meta">
            <span>📅 ${esc(Fmt.tanggal(k.tanggal))}</span>
            <span>🕐 ${k.waktu ? esc(Fmt.waktu(k.waktu)) : '-'}</span>
            ${k.lokasi ? `<span>📍 ${esc(k.lokasi)}</span>` : ''}
          </div>
        </div>
        <div class="kg-admin-actions">
          ${badge}
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
            <button class="btn btn-outline btn-sm"
              onclick="doLihatDetail('${k.id}')">Detail</button>
            <button class="btn btn-outline btn-sm"
              style="color:var(--clr-warn);border-color:var(--clr-warn);"
              onclick="doEditKegiatan('${k.id}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0
                         0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
              Edit
            </button>
            ${toggleBtn}
            <button class="btn btn-danger btn-sm"
              onclick="doKonfirmasiHapus('${k.id}','${esc(k.judul).replace(/'/g,"\\'")}')">Hapus</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ── TAMBAH KEGIATAN ─────────────────────────────────────── */
async function onTambahKegiatan(e) {
  e.preventDefault();

  const judul   = document.getElementById('input-judul').value.trim();
  const tglRaw  = document.getElementById('input-tanggal').value;
  const waktu   = document.getElementById('input-waktu').value;
  const lokasi  = document.getElementById('input-lokasi').value.trim();
  const ket     = document.getElementById('input-ket').value.trim();

  if (!judul || !tglRaw) { showToast('Judul dan tanggal wajib diisi.', 'warn'); return; }

  const [y, m, d] = tglRaw.split('-');
  const tanggal   = `${d}/${m}/${y}`;

  const btn = document.getElementById('btn-tambah');
  setButtonLoading(btn, true, 'Menyimpan…');

  try {
    const result = await DB.tambahKegiatan(
      AdminState.password,
      { judul, tanggal, waktu, lokasi, keterangan: ket }
    );
    if (result.ok) {
      showToast('✓ Kegiatan berhasil ditambahkan!', 'success');
      e.target.reset();
      setDefaultDate();
      document.querySelector('[data-tab="kegiatan"]').click();
      await loadKegiatan();
    } else {
      showToast(result.msg || 'Gagal menyimpan.', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    setButtonLoading(btn, false,
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="white">' +
      '<path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>' +
      '</svg> Simpan Kegiatan'
    );
  }
}

/* ── TOGGLE STATUS ───────────────────────────────────────── */
async function doToggleStatus(id, status) {
  try {
    await DB.updateStatusKegiatan(AdminState.password, id, status);
    showToast('Status diperbarui: ' + status, 'success');
    await loadKegiatan();
  } catch (e) {
    showToast('Gagal update status: ' + e.message, 'error');
  }
}

/* ── EDIT KEGIATAN ───────────────────────────────────────── */
function doEditKegiatan(id) {
  const k = AdminState.allKegiatan.find(k => k.id === id);
  if (!k) { showToast('Kegiatan tidak ditemukan.', 'error'); return; }

  document.getElementById('edit-id').value    = k.id;
  document.getElementById('edit-judul').value = k.judul || '';
  document.getElementById('edit-lokasi').value = k.lokasi || '';
  document.getElementById('edit-ket').value   = k.keterangan || '';

  // Konversi tanggal DD/MM/YYYY atau DD MMMM YYYY → YYYY-MM-DD untuk input[type=date]
  const tglISO = tanggalToISO(k.tanggal);
  document.getElementById('edit-tanggal').value = tglISO;

  // Waktu: bersihkan "WIB" jika ada → format HH:mm
  const waktuBersih = (k.waktu || '').replace(/\s*WIB\s*/i, '').trim();
  document.getElementById('edit-waktu').value = waktuBersih;

  openModal('modal-edit');
}

async function onSimpanEdit(e) {
  e.preventDefault();
  const id     = document.getElementById('edit-id').value;
  const judul  = document.getElementById('edit-judul').value.trim();
  const tglRaw = document.getElementById('edit-tanggal').value;
  const waktu  = document.getElementById('edit-waktu').value;
  const lokasi = document.getElementById('edit-lokasi').value.trim();
  const ket    = document.getElementById('edit-ket').value.trim();

  if (!judul || !tglRaw) { showToast('Judul dan tanggal wajib diisi.', 'warn'); return; }

  const [y, m, d] = tglRaw.split('-');
  const tanggal   = `${d}/${m}/${y}`;

  const btn = document.getElementById('btn-simpan-edit');
  btn.disabled = true;
  btn.textContent = 'Menyimpan…';

  try {
    await DB.editKegiatan(AdminState.password, { id, judul, tanggal, waktu, lokasi, keterangan: ket });
    closeModal('modal-edit');
    showToast('✓ Kegiatan berhasil diperbarui!', 'success');
    await loadKegiatan();
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
      <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10v4z"/>
    </svg> Simpan Perubahan`;
  }
}

/** Konversi berbagai format tanggal ke YYYY-MM-DD untuk input[type=date] */
function tanggalToISO(str) {
  if (!str) return '';
  str = String(str).trim();
  // DD/MM/YYYY
  const m1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  // DD MMMM YYYY
  const BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                 'Juli','Agustus','September','Oktober','November','Desember'];
  const m2 = str.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/i);
  if (m2) {
    const mIdx = BULAN.findIndex(b => b.toLowerCase() === m2[2].toLowerCase());
    if (mIdx !== -1) {
      return `${m2[3]}-${String(mIdx+1).padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
    }
  }
  // ISO atau lainnya
  return str.slice(0, 10);
}

/* ── HAPUS KEGIATAN ──────────────────────────────────────── */
function doKonfirmasiHapus(id, judul) {
  document.getElementById('confirm-msg').textContent =
    `Hapus kegiatan "${judul}"? Data hadir terkait tidak akan terhapus.`;
  AdminState.confirmCb = async () => {
    try {
      await DB.hapusKegiatan(AdminState.password, id);
      showToast('Kegiatan dihapus.', 'success');
      await loadKegiatan();
    } catch (e) {
      showToast('Gagal hapus: ' + e.message, 'error');
    }
  };
  openModal('modal-confirm');
}

/* ── DETAIL ──────────────────────────────────────────────── */
async function doLihatDetail(id) {
  document.getElementById('detail-title').textContent = 'Memuat…';
  document.getElementById('detail-stats').innerHTML   =
    '<div class="no-data">Memuat statistik…</div>';
  document.getElementById('detail-hadir-list').innerHTML = '';
  openModal('modal-detail');

  try {
    const kg    = AdminState.allKegiatan.find(k => k.id === id);
    const hadir = await DB.getHadirByKegiatan(id);
    const stat  = await DB.getStatistik(id);

    document.getElementById('detail-title').textContent = kg?.judul || id;

    // Render statistik — dinamis dari stat._jabatanList atau kunci stat
    const jabatanListStat = stat._jabatanList || Object.keys(stat).filter(k => k !== 'total' && !k.startsWith('_'));
    // Kunci unik yang muncul di stat (exclude total & private)
    const statKeys = Object.keys(stat).filter(k => k !== 'total' && !k.startsWith('_'));

    // Warna per posisi key (siklus agar selalu ada warna)
    const STAT_COLORS = ['#4a148c','#1a237e','#01579b','#1967d2','#e65100','#2e7d32','#7b1fa2','#880e4f','#4e342e','#37474f'];

    const statCards = statKeys
      .filter(k => stat[k] > 0)
      .map((k, i) => {
        const color = STAT_COLORS[i % STAT_COLORS.length];
        return `
        <div class="stat-card">
          <div class="stat-num" style="color:${esc(color)}">${stat[k]}</div>
          <div class="stat-lbl">${esc(k)}</div>
        </div>`;
      }).join('');

    document.getElementById('detail-stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-num">${stat.total}</div>
        <div class="stat-lbl">Total</div>
      </div>
      ${statCards}`;

    // Info tanggal & waktu kegiatan di bawah statistik
    if (kg) {
      const infoEl = document.getElementById('detail-kg-info');
      if (infoEl) {
        infoEl.innerHTML =
          `<span>📅 ${esc(Fmt.tanggalHari(kg.tanggal))}</span>` +
          (kg.waktu ? `<span style="margin-left:14px;">🕐 ${esc(Fmt.waktu(kg.waktu))}</span>` : '') +
          (kg.lokasi ? `<span style="margin-left:14px;">📍 ${esc(kg.lokasi)}</span>` : '');
      }
    }

    document.getElementById('btn-export-csv').onclick = async () => {
      const ok = await DB.exportCSV(id);
      if (!ok) showToast('Belum ada data untuk diekspor.', 'warn');
      else showToast('CSV berhasil diunduh.', 'success');
    };

    // Tombol PDF
    document.getElementById('btn-export-pdf').onclick = async () => {
      if (!hadir.length) { showToast('Belum ada data hadir.', 'warn'); return; }
      const btn = document.getElementById('btn-export-pdf');
      btn.disabled = true;
      btn.textContent = 'Menyiapkan…';
      try {
        const setting = await DB.getSetting();
        await PDFExport.cetakDaftarHadir({ kegiatan: kg, hadir, setting });
        showToast('Dialog cetak/simpan PDF dibuka.', 'success');
      } catch (err) {
        showToast('Gagal membuat PDF: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">' +
          '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>' +
          '</svg> Unduh PDF';
      }
    };

    const listEl = document.getElementById('detail-hadir-list');
    if (!hadir.length) {
      listEl.innerHTML =
        '<div class="no-data">Belum ada yang hadir pada kegiatan ini.</div>';
    } else {
      listEl.innerHTML = hadir.map((h, i) => `
        <div class="hadir-item">
          <div style="font-size:12px;color:#9aa0a6;min-width:22px;text-align:right;">${i + 1}</div>
          <div class="avatar">${(h.nama || '?').charAt(0).toUpperCase()}</div>
          <div class="hadir-info">
            <div class="hadir-nama">${esc(h.nama)}</div>
            <div class="hadir-jabatan">${esc(h.jabatan)} · ${esc(Fmt.waktu(h.waktuAbsen || ''))}</div>
          </div>
          <div class="hadir-ttd">
            ${h.ttd
              ? `<img src="${h.ttd}" alt="ttd">`
              : '<span style="font-size:10px;color:#9aa0a6">-</span>'}
          </div>
          <button class="btn-icon" title="Hapus data ini"
            onclick="doHapusHadir('${h.id}','${id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--clr-danger)">
              <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </button>
        </div>`).join('');
    }
  } catch (e) {
    document.getElementById('detail-hadir-list').innerHTML =
      `<div class="no-data" style="color:var(--clr-danger)">Gagal memuat: ${esc(e.message)}</div>`;
  }
}

async function doHapusHadir(hadirId, kegiatanId) {
  try {
    await DB.hapusHadir(AdminState.password, hadirId);
    showToast('Data hadir dihapus.', 'success');
    await doLihatDetail(kegiatanId);
    await loadKegiatan();
  } catch (e) {
    showToast('Gagal hapus: ' + e.message, 'error');
  }
}

/* ── SETTING ─────────────────────────────────────────────── */
async function loadSettingForm() {
  try {
    const s = await DB.getSetting();
    const logoUrl = s.logo_url || '';
    document.getElementById('setting-logo').value     = logoUrl;
    const prev = document.getElementById('setting-logo-preview');
    if (prev) prev.src = logoUrl || 'https://i.ibb.co.com/B2KQmpM1/logoMI-R.png';
    document.getElementById('setting-nama').value     = s.nama_sekolah    || '';
    document.getElementById('setting-alamat').value   = s.alamat          || '';
    document.getElementById('setting-kota').value     = s.kota            || '';
    document.getElementById('setting-kepala').value   = s.kepala_madrasah || '';
    document.getElementById('setting-pimpinan').value = s.pimpinan_rapat  || '';
    const warna = s.warna_primer || '#1a73e8';
    document.getElementById('setting-warna').value     = warna;
    document.getElementById('setting-warna-hex').value = warna;
    // Jabatan list
    const jabEl = document.getElementById('setting-jabatan-list');
    if (jabEl) jabEl.value = s.jabatan_list || '';
  } catch {}
}

async function onSaveSetting(e) {
  e.preventDefault();
  const nama     = document.getElementById('setting-nama').value.trim();
  const alamat   = document.getElementById('setting-alamat').value.trim();
  const kota     = document.getElementById('setting-kota').value.trim();
  const logoUrl  = document.getElementById('setting-logo').value.trim();
  const kepala   = document.getElementById('setting-kepala').value.trim();
  const pimpinan = document.getElementById('setting-pimpinan').value.trim();
  const pass     = document.getElementById('setting-pass').value;
  const warna    = document.getElementById('setting-warna-hex').value.trim() ||
                   document.getElementById('setting-warna').value;

  // Jabatan list — bersihkan baris kosong berlebih, pertahankan urutan
  const jabEl     = document.getElementById('setting-jabatan-list');
  const jabatanList = jabEl
    ? jabEl.value.split('\n').map(s => s.trim()).filter(s => s.length > 0).join('\n')
    : '';

  const payload = {
    nama_sekolah:    nama,
    alamat,
    kota,
    logo_url:        logoUrl,
    kepala_madrasah: kepala,
    pimpinan_rapat:  pimpinan,
    warna_primer:    warna,
    jabatan_list:    jabatanList
  };
  if (pass) payload.admin_password = pass;

  const btn = e.submitter;
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }

  try {
    await DB.saveSetting(AdminState.password, payload);
    // Update session password jika diubah
    if (pass) {
      AdminState.password = pass;
      sessionStorage.setItem('dh_admin_pass', pass);
    }
    showToast('✓ Pengaturan berhasil disimpan.', 'success');
    document.getElementById('setting-pass').value = '';
    // Update header
    document.getElementById('header-title').textContent = nama || 'Panel Admin';
    document.documentElement.style.setProperty('--clr-primary', warna);
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML =
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="white">' +
        '<path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10v4z"/>' +
        '</svg> Simpan Pengaturan';
    }
  }
}

/* ── SETUP GAS ───────────────────────────────────────────── */
async function doSetupGas() {
  if (!DB.isGasMode()) {
    showToast('URL GAS belum dikonfigurasi. Isi di bagian Koneksi GAS.', 'warn');
    return;
  }
  const btn = document.getElementById('btn-setup-gas');
  btn.disabled    = true;
  btn.textContent = 'Menyiapkan…';
  try {
    const res = await DB.setupGas(AdminState.password);
    showToast('✓ ' + (res.message || 'Spreadsheet berhasil disiapkan!'), 'success');
  } catch (e) {
    showToast('Gagal setup: ' + e.message, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Setup Spreadsheet GAS';
  }
}

/* ── BACKUP / RESTORE ────────────────────────────────────── */
function onRestore(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const result = DB.importBackup(ev.target.result);
    if (result.ok) {
      // Sinkronisasi URL dari backup
      const savedUrl = GasAPI.getUrl();
      if (savedUrl) document.getElementById('input-gas-url').value = savedUrl;
      updateUrlStatus(savedUrl);
      renderModeBadge();
      showToast('✓ Backup berhasil dipulihkan!', 'success');
      loadKegiatan();
      loadSettingForm();
    } else {
      showToast(result.msg, 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

/* ── MODAL ───────────────────────────────────────────────── */
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden');    }

/* ── UTILS ───────────────────────────────────────────────── */
function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !show);
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
