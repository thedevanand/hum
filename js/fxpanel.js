// The FX tab: effect library, the chain on a clip / track / sound, drag and drop, and presets (built-in, global, per project).
import { FACTORY, FX, FX_ORDER, defaultsOf } from './fx.js';
import { param } from './controls.js';
import { modal, fld } from './dialogs.js';
import { edit } from './edit.js';
import { renderEditor } from './editor.js';
import { S, T, selClip, soundName, ui } from './state.js';
import { h, pct, toast, uid } from './util.js';

export let dragFx = null; // { fx } or { preset } while an effect or preset is being dragged

const newItem = key => ({ id: uid(), fx: key, on: true, p: defaultsOf(FX[key]) });
const copyItems = list => list.filter(f => FX[f.fx]).map(f => ({ id: uid(), fx: f.fx, on: f.on !== false, p: { ...f.p } }));
const itemsOf = d => (d.fx ? [newItem(d.fx)] : copyItems(d.preset.fx));

// ---------- presets: built-in, global (this browser), project (saved in the project and its .hum) ----------
const GKEY = 'hum.fxpresets';
const globalPresets = () => { try { return JSON.parse(localStorage.getItem(GKEY)) || []; } catch { return []; } };
const factoryPresets = () => FACTORY.map(([name, chain]) => ({ id: 'f:' + name, name, fx: chain.map(([fx, p]) => ({ fx, on: true, p })) }));

// ---------- where an effect lands: { scope: 'clip' | 'track' | 'media', tid, cid, sid } ----------
export function chainOf(spec, make) {
  if (spec.scope === 'media') return make ? ((S.mfx ??= {})[spec.sid] ??= []) : S.mfx?.[spec.sid] || [];
  const t = T(spec.tid), holder = spec.scope === 'clip' ? t?.clips.find(c => c.id === spec.cid) : t;
  return make ? (holder.fx ??= []) : holder?.fx || [];
}
const labelOf = spec => (spec.scope === 'media' ? `sound ${soundName(spec.sid)}` : spec.scope === 'track' ? `track ${T(spec.tid)?.name}` : 'clip');
export function applyFx(spec, items) {
  if (!items.length) return;
  if (spec.scope === 'clip') { ui.tid = spec.tid; ui.cid = spec.cid; } // the clip you dropped on becomes the selection
  ui.fxScope = spec.scope;
  edit(() => chainOf(spec, true).push(...items));
  toast(`${items.length > 1 ? `${items.length} effects` : FX[items[0].fx].name} added to ${labelOf(spec)}`);
}
/** Spread into an element's props to make it accept dragged effects and presets. */
export const fxDrop = spec => ({
  ondragover: e => { if (!dragFx) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('fxover'); },
  ondragleave: e => e.currentTarget.classList.remove('fxover'),
  ondrop: e => { if (!dragFx) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('fxover'); applyFx(spec(), itemsOf(dragFx)); },
});
export const dropFxOnLane = (t, e) => { if (!dragFx) return false; e.preventDefault(); e.stopPropagation(); applyFx({ scope: 'track', tid: t.id }, itemsOf(dragFx)); return true; };

const fmt = (u, v) => (u === 'hz' ? (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v < 10 ? v.toFixed(1) + ' hz' : Math.round(v) + ' hz')
  : u === 'pct' ? pct(v) : u === 'db' ? `${v > 0 ? '+' : ''}${Math.round(v * 2) / 2} db` : u === 'ms' ? v.toFixed(0) + ' ms' : u === 'sec' ? v.toFixed(1) + ' s'
  : u === 'bit' ? v + ' bit' : u === 'x' ? (v < 10 ? v.toFixed(1) : Math.round(v)) + '×' : String(v));

function control(item, q) {
  const val = item.p[q.k] ?? q.def;
  if (q.options) {
    const num = typeof q.options[0][0] === 'number';
    return h('label', { className: 'param' }, h('span', { className: 'lab', textContent: q.label }),
      h('select', { ariaLabel: q.label, onchange: e => edit(() => (item.p[q.k] = num ? +e.target.value : e.target.value)) }, q.options.map(([v, l]) => h('option', { value: v, textContent: l, selected: v === val }))));
  }
  const to = q.log ? v => Math.log(v / q.min) / Math.log(q.max / q.min) : v => v, from = q.log ? v => q.min * (q.max / q.min) ** v : v => v; // log = slider moves in octaves
  return param(q.label, to(val), q.log ? [0, 1, 0.001] : [q.min, q.max, q.step], v => (item.p[q.k] = from(v)), v => fmt(q.unit, from(v)));
}

function card(list, i) {
  const item = list[i], def = FX[item.fx];
  if (!def) return null;
  const swap = d => edit(() => ([list[i], list[i + d]] = [list[i + d], list[i]]));
  return h('div', { className: 'fxc' + (item.on === false ? ' off' : '') },
    h('div', { className: 'fxch' }, h('b', { textContent: def.name, title: def.desc }), h('span', { className: 'grow' }),
      h('button', { className: 'ms' + (item.on === false ? '' : ' on'), textContent: item.on === false ? 'off' : 'on', title: 'Bypass', ariaPressed: item.on !== false, onclick: () => edit(() => (item.on = item.on === false)) }),
      h('button', { className: 'ms', textContent: '‹', title: 'Move earlier', ariaLabel: 'Move earlier', disabled: i === 0, onclick: () => swap(-1) }),
      h('button', { className: 'ms', textContent: '›', title: 'Move later', ariaLabel: 'Move later', disabled: i === list.length - 1, onclick: () => swap(1) }),
      h('button', { className: 'ms del', textContent: '×', title: 'Remove', ariaLabel: 'Remove', onclick: () => edit(() => list.splice(i, 1)) })),
    ...def.params.map(q => control(item, q)));
}

