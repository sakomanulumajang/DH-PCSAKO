// ============================================================
//  DAFTAR HADIR — Google Apps Script API Backend
//  Versi: 2.0 (GitHub Pages compatible)
//
//  Deploy sebagai:
//    Deploy > New deployment > Web App
//    Execute as: Me
//    Who has access: Anyone
//
//  Setelah deploy, salin URL dan paste ke pengaturan
//  aplikasi web (Admin > Pengaturan > URL API GAS)
// ============================================================

// ── KONFIGURASI ──────────────────────────────────────────────
var SHEET_SETTING  = 'Setting';
var SHEET_KEGIATAN = 'Kegiatan';
var SHEET_HADIR    = 'DataHadir';

// ── CORS HEADERS (wajib untuk cross-origin dari GitHub Pages) ─
// ── RESPONSE HELPERS ─────────────────────────────────────────
// Semua response dibungkus JSONP jika ada parameter 'callback'.
// Ini solusi untuk CORS — browser memuat via <script> tag,
// bukan fetch(), sehingga tidak ada masalah cross-origin.

function buildResponse(data, callbackName) {
  var json = JSON.stringify(data);
  if (callbackName) {
    // JSONP: callback({...})
    return ContentService
      .createTextOutput(callbackName + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  // Fallback JSON biasa (untuk test di browser / Postman)
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(msg, code, cb) {
  return buildResponse({ ok: false, error: msg, code: code || 400 }, cb);
}

function okResponse(data, cb) {
  return buildResponse(Object.assign({ ok: true }, data), cb);
}

// ── ENTRY POINTS ─────────────────────────────────────────────

// GET  → ?action=...&callback=fnName&...params...
// Semua operasi (termasuk write) dikirim via GET + JSONP
function doGet(e) {
  var cb     = (e.parameter && e.parameter.callback) || '';
  var action = (e.parameter && e.parameter.action)   || '';
  try {
    return routeGet(action, e.parameter, cb);
  } catch (err) {
    return errorResponse('Server error: ' + err.message, 500, cb);
  }
}

// POST tetap didukung sebagai alternatif (misal dari Postman/curl)
function doPost(e) {
  try {
    var body   = JSON.parse(e.postData.contents);
    var action = body.action || '';
    var cb     = body.callback || '';
    return routePost(action, body, cb);
  } catch (err) {
    return errorResponse('Server error: ' + err.message, 500, '');
  }
}

// ── ROUTER GET ────────────────────────────────────────────────
function routeGet(action, params, cb) {
  switch (action) {
    case 'ping':          return okResponse({ message: 'pong', ts: new Date().toISOString() }, cb);
    case 'setting':       return okResponse({ data: getSetting() }, cb);
    case 'kegiatan':      return okResponse({ data: getAllKegiatan() }, cb);
    case 'kegiatanAktif': return okResponse({ data: getKegiatanAktif() }, cb);
    case 'hadir':
      if (!params.id) return errorResponse('Parameter id diperlukan', 400, cb);
      return okResponse({ data: getHadirByKegiatan(params.id) }, cb);
    case 'statistik':
      if (!params.id) return errorResponse('Parameter id diperlukan', 400, cb);
      return okResponse({ data: getStatistik(params.id) }, cb);
    // Write via GET (JSONP tidak bisa POST)
    case 'login':                return handleLogin(params, cb);
    case 'tambahKegiatan':       return handleTambahKegiatan(params, cb);
    case 'updateStatusKegiatan': return handleUpdateStatus(params, cb);
    case 'hapusKegiatan':        return handleHapusKegiatan(params, cb);
    case 'editKegiatan':         return handleEditKegiatan(params, cb);
    case 'simpanHadir':          return handleSimpanHadir(params, cb);
    case 'hapusHadir':           return handleHapusHadir(params, cb);
    case 'saveSetting':          return handleSaveSetting(params, cb);
    case 'setup':                return handleSetup(params, cb);
    default:
      return errorResponse('Action tidak dikenal: ' + action, 404, cb);
  }
}

// ── ROUTER POST ───────────────────────────────────────────────
function routePost(action, body, cb) {
  switch (action) {
    case 'login':                return handleLogin(body, cb);
    case 'tambahKegiatan':       return handleTambahKegiatan(body, cb);
    case 'updateStatusKegiatan': return handleUpdateStatus(body, cb);
    case 'hapusKegiatan':        return handleHapusKegiatan(body, cb);
    case 'editKegiatan':         return handleEditKegiatan(body, cb);
    case 'simpanHadir':          return handleSimpanHadir(body, cb);
    case 'hapusHadir':           return handleHapusHadir(body, cb);
    case 'saveSetting':          return handleSaveSetting(body, cb);
    case 'setup':                return handleSetup(body, cb);
    default:
      return errorResponse('Action tidak dikenal: ' + action, 404, cb);
  }
}

// ── AUTH HELPER ───────────────────────────────────────────────
function checkAuth(body) {
  var setting = getSetting();
  var pass    = setting.admin_password || 'admin123';
  return body.password && body.password === pass;
}

// ── HANDLERS ─────────────────────────────────────────────────

function handleLogin(body, cb) {
  var setting = getSetting();
  if (body.password === (setting.admin_password || 'admin123')) {
    return okResponse({ message: 'Login berhasil' }, cb);
  }
  return buildResponse({ ok: false, error: 'Password salah' }, cb);
}

function handleTambahKegiatan(body, cb) {
  if (!checkAuth(body)) return errorResponse('Unauthorized', 401, cb);
  if (!body.judul || !body.tanggal) return errorResponse('judul dan tanggal wajib diisi', 400, cb);

  var sh    = getSheet(SHEET_KEGIATAN);
  var id    = 'KGT' + Date.now();
  var now   = formatDateTime(new Date());
  var waktu = String(body.waktu || '08:00').replace(/\s*WIB\s*/i,'').trim();

  // Tulis sebagai plain text: pakai setValues pada range spesifik
  // agar Sheets tidak mengkonversi waktu ke angka
  var lastRow = sh.getLastRow() + 1;
  sh.getRange(lastRow, 1, 1, 8).setNumberFormat('@STRING@').setValues([[
    id,
    body.judul,
    String(body.tanggal),
    waktu,
    String(body.lokasi     || ''),
    String(body.keterangan || ''),
    now,
    'Aktif'
  ]]);
  SpreadsheetApp.flush();
  return okResponse({ id: id, message: 'Kegiatan berhasil ditambahkan' }, cb);
}

function handleUpdateStatus(body, cb) {
  if (!checkAuth(body)) return errorResponse('Unauthorized', 401, cb);
  if (!body.id || !body.status) return errorResponse('id dan status wajib diisi', 400, cb);

  var sh   = getSheet(SHEET_KEGIATAN);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.id)) {
      sh.getRange(i + 1, 8).setValue(body.status);
      SpreadsheetApp.flush();
      return okResponse({ message: 'Status diperbarui' }, cb);
    }
  }
  return errorResponse('Kegiatan tidak ditemukan', 404, cb);
}

