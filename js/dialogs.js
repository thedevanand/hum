// Dialogs: preferences (theme, project settings, defaults), credits, changelog and shortcuts.
import * as E from './engine.js';
import { changed, edit } from './edit.js';
import { exportHum, fmtDate, libRefs, mb, wavBytes } from './hum.js';
import { openMedia } from './media.js';
import { CHANGELOG } from './changelog.js';
import { render, readColors } from './render.js';
import { THEMES, setTheme } from './theme.js';
import { APP, FORMAT, G, KEYS, S, info, looping, saveG } from './state.js';
import { customIds, missingIds } from './storage.js';
import { syncTransport } from './timeline.js';
import { $, clamp, clock, h, toast } from './util.js';
import { safeCover } from './humfile.js';

export function modal(title, ...kids) {
  const close = () => dlg.remove();
  const dlg = h('div', { className: 'dlg', data: { t: title }, onclick: e => e.target === dlg && close(), onkeydown: e => e.key === 'Escape' && close() },
    h('div', { className: 'dbox wide', role: 'dialog', ariaLabel: title },
      h('div', { className: 'dttl' }, title, h('span', { className: 'grow' }), h('button', { className: 'btn sm', textContent: 'close', onclick: close })),
      h('div', { className: 'sbody' }, ...kids)));
  document.body.append(dlg); (dlg.querySelector('input, textarea') || dlg.querySelector('button'))?.focus(); // focus inside so Esc works
  return close;
}
export const fld = (label, el, hint) => h('label', { className: 'fld' }, label, el, hint && h('small', { className: 'lab', textContent: hint }));
const numBox = (value, placeholder, set) => h('input', { type: 'number', min: 0, max: 64, step: 1, value, placeholder, onchange: e => set(e.target.value) });

export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'ctrl ';
const link = (text, href) => h('a', { href, target: '_blank', rel: 'noopener', textContent: text });
/** "made with ❤️ by Anand Raj", the name linking to the portfolio. */
export const madeBy = () => h('div', { className: 'madeby' }, 'made with ', h('span', { role: 'img', ariaLabel: 'love', textContent: '❤️' }), ' by ', link('Anand Raj', 'https://anand.thedevs.in'));
// keep CREDITS.md (the repo's copy) in step with this list
const CREDITS = [
  ['Drums, loops, bass, textures', 'sounds/Kicks/ … sounds/Textures/', [
    'From the sample set shipped with ', link('Sonic Pi', 'https://github.com/sonic-pi-net/sonic-pi/tree/dev/etc/samples'), '. All are public domain under ', link('Creative Commons 0', 'http://creativecommons.org/publicdomain/zero/1.0/'),
    '. They come from freesound.org; the links to each original are in Sonic Pi\'s ', link('samples README', 'https://github.com/sonic-pi-net/sonic-pi/blob/dev/etc/samples/README.md'), '. No attribution is required.']],
  ['Piano and flute notes', 'sounds/_inst/', [
    'Rendered from the FluidR3_GM soundfont by Frank Wen, taken from ', link('midi-js-soundfonts', 'https://github.com/gleitz/midi-js-soundfonts'), '. Licensed ', link('Creative Commons Attribution 3.0', 'https://creativecommons.org/licenses/by/3.0/us/'), '. ',
    h('b', { textContent: 'Attribution is required' }), ': this credit stays visible in the product.']],
  ['Font', 'fonts/', ['Geist Mono, from ', link('Fontsource', 'https://fontsource.org'), ', under the ', link('SIL Open Font License 1.1', 'https://openfontlicense.org'), ': free to use and bundle, the font itself may not be sold.']],
  ['Icons', 'js/icons.js', [link('Phosphor Icons', 'https://phosphoricons.com'), ', MIT license.']],
];
export function openCredits() {
  modal('credits', h('div', { className: 'cred' },
    h('p', { className: 'lab', textContent: `hum ${APP.version}. Everything bundled with this app that someone else made.` }),
    ...CREDITS.flatMap(([title, where, text]) => [h('div', { className: 'cgrp' }, h('b', { textContent: title }), h('span', { className: 'lab', textContent: where })), h('p', {}, ...text)]),
    madeBy()));
}
const SHORTCUTS = [
  ['playback', [['space', 'play / pause'], ['loop button', 'loop playback, or stop at the last clip'], ['click the ruler', 'move the playhead'], ['A W S E D F T G Y H U J K O L P', 'play the selected instrument']]],
  ['clips', [['click', 'select a clip'], [`${MOD} click`, 'add or remove a clip from the selection'], ['shift click', 'select a range of clips on the track'], [`${MOD}A`, 'select every clip on the track'],
    ['drag', 'move the selection'], ['drag the right edge', 'resize a clip'], ['double-click a lane', 'new pattern'], [`${MOD}C / ${MOD}X / ${MOD}V`, 'copy / cut / paste at the playhead, also between tabs'],
    [`${MOD}D`, 'duplicate after the selection'], ['del', 'remove the selection'], ['drag a clip onto the box', 'store a copy']]],
  ['sounds', [['click a sound', 'preview it'], ['drag a sound', 'onto a track, a drum pattern or a pad row'], ['drop an audio file', 'import it']]],
  ['pattern tiles (notes and drum steps)', [['click or drag', 'paint a tile; click a note to remove it'], ['shift drag', 'draw a box to select tiles; shift click adds or removes one'], [`${MOD}A`, 'select every tile in the pattern'],
    ['drag a selected tile', 'move the whole selection'], ['arrows', 'nudge the selection (shift: a bar, or an octave)'], [`${MOD}C / ${MOD}X / ${MOD}V`, 'copy / cut / paste tiles at the last step you clicked'], ['del', 'remove the selected tiles'], ['esc', 'clear the selection']]],
  ['project', [[`${MOD}Z / shift ${MOD}Z`, 'undo / redo'], [`${MOD}S`, 'save the project as a .hum file'], [`${MOD}wheel or pinch`, 'zoom the timeline'], [`${MOD}/`, 'this window']]],
];
export function openShortcuts() {
  modal('keyboard shortcuts', ...SHORTCUTS.flatMap(([g, rows]) => [h('div', { className: 'kgrp', textContent: g }), ...rows.map(([k, d]) => h('div', { className: 'krow' }, h('b', { style: 'font-weight:400' }, h('kbd', { textContent: k })), h('span', { textContent: d })))]));
}

