// The editor panel: step grid, piano roll and audio clip editor.
import * as E from './engine.js';
import { inScale } from './dsp.js';
import { ICON } from './icons.js';
import { deleteClip, dropOnPattern, duplicateClip, fitBars } from './clips.js';
import { param, range } from './controls.js';
import { drawWave, redrawClip } from './draw.js';
import { changed, edit, seek, snap } from './edit.js';
import { renderFx } from './fxpanel.js';
import { dragId } from './library.js';
import { COLORS, HI, LO, RH, S, SW, T, selClip, soundName, trackIcon, ui, undo } from './state.js';
import { keepSound, loadAssets } from './storage.js';
import { $, clamp, drag, h, ico, pct, secs, toast, uid } from './util.js';

export const ed = $('#editor');
const emptyState = (title, text) => h('div', { className: 'empty' }, h('b', { textContent: title }), text);
export function renderEditor() {
  const t = T(ui.tid), c = selClip();
  $('#ctx').textContent = t ? t.name + (c ? ' › ' + (c.buf ? soundName(c.buf) : t.type === 'drums' ? 'beat' : 'melody') + (ui.sel.size > 1 ? ` (+${ui.sel.size - 1} selected)` : '') : '') : 'hum';
  if (!t) return ed.replaceChildren(emptyState('no tracks yet', 'Add a track above to start your song.'));
  ed.style.setProperty('--c', COLORS[t.color]);
  const nfx = (c?.fx?.length || 0) + (t.fx?.length || 0);
  const tabs = h('div', { className: 'etabs', role: 'tablist' }, [['edit', 'edit'], ['fx', nfx ? `fx · ${nfx}` : 'fx']].map(([k, label]) =>
    h('button', { className: 'etab' + (ui.tab === k ? ' on' : ''), role: 'tab', ariaSelected: ui.tab === k, textContent: label, onclick: () => { ui.tab = k; renderEditor(); } })));
  if (ui.tab === 'fx') return ed.replaceChildren(tabs, renderFx());
  const def = t.inst && { ...E.INSTRUMENTS[t.inst], ...t.synth }, tweak = (k, v) => (t.synth = { ...t.synth, [k]: v });
  const sub = t.type === 'drums' ? `Drum machine · ${t.rows.length} sounds` : t.type === 'inst' ? (def.sampler ? 'Sampled instrument' : 'Synthesizer') : `Audio · ${t.clips.length} clip${t.clips.length === 1 ? '' : 's'}`;
  const head = h('div', { className: 'ehead' },
    h('div', { className: 'etitle' }, h('span', { className: 'tile', innerHTML: ICON[trackIcon(t)] }), h('div', {}, h('b', { textContent: t.name }), h('span', { className: 'lab', textContent: sub }))),
    t.inst && h('label', { className: 'pill' }, h('select', { ariaLabel: 'Instrument', onchange: e => { snap(); t.inst = e.target.value; delete t.synth; changed(); loadAssets(); } },
      Object.entries(E.INSTRUMENTS).map(([k, d]) => h('option', { value: k, textContent: d.name, selected: k === t.inst })))),
    param('Reverb', t.reverb, [0, 1, 0.01], v => (t.reverb = v)),
    param('Echo', t.echo, [0, 1, 0.01], v => (t.echo = v)),
    h('span', { className: 'grow' }),
    c && h('button', { className: 'btn sm', title: 'Duplicate clip (Ctrl/⌘ D)', onclick: duplicateClip }, ico('copy'), 'Duplicate'),
    c && h('button', { className: 'btn sm', title: 'Delete clip (Delete)', onclick: deleteClip }, ico('trash'), 'Delete'),
    def && !def.sampler && h('div', { className: 'esub' }, h('span', { className: 'lab', textContent: 'Shape the sound' }),
      h('div', { className: 'seg', role: 'group', ariaLabel: 'Waveform' }, ['sine', 'triangle', 'sawtooth', 'square'].map(w =>
        h('button', { className: w === def.wave ? 'on' : '', innerHTML: ICON[w], title: w[0].toUpperCase() + w.slice(1), ariaLabel: w, ariaPressed: w === def.wave, onclick: () => edit(() => tweak('wave', w)) }))),
      param('Attack', def.a, [0.002, 1, 0.002], v => tweak('a', v), secs),
      param('Release', def.r, [0.05, 2, 0.01], v => tweak('r', v), secs),
      param('Tone', def.cut, [200, 8000, 50], v => tweak('cut', v), v => (v / 1000).toFixed(1) + 'k')));
  const old = ed.querySelector('.roll'), keep = old && old.dataset.cid === c?.id && [old.scrollLeft, old.scrollTop];
  const body = !c ? (t.type === 'audio' ? emptyState('Nothing to edit yet', 'Drop a sound on this track, import a file, or press record.')
      : emptyState('Pick a pattern', 'Click one in the timeline, or double-click an empty spot to add a new one.'))
    : t.type === 'drums' ? stepEditor(t, c) : t.type === 'inst' ? pianoRoll(t, c) : waveEditor(t, c);
  ed.replaceChildren(tabs, head, body);
  if (body.classList.contains('roll')) {
    const mid = c.notes.length ? c.notes.reduce((s, n) => s + n.n, 0) / c.notes.length : 62;
    body.scrollTo(...(keep || [0, (HI - mid) * RH - body.clientHeight / 2]));
  }
}