function handleHapusKegiatan(body, cb) {
  if (!checkAuth(body)) return errorResponse('Unauthorized', 401, cb);
  if (!body.id) return errorResponse('id wajib diisi', 400, cb);

  var sh   = getSheet(SHEET_KEGIATAN);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.id)) {
      sh.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return okResponse({ message: 'Kegiatan dihapus' }, cb);
    }
  }
  return errorResponse('Kegiatan tidak ditemukan', 404, cb);
}

function handleEditKegiatan(body, cb) {
  if (!checkAuth(body)) return errorResponse('Unauthorized', 401, cb);
  if (!body.id || !body.judul || !body.tanggal)
    return errorResponse('id, judul, dan tanggal wajib diisi', 400, cb);

  var sh    = getSheet(SHEET_KEGIATAN);
  var data  = sh.getDataRange().getValues();
  var waktu = String(body.waktu || '').replace(/\s*WIB\s*/i,'').trim();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.id)) {
      sh.getRange(i + 1, 2).setNumberFormat('@STRING@').setValue(String(body.judul));
      sh.getRange(i + 1, 3).setNumberFormat('@STRING@').setValue(String(body.tanggal));
      sh.getRange(i + 1, 4).setNumberFormat('@STRING@').setValue(
        waktu || sheetWaktuToStr_(data[i][3]));
      sh.getRange(i + 1, 5).setNumberFormat('@STRING@').setValue(
        body.lokasi !== undefined ? String(body.lokasi) : String(data[i][4] || ''));
      sh.getRange(i + 1, 6).setNumberFormat('@STRING@').setValue(
        body.keterangan !== undefined ? String(body.keterangan) : String(data[i][5] || ''));
      SpreadsheetApp.flush();
      return okResponse({ message: 'Kegiatan berhasil diperbarui' }, cb);
    }
  }
  return errorResponse('Kegiatan tidak ditemukan', 404, cb);
}