const defaultsPanel = () => [
    h('div', { className: 'sgrid one' },
      fld('minimum timeline length (bars)', numBox(G.minBars, '4', v => { G.minBars = clamp(Math.round(+v) || 0, 0, 64); saveG(); toast('Saved'); }),
        'Bars shown on an empty timeline. 0 = only as long as your clips. Playback never plays empty bars either way. Each project can override this.'),
      fld('loop playback by default', h('input', { type: 'checkbox', checked: G.loop, onchange: e => { G.loop = e.target.checked; saveG(); toast('Saved'); } }), 'When off, play stops at the end of the last clip.'))];

/** Square 256px JPEG from any image file, small enough to live in the project and the .hum header. */
async function coverFrom(file) {
  const bm = await createImageBitmap(file), side = Math.min(bm.width, bm.height), cv = h('canvas', { width: 256, height: 256 });
  cv.getContext('2d').drawImage(bm, (bm.width - side) / 2, (bm.height - side) / 2, side, side, 0, 0, 256, 256);
  return cv.toDataURL('image/jpeg', 0.85);
}
function projectPanel(close) {
  const M = () => (S.meta ??= {});
  const text = (key, { area, ph } = {}) => h(area ? 'textarea' : 'input', {
    value: key === 'tags' ? (M().tags || []).join(', ') : M()[key] ?? '', rows: 3, maxLength: area ? 600 : 80, spellcheck: false, placeholder: ph || '',
    onchange: e => edit(() => { const v = e.target.value.trim(); M()[key] = key === 'tags' ? v.split(',').map(x => x.trim()).filter(Boolean).slice(0, 12) : v; }),
  });
  const cover = h('div', { className: 'cover' }), paintCover = () => { const c = safeCover(M().cover); cover.style.backgroundImage = c ? `url("${c}")` : ''; cover.textContent = c ? '' : 'no cover'; };
  const pick = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) try { const url = await coverFrom(f); edit(() => (M().cover = url)); paintCover(); } catch { toast('Could not read that image'); }
  } });
  paintCover();
  const ids = customIds(), bytes = ids.reduce((n, id) => n + (E.buffers.has(id) ? wavBytes(E.buffers.get(id)) : 0), 0), bars = E.songSteps(S) / 16, m = M();
  const info = [
    ['created', fmtDate(m.created)], ['last changed', fmtDate(m.modified)], ['file saves', m.revision ? `${m.revision} (saved as .hum)` : 'not saved as .hum yet'],
    ['made with', `${APP.name} ${APP.version}`], ['file format', `.hum v${FORMAT}`], ['tempo and key', `${S.bpm} bpm · ${KEYS[S.key]} ${S.scale}`],
    ['length', `${bars} bar${bars === 1 ? '' : 's'} · ${clock(bars * 16 * E.stepSec(S))} · ${S.tracks.length} track${S.tracks.length === 1 ? '' : 's'}`],
    ['custom media', `${ids.length} file${ids.length === 1 ? '' : 's'} · ${mb(bytes)} audio${E.buffers && missingIds().length ? ` · ${missingIds().length} missing` : ''}`],
    ['library sounds', `${libRefs(S).length} linked by path (not stored in the file)`],
    ['est. .hum size', mb(bytes * 4 / 3 + JSON.stringify(S).length + 4000)],
  ];
  return [
    h('div', { className: 'sgrid' },
      h('div', {}, cover, h('div', { className: 'cbtns' }, h('button', { className: 'btn sm', textContent: 'choose cover', onclick: () => pick.click() }), h('button', { className: 'btn sm', textContent: 'remove', onclick: () => { edit(() => delete M().cover); paintCover(); } })), pick),
      h('div', {},
        fld('title', h('input', { value: S.name, maxLength: 60, spellcheck: false, onchange: e => edit(() => (S.name = e.target.value.trim() || 'untitled')) })),
        fld('artist', text('artist')), fld('genre', text('genre', { ph: 'lo-fi, house…' })), fld('tags', text('tags', { ph: 'comma separated' })), fld('notes', text('description', { area: true })))),
    h('div', { className: 'sgrid one' },
      fld('minimum timeline length (bars)', numBox(S.minBars ?? '', `${G.minBars} (global)`, v => edit(() => { if (v === '') delete S.minBars; else S.minBars = clamp(Math.round(+v) || 0, 0, 64); })),
        'Bars shown on an empty timeline. Leave blank to use the global default. Playback never plays empty bars.'),
      fld('loop playback', h('input', { type: 'checkbox', checked: looping(), onchange: e => { S.loop = e.target.checked; changed(true); syncTransport(); } }), 'Same as the loop button in the top bar.')),
    h('dl', { className: 'sinfo' }, ...info.flatMap(([k, v]) => [h('dt', { textContent: k }), h('dd', { textContent: v })])),
    h('div', { className: 'sgrid one' }, h('div', { className: 'cbtns' },
      h('button', { className: 'btn sm', textContent: 'open media', onclick: () => { close(); openMedia(); } }),
      h('button', { className: 'btn sm pri', textContent: 'save .hum', onclick: () => exportHum(S) })))];
}

