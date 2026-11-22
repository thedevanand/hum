// The sound library pane: search, preview, drag.
import * as E from './engine.js';
import { fxDrop } from './fxpanel.js';
import { ICON } from './icons.js';
import { addSound } from './clips.js';
import { LIB, LIBMAP, S, T, info, mini, soundName, ui } from './state.js';
import { $, clock, h, toast } from './util.js';

export let dragId = null;
export function renderLib() {
  const cats = [...new Set(LIB.map(s => s.cat)), 'Mine'], drumsSel = T(ui.tid)?.type === 'drums';
  $('#cats').replaceChildren(...cats.map(cat => h('button', { className: 'tag' + (cat === ui.cat && !ui.q ? ' on' : ''), textContent: cat, ariaPressed: cat === ui.cat && !ui.q, onclick: () => { ui.cat = cat; ui.q = $('#q').value = ''; renderLib(); } })));
  const q = ui.q.toLowerCase(), list = [...LIBMAP.keys(), ...Object.keys(S.sounds)].filter(id => (q ? soundName(id).toLowerCase().includes(q) : info(id).cat === ui.cat));
  $('#sounds').replaceChildren(...list.map(id => {
    const { dur, peaks } = info(id), on = ui.previewing === id;
    const toggle = () => {
      if (on) return E.stopPreview();
      ui.previewing = id; renderLib();
      E.preview(id, () => { if (ui.previewing === id) { ui.previewing = null; renderLib(); } }).catch(() => toast('Could not load that sound'));
    };
    return h('div', {
      ...fxDrop(() => ({ scope: 'media', sid: id })), className: 'snd' + (on ? ' playing' : ''), draggable: true, tabIndex: 0, role: 'button', ariaLabel: `Preview ${soundName(id)}`, title: 'Click to preview · drag onto the timeline',
      onclick: toggle, onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) toggle(); },
      ondragstart: e => { dragId = id; e.dataTransfer.setData('text/plain', soundName(id)); e.dataTransfer.effectAllowed = 'copy'; },
      ondragend: () => (dragId = null),
    }, h('span', { className: 'tile', innerHTML: on ? ICON.stop : ICON.play }),
    h('b', { textContent: soundName(id) }), h('small', { textContent: dur ? (dur < 10 ? dur.toFixed(1) + 's' : clock(dur)) : '' }),
    h('span', { innerHTML: mini(peaks) }),
    h('button', {
      className: 'cbtn sm add', innerHTML: ICON.plus, title: drumsSel ? 'Add to the selected drum track' : 'Add to the timeline at the playhead', ariaLabel: `Add ${soundName(id)}`,
      onclick: e => { e.stopPropagation(); addSound(id); },
    }));
  }), ...(list.length ? [] : [h('div', { className: 'none', textContent: q ? 'No sound matches that search.' : 'Your recordings and imported files show up here.' })]));
}