function handleSimpanHadir(body, cb) {
  var nama       = body.nama       ? String(body.nama).trim()       : '';
  var jabatan    = body.jabatan    ? String(body.jabatan).trim()    : '';
  var ttd        = body.ttd        ? String(body.ttd)               : '';
  var idKgt      = body.idKegiatan ? String(body.idKegiatan)        : '';
  var keterangan = body.keterangan ? String(body.keterangan).trim() : '';

  if (!nama)    return errorResponse('Nama tidak boleh kosong', 400, cb);
  if (!jabatan) return errorResponse('Jabatan harus dipilih', 400, cb);
  if (!ttd)     return errorResponse('Tanda tangan diperlukan', 400, cb);
  if (!idKgt)   return errorResponse('idKegiatan diperlukan', 400, cb);

  var kegiatan = getKegiatanById(idKgt);
  if (!kegiatan) return errorResponse('Kegiatan tidak ditemukan', 404, cb);

  var sh  = getSheet(SHEET_HADIR);
  var id  = 'HDR' + Date.now();
  var now = formatDateTime(new Date());
  // 9 kolom: ID, IDKegiatan, Judul, Tanggal, Nama, Jabatan, TTD, WaktuAbsen, Keterangan
  sh.appendRow([id, idKgt, kegiatan.judul, kegiatan.tanggal,
                nama, jabatan, ttd, now, keterangan]);
  SpreadsheetApp.flush();
  return okResponse({ id: id, message: 'Daftar hadir berhasil disimpan' }, cb);
}

function handleHapusHadir(body, cb) {
  if (!checkAuth(body)) return errorResponse('Unauthorized', 401, cb);
  if (!body.id) return errorResponse('id wajib diisi', 400, cb);

  var sh   = getSheet(SHEET_HADIR);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.id)) {
      sh.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return okResponse({ message: 'Data hadir dihapus' }, cb);
    }
  }
  return errorResponse('Data tidak ditemukan', 404, cb);
}

function handleSaveSetting(body, cb) {
  if (!checkAuth(body)) return errorResponse('Unauthorized', 401, cb);

  var allowed = [
    'nama_sekolah', 'alamat', 'kota',
    'warna_primer', 'logo_url', 'kepala_madrasah', 'pimpinan_rapat',
    'app_version', 'jabatan_list'
  ];
  if (body.new_password) updateSettingKey('admin_password', body.new_password);
  allowed.forEach(function(key) {
    if (body[key] !== undefined) updateSettingKey(key, body[key]);
  });
  return okResponse({ message: 'Pengaturan disimpan' }, cb);
}

function handleSetup(body, cb) {
  if (!checkAuth(body)) return errorResponse('Unauthorized', 401, cb);
  setupSpreadsheet();
  return okResponse({ message: 'Spreadsheet berhasil disiapkan' }, cb);
}

