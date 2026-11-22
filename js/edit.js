// Undo, redo, change notification, and clip selection.
import * as E from './engine.js';
import { renderEditor } from './editor.js';
import { renderLib } from './library.js';
import { render } from './render.js';
import { S, T, looping, redo, setS, ui, undo } from './state.js';
import { loadAssets, save } from './storage.js';
import { toast } from './util.js';

export function snap() { if (S.meta) S.meta.modified = new Date().toISOString(); undo.push(JSON.stringify(S)); if (undo.length > 80) undo.shift(); redo.length = 0; }
export function travel(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(S)); setS(JSON.parse(from.pop()));
  loadAssets().then(() => changed());
}
/** Call after touching S. soft = the DOM already shows the change. */
export function changed(soft) {
  E.eng.S = S; E.eng.loop = looping(); E.applyMix(E.live, S); save();
  if (E.needsDerive(S)) {
    toast('Processing audio…', 60000);
    setTimeout(() => { E.syncDerived(S); toast(''); render(); }, 40); // let the toast paint first
  } else E.syncDerived(S);
  if (!soft) render();
}
export const edit = fn => { snap(); fn(); changed(); };

export function select(tid, cid = null) {
  if (ui.tid === tid && ui.cid === cid && ui.sel.size <= 1) return;
  ui.tid = tid; ui.cid = cid; ui.wsel = null; ui.sel = new Set(cid ? [cid] : []);
  for (const el of document.querySelectorAll('.track')) el.classList.toggle('sel', el.dataset.tid === tid);
  markSel(); renderEditor(); renderLib();
}
export const markSel = () => { for (const el of document.querySelectorAll('.clip')) el.classList.toggle('sel', ui.sel.has(el.dataset.cid)); };
/** Selected clips of the current track, left to right. */
export const selClips = () => (T(ui.tid)?.clips || []).filter(c => ui.sel.has(c.id)).sort((a, b) => a.start - b.start);
/** ⌘/ctrl-click toggles a clip in the selection, shift-click selects everything from the last clicked clip to this one. */
export function multiSelect(t, c, shift) {
  if (shift && ui.cid) {
    const order = [...t.clips].sort((a, b) => a.start - b.start), a = order.findIndex(x => x.id === ui.cid), b = order.indexOf(c);
    ui.sel = new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1).map(x => x.id)); ui.cid = c.id;
  } else if (ui.sel.has(c.id)) { ui.sel.delete(c.id); if (ui.cid === c.id) ui.cid = [...ui.sel].pop() ?? null; }
  else { ui.sel.add(c.id); ui.cid = c.id; }
  ui.wsel = null; markSel(); renderEditor();
}
export function seek(step) {
  if (step === ui.pos) return;
  ui.pos = step;
  if (E.playing()) E.play(step);
}
