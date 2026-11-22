// The box: stored clips and patterns you can drag back onto tracks.
import { ICON } from './icons.js';
import { KIND, pasteItem, readClipboard, storeItem, trackFor } from './clips.js';
import { drawClip } from './draw.js';
import { edit } from './edit.js';
import { COLORS, S, ui } from './state.js';
import { $, h, secs, toast } from './util.js';

export let dragBox = null;
export function renderBox() {
  $('#boxcount').textContent = S.box.length ? String(S.box.length) : '';
  $('#boxlist').replaceChildren(...S.box.map(it => {
    const cv = h('canvas'), len = it.c.buf ? it.c.dur : it.c.len / 16;
    const el = h('div', {
      className: 'bitem', draggable: true, style: `--c:${COLORS[it.color]}`, title: 'Drag onto a track · + pastes at the playhead',
      ondragstart: e => { dragBox = it.id; e.dataTransfer.setData('text/plain', it.name); e.dataTransfer.effectAllowed = 'copy'; },
      ondragend: () => (dragBox = null),
      onpointerdown: e => { el.draggable = !e.target.closest('input'); }, // a draggable parent stops some browsers from placing the caret in the name field
    }, cv,
    h('input', {
      className: 'bname', value: it.name, ariaLabel: 'Pattern name', title: 'Rename', spellcheck: false, maxLength: 40,
      onfocus: () => (el.draggable = false), onblur: () => (el.draggable = true),
      onkeydown: e => e.key === 'Enter' && e.target.blur(),
      onchange: e => edit(() => (it.name = e.target.value.trim() || it.name)),
    }),
    h('span', { className: 'bbtn' },
      h('button', { className: 'cbtn sm', innerHTML: ICON.plus, title: 'Paste at the playhead', ariaLabel: `Paste ${it.name}`, onclick: () => pasteItem(it, trackFor(it.type), ui.pos) }),
      h('button', { className: 'cbtn sm', innerHTML: ICON.x, title: 'Remove from the box', ariaLabel: `Remove ${it.name}`, onclick: () => edit(() => (S.box = S.box.filter(b => b !== it))) })),
    h('small', { textContent: it.clips?.length > 1 ? `${it.clips.length} ${KIND[it.type]} clips` : it.c.buf ? `audio · ${secs(len)}` : `${KIND[it.type]} · ${len} bar${len === 1 ? '' : 's'}` }));
    requestAnimationFrame(() => drawClip(cv, { type: it.type, color: it.color, rows: (it.rows || []).map(id => ({ id })) }, it.c));
    return el;
  }), ...(S.box.length ? [] : [h('div', { className: 'none', textContent: 'Empty. Drag a clip here, or select one and press store clip.' })]));
}
/** ⌘V with the box focused: store the copied clip here. */
export function pasteToBox() {
  const it = readClipboard();
  if (!it) return toast('Nothing copied yet: select a clip and press ⌘C');
  storeItem(it);
}