// ── DATA READERS ──────────────────────────────────────────────

function getSetting() {
  var sh = getSheet(SHEET_SETTING);
  if (!sh) return defaultSetting();
  var data   = sh.getDataRange().getValues();
  var result = defaultSetting();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) result[String(data[i][0])] = data[i][1];
  }
  return result;
}

function defaultSetting() {
  return {
    nama_sekolah:    'Sekolah / Instansi Anda',
    alamat:          'Jl. Contoh No. 1, Kota Anda',
    kota:            '',
    admin_password:  'admin123',
    warna_primer:    '#1a73e8',
    logo_url:        'https://i.ibb.co.com/B2KQmpM1/logoMI-R.png',
    kepala_madrasah: 'SAHRONI, S.Pd.',
    pimpinan_rapat:  '',
    app_version:     '2.0.0',
    jabatan_list:    'Pengawas Madrasah\nKepala Madrasah\nWakabid Kurikulum\nWakabid Kesiswaan\nWakabid Sarana Prasarana\nWakabid Keuangan\nWakabid Humas\nGuru\nOperator\nKaryawan\nGuru Bantu'
  };
}

function getAllKegiatan() {
  var sh = getSheet(SHEET_KEGIATAN);
  if (!sh) return [];
  var data   = sh.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    result.push({
      id:          String(data[i][0]),
      judul:       String(data[i][1] || ''),
      tanggal:     sheetTanggalToStr_(data[i][2]),
      waktu:       sheetWaktuToStr_(data[i][3]),
      lokasi:      String(data[i][4] || ''),
      keterangan:  String(data[i][5] || ''),
      createdStr:  String(data[i][6] || ''),
      status:      String(data[i][7] || 'Aktif'),
      createdAt:   parseCreatedAt_(data[i][6])
    });
  }
  // Terbaru di atas
  return result.sort(function(a, b) { return b.createdAt - a.createdAt; });
}

function getKegiatanAktif() {
  var list = getAllKegiatan();
  for (var i = 0; i < list.length; i++) {
    if (list[i].status === 'Aktif') return list[i];
  }
  return list.length ? list[0] : null;
}

function getKegiatanById(id) {
  var list = getAllKegiatan();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === String(id)) return list[i];
  }
  return null;
}

function getHadirByKegiatan(idKegiatan) {
  var sh = getSheet(SHEET_HADIR);
  if (!sh) return [];
  var data   = sh.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) !== String(idKegiatan)) continue;
    result.push({
      id:              String(data[i][0]),
      idKegiatan:      String(data[i][1]),
      judulKegiatan:   String(data[i][2] || ''),
      tanggalKegiatan: sheetTanggalToStr_(data[i][3]),
      nama:            String(data[i][4] || ''),
      jabatan:         String(data[i][5] || ''),
      ttd:             String(data[i][6] || ''),
      waktuAbsen:      String(data[i][7] || ''),
      keterangan:      String(data[i][8] || '')
    });
  }
  return result;
}

function getStatistik(idKegiatan) {
  var hadir   = getHadirByKegiatan(idKegiatan);
  var setting = getSetting();

  // Bangun daftar jabatan dari setting (satu per baris)
  var jabatanRaw = String(setting.jabatan_list || '');
  var jabatanList = jabatanRaw.split('\n')
    .map(function(s) { return s.trim(); })
    .filter(function(s) { return s.length > 0; });

  // Inisialisasi stat: setiap jabatan unik menjadi key
  // Jabatan yang berawalan "Wakabid" dikelompokkan menjadi key "Wakabid"
  var stat = { total: hadir.length };
  jabatanList.forEach(function(j) {
    var key = j.indexOf('Wakabid') === 0 ? 'Wakabid' : j;
    if (stat[key] === undefined) stat[key] = 0;
  });

  hadir.forEach(function(h) {
    var j   = h.jabatan || '';
    var key = j.indexOf('Wakabid') === 0 ? 'Wakabid' : j;
    if (stat[key] !== undefined) stat[key]++;
    else {
      // Jabatan tidak dikenal — tetap hitung agar tidak hilang
      stat[key] = (stat[key] || 0) + 1;
    }
  });

  // Sertakan jabatan_list agar frontend bisa render dinamis
  stat._jabatanList = jabatanList;
  return stat;
}

