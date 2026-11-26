// Project state, constants, track helpers and the blank / demo songs.
import { FORMAT } from './humfile.js';
import * as E from './engine.js';
import { $, uid } from './util.js';

export const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const COLORS = ['#e6b450', '#59c2ff', '#d2a6ff', '#95e6cb', '#f07178', '#aad94c']; // terminal palette, one per track
export const APP = { name: 'hum', version: '1.0.1' };
export { FORMAT }; // .hum file layout version
export const HEAD = 208, LO = 36, HI = 84, RH = 18, SW = 26; // track header px; piano roll range, row px, step px

// ---------- state ----------
export let S; // the project: everything undoable and saved
export const setS = v => { S = v; };
export const LIB = []; // sounds/index.json
export const LIBMAP = new Map(), mine = new Map(); // sound id → { cat, dur, peaks }
export const ui = { tid: null, cid: null, sel: new Set(), tab: 'edit', fxScope: null, sp: 9, pos: 0, wsel: null, cat: 'Kicks', q: '', noteLen: 2, previewing: null };
export const undo = [], redo = [];
// global defaults for every project; a project can override them in its own settings
export const G = (() => { try { return { minBars: 4, loop: true, ...JSON.parse(localStorage.getItem('hum.settings')) }; } catch { return { minBars: 4, loop: true }; } })();
export const saveG = () => { try { localStorage.setItem('hum.settings', JSON.stringify(G)); } catch { /* lasts this session only */ } };
const minBars = (p = S) => p.minBars ?? G.minBars;
export const viewSteps = p => Math.max(minBars(p) * 16, E.songSteps(p)); // timeline width: padded; playback and export use E.songSteps
export const looping = () => S.loop ?? G.loop;

export const T = id => S.tracks.find(t => t.id === id);
export const selClip = () => T(ui.tid)?.clips.find(c => c.id === ui.cid);
export const trackIcon = t => (t.type === 'inst' ? { piano: 'piano', flute: 'flute' }[t.inst] || 'synth' : t.type);
export const pretty = file => {
  const s = file.split('/').pop().replace(/\.\w+$/, '').replace(/_/g, ' ').replace(/^bd /, 'kick ').replace(/^sn /, 'snare ')
    .replace(/^(drum|perc|loop|tbd|misc) /, '').replace(/^elec /, 'electro ').replace(/^ambi /, 'ambient ').replace(/^guit /, 'guitar ');
  return s[0].toUpperCase() + s.slice(1);
};
export const soundName = id => S.sounds[id] || pretty(id.slice(4));
/** Category, duration and 40 loudness digits for a sound: precomputed for the library, measured for the user's own. */
export function info(id) {
  if (LIBMAP.has(id)) return LIBMAP.get(id);
  const buf = E.buffers.get(id);
  if (buf && !mine.has(id)) {
    const d = buf.getChannelData(0), out = [];
    for (let i = 0; i < 40; i++) {
      const a = Math.floor((i * d.length) / 40), e = Math.floor(((i + 1) * d.length) / 40), stride = Math.max(1, (e - a) >> 8);
      let p = 0;
      for (let j = a; j < e; j += stride) p = Math.max(p, Math.abs(d[j]));
      out.push(p);
    }
    const top = Math.max(...out, 1e-6);
    mine.set(id, { cat: 'Mine', dur: buf.duration, peaks: out.map(p => Math.round((p / top) * 9)).join('') });
  }
  return mine.get(id) || { cat: 'Mine' };
}
export const mini = (peaks = '') => `<svg class="mini" viewBox="0 0 120 20" preserveAspectRatio="none" aria-hidden="true" fill="currentColor">${
  [...peaks].map((p, i) => { const hh = Math.max(2, (p / 9) * 20); return `<rect x="${i * 3}" y="${(20 - hh) / 2}" width="2" height="${hh}"/>`; }).join('')}</svg>`;

export function pushTrack(type, extra) {
  const used = S.tracks.map(t => t.color), free = COLORS.findIndex((_, i) => !used.includes(i));
  const t = { id: uid(), type, name: 'Audio', color: free < 0 ? S.tracks.length % COLORS.length : free, vol: 0.8, mute: false, solo: false, reverb: 0, echo: 0, clips: [], ...extra };
  S.tracks.push(t);
  requestAnimationFrame(() => $('#scroll').scrollTo({ top: 1e6, behavior: 'smooth' })); // bring the new track into view
  return t;
}
export const drumRows = () => [['Kicks/bd_haus', 0.9], ['Snares/sn_dolf', 0.8], ['Hats/drum_cymbal_closed', 0.5], ['Hats/drum_cymbal_open', 0.35], ['Snares/perc_snap', 0.7]]
  .map(([f, vol]) => ({ id: uid(), sound: `lib:${f}.flac`, vol }));

export function blank() {
  S = { name: 'untitled', bpm: 100, key: 0, scale: 'minor', vol: 0.8, sounds: {}, tracks: [], box: [] };
  const t = pushTrack('drums', { name: 'Drums', rows: drumRows() });
  t.clips.push({ id: uid(), start: 0, len: 16, steps: {} });
}
export function demo() {
  S = { name: 'demo song', bpm: 96, key: 9, scale: 'minor', vol: 0.8, sounds: {}, tracks: [], box: [] };
  const pat = s => [...s].map(ch => +(ch === 'x'));
  const d = pushTrack('drums', { name: 'Drums', rows: drumRows() }), [k, sn, hh, oh] = d.rows.map(r => r.id);
  for (let bar = 0; bar < 4; bar++) d.clips.push({
    id: uid(), start: bar * 16, len: 16,
    steps: { [k]: pat(bar === 3 ? 'x..x....x.x..x..' : 'x..x....x.x.....'), [sn]: pat('....x.......x...'), [hh]: pat('x.x.x.x.x.x.x.x.'), [oh]: pat(bar % 2 ? '..............x.' : '................') },
  });
  const roots = [45, 41, 48, 43], chords = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]]; // Am F C G
  pushTrack('inst', { name: 'Bass', inst: 'bass', vol: 0.7 }).clips.push({
    id: uid(), start: 0, len: 64, notes: roots.flatMap((n, bar) => [0, 3, 6, 8, 11, 14].map(t => ({ t: bar * 16 + t, d: 2, n }))),
  });
  pushTrack('inst', { name: 'Piano', inst: 'piano', vol: 0.7, reverb: 0.2 }).clips.push({
    id: uid(), start: 0, len: 64, notes: chords.flatMap((ch, bar) => [[0, 3], [6, 3], [10, 5]].flatMap(([t, len]) => ch.map(n => ({ t: bar * 16 + t, d: len, n })))),
  });
  pushTrack('inst', { name: 'Flute', inst: 'flute', vol: 0.55, reverb: 0.4, echo: 0.2 }).clips.push({
    id: uid(), start: 0, len: 64,
    notes: [[0, 4, 76], [4, 2, 74], [6, 6, 72], [16, 4, 69], [20, 2, 72], [22, 8, 74], [32, 4, 76], [36, 2, 79], [38, 6, 76], [48, 4, 74], [52, 2, 72], [54, 8, 71]].map(([t, len, n]) => ({ t, d: len, n })),
  });
}
