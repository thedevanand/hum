// Canvas drawing: waveforms and pattern thumbnails.
import * as E from './engine.js';
import { COLORS, S } from './state.js';
import { $, clamp } from './util.js';

const fit = cv => {
  const r = devicePixelRatio || 1;
  cv.width = clamp(cv.clientWidth * r, 1, 8192); cv.height = Math.max(1, cv.clientHeight * r);
  return cv.getContext('2d');
};
export function drawWave(cv, buf, off, dur, color) {
  const g = fit(cv), W = cv.width, H = cv.height, d = buf.getChannelData(0), r = devicePixelRatio || 1;
  const bar = 2 * r, pitch = 3 * r, n = Math.floor(W / pitch), a = off * buf.sampleRate, per = (dur * buf.sampleRate) / n, stride = Math.max(1, Math.floor(per / 80));
  g.fillStyle = color;
  for (let x = 0; x < n; x++) {
    let peak = 0;
    for (let i = Math.floor(a + x * per), end = Math.min(d.length, i + per); i < end; i += stride) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
    const hh = Math.max(r, peak * H * 0.92);
    g.fillRect(x * pitch, (H - hh) / 2, bar, hh);
  }
}
export function drawClip(cv, t, c) {
  if (!cv.isConnected) return;
  const color = COLORS[t.color];
  if (c.buf) { const buf = E.clipBuffer(c, S); if (buf) drawWave(cv, buf, c.off, c.dur, color); else fit(cv); return; }
  const g = fit(cv), W = cv.width, H = cv.height, sw = W / c.len, r = devicePixelRatio || 1;
  g.fillStyle = color;
  const box = (x, y, w, hh) => g.fillRect(x, y, Math.max(2 * r, w), Math.max(2 * r, hh));
  if (t.type === 'drums') {
    const rh = H / Math.max(4, t.rows.length);
    t.rows.forEach((row, ri) => (c.steps[row.id] || []).forEach((on, i) => on && i < c.len && box(i * sw + r, ri * rh + r, sw - 2 * r, rh - 2 * r)));
  } else if (c.notes.length) {
    const lo = Math.min(...c.notes.map(n => n.n)) - 1, hi = Math.max(...c.notes.map(n => n.n)) + 1, rh = Math.min(5 * r, H / (hi - lo + 1));
    for (const n of c.notes) if (n.t < c.len) box(n.t * sw + r, ((hi - n.n) / (hi - lo + 1)) * H, Math.min(n.d, c.len - n.t) * sw - 2 * r, rh);
  }
}
export const redrawClip = (t, c) => { const cv = document.querySelector(`.clip[data-cid="${c.id}"] canvas`); if (cv) drawClip(cv, t, c); };
