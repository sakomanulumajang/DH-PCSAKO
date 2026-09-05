/**
 * pdf.js — Modul Unduh PDF Daftar Hadir
 *
 * Layout halaman:
 *   - Kop surat: logo (dari setting.logo_url) + nama instansi + alamat
 *   - Judul "DAFTAR HADIR"
 *   - Info kegiatan (nama, tanggal, waktu, lokasi, jumlah)
 *   - Statistik per jabatan
 *   - Tabel: No | Nama | Jabatan | Tanda Tangan
 *   - Blok penandatangan:
 *       Ada pimpinan  → Kepala (kiri) | Pimpinan Rapat (kanan)
 *       Tanpa pimpinan → Kepala saja, posisi tengah agak kanan (60% dari kiri)
 *   - Tidak ada footer "dicetak oleh...", tidak ada kolom waktu absen,
 *     tidak ada garis di ruang tanda tangan kepala/pimpinan.
 *
 * Bergantung pada: utils.js (Fmt)
 */

'use strict';

const PDFExport = (() => {

  const LOGO_DEFAULT = 'https://i.ibb.co.com/8Dp1r5wm/sako-Maarif-NU-logo.png';

  /* ── ENTRY POINT ─────────────────────────────────────────── */
  async function cetakDaftarHadir({ kegiatan, hadir, setting }) {
    const html = buildHTML({ kegiatan, hadir, setting });
    triggerPrint(html);
  }

  /* ── BUILD HTML ──────────────────────────────────────────── */
  function buildHTML({ kegiatan, hadir, setting }) {
    const namaSekolah = setting?.nama_sekolah    || 'Instansi';
    const alamat      = setting?.alamat          || '';
    const kota        = setting?.kota            || '';
    const warna       = setting?.warna_primer    || '#9e5400';
    const logoUrl     = setting?.logo_url        || LOGO_DEFAULT;

    const kepala      = (setting?.kepala_madrasah || 'SAHRONI, S.Pd.').trim();
    const pimpinan    = (setting?.pimpinan_rapat  || '').trim();
    const adaPimpinan = pimpinan.length > 0;

    // Info kegiatan
    const tglKgt      = Fmt.tanggalHari(kegiatan.tanggal);
    // Waktu langsung dari field waktu kegiatan (bukan waktu absen)
    const waktuKgt    = kegiatan.waktu ? Fmt.waktu(kegiatan.waktu) : '';
    const jumlah      = hadir.length;
    const kotaTanggal = (kota ? kota + ', ' : '') + Fmt.tanggal(kegiatan.tanggal);

    // Urutan presensi dari setting.jabatan_list (satu per baris)
    // Baris kosong dan baris separator (---) diabaikan
    const jabatanRaw  = String(setting?.jabatan_list || '');
    const URUTAN_JABATAN = jabatanRaw
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !/^[-=]{3,}$/.test(s));

    function urutanIdx(jabatan) {
      const idx = URUTAN_JABATAN.indexOf(jabatan);
      return idx === -1 ? 999 : idx;
    }

    // Sort hadir sesuai urutan jabatan
    const hadirUrut = [...hadir].sort((a, b) => {
      const diff = urutanIdx(a.jabatan) - urutanIdx(b.jabatan);
      if (diff !== 0) return diff;
      return (a.nama || '').localeCompare(b.nama || '', 'id');
    });

    // Statistik — hitung dinamis dari jabatan_list, Wakabid digabung
    const stat = { total: hadir.length };
    URUTAN_JABATAN.forEach(j => {
      const key = j.startsWith('Wakabid') ? 'Wakabid' : j;
      if (stat[key] === undefined) stat[key] = 0;
    });
    hadir.forEach(h => {
      const j   = h.jabatan || '';
      const key = j.startsWith('Wakabid') ? 'Wakabid' : j;
      if (stat[key] !== undefined) stat[key]++;
      else stat[key] = (stat[key] || 0) + 1;
    });

    // Kunci unik untuk ditampilkan (urutan sesuai URUTAN_JABATAN → lalu sisanya)
    const statKeyOrder = [];
    URUTAN_JABATAN.forEach(j => {
      const key = j.startsWith('Wakabid') ? 'Wakabid' : j;
      if (!statKeyOrder.includes(key)) statKeyOrder.push(key);
    });
    Object.keys(stat).forEach(k => {
      if (k !== 'total' && !statKeyOrder.includes(k)) statKeyOrder.push(k);
    });

    const STAT_COLORS = ['#4a148c','#1a237e','#01579b','#1967d2','#e65100','#2e7d32','#7b1fa2','#880e4f','#4e342e','#37474f'];

    /* ── BLOK PENANDATANGAN ──────────────────────────────────
     * Ada pimpinan  → flex space-between, masing-masing 44%
     * Tanpa pimpinan → flex justify center, blok tunggal 52%
     *   posisi "agak ke kanan" → margin-left: 48%
     * ──────────────────────────────────────────────────────── */
    const blokKepala2 = `
      <div class="ttd-blok">
        <div class="ttd-lbl-atas">Mengetahui,</div>
        <div class="ttd-jabatan">Kepala Madrasah</div>
        <div class="ttd-ruang"></div>
        <div class="ttd-nama">${escH(kepala)}</div>
      </div>`;

    const blokPimpinan2 = `
      <div class="ttd-blok">
        <div class="ttd-lbl-atas">${escH(kotaTanggal)}</div>
        <div class="ttd-jabatan">Pimpinan Rapat</div>
        <div class="ttd-ruang"></div>
        <div class="ttd-nama">${escH(pimpinan)}</div>
      </div>`;

    // Kepala saja — rata tengah agak kanan (margin-left 48% supaya condong kanan)
    const blokKepalaOnly = `
      <div class="ttd-blok ttd-blok-only">
        <div class="ttd-lbl-atas">${escH(kotaTanggal)}</div>
        <div class="ttd-jabatan">Mengetahui,<br>Kepala Madrasah</div>
        <div class="ttd-ruang"></div>
        <div class="ttd-nama">${escH(kepala)}</div>
      </div>`;

    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Daftar Hadir — ${escH(kegiatan.judul)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Arial', sans-serif;
    font-size: 11pt;
    color: #111;
    background: #fff;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 15mm 18mm 18mm;
    margin: 0 auto;
    background: #fff;
  }

  /* ── KOP ──────────────────────────────────────── */
  .kop {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-bottom: 10px;
    border-bottom: 3px solid ${escH(warna)};
    margin-bottom: 10px;
  }
  .kop-logo {
    width: 58px;
    height: 58px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .kop-logo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .kop-text h1 {
    font-size: 14pt;
    font-weight: 700;
    color: ${escH(warna)};
    line-height: 1.2;
  }
  .kop-text p {
    font-size: 9pt;
    color: #555;
    margin-top: 2px;
  }

  /* ── JUDUL ────────────────────────────────────── */
  .doc-title {
    text-align: center;
    margin: 12px 0 8px;
  }
  .doc-title h2 {
    font-size: 13pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    border-bottom: 1.5px solid #333;
    display: inline-block;
    padding-bottom: 3px;
  }

  /* ── INFO KEGIATAN ────────────────────────────── */
  .info-table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0;
    font-size: 10.5pt;
  }
  .info-table td { padding: 3px 6px; vertical-align: top; }
  .info-table td:first-child {
    font-weight: 600;
    width: 130px;
    white-space: nowrap;
  }
  .info-table td:nth-child(2) { width: 12px; }

  /* ── STATISTIK ────────────────────────────────── */
  .stat-row {
    display: flex;
    gap: 7px;
    margin: 10px 0 12px;
  }
  .stat-box {
    flex: 1;
    border: 1.5px solid ${escH(warna)};
    border-radius: 5px;
    padding: 5px 6px;
    text-align: center;
  }
  .stat-box .num {
    font-size: 15pt;
    font-weight: 800;
    color: ${escH(warna)};
    line-height: 1.2;
  }
  .stat-box .lbl {
    font-size: 8pt;
    color: #666;
    margin-top: 1px;
  }

  /* ── TABEL HADIR ──────────────────────────────── */
  .hadir-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    margin-bottom: 22px;
    page-break-inside: auto;
  }
  .hadir-table thead th {
    background: ${escH(warna)};
    color: #fff;
    padding: 7px 8px;
    text-align: left;
    font-size: 10pt;
    font-weight: 700;
  }
  .hadir-table thead th:nth-child(1) { width: 30px; text-align: center; }
  .hadir-table thead th:nth-child(4) { width: 100px; text-align: center; }
  .hadir-table thead th:nth-child(5) { width: 110px; }
  .hadir-table tbody td {
    padding: 6px 8px;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: middle;
  }
  .hadir-table tbody tr:nth-child(even) td { background: #f9fafb; }
  .hadir-table tbody td:nth-child(1) {
    text-align: center;
    color: #888;
    font-size: 9pt;
  }
  .ttd-cell { text-align: center; padding: 3px 6px !important; }
  .ttd-cell img {
    max-width: 100px;
    max-height: 46px;
    object-fit: contain;
    display: block;
    margin: 0 auto;
  }
  .ttd-cell .no-ttd {
    font-size: 9pt;
    color: #ccc;
    border: 1px dashed #e0e0e0;
    border-radius: 4px;
    padding: 5px 0;
    width: 100px;
    margin: 0 auto;
    text-align: center;
  }

  /* ── BLOK PENANDATANGAN ───────────────────────── */
  .ttd-footer {
    margin-top: 26px;
    page-break-inside: avoid;
  }
  /* 2 kolom */
  .ttd-footer-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  /* 1 kolom (hanya kepala) → tengah agak kanan */
  .ttd-footer-row.single {
    justify-content: flex-end;
    padding-right: 4%;
  }
  .ttd-blok {
    width: 44%;
    text-align: center;
    font-size: 10.5pt;
  }
  /* Blok tunggal kepala saja: sedikit lebih lebar, posisi sudah diatur oleh flex-end */
  .ttd-blok.ttd-blok-only {
    width: 48%;
  }
  .ttd-lbl-atas {
    font-size: 10.5pt;
    color: #333;
    margin-bottom: 3px;
    min-height: 1.4em;
  }
  .ttd-jabatan {
    font-size: 10.5pt;
    font-weight: 700;
    line-height: 1.5;
    margin-bottom: 2px;
  }
  /* TANPA garis — ruang kosong untuk tanda tangan fisik */
  .ttd-ruang {
    height: 58px;
    /* tidak ada border-bottom sama sekali */
  }
  .ttd-nama {
    font-size: 10.5pt;
    font-weight: 700;
    text-decoration: underline;
    margin-top: 0;
  }

  @page { size: A4 portrait; margin: 0; }
  @media print {
    body { padding: 0; }
    .page { padding: 12mm 16mm 14mm; }
    .hadir-table tbody tr { page-break-inside: avoid; }
    .ttd-footer { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- KOP SURAT -->
  <div class="kop">
    <div class="kop-logo">
      <img src="${escH(logoUrl)}" alt="Logo" onerror="this.style.display='none'">
    </div>
    <div class="kop-text">
      <h1>${escH(namaSekolah)}</h1>
      ${alamat ? `<p>${escH(alamat)}</p>` : ''}
    </div>
  </div>

  <!-- JUDUL DOKUMEN -->
  <div class="doc-title"><h2>Daftar Hadir</h2></div>

  <!-- INFO KEGIATAN -->
  <table class="info-table">
    <tr>
      <td>Kegiatan</td><td>:</td>
      <td><strong>${escH(kegiatan.judul)}</strong></td>
    </tr>
    <tr>
      <td>Tanggal</td><td>:</td>
      <td>${escH(tglKgt)}</td>
    </tr>
    ${waktuKgt ? `
    <tr>
      <td>Waktu</td><td>:</td>
      <td>${escH(waktuKgt)}</td>
    </tr>` : ''}
    ${kegiatan.lokasi ? `
    <tr>
      <td>Lokasi</td><td>:</td>
      <td>${escH(kegiatan.lokasi)}</td>
    </tr>` : ''}
    <tr>
      <td>Jumlah Hadir</td><td>:</td>
      <td><strong>${jumlah} orang</strong></td>
    </tr>
  </table>

  <!-- STATISTIK — hanya tampil jika > 0, Wakabid digabung -->
  <div class="stat-row">
    <div class="stat-box">
      <div class="num">${jumlah}</div><div class="lbl">Total</div>
    </div>
    ${statKeyOrder.filter(k => stat[k] > 0).map((k, i) => `
    <div class="stat-box">
      <div class="num" style="color:${escH(STAT_COLORS[i % STAT_COLORS.length])}">${stat[k]}</div>
      <div class="lbl">${escH(k)}</div>
    </div>`).join('')}
  </div>

  <!-- TABEL DAFTAR HADIR (urutan jabatan, tanpa kolom waktu absen) -->
  <table class="hadir-table">
    <thead>
      <tr>
        <th>No</th>
        <th>Nama</th>
        <th>Jabatan</th>
        <th>Tanda Tangan</th>
        <th>Keterangan</th>
      </tr>
    </thead>
    <tbody>
      ${hadirUrut.map((h, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escH(h.nama)}</td>
        <td>${escH(h.jabatan)}</td>
        <td class="ttd-cell">
          ${h.ttd
            ? `<img src="${h.ttd}" alt="TTD ${escH(h.nama)}">`
            : '<div class="no-ttd">—</div>'
          }
        </td>
        <td style="font-size:9pt;color:#444;">${escH(h.keterangan || '')}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <!-- BLOK PENANDATANGAN -->
  <div class="ttd-footer">
    ${adaPimpinan
      ? `<div class="ttd-footer-row">
           ${blokKepala2}
           ${blokPimpinan2}
         </div>`
      : `<div class="ttd-footer-row single">
           ${blokKepalaOnly}
         </div>`
    }
  </div>

</div><!-- /page -->
</body>
</html>`;
  }

  /* ── TRIGGER PRINT via iframe ────────────────────────────── */
  function triggerPrint(html) {
    const old = document.getElementById('__pdf_iframe');
    if (old) old.remove();

    const iframe = document.createElement('iframe');
    iframe.id    = '__pdf_iframe';
    iframe.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    iframe.contentWindow.onload = () => {
      const imgs  = iframe.contentDocument.querySelectorAll('img');
      let loaded  = 0;
      const total = imgs.length;

      function doPrint() {
        setTimeout(() => {
          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          } catch (e) {
            console.error('Print gagal:', e);
          }
        }, 400);
      }

      if (total === 0) {
        doPrint();
      } else {
        imgs.forEach(img => {
          if (img.complete) {
            loaded++;
            if (loaded === total) doPrint();
          } else {
            img.onload  = () => { loaded++; if (loaded === total) doPrint(); };
            img.onerror = () => { loaded++; if (loaded === total) doPrint(); };
          }
        });
        // Safety: cetak setelah 5 detik meski ada img yang lambat
        setTimeout(doPrint, 5000);
      }
    };
  }

  /* ── ESCAPE HTML ─────────────────────────────────────────── */
  function escH(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { cetakDaftarHadir };

})();
