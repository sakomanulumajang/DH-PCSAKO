/**
 * db.js — Hybrid Database Layer
 *
 * Mode operasi:
 *   1. GAS Mode  → Jika URL API GAS dikonfigurasi & terjangkau,
 *                  semua data baca/tulis ke Google Spreadsheet.
 *   2. Local Mode → Fallback ke localStorage jika GAS tidak
 *                   dikonfigurasi atau tidak terjangkau.
 *
 * Semua fungsi mengembalikan Promise.
 * Bergantung pada: api.js (harus dimuat lebih dulu)
 */

'use strict';

const DB = (() => {

  /* ── LOCAL STORAGE KEYS ──────────────────────────────────── */
  const K_SETTING  = 'dh_setting';
  const K_KEGIATAN = 'dh_kegiatan';
  const K_HADIR    = 'dh_hadir';
  const K_MODE     = 'dh_mode'; // 'gas' | 'local'

  /* ── MODE ────────────────────────────────────────────────── */
  function isGasMode() {
    return GasAPI.isConfigured();
  }

  function getMode() {
    return isGasMode() ? 'gas' : 'local';
  }

  /* ── LOCAL HELPERS ───────────────────────────────────────── */
  function lLoad(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function lSave(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function nowStr() {
    // Pakai Fmt dari utils.js agar konsisten WIB
    return Fmt.now();
  }

  /* ── DEFAULT SETTING ─────────────────────────────────────── */
  const DEFAULT_SETTING = {
    nama_sekolah:    'Sekolah / Instansi Anda',
    alamat:          'Jl. Contoh No. 1, Kota Anda',
    kota:            '',
    admin_password:  'admin123',
    warna_primer:    '#9e5400',
    logo_url:        'https://i.ibb.co.com/8Dp1r5wm/sako-Maarif-NU-logo.png',
    kepala_madrasah: 'SAHRONI, S.Pd.',
    pimpinan_rapat:  '',
    app_version:     '2.0.0',
    jabatan_list:    'Mabi Sako\nKetua Sako\nSekretaris Sako\nWakil Sekretaris\nWakabidang\nAnggota\nDewan Kerja'
  };

  /* ══════════════════════════════════════════════════════════
     SETTING
     ══════════════════════════════════════════════════════════ */

  async function getSetting() {
    if (isGasMode()) {
      try {
        const data = await GasAPI.getSetting();
        // Cache lokal sebagai backup
        lSave(K_SETTING, data);
        return data;
      } catch (e) {
        console.warn('[DB] GAS getSetting gagal, pakai cache lokal:', e.message);
        return Object.assign({}, DEFAULT_SETTING, lLoad(K_SETTING, {}));
      }
    }
    return Object.assign({}, DEFAULT_SETTING, lLoad(K_SETTING, {}));
  }

  async function saveSetting(adminPassword, newData) {
    if (isGasMode()) {
      const payload = { ...newData };
      if (newData.admin_password) {
        payload.new_password    = newData.admin_password;
        delete payload.admin_password;
      }
      const res = await GasAPI.saveSetting(adminPassword, payload);
      if (!res.ok) throw new Error(res.error || 'Gagal menyimpan setting');
    }
    // Selalu update cache lokal
    const current = lLoad(K_SETTING, {});
    lSave(K_SETTING, Object.assign(current, newData));
    return true;
  }

  /* ══════════════════════════════════════════════════════════
     AUTH
     ══════════════════════════════════════════════════════════ */

  async function login(password) {
    if (isGasMode()) {
      const res = await GasAPI.login(password);
      return res.ok;
    }
    // Local: bandingkan dengan setting tersimpan
    const s = lLoad(K_SETTING, {});
    return password === (s.admin_password || DEFAULT_SETTING.admin_password);
  }

  /* ══════════════════════════════════════════════════════════
     KEGIATAN
     ══════════════════════════════════════════════════════════ */

  async function getAllKegiatan() {
    if (isGasMode()) {
      try {
        const data = await GasAPI.getAllKegiatan();
        lSave(K_KEGIATAN, data); // cache
        return data;
      } catch (e) {
        console.warn('[DB] GAS getAllKegiatan gagal, pakai cache:', e.message);
        return _localGetKegiatan();
      }
    }
    return _localGetKegiatan();
  }

  function _localGetKegiatan() {
    return [...lLoad(K_KEGIATAN, [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async function getKegiatanAktif() {
    if (isGasMode()) {
      try {
        const data = await GasAPI.getKegiatanAktif();
        return data;
      } catch (e) {
        console.warn('[DB] GAS getKegiatanAktif gagal, pakai cache:', e.message);
        return _localGetAktif();
      }
    }
    return _localGetAktif();
  }

  function _localGetAktif() {
    const list = _localGetKegiatan();
    return list.find(k => k.status === 'Aktif') || (list.length ? list[0] : null);
  }

  function getKegiatanByIdLocal(id) {
    return lLoad(K_KEGIATAN, []).find(k => k.id === id) || null;
  }

  async function tambahKegiatan(adminPassword, { judul, tanggal, waktu, lokasi, keterangan }) {
    if (!judul || !tanggal) return { ok: false, msg: 'Judul dan tanggal wajib diisi.' };

    if (isGasMode()) {
      const res = await GasAPI.tambahKegiatan(adminPassword, { judul, tanggal, waktu, lokasi, keterangan });
      if (!res.ok) return { ok: false, msg: res.error || 'Gagal tambah kegiatan' };
      // Invalidate cache
      try { lSave(K_KEGIATAN, await GasAPI.getAllKegiatan()); } catch {}
      return { ok: true, data: res };
    }

    // Local
    const list = lLoad(K_KEGIATAN, []);
    const item = {
      id:          uid(),
      judul:       judul.trim(),
      tanggal,
      waktu:       waktu  || '08:00',
      lokasi:      lokasi || '',
      keterangan:  keterangan || '',
      status:      'Aktif',
      createdAt:   Date.now(),
      createdStr:  nowStr()
    };
    list.push(item);
    lSave(K_KEGIATAN, list);
    return { ok: true, data: item };
  }

  async function updateStatusKegiatan(adminPassword, id, status) {
    if (isGasMode()) {
      const res = await GasAPI.updateStatusKegiatan(adminPassword, id, status);
      if (!res.ok) throw new Error(res.error || 'Gagal update status');
      try { lSave(K_KEGIATAN, await GasAPI.getAllKegiatan()); } catch {}
      return true;
    }
    const list = lLoad(K_KEGIATAN, []);
    const idx  = list.findIndex(k => k.id === id);
    if (idx === -1) return false;
    list[idx].status = status;
    lSave(K_KEGIATAN, list);
    return true;
  }

  async function hapusKegiatan(adminPassword, id) {
    if (isGasMode()) {
      const res = await GasAPI.hapusKegiatan(adminPassword, id);
      if (!res.ok) throw new Error(res.error || 'Gagal hapus kegiatan');
      try { lSave(K_KEGIATAN, await GasAPI.getAllKegiatan()); } catch {}
      return true;
    }
    lSave(K_KEGIATAN, lLoad(K_KEGIATAN, []).filter(k => k.id !== id));
    return true;
  }

  async function editKegiatan(adminPassword, { id, judul, tanggal, waktu, lokasi, keterangan }) {
    if (!judul || !tanggal) return { ok: false, msg: 'Judul dan tanggal wajib diisi.' };

    if (isGasMode()) {
      const res = await GasAPI.editKegiatan(adminPassword, { id, judul, tanggal, waktu, lokasi, keterangan });
      if (!res.ok) throw new Error(res.error || 'Gagal edit kegiatan');
      try { lSave(K_KEGIATAN, await GasAPI.getAllKegiatan()); } catch {}
      return { ok: true };
    }

    const list = lLoad(K_KEGIATAN, []);
    const idx  = list.findIndex(k => k.id === id);
    if (idx === -1) throw new Error('Kegiatan tidak ditemukan');
    list[idx] = Object.assign(list[idx], {
      judul: judul.trim(), tanggal,
      waktu:      waktu      || '',
      lokasi:     lokasi     || '',
      keterangan: keterangan || ''
    });
    lSave(K_KEGIATAN, list);
    return { ok: true };
  }

  /* ══════════════════════════════════════════════════════════
     DATA HADIR
     ══════════════════════════════════════════════════════════ */

  async function getHadirByKegiatan(idKegiatan) {
    if (isGasMode()) {
      try {
        const data = await GasAPI.getHadirByKegiatan(idKegiatan);
        // Cache per kegiatan
        const all  = lLoad(K_HADIR, []).filter(h => h.idKegiatan !== idKegiatan);
        lSave(K_HADIR, [...all, ...data]);
        return data;
      } catch (e) {
        console.warn('[DB] GAS getHadir gagal, pakai cache:', e.message);
        return lLoad(K_HADIR, []).filter(h => h.idKegiatan === idKegiatan);
      }
    }
    return lLoad(K_HADIR, []).filter(h => h.idKegiatan === idKegiatan);
  }

  async function simpanHadir({ idKegiatan, nama, jabatan, keterangan, ttd }) {
    if (!nama || !nama.trim()) return { ok: false, msg: 'Nama tidak boleh kosong.' };
    if (!jabatan)               return { ok: false, msg: 'Jabatan harus dipilih.' };
    if (!ttd)                   return { ok: false, msg: 'Tanda tangan wajib diisi.' };

    if (isGasMode()) {
      const res = await GasAPI.simpanHadir({ idKegiatan, nama: nama.trim(), jabatan, keterangan: keterangan || '', ttd });
      if (!res.ok) return { ok: false, msg: res.error || 'Gagal menyimpan' };
      const all  = lLoad(K_HADIR, []);
      const item = {
        id: res.id || uid(), idKegiatan,
        nama: nama.trim(), jabatan, keterangan: keterangan || '', ttd,
        waktuAbsen: nowStr(), ts: Date.now()
      };
      all.push(item);
      lSave(K_HADIR, all);
      return { ok: true, data: item };
    }

    // Local
    const kgList = lLoad(K_KEGIATAN, []);
    const kg     = kgList.find(k => k.id === idKegiatan);
    if (!kg) return { ok: false, msg: 'Kegiatan tidak ditemukan.' };

    const all  = lLoad(K_HADIR, []);
    const item = {
      id:              uid(),
      idKegiatan,
      judulKegiatan:   kg.judul,
      tanggalKegiatan: kg.tanggal,
      nama:            nama.trim(),
      jabatan,
      keterangan:      keterangan || '',
      ttd,
      waktuAbsen:      nowStr(),
      ts:              Date.now()
    };
    all.push(item);
    lSave(K_HADIR, all);
    return { ok: true, data: item };
  }

  async function hapusHadir(adminPassword, id) {
    if (isGasMode()) {
      const res = await GasAPI.hapusHadir(adminPassword, id);
      if (!res.ok) throw new Error(res.error || 'Gagal hapus data hadir');
    }
    lSave(K_HADIR, lLoad(K_HADIR, []).filter(h => h.id !== id));
    return true;
  }

  /* ── STATISTIK (lokal — dihitung dari cache) ─────────────── */
  function getStatistikLocal(idKegiatan) {
    const hadir      = lLoad(K_HADIR, []).filter(h => h.idKegiatan === idKegiatan);
    const setting    = lLoad(K_SETTING, {});
    const jabatanRaw = String(setting.jabatan_list || DEFAULT_SETTING.jabatan_list || '');
    const jabatanList = jabatanRaw.split('\n')
      .map(s => s.trim()).filter(s => s.length > 0);

    // Inisialisasi stat dari daftar jabatan: Wakabid-* dikelompokkan jadi 'Wakabid'
    const stat = { total: hadir.length };
    jabatanList.forEach(j => {
      const key = j.startsWith('Wakabid') ? 'Wakabid' : j;
      if (stat[key] === undefined) stat[key] = 0;
    });

    hadir.forEach(h => {
      const j   = h.jabatan || '';
      const key = j.startsWith('Wakabid') ? 'Wakabid' : j;
      if (stat[key] !== undefined) stat[key]++;
      else stat[key] = (stat[key] || 0) + 1; // jabatan tidak dikenal tetap dihitung
    });

    stat._jabatanList = jabatanList;
    return stat;
  }

  async function getStatistik(idKegiatan) {
    if (isGasMode()) {
      try {
        const res = await GasAPI.getStatistik(idKegiatan);
        return res;
      } catch {
        return getStatistikLocal(idKegiatan);
      }
    }
    return getStatistikLocal(idKegiatan);
  }

  /* ══════════════════════════════════════════════════════════
     EXPORT CSV
     ══════════════════════════════════════════════════════════ */

  async function exportCSV(idKegiatan) {
    const hadir = await getHadirByKegiatan(idKegiatan);
    const kg    = lLoad(K_KEGIATAN, []).find(k => k.id === idKegiatan);
    if (!hadir.length) return null;

    const header = ['No', 'Nama', 'Jabatan', 'Waktu Absen', 'Kegiatan', 'Tanggal Kegiatan'];
    const rows   = hadir.map((h, i) => [
      i + 1, `"${h.nama}"`, h.jabatan, h.waktuAbsen,
      `"${h.judulKegiatan || ''}"`, h.tanggalKegiatan || ''
    ]);
    const csv  = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const safe = (kg?.judul || 'data').replace(/[^a-zA-Z0-9]/g, '_');
    a.href     = url;
    a.download = `daftar_hadir_${safe}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  /* ══════════════════════════════════════════════════════════
     BACKUP / RESTORE (selalu lokal)
     ══════════════════════════════════════════════════════════ */

  function exportBackup() {
    const payload = {
      exportedAt: nowStr(),
      gasUrl:     GasAPI.getUrl(),
      setting:    lLoad(K_SETTING, {}),
      kegiatan:   lLoad(K_KEGIATAN, []),
      hadir:      lLoad(K_HADIR, [])
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `backup_daftar_hadir_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importBackup(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (data.setting)  lSave(K_SETTING,  data.setting);
      if (data.kegiatan) lSave(K_KEGIATAN, data.kegiatan);
      if (data.hadir)    lSave(K_HADIR,    data.hadir);
      if (data.gasUrl)   GasAPI.setUrl(data.gasUrl);
      return { ok: true };
    } catch {
      return { ok: false, msg: 'File backup tidak valid.' };
    }
  }

  /* ══════════════════════════════════════════════════════════
     SEED (pertama kali, hanya mode lokal)
     ══════════════════════════════════════════════════════════ */

  function seedIfEmpty() {
    if (isGasMode()) return; // GAS punya data sendiri
    if (lLoad(K_KEGIATAN, []).length > 0) return;

    const today = Fmt.nowTanggalLokal(); // "DD/MM/YYYY"
    const list = lLoad(K_KEGIATAN, []);
    list.push({
      id:         uid(),
      judul:      'Rapat Koordinasi Bulanan',
      tanggal:    today,
      waktu:      '08:00',
      lokasi:     'Ruang Rapat',
      keterangan: 'Kegiatan contoh — hapus atau ubah dari panel admin.',
      status:     'Aktif',
      createdAt:  Date.now(),
      createdStr: nowStr()
    });
    lSave(K_KEGIATAN, list);
  }

  /* ── SETUP GAS SPREADSHEET ───────────────────────────────── */
  async function setupGas(adminPassword) {
    if (!isGasMode()) throw new Error('URL GAS belum dikonfigurasi.');
    const res = await GasAPI.setup(adminPassword);
    if (!res.ok) throw new Error(res.error || 'Setup gagal');
    return res;
  }

  /* ── PUBLIC API ──────────────────────────────────────────── */
  return {
    isGasMode, getMode,
    getSetting, saveSetting,
    login,
    getAllKegiatan, getKegiatanAktif,
    tambahKegiatan, editKegiatan, updateStatusKegiatan, hapusKegiatan,
    getHadirByKegiatan, simpanHadir, hapusHadir,
    getStatistik,
    exportCSV, exportBackup, importBackup,
    seedIfEmpty, setupGas
  };

})();
