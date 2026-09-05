/**
 * canvas.js — Modul Tanda Tangan Digital
 * Mendukung mouse (desktop) dan touch (mobile/tablet)
 */

'use strict';

const SignaturePad = (() => {

  let canvas, ctx, wrap, hint;
  let drawing  = false;
  let hasDrawn = false;
  let lastX = 0, lastY = 0;

  /* ── INIT ────────────────────────────────────────────── */
  function init(canvasId, wrapperId, hintId) {
    canvas = document.getElementById(canvasId);
    wrap   = document.getElementById(wrapperId);
    hint   = document.getElementById(hintId);
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    resize();
    bindEvents();
    window.addEventListener('resize', resize);
  }

  /* ── RESIZE ─────────────────────────────────────────── */
  function resize() {
    if (!canvas) return;
    const prev = hasDrawn ? canvas.toDataURL() : null;

    const rect = canvas.parentElement.getBoundingClientRect();
    const w    = rect.width  || 320;
    const h    = Math.max(150, Math.round(w * 0.38));

    canvas.width  = w;
    canvas.height = h;
    canvas.style.height = h + 'px';

    styleCtx();
    drawBaseLine();

    if (prev) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = prev;
    }
  }

  function styleCtx() {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }

  function drawBaseLine() {
    ctx.save();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth   = 1;
    ctx.setLineDash([5, 4]);
    const y = canvas.height - 28;
    ctx.beginPath();
    ctx.moveTo(18, y);
    ctx.lineTo(canvas.width - 18, y);
    ctx.stroke();
    ctx.restore();
  }

  /* ── EVENTS ─────────────────────────────────────────── */
  function bindEvents() {
    // Mouse
    canvas.addEventListener('mousedown',  onStart);
    canvas.addEventListener('mousemove',  onMove);
    canvas.addEventListener('mouseup',    onStop);
    canvas.addEventListener('mouseleave', onStop);
    // Touch
    canvas.addEventListener('touchstart',  onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',   onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',    onStop);
    canvas.addEventListener('touchcancel', onStop);
  }

  function getXY(e) {
    const r  = canvas.getBoundingClientRect();
    const sx = canvas.width  / r.width;
    const sy = canvas.height / r.height;
    return {
      x: (e.clientX - r.left) * sx,
      y: (e.clientY - r.top)  * sy
    };
  }

  function onStart(e) {
    drawing = true;
    const p = getXY(e);
    lastX = p.x; lastY = p.y;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    hideHint();
  }

  function onMove(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = getXY(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x; lastY = p.y;
    markDrawn();
  }

  function onTouchStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width  / r.width;
    const sy = canvas.height / r.height;
    drawing = true;
    lastX = (t.clientX - r.left) * sx;
    lastY = (t.clientY - r.top)  * sy;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    hideHint();
  }

  function onTouchMove(e) {
    if (!drawing) return;
    e.preventDefault();
    const t  = e.touches[0];
    const r  = canvas.getBoundingClientRect();
    const sx = canvas.width  / r.width;
    const sy = canvas.height / r.height;
    const x  = (t.clientX - r.left) * sx;
    const y  = (t.clientY - r.top)  * sy;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastX = x; lastY = y;
    markDrawn();
  }

  function onStop() { drawing = false; }

  /* ── HELPERS ─────────────────────────────────────────── */
  function hideHint() {
    if (hint) hint.classList.add('hidden');
  }

  function markDrawn() {
    hasDrawn = true;
    if (wrap) {
      wrap.classList.add('active');
      wrap.classList.remove('error');
    }
    const errEl = document.getElementById('sig-error');
    if (errEl) errEl.classList.remove('show');
  }

  function clear() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBaseLine();
    hasDrawn = false;
    if (wrap) { wrap.classList.remove('active', 'error'); }
    if (hint) hint.classList.remove('hidden');
  }

  function getDataURL() {
    if (!hasDrawn) return null;
    return canvas.toDataURL('image/png');
  }

  function isDrawn() { return hasDrawn; }

  function setError() {
    if (wrap) wrap.classList.add('error');
    const errEl = document.getElementById('sig-error');
    if (errEl) errEl.classList.add('show');
  }

  return { init, clear, getDataURL, isDrawn, setError, resize };

})();