// ── SPREADSHEET HELPERS ───────────────────────────────────────

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

function updateSettingKey(key, value) {
  var sh   = getSheet(SHEET_SETTING);
  if (!sh) return;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sh.getRange(i + 1, 2).setValue(value);
      SpreadsheetApp.flush();
      return;
    }
  }
  sh.appendRow([key, value]);
  SpreadsheetApp.flush();
}

// ── FORMAT TANGGAL & WAKTU (WIB = UTC+7) ─────────────────────
//
// Prinsip: selalu hitung dari UTC murni, lalu tambah 7 jam.
// JANGAN gunakan getTimezoneOffset() karena nilainya berbeda
// tergantung timezone server/browser, menyebabkan hasil yang
// tidak konsisten antar lingkungan.
//
var BULAN_ID = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];

/**
 * Konversi Date ke WIB (UTC+7) secara aman.
 * Selalu benar terlepas dari timezone server GAS.
 */
function toWIB(date) {
  // getTime() selalu mengembalikan milisecond sejak Unix epoch (UTC)
  // Tambahkan 7 jam (7 * 3600 * 1000 ms) untuk mendapat waktu WIB
  return new Date(date.getTime() + 7 * 3600 * 1000);
}

/**
 * Format datetime ke "DD MMMM YYYY, HH:mm WIB"
 * misal: "05 Juli 2025, 08:30 WIB"
 */
function formatDateTime(date) {
  var w   = toWIB(date);
  var dd  = String(w.getUTCDate()).padStart(2, '0');
  var mmm = BULAN_ID[w.getUTCMonth()];
  var yy  = w.getUTCFullYear();
  var hh  = String(w.getUTCHours()).padStart(2, '0');
  var min = String(w.getUTCMinutes()).padStart(2, '0');
  return dd + ' ' + mmm + ' ' + yy + ', ' + hh + ':' + min + ' WIB';
}

/**
 * Format tanggal saja: "DD MMMM YYYY"
 * misal: "05 Juli 2025"
 */
function formatTanggal(date) {
  var w   = toWIB(date);
  var dd  = String(w.getUTCDate()).padStart(2, '0');
  var mmm = BULAN_ID[w.getUTCMonth()];
  var yy  = w.getUTCFullYear();
  return dd + ' ' + mmm + ' ' + yy;
}

/**
 * Format waktu saja: "HH:mm WIB"
 * misal: "08:30 WIB"
 */
function formatWaktu(date) {
  var w   = toWIB(date);
  var hh  = String(w.getUTCHours()).padStart(2, '0');
  var min = String(w.getUTCMinutes()).padStart(2, '0');
  return hh + ':' + min + ' WIB';
}

// ── SETUP SPREADSHEET ─────────────────────────────────────────
function setupSpreadsheet() {
  var ss = getSpreadsheet();
  _setupSetting(ss);
  _setupKegiatan(ss);
  _setupHadir(ss);
  SpreadsheetApp.flush();
  Logger.log('Setup selesai!');
}

