// Selecting, moving, copying and pasting painted tiles (piano-roll notes, drum pads) inside the open pattern.
// Notes are selected by object, pads by "rowId:step". The maths lives in tilemath.js.
import { edit } from './edit.js';
import { HI, LO, T, selClip, ui } from './state.js';
import { drag, h, toast } from './util.js';
import { fitDelta, landNotes, landPads, pack } from './tilemath.js';

export const sel = { cid: null, set: new Set() };
export const view = { mark: null, bar: null }; // the editor sets these each time it builds a grid
export const key = (r, i) => r + ':' + i;
const KEY = 'hum.tiles';
let clip = null, cur = { cid: null, step: 0 }; // cur = where the next paste lands: the last step clicked

export const own = c => { if (sel.cid !== c.id) { sel.cid = c.id; sel.set = new Set(); } };
export const refresh = () => { view.mark?.(); view.bar?.(); };
export const cursor = (c, step) => { cur = { cid: c.id, step }; };
export const touches = (el, r) => { const b = el.getBoundingClientRect(); return b.right >= r.l && b.left <= r.r && b.bottom >= r.t && b.top <= r.b; };

const everyPad = (t, c) => t.rows.flatMap((row, ri) => (c.steps[row.id] || []).flatMap((on, i) => (on && i < c.len ? [{ t: i, n: ri, r: row.id }] : [])));
/** Selected tiles of this pattern: notes, or pads as { t: step, n: row index, r: row id }. */
export function selected(t, c) {
  if (sel.cid !== c.id) return [];
  return t.type === 'inst' ? c.notes.filter(n => sel.set.has(n)) : everyPad(t, c).filter(p => sel.set.has(key(p.r, p.t)));
}
export function clear() { if (!sel.set.size) return; sel.set = new Set(); refresh(); }
export function selectAll(t, c) { own(c); sel.set = new Set(t.type === 'inst' ? c.notes : everyPad(t, c).map(p => key(p.r, p.t))); refresh(); }

/** Drag a box to select, additive. A plain click on a tile (tkey) toggles just that tile. */
export function marquee(e, hits, tkey) {
  const x0 = e.clientX, y0 = e.clientY, base = new Set(sel.set), box = h('div', { className: 'marq' });
  let moved = false;
  drag(ev => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
    if (!moved) { moved = true; document.body.append(box); }
    const r = { l: Math.min(x0, ev.clientX), t: Math.min(y0, ev.clientY), r: Math.max(x0, ev.clientX), b: Math.max(y0, ev.clientY) };
    box.style.cssText = `left:${r.l}px;top:${r.t}px;width:${r.r - r.l}px;height:${r.b - r.t}px`;
    sel.set = new Set([...base, ...hits(r)]); refresh();
  }, () => {
    box.remove();
    if (!moved && tkey != null) { sel.set = base; sel.set.has(tkey) ? sel.set.delete(tkey) : sel.set.add(tkey); refresh(); }
  });
}

/** Rewrites the pads of `items` (taken from `base`, a copy of c.steps) moved by (di steps, dr rows), and selects them in their new place. */
export function movePads(t, c, items, base, di, dr) {
  const [fi, fr] = fitDelta(items, di, dr, c.len - 1, 0, t.rows.length - 1);
  c.steps = JSON.parse(JSON.stringify(base));
  for (const p of items) c.steps[p.r][p.t] = 0;
  const to = items.map(p => ({ r: t.rows[p.n + fr].id, t: p.t + fi }));
  for (const p of to) (c.steps[p.r] ||= [])[p.t] = 1;
  sel.set = new Set(to.map(p => key(p.r, p.t)));
}
export function nudge(t, c, dt, dn) {
  const items = selected(t, c);
  if (!items.length) return;
  if (t.type === 'inst') {
    const [a, b] = fitDelta(items, dt, dn, c.len - 1, LO, HI);
    if (a || b) edit(() => items.forEach(n => { n.t += a; n.n += b; }));
  } else {
    const base = JSON.parse(JSON.stringify(c.steps));
    edit(() => movePads(t, c, items, base, dt, dn));
  }
}
export function del(t, c) {
  const items = selected(t, c);
  if (!items.length) return;
  edit(() => { if (t.type === 'inst') c.notes = c.notes.filter(n => !sel.set.has(n)); else for (const p of items) c.steps[p.r][p.t] = 0; sel.set = new Set(); });
}

