/**
 * utils.js — Utilitas format tanggal & waktu (WIB, UTC+7)
 *
 * PRINSIP DESAIN:
 * ──────────────
 * Semua tanggal/waktu di aplikasi ini SELALU disimpan dan dibaca
 * sebagai string literal WIB tanpa informasi timezone:
 *   tanggal : "DD/MM/YYYY"         (dari input form atau GAS)
 *   waktu   : "HH:mm"              (dari input time)
 *   absen   : "DD/MM/YYYY HH:mm:ss" (dari Fmt.now())
 *
 * Karena sudah WIB, TIDAK ADA konversi timezone yang perlu dilakukan
 * untuk string dari DB. toWIBNow() hanya digunakan untuk mengambil
 * waktu saat ini dalam WIB dari sistem.
 *
 * Format tampilan:
 *   tanggal  → "05 September 2026"
 *   waktu    → "08:00 WIB"
 *   lengkap  → "Jumat, 05 September 2026, 08:00 WIB"
 */

'use strict';

const Fmt = (() => {

  const BULAN = [
    'Januari','Februari','Maret','April','Mei','Juni',
    'Juli','Agustus','September','Oktober','November','Desember'
  ];

  const HARI = [
    'Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'
  ];

  /* ══════════════════════════════════════════════════════════
     WAKTU SEKARANG (WIB)
     Satu-satunya tempat di mana kita perlu konversi ke WIB.
     ══════════════════════════════════════════════════════════ */

  /**
   * Mengembalikan komponen waktu WIB saat ini.
   * Selalu ambil dari Date.now() (UTC epoch) lalu tambah +7 jam.
   * TIDAK menggunakan getTimezoneOffset() — hasilnya sama
   * di semua timezone browser/server.
   */
  function _nowWIBComponents() {
    // Date.now() = milisecond UTC sejak epoch
    // Tambah 7 jam = +7 * 3600 * 1000 ms
    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    return {
      d:   wib.getUTCDate(),
      m:   wib.getUTCMonth(),      // 0-based
      y:   wib.getUTCFullYear(),
      h:   wib.getUTCHours(),
      min: wib.getUTCMinutes(),
      s:   wib.getUTCSeconds(),
      dow: wib.getUTCDay()         // 0=Minggu
    };
  }

  /* ══════════════════════════════════════════════════════════
     PARSER STRING LOKAL
     ══════════════════════════════════════════════════════════ */

  /**
   * Parse "DD/MM/YYYY" → { d, m, y }  (m = 0-based)
   * Parse "DD MMMM YYYY" → { d, m, y }
   * Parse "YYYY-MM-DD"   → { d, m, y }
   * Return null jika tidak cocok.
   */
  function _parseTanggal(str) {
    if (!str || typeof str !== 'string') return null;
    str = str.trim();

    // DD/MM/YYYY
    const r1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (r1) return { d: +r1[1], m: +r1[2] - 1, y: +r1[3] };

    // DD MMMM YYYY  (bisa ada prefix hari: "Jumat, 03 September 2026")
    const r2 = str.replace(/^[^,]+,\s*/, '')
                  .match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (r2) {
      const mi = BULAN.findIndex(b => b.toLowerCase() === r2[2].toLowerCase());
      if (mi !== -1) return { d: +r2[1], m: mi, y: +r2[3] };
    }

    // YYYY-MM-DD (ISO, misal dari input[type=date])
    const r3 = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (r3) return { d: +r3[3], m: +r3[2] - 1, y: +r3[1] };

    return null;
  }

  /**
   * Parse "HH:mm" atau "HH:mm:ss" → { h, min }
   * Juga menerima angka desimal 0–1 (serial waktu dari Google Sheets).
   * Return null jika tidak cocok.
   */
  function _parseWaktu(str) {
    if (!str && str !== 0) return null;

    // Angka desimal 0–1 (serial waktu Google Sheets, misal 0.333... = 08:00)
    const n = Number(str);
    if (!isNaN(n) && n >= 0 && n < 1) {
      const totalMenit = Math.round(n * 24 * 60);
      return { h: Math.floor(totalMenit / 60) % 24, min: totalMenit % 60 };
    }

    if (typeof str !== 'string') return null;
    // Hilangkan suffix " WIB" jika ada
    const clean = str.trim().replace(/\s*WIB\s*$/i, '');
    const r = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (r) return { h: +r[1], min: +r[2] };
    return null;
  }

  /**
   * Parse "DD/MM/YYYY HH:mm:ss" → { d, m, y, h, min }
   * Digunakan untuk string waktu absen dari Fmt.now() / GAS.
   */
  function _parseDatetime(str) {
    if (!str || typeof str !== 'string') return null;
    str = str.trim();
    // Format "DD/MM/YYYY HH:mm:ss" atau "DD/MM/YYYY HH:mm"
    const r = str.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
    );
    if (r) return { d: +r[1], m: +r[2]-1, y: +r[3], h: +r[4], min: +r[5] };

    // Format "DD MMMM YYYY, HH:mm WIB" (dari GAS)
    const r2 = str.match(
      /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/
    );
    if (r2) {
      const mi = BULAN.findIndex(b => b.toLowerCase() === r2[2].toLowerCase());
      if (mi !== -1) return { d: +r2[1], m: mi, y: +r2[3], h: +r2[4], min: +r2[5] };
    }
    return null;
  }

  /* ══════════════════════════════════════════════════════════
     FORMAT PUBLIK
     ══════════════════════════════════════════════════════════ */

  /**
   * Format tanggal → "03 September 2026"
   * Input: "03/09/2026", "2026-09-03", "03 September 2026", dll.
   */
  function tanggal(input) {
    const p = _parseTanggal(String(input || ''));
    if (p) return `${String(p.d).padStart(2,'0')} ${BULAN[p.m]} ${p.y}`;
    // Fallback: kembalikan apa adanya
    return String(input || '-');
  }

  /**
   * Format tanggal dengan hari → "Kamis, 03 September 2026"
   * Input sama dengan tanggal().
   */
  function tanggalHari(input) {
    const p = _parseTanggal(String(input || ''));
    if (!p) return String(input || '-');
    // Hitung hari dengan Date.UTC agar tidak terpengaruh timezone lokal
    const hari = new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay();
    return `${HARI[hari]}, ${String(p.d).padStart(2,'0')} ${BULAN[p.m]} ${p.y}`;
  }

  /**
   * Format waktu → "08:00 WIB"
   * Input: "08:00", "8:00", "08:00:00", "08:00 WIB",
   *        "03/09/2026 08:00:00" (ambil bagian waktu saja),
   *        "03 September 2026, 08:00 WIB" (dari GAS)
   */
  function waktu(input) {
    if (!input) return '-';
    const s = String(input).trim();

    // Sudah "HH:mm" atau "HH:mm:ss" (mungkin + " WIB")
    const pw = _parseWaktu(s);
    if (pw) return `${String(pw.h).padStart(2,'0')}:${String(pw.min).padStart(2,'0')} WIB`;

    // String datetime — ambil bagian waktu
    const pd = _parseDatetime(s);
    if (pd) return `${String(pd.h).padStart(2,'0')}:${String(pd.min).padStart(2,'0')} WIB`;

    return '-';
  }

  /**
   * Format lengkap → "03 September 2026, 08:00 WIB"
   */
  function lengkap(inputTgl, inputWaktu) {
    if (inputWaktu !== undefined) {
      return `${tanggal(inputTgl)}, ${waktu(inputWaktu)}`;
    }
    return `${tanggal(inputTgl)}, ${waktu(inputTgl)}`;
  }

  /* ══════════════════════════════════════════════════════════
     WAKTU SEKARANG
     ══════════════════════════════════════════════════════════ */

  /**
   * Timestamp sekarang dalam WIB.
   * Format: "DD/MM/YYYY HH:mm:ss"
   * Ini yang disimpan ke DB sebagai waktu absen / createdStr.
   */
  function now() {
    const c = _nowWIBComponents();
    return [
      String(c.d).padStart(2,'0') + '/' +
      String(c.m + 1).padStart(2,'0') + '/' + c.y,
      String(c.h).padStart(2,'0') + ':' +
      String(c.min).padStart(2,'0') + ':' +
      String(c.s).padStart(2,'0')
    ].join(' ');
  }

  /**
   * Tanggal hari ini dalam WIB: "DD/MM/YYYY"
   * Digunakan untuk seed data awal.
   */
  function nowTanggalLokal() {
    const c = _nowWIBComponents();
    return `${String(c.d).padStart(2,'0')}/${String(c.m+1).padStart(2,'0')}/${c.y}`;
  }

  /**
   * Tahun sekarang (WIB).
   */
  function tahun() {
    return _nowWIBComponents().y;
  }

  /* ── PUBLIC API ───────────────────────────────────────────── */
  return {
    tanggal, tanggalHari, waktu, lengkap,
    now, nowTanggalLokal, tahun,
    BULAN, HARI
  };

})();
