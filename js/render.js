// Full render and the per-frame animation (playhead, meter).
import * as E from './engine.js';
import { renderBox } from './box.js';
import { ed, renderEditor } from './editor.js';
import { renderLib } from './library.js';
import { HEAD, S, SW, T, selClip, ui } from './state.js';
import { playhead, renderArr, renderTop } from './timeline.js';
import { $, clock } from './util.js';

export function render() {
  if (!T(ui.tid)) { ui.tid = S.tracks[0]?.id ?? null; ui.cid = null; }
  if (!selClip()) ui.cid = null;
  const ids = new Set(T(ui.tid)?.clips.map(c => c.id)); ui.sel = new Set([...ui.sel].filter(id => ids.has(id)));
  if (!ui.cid) ui.sel.clear(); else if (!ui.sel.has(ui.cid)) ui.sel = new Set([ui.cid]); // cid changed elsewhere: selection follows it
  renderTop(); renderArr(); renderEditor(); renderLib(); renderBox();
}
const meter = $('#meter'), mg = meter.getContext('2d'), bins = new Uint8Array(E.analyser.frequencyBinCount);
let lastStep = -2;
let running = false;
/** The animation loop stops itself while the project screen covers the editor; call this when the editor shows again. */
export function startFrames() { if (!running) { running = true; requestAnimationFrame(frame); } }
function frame() {
  if (!$('#pm').hidden) { running = false; return; }
  const live = E.position(), pos = live ?? ui.pos, st = live === null ? -1 : Math.floor(pos), sc = $('#scroll'), p = Math.floor(pos), c = selClip();
  playhead.style.transform = `translateX(${HEAD + pos * ui.sp}px)`;
  if (live !== null) { const x = pos * ui.sp; if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - HEAD - 30) sc.scrollLeft = x - 30; }
  $('#time').textContent = `${(p >> 4) + 1}.${((p >> 2) & 3) + 1}.${(p & 3) + 1}`;
  if (st !== lastStep) { // light up the current column of the step grid and its LED
    lastStep = st;
    for (const el of ed.querySelectorAll('.now')) el.classList.remove('now');
    if (c && st >= 0) for (const el of ed.querySelectorAll(`.steps [data-i="${st - c.start}"]`)) el.classList.add('now');
  }
  const line = ed.querySelector('.rpos');
  if (line && c) {
    const rel = pos - c.start, len = E.clipLen(c, S);
    line.hidden = rel < 0 || rel > len;
    line.style.left = c.buf ? (rel / len) * 100 + '%' : rel * SW + 'px';
    if (c.buf) line.dataset.t = clock(Math.max(0, rel) * E.stepSec(S));
  }
  E.analyser.getByteFrequencyData(bins);
  mg.clearRect(0, 0, meter.width, meter.height); mg.fillStyle = '#d6d6d1';
  for (let i = 0; i < 32; i++) { const v = Math.max(2, (bins[i + 1] / 255) * meter.height); mg.fillRect(i * 6, meter.height - v, 4, v); }
  requestAnimationFrame(frame);
}