function savePreset(list) {
  const name = h('input', { placeholder: 'preset name', maxLength: 40, spellcheck: false });
  const where = h('select', { ariaLabel: 'Save for' }, h('option', { value: 'project', textContent: 'this project only' }), h('option', { value: 'global', textContent: 'every project (this browser)' }));
  const save = () => {
    const n = name.value.trim();
    if (!n) return name.focus();
    const preset = { id: uid(), name: n, fx: list.map(f => ({ fx: f.fx, on: f.on !== false, p: { ...f.p } })) };
    close();
    if (where.value === 'global') { localStorage.setItem(GKEY, JSON.stringify([...globalPresets(), preset])); renderEditor(); } else edit(() => (S.fxPresets ??= []).push(preset));
    toast(`Saved preset ${n}`);
  };
  name.onkeydown = e => e.key === 'Enter' && save();
  const close = modal('save preset', h('div', { className: 'sgrid one' }, fld('name', name), fld('save for', where), h('div', { className: 'cbtns' }, h('button', { className: 'btn sm pri', textContent: 'save', onclick: save }))));
  name.focus();
}

/** Effects and presets you can click or drag. */
function library(cur) {
  const preset = (p, remove) => h('div', {
    className: 'fxcard', draggable: true, title: 'Drag onto a clip, track or sound, or click to add to the selected one',
    ondragstart: e => { dragFx = { preset: p }; e.dataTransfer.setData('text/plain', p.name); e.dataTransfer.effectAllowed = 'copy'; }, ondragend: () => (dragFx = null),
    onclick: () => applyFx(cur, copyItems(p.fx)),
  }, h('b', { textContent: p.name }), h('small', { textContent: p.fx.map(f => FX[f.fx]?.name).filter(Boolean).join(' · ') }),
  remove && h('button', { className: 'ms del', textContent: '×', title: 'Delete preset', ariaLabel: `Delete ${p.name}`, onclick: e => { e.stopPropagation(); remove(); } }));
  const groups = [
    ['project presets', S.fxPresets || [], p => edit(() => (S.fxPresets = S.fxPresets.filter(x => x !== p)))],
    ['global presets', globalPresets(), p => { localStorage.setItem(GKEY, JSON.stringify(globalPresets().filter(x => x.id !== p.id))); renderEditor(); }],
    ['built-in presets', factoryPresets(), null],
  ];
  return h('div', { className: 'fxlib' },
    h('div', { className: 'fxh', textContent: 'effects · drag onto a clip, track or sound' }),
    ...FX_ORDER.map(key => h('div', {
      className: 'fxcard', draggable: true, title: FX[key].desc,
      ondragstart: e => { dragFx = { fx: key }; e.dataTransfer.setData('text/plain', FX[key].name); e.dataTransfer.effectAllowed = 'copy'; }, ondragend: () => (dragFx = null),
      onclick: () => applyFx(cur, [newItem(key)]),
    }, h('b', { textContent: FX[key].name }), h('small', { textContent: FX[key].desc }))),
    ...groups.filter(([, list]) => list.length).flatMap(([title, list, del]) => [h('div', { className: 'fxh', textContent: title }), ...list.map(p => preset(p, del && (() => del(p))))]));
}

export function renderFx() {
  const t = T(ui.tid), c = selClip();
  const scopes = [c && { scope: 'clip', tid: t.id, cid: c.id, tab: 'clip', noun: 'clip' }, t && { scope: 'track', tid: t.id, tab: 'track', noun: `track ${t.name}` }, c?.buf && { scope: 'media', sid: c.buf, tab: 'sound', noun: `sound ${soundName(c.buf)}` }].filter(Boolean);
  const cur = scopes.find(s => s.scope === ui.fxScope) || scopes[0];
  ui.fxScope = cur.scope;
  const list = chainOf(cur, false);
  return h('div', { className: 'fxwrap' }, library(cur),
    h('div', { className: 'fxmain' },
      h('div', { className: 'fxbar' },
        h('div', { className: 'seg txt', role: 'group', ariaLabel: 'Apply to' }, scopes.map(s => h('button', { className: s.scope === cur.scope ? 'on' : '', textContent: s.tab, ariaPressed: s.scope === cur.scope, onclick: () => { ui.fxScope = s.scope; renderEditor(); } }))),
        h('span', { className: 'lab', textContent: cur.noun }), h('span', { className: 'grow' }),
        h('button', { className: 'btn sm', textContent: 'save preset', disabled: !list.length, onclick: () => savePreset(list) }),
        h('button', { className: 'btn sm', textContent: 'clear', disabled: !list.length, onclick: () => edit(() => (list.length = 0)) })),
      h('div', { className: 'fxchain', ...fxDrop(() => cur) },
        ...(list.length ? list.map((_, i) => card(list, i)) : [h('div', { className: 'none', textContent: `No effects on this ${cur.scope === 'media' ? 'sound' : cur.scope}. Drag one here, or click one on the left. A sound's effects follow it everywhere it is used.` })]))));
}