function _setupSetting(ss) {
  var sh = ss.getSheetByName(SHEET_SETTING) || ss.insertSheet(SHEET_SETTING);
  if (sh.getLastRow() > 0) return; // Tidak timpa data yang sudah ada
  var headers = [['Kunci', 'Nilai']];
  sh.getRange(1, 1, 1, 2).setValues(headers)
    .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  var defaults = [
    ['admin_password',  'admin123'],
    ['nama_sekolah',    'Sekolah / Instansi Anda'],
    ['alamat',          'Jl. Contoh No. 1, Kota Anda'],
    ['kota',            'Kota Anda'],
    ['warna_primer',    '#099b46'],
    ['logo_url',        'https://i.ibb.co.com/B2KQmpM1/logoMI-R.png'],
    ['kepala_madrasah', 'SAHRONI, S.Pd.'],
    ['pimpinan_rapat',  ''],
    ['app_version',     '2.0.0'],
    ['jabatan_list',    'Pengawas Madrasah\nKepala Madrasah\nWakabid Kurikulum\nWakabid Kesiswaan\nWakabid Sarana Prasarana\nWakabid Keuangan\nWakabid Humas\nGuru\nOperator\nKaryawan\nGuru Bantu']
  ];
  sh.getRange(2, 1, defaults.length, 2).setValues(defaults);
  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 320);
}

function _setupKegiatan(ss) {
  var sh = ss.getSheetByName(SHEET_KEGIATAN) || ss.insertSheet(SHEET_KEGIATAN);
  if (sh.getLastRow() > 0) return;
  var headers = [['ID','Judul Kegiatan','Tanggal','Waktu','Lokasi','Keterangan','Dibuat Pada','Status']];
  sh.getRange(1, 1, 1, 8).setValues(headers)
    .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  // Paksa kolom Tanggal (C) dan Waktu (D) sebagai Plain Text
  // agar Sheets tidak mengkonversi "08:00" menjadi angka desimal
  sh.getRange('C:C').setNumberFormat('@STRING@');
  sh.getRange('D:D').setNumberFormat('@STRING@');
  // Contoh data
  var now   = formatDateTime(new Date());
  var today = formatTanggal(new Date());
  sh.appendRow(['KGT001','Rapat Koordinasi Bulanan', today,'08:00','Ruang Rapat','Kegiatan contoh',now,'Aktif']);
  sh.setFrozenRows(1);
  for (var c = 1; c <= 8; c++) sh.setColumnWidth(c, 160);
  sh.setColumnWidth(1, 100);
}

function _setupHadir(ss) {
  var sh = ss.getSheetByName(SHEET_HADIR) || ss.insertSheet(SHEET_HADIR);
  if (sh.getLastRow() > 0) return;
  // 9 kolom — kolom ke-9 adalah Keterangan (opsional dari peserta)
  var headers = [['ID Hadir','ID Kegiatan','Judul Kegiatan','Tanggal Kegiatan',
                  'Nama','Jabatan','Tanda Tangan (Base64)','Waktu Absen','Keterangan']];
  sh.getRange(1, 1, 1, 9).setValues(headers)
    .setFontWeight('bold').setBackground('#0d652d').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  for (var c = 1; c <= 9; c++) sh.setColumnWidth(c, 160);
  sh.setColumnWidth(7, 80);  // TTD (base64 panjang)
  sh.setColumnWidth(9, 200); // Keterangan
}

// ── KONVERSI NILAI WAKTU DARI SPREADSHEET ────────────────────
// Google Sheets menyimpan waktu sebagai angka desimal 0–1
// (misal 08:00 = 8/24 = 0.3333...).
// Tanggal disimpan sebagai integer serial (misal 45869).
// Fungsi ini mengkonversi ke string yang aman dikirim ke frontend.

/**
 * Konversi nilai waktu dari Sheets → string "HH:mm"
 * Input bisa berupa:
 *   - Number 0–1    : serial waktu Sheets (0.333... = 08:00)
 *   - String "HH:mm": langsung dikembalikan
 *   - String lain   : dikembalikan apa adanya
 */
function sheetWaktuToStr_(val) {
  if (val === '' || val === null || val === undefined) return '';
  if (typeof val === 'number') {
    // Tangani kemungkinan nilai waktu negatif atau > 1 (anomali Sheets)
    var frac = val - Math.floor(val); // ambil bagian desimal saja
    var totalMenit = Math.round(frac * 24 * 60);
    var hh  = Math.floor(totalMenit / 60) % 24;
    var min = totalMenit % 60;
    return String(hh).padStart(2, '0') + ':' + String(min).padStart(2, '0');
  }
  var s = String(val).trim();
  // Sudah format HH:mm atau HH:mm:ss
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5); // pastikan max HH:mm
  return s;
}