const readClip = () => { try { return JSON.parse(localStorage.getItem(KEY)) || clip; } catch { return clip; } }; // shared between tabs like clips are
export function copy(t, c, cut) {
  const items = selected(t, c);
  if (!items.length) return toast('Select some tiles first: shift-drag a box around them');
  const { items: rel, span } = pack(items.map(i => (t.type === 'inst' ? { t: i.t, d: i.d, n: i.n } : { t: i.t, r: i.r, ri: i.n })));
  clip = { kind: t.type === 'inst' ? 'notes' : 'pads', items: rel };
  try { localStorage.setItem(KEY, JSON.stringify(clip)); } catch { /* this tab only */ }
  cur = { cid: c.id, step: Math.min(c.len - 1, Math.min(...items.map(i => i.t)) + span) }; // paste right after what was copied
  toast(`${cut ? 'Cut' : 'Copied'} ${items.length} tile${items.length > 1 ? 's' : ''}. ⌘V pastes at the last step you clicked`);
  if (cut) del(t, c); else refresh();
}
export function paste(t, c) {
  const it = readClip();
  if (!it) return toast('Nothing copied yet: select tiles and press ⌘C');
  const notes = t.type === 'inst';
  if ((it.kind === 'notes') !== notes) return toast(`Those are ${it.kind === 'notes' ? 'notes' : 'drum steps'}: open a ${it.kind === 'notes' ? 'melody' : 'drum'} pattern to paste them`);
  const at = cur.cid === c.id ? cur.step : 0, span = pack(it.items).span;
  let dropped = 0;
  edit(() => {
    if (notes) { const r = landNotes(it.items, at, c.len); c.notes.push(...r.notes); dropped = r.dropped; sel.set = new Set(r.notes); }
    else { const r = landPads(it.items, at, c.len, t.rows.map(x => x.id)); for (const p of r.pads) (c.steps[p.r] ||= [])[p.t] = 1; dropped = r.dropped; sel.set = new Set(r.pads.map(p => key(p.r, p.t))); }
    sel.cid = c.id;
  });
  cur = { cid: c.id, step: at + span }; // paste again to chain
  if (dropped) toast(`${dropped} tile${dropped > 1 ? 's' : ''} fell off the end of the pattern. Drag its right edge in the timeline for more bars`, 5000);
}

/** The strip above the grid. */
export function bar(t, c) {
  const btn = (label, title, fn) => h('button', { className: 'btn sm', textContent: label, title, onclick: fn });
  const count = h('span', { className: 'lab' }), b = {
    copy: btn('copy', 'Copy the selected tiles (Ctrl/⌘ C)', () => copy(t, c)), cut: btn('cut', 'Cut the selected tiles (Ctrl/⌘ X)', () => copy(t, c, true)),
    paste: btn('paste', 'Paste at the last step you clicked (Ctrl/⌘ V)', () => paste(t, c)), del: btn('delete', 'Delete the selected tiles (Delete)', () => del(t, c)),
  };
  view.bar = () => { const n = selected(t, c).length; count.textContent = n ? `${n} selected` : ''; b.copy.disabled = b.cut.disabled = b.del.disabled = !n; b.paste.disabled = !readClip(); };
  return h('div', { className: 'tbar' }, btn('select all', 'Select every tile (Ctrl/⌘ A)', () => selectAll(t, c)), b.copy, b.cut, b.paste, b.del, count,
    h('span', { className: 'grow' }), h('span', { className: 'lab', textContent: 'shift-drag to select · drag to move · arrows nudge' }));
}

/** Keys for the open pattern. Only when the last click was inside the grid, so the timeline keeps ⌘C/⌘V for clips. Returns true when it used the key. */
addEventListener('pointerdown', e => { ui.edFocus = !!e.target.closest?.('.roll, .steps'); }, true);
export function tileKey(e, mod, k) {
  const t = T(ui.tid), c = selClip();
  if (!ui.edFocus || !t || !c || t.type === 'audio') return false;
  const some = selected(t, c).length > 0;
  if (mod && k === 'a') selectAll(t, c);
  else if (mod && (k === 'c' || k === 'x') && some) copy(t, c, k === 'x');
  else if (mod && k === 'v' && readClip()) paste(t, c);
  else if (!mod && some && (k === 'delete' || k === 'backspace')) del(t, c);
  else if (!mod && some && k === 'escape') clear();
  else if (!mod && some && k.startsWith('arrow')) {
    const up = t.type === 'inst' ? 1 : -1, big = e.shiftKey;
    nudge(t, c, k === 'arrowleft' ? (big ? -16 : -1) : k === 'arrowright' ? (big ? 16 : 1) : 0, k === 'arrowup' ? up * (big && t.type === 'inst' ? 12 : 1) : k === 'arrowdown' ? -up * (big && t.type === 'inst' ? 12 : 1) : 0);
  } else return false;
  return true;
}