function hit(t, row) {
  const b = E.buffers.get(row.sound);
  if (b) { E.ac.resume(); E.playBuf(E.live, E.trackIn(E.live, t.id).in, b, E.ac.currentTime, { gain: row.vol }); }
}
function stepEditor(t, c) {
  const rowOf = id => t.rows.find(r => r.id === id);
  let val = true;
  const set = pad => {
    const { r, i } = pad.dataset, arr = (c.steps[r] ||= []);
    if (!!arr[i] === val) return;
    arr[i] = +val; pad.classList.toggle('on', val); pad.ariaPressed = val;
    if (val) { pad.classList.remove('pop'); void pad.offsetWidth; pad.classList.add('pop'); hit(t, rowOf(r)); }
  };
  const done = () => { changed(true); redrawClip(t, c); };
  const gap = i => (i && i % 16 === 0 ? ' bar' : '');
  const unmark = () => { for (const el of ed.querySelectorAll('.over')) el.classList.remove('over'); };
  const wrap = h('div', {
    className: 'steps',
    onpointerdown: e => {
      const pad = e.target.closest('.pad');
      if (!pad || e.button) return;
      snap(); val = !pad.classList.contains('on'); set(pad);
      drag(ev => { const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.pad'); if (el && wrap.contains(el)) set(el); }, done);
    },
    onclick: e => { const pad = e.target.closest('.pad'); if (pad && e.detail === 0) { snap(); val = !pad.classList.contains('on'); set(pad); done(); } }, // keyboard
    // sounds dropped here: on a row = swap that row's sound, anywhere else = new row
    ondragover: e => { e.preventDefault(); unmark(); (e.target.closest('.srow[data-r]') || wrap).classList.add('over'); },
    ondragleave: e => { if (!wrap.contains(e.relatedTarget)) unmark(); },
    ondrop: e => {
      if ([...e.dataTransfer.files].some(f => f.name.endsWith('.hum'))) return; // let the page-level handler offer choices
      e.preventDefault(); e.stopPropagation(); unmark();
      const rowId = e.target.closest('.srow[data-r]')?.dataset.r;
      if (dragId) dropOnPattern(t, dragId, rowId);
      else for (const f of e.dataTransfer.files) f.arrayBuffer().then(b => E.ac.decodeAudioData(b)).then(buf => dropOnPattern(t, keepSound(buf, f.name.replace(/\.\w+$/, '')), rowId), () => toast(`Could not read ${f.name}`));
    },
  },
  h('div', { className: 'srow' },
    h('div', { className: 'shead' }, h('span', { className: 'lab', style: 'grid-column:1/-1', textContent: `${c.len / 16} bar${c.len > 16 ? 's' : ''} · drag to paint` })),
    h('div', { className: 'cells' }, Array.from({ length: c.len }, (_, i) => h('span', { className: 'led' + (i % 4 ? '' : ' beat') + gap(i), textContent: i % 4 ? '' : `${(i >> 4) + 1}.${((i >> 2) & 3) + 1}`, data: { i } })))),
  t.rows.map(r => h('div', { className: 'srow', data: { r: r.id } },
    h('div', { className: 'shead' },
      h('button', { className: 'tile sm', innerHTML: ICON.play, title: 'Play this sound', ariaLabel: `Play ${soundName(r.sound)}`, onclick: () => hit(t, r) }),
      h('span', { className: 'nm', textContent: soundName(r.sound) }),
      range(r.vol, [0, 1.5, 0.01], v => (r.vol = v), { className: 'slim', ariaLabel: `${soundName(r.sound)} volume`, title: 'Volume' }),
      h('button', { className: 'ms del', innerHTML: ICON.x, title: 'Remove sound', ariaLabel: `Remove ${soundName(r.sound)}`, onclick: () => edit(() => (t.rows = t.rows.filter(x => x !== r))) })),
    h('div', { className: 'cells' }, Array.from({ length: c.len }, (_, i) => h('button', {
      className: 'pad' + (c.steps[r.id]?.[i] ? ' on' : '') + (i % 8 >= 4 ? ' alt' : '') + gap(i),
      data: { r: r.id, i }, ariaLabel: `${soundName(r.sound)} step ${i + 1}`, ariaPressed: !!c.steps[r.id]?.[i],
    }))))),
  h('div', { className: 'shint', textContent: 'drag a sound from the library onto a row to swap it, or below the rows to add it · drag the pattern\'s right edge in the timeline for more bars' }));
  return wrap;
}

const isBlack = n => [1, 3, 6, 8, 10].includes(n % 12);
const ping = (t, n) => { E.ac.resume(); E.playNote(E.live, E.trackIn(E.live, t.id).in, t, n, E.ac.currentTime, 0.3); };
function pianoRoll(t, c) {
  const pitches = Array.from({ length: HI - LO + 1 }, (_, i) => HI - i), y = n => (HI - n) * RH;
  const place = (el, n) => { el.style.cssText = `left:${n.t * SW}px;top:${y(n.n)}px;width:${Math.max(6, n.d * SW - 2)}px`; return el; };
  const noteEl = n => place(h('div', { className: 'note' }), n);
  const keys = h('div', {
    className: 'keys',
    onpointerdown: e => {
      const n = +e.target.dataset.n;
      if (!n) return;
      E.ac.resume(); e.target.classList.add('down');
      const off = E.playNote(E.live, E.trackIn(E.live, t.id).in, t, n, E.ac.currentTime);
      drag(() => {}, () => { off(); e.target.classList.remove('down'); });
    },
  }, pitches.map(n => h('div', { className: 'key' + (isBlack(n) ? ' black' : '') + ([0, 5].includes(n % 12) ? ' line' : ''), textContent: n % 12 ? '' : 'C' + (n / 12 - 1), data: { n } })));
  const grid = h('div', {
    className: 'grid', style: `width:${c.len * SW}px;height:${pitches.length * RH}px`,
    onpointerdown: e => {
      if (e.button) return;
      const box = grid.getBoundingClientRect(), at = ev => ({ t: Math.floor((ev.clientX - box.left) / SW), n: HI - Math.floor((ev.clientY - box.top) / RH) });
      // note elements stay in the same order as c.notes, so the DOM index finds the note
      let el = e.target, note = c.notes[[...grid.querySelectorAll('.note')].indexOf(el)], mode = 'move', moved = false;
      const p0 = at(e);
      snap();
      if (!note) {
        note = { t: clamp(p0.t, 0, c.len - 1), d: ui.noteLen, n: clamp(p0.n, LO, HI) };
        c.notes.push(note); grid.append((el = noteEl(note))); moved = true; ping(t, note.n);
      } else if (e.offsetX > el.offsetWidth - 9) mode = 'size';
      const n0 = { ...note };
      drag(ev => {
        const p = at(ev);
        if (!moved && p.t === p0.t && p.n === p0.n) return;
        moved = true;
        if (mode === 'size') note.d = Math.max(1, n0.d + p.t - p0.t);
        else {
          note.t = clamp(n0.t + p.t - p0.t, 0, c.len - 1);
          const n = clamp(n0.n + p.n - p0.n, LO, HI);
          if (n !== note.n) { note.n = n; ping(t, n); }
        }
        place(el, note);
      }, () => {
        if (moved) ui.noteLen = note.d; else { c.notes.splice(c.notes.indexOf(note), 1); el.remove(); } // plain click on a note deletes it
        changed(true); redrawClip(t, c);
      });
    },
  }, pitches.map(n => h('div', { className: 'row' + (isBlack(n) ? ' black' : '') + (inScale(n, S.key, S.scale) ? '' : ' off') + (n % 12 ? '' : ' c'), style: `top:${y(n)}px` })),
  c.notes.map(noteEl), h('div', { className: 'rpos', hidden: true }));
  return h('div', { className: 'roll', data: { cid: c.id } }, keys, grid);
}

function waveEditor(t, c) {
  const buf = E.clipBuffer(c, S), sd = E.stepSec(S);
  if (!buf) return emptyState('One moment', 'Preparing audio…');
  const cv = h('canvas'), strip = h('div', { className: 'wstrip' }), selEl = h('div', { className: 'wsel' }), keep = h('div', { className: 'wkeep' });
  const showSel = () => {
    const s = ui.wsel;
    selEl.hidden = keep.hidden = !s; strip.textContent = s ? '' : 'Drag across the wave to select · click to move the playhead';
    if (s) { selEl.style.left = keep.style.left = (s[0] / c.dur) * 100 + '%'; selEl.style.width = keep.style.width = ((s[1] - s[0]) / c.dur) * 100 + '%'; keep.textContent = `KEEP ${secs(s[1] - s[0])}`; }
  };
  const box = h('div', {
    className: 'wavebox',
    onpointerdown: e => {
      const r = box.getBoundingClientRect(), at = ev => clamp((ev.clientX - r.left) / r.width, 0, 1) * c.dur, a = at(e);
      ui.wsel = null; showSel();
      drag(ev => { if (Math.abs(ev.clientX - e.clientX) > 3) { const b = at(ev); ui.wsel = [Math.min(a, b), Math.max(a, b)]; showSel(); } },
        () => { if (!ui.wsel) seek(c.start + a / c.rate / sd); renderEditor(); });
    },
  }, cv, strip, selEl, keep, h('div', { className: 'rpos', hidden: true, data: { t: '' } }));
  showSel(); requestAnimationFrame(() => cv.isConnected && drawWave(cv, buf, c.off, c.dur, '#d6d6d1'));

  const s = ui.wsel, steps = sec => sec / c.rate / sd, piece = (from, start) => ({ ...c, id: uid(), start, off: c.off + from, dur: c.dur - from, fadeIn: 0 });
  const tool = (label, icon, fn, disabled, on) => h('button', {
    className: 'btn sm' + (on ? ' on' : ''), disabled, ariaPressed: !!on,
    onclick: () => { snap(); if (fn() === false) return void undo.pop(); t.clips = t.clips.filter(x => x.dur > 0.02); ui.wsel = null; changed(); },
  }, ico(icon), label);
  return h('div', { className: 'audio' }, box,
    h('div', { className: 'tools' },
      tool('Keep selection', 'crop', () => { c.start += steps(s[0]); c.off += s[0]; c.dur = s[1] - s[0]; }, !s),
      tool('Cut selection out', 'x', () => { t.clips.push(piece(s[1], c.start + steps(s[1]))); c.dur = s[0]; c.fadeOut = 0; }, !s),
      tool('Split at playhead', 'split', () => {
        const now = E.position() ?? ui.pos, at = (now - c.start) * sd * c.rate;
        if (at < 0.03 || at > c.dur - 0.03) { toast('Click inside the wave first to put the playhead where you want the cut'); return false; }
        t.clips.push(piece(at, now)); c.dur = at; c.fadeOut = 0;
      }),
      tool('Fit to bars', 'fit', () => fitBars(c)),
      tool('Reverse', 'rev', () => { c.off = E.buffers.get(c.buf).duration - c.off - c.dur; c.rev = !c.rev; }, false, c.rev)),
    h('div', { className: 'knobs' },
      param('Volume', c.gain, [0, 2, 0.01], v => (c.gain = v)),
      param('Speed', c.rate, [0.25, 3, 0.01], v => (c.rate = v), v => v.toFixed(2) + '×', { done: () => changed() }),
      param('Pitch', c.pitch, [-12, 12, 1], v => (c.pitch = v), v => (v > 0 ? '+' : '') + v + ' st', { lazy: true }),
      param('Fade in', c.fadeIn, [0, Math.min(5, c.dur / 2), 0.01], v => (c.fadeIn = v), secs),
      param('Fade out', c.fadeOut, [0, Math.min(5, c.dur / 2), 0.01], v => (c.fadeOut = v), secs),
      param('Autotune', c.tune, [0, 1, 0.05], v => (c.tune = v), v => (v ? pct(v) : 'off'), { lazy: true })));
}