function themePanel() {
  const cur = THEMES[G.theme] ? G.theme : 'terminal';
  const cards = Object.entries(THEMES).map(([k, t]) => h('button', {
    className: 'thcard' + (k === cur ? ' on' : ''), data: { k }, ariaPressed: k === cur,
    onclick: () => { setTheme(k); readColors(); if ($('#pm').hidden) render(); for (const b of cards) { b.classList.toggle('on', b.dataset.k === k); b.ariaPressed = b.dataset.k === k; } }, // render repaints the track colours
  }, h('span', { className: 'swatch', style: `--r:${t.radius}px` }, ...t.swatch.map(c => h('i', { style: `background:${c}` }))), h('b', { textContent: k }), h('small', { textContent: t.note })));
  return [h('div', { className: 'thgrid' }, ...cards), h('p', { className: 'lab thnote', textContent: 'A theme changes the colours and how round things are. Saved in this browser, for every project.' })];
}
/** Preferences: one window, three tabs. The project tab only exists while a project is open. */
export function openPrefs(tab = 'theme') {
  const tabs = [['theme', 'theme'], !$('#pm').hidden ? null : ['project', 'project settings'], ['defaults', 'defaults · every project']].filter(Boolean);
  const body = h('div'), bar = h('div', { className: 'etabs ptabs', role: 'tablist' });
  let close;
  const panels = { theme: themePanel, project: () => projectPanel(() => close()), defaults: defaultsPanel };
  const show = k => { body.replaceChildren(...panels[k]()); for (const b of bar.children) { b.classList.toggle('on', b.dataset.k === k); b.ariaSelected = b.dataset.k === k; } };
  bar.append(...tabs.map(([k, label]) => h('button', { className: 'etab', role: 'tab', textContent: label, data: { k }, onclick: () => show(k) })));
  close = modal('preferences', bar, body);
  show(tabs.some(([k]) => k === tab) ? tab : 'theme');
}
export const openSettings = () => openPrefs('project');

export function openChangelog() {
  modal('changelog', h('div', { className: 'clog' }, ...CHANGELOG.map(r => h('div', {},
    h('div', { className: 'cgrp' }, h('b', { textContent: 'v' + r.v }), h('span', { className: 'lab', textContent: r.date })),
    ...[['new', r.new], ['fixed', r.fix]].filter(([, l]) => l.length).flatMap(([kind, list]) => [h('div', { className: 'kind', textContent: kind }), h('ul', {}, ...list.map(t => h('li', { textContent: t })))])))));
}