/**
 * Konversi nilai tanggal dari Sheets → string "DD/MM/YYYY"
 * Sheets menyimpan tanggal sebagai integer serial (1 = 1 Jan 1900).
 * Jika sudah string, dikembalikan apa adanya.
 */
function sheetTanggalToStr_(val) {
  if (val === '' || val === null || val === undefined) return '';
  if (typeof val === 'number') {
    // Sheets epoch: 1 = 1 Jan 1900, tapi ada bug Lotus 1-2-3 di Sheets
    // (29 Feb 1900 dianggap ada). Koreksi: serial >= 61 kurangi 1.
    var serial = val >= 61 ? val - 1 : val;
    // Epoch Sheets = 31 Des 1899 (hari 0)
    var epoch = new Date(Date.UTC(1899, 11, 30)); // 30 Des 1899 UTC
    var ms    = epoch.getTime() + serial * 86400000;
    var d     = new Date(ms);
    var dd    = String(d.getUTCDate()).padStart(2, '0');
    var mm    = String(d.getUTCMonth() + 1).padStart(2, '0');
    var yyyy  = d.getUTCFullYear();
    return dd + '/' + mm + '/' + yyyy;
  }
  return String(val).trim();
}
// Format yang mungkin muncul:
//   "03 September 2026, 08:30 WIB"  (dari formatDateTime baru)
//   "03/09/2026 08:30:00"           (format lama jika ada)
// Kembalikan timestamp milidetik WIB. Fallback ke Date.now().
function parseCreatedAt_(str) {
  if (!str) return Date.now();
  str = String(str).trim();

  // Format baru: "DD MMMM YYYY, HH:mm WIB"
  var r1 = str.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/
  );
  if (r1) {
    var bulanIdx = BULAN_ID.indexOf(r1[2]);
    if (bulanIdx !== -1) {
      // Bangun timestamp WIB (gunakan UTC agar tidak ada offset)
      return Date.UTC(
        parseInt(r1[3]), bulanIdx, parseInt(r1[1]),
        parseInt(r1[4]), parseInt(r1[5]), 0
      );
    }
  }

  // Format lama: "DD/MM/YYYY HH:mm:ss"
  var r2 = str.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/
  );
  if (r2) {
    return Date.UTC(
      parseInt(r2[3]), parseInt(r2[2]) - 1, parseInt(r2[1]),
      parseInt(r2[4]), parseInt(r2[5]), 0
    );
  }

  // Fallback
  return Date.now();
}

// ── INISIALISASI ──────────────────────────────────────────────
function init() {
  setupSpreadsheet();
  Logger.log('Setup spreadsheet selesai.');
  Logger.log('Sekarang deploy sebagai Web App (Deploy > New deployment > Web App).');
}

// ── TEST ──────────────────────────────────────────────────────
// Jalankan dari editor GAS untuk memverifikasi sebelum deploy
function testAPI() {
  // Simulasi GET ping tanpa callback (response JSON biasa)
  var fakeE = { parameter: { action: 'ping' } };
  Logger.log('ping: ' + doGet(fakeE).getContent());

  fakeE.parameter.action = 'setting';
  Logger.log('setting: ' + doGet(fakeE).getContent());

  fakeE.parameter.action = 'kegiatanAktif';
  Logger.log('kegiatanAktif: ' + doGet(fakeE).getContent());

  // Simulasi dengan callback (JSONP)
  fakeE.parameter.action   = 'ping';
  fakeE.parameter.callback = 'testCallback';
  Logger.log('ping JSONP: ' + doGet(fakeE).getContent());
  // Output harus: testCallback({"ok":true,"message":"pong",...})
}
