// Adding tracks and sounds, copy / paste / duplicate / delete of clips.
import * as E from './engine.js';
import { freeStart, remapSteps } from './place.js';
import { changed, edit, selClips, snap } from './edit.js';
import { setBox, boxOpen } from './box.js';
import { S, T, drumRows, pushTrack, soundName, ui } from './state.js';
import { keepSound, loadAssets, sound } from './storage.js';
import { $, clamp, toast, uid } from './util.js';

export function addTrack(type, inst) {
  snap();
  const start = Math.floor(ui.pos / 16) * 16;
  const t = type === 'drums' ? pushTrack('drums', { name: 'Drums', rows: drumRows() }) : pushTrack('inst', { name: E.INSTRUMENTS[inst].name, inst });
  t.clips.push(type === 'drums' ? { id: uid(), start, len: 16, steps: {} } : { id: uid(), start, len: 32, notes: [] });
  ui.tid = t.id; ui.cid = t.clips[0].id;
  changed(); loadAssets();
}
/** Library or user sound → drum row (when the target is a drum track) or audio clip. */
export async function addSound(id, tid = ui.tid, step = Math.floor(ui.pos), asClip = false) {
  const buf = await sound(id).catch(() => null);
  if (!buf) return toast('Could not load that sound');
  snap();
  let t = T(tid);
  if (t?.type === 'drums' && !asClip) { t.rows.push({ id: uid(), sound: id, vol: 0.8 }); toast(`${soundName(id)} added to ${t.name}`); return changed(); }
  if (t?.type !== 'audio') t = pushTrack('audio', { name: soundName(id) });
  const c = { id: uid(), start: step, buf: id, off: 0, dur: buf.duration, gain: 1, rate: 1, pitch: 0, tune: 0, rev: false, fadeIn: 0, fadeOut: 0 };
  if (id.startsWith('lib:Loops/')) fitBars(c);
  t.clips.push(c); ui.tid = t.id; ui.cid = c.id; ui.wsel = null;
  changed();
}
/** A sound dropped on a drum pattern: replaces the row it landed on, or becomes a new row. */
export async function dropOnPattern(t, id, rowId) {
  if (!(await sound(id).catch(() => null))) return toast('Could not load that sound');
  const row = t.rows.find(r => r.id === rowId);
  edit(() => { if (row) row.sound = id; else t.rows.push({ id: uid(), sound: id, vol: 0.8 }); });
  toast(row ? `row now plays ${soundName(id)}` : `${soundName(id)} added to ${t.name}`);
}
/** Stretch a clip to the nearest 1/2/4/8… bars at the song tempo, so loops lock to the grid. */
export function fitBars(c) {
  const bars = 2 ** Math.max(0, Math.round(Math.log2(E.clipLen(c, S) / 16)));
  c.rate = clamp(c.dur / (bars * 16 * E.stepSec(S)), 0.25, 3); c.start = Math.round(c.start / 16) * 16;
}
export async function importFiles(files, tid, step) {
  for (const f of files) {
    try { await addSound(keepSound(await E.ac.decodeAudioData(await f.arrayBuffer()), f.name.replace(/\.\w+$/, '')), tid, step, true); }
    catch { toast(`Could not read ${f.name}: not an audio file this browser can decode`); }
  }
}
export const KIND = { drums: 'drum', inst: 'instrument', audio: 'audio' };
export const overBox = e => !!document.elementFromPoint(e.clientX, e.clientY)?.closest('#box');
/** Clips with what they need to live outside their track: type, colour, drum row order, sound names, spacing between them. */
const itemOf = (t, clips) => {
  const min = Math.min(...clips.map(c => c.start));
  return {
    type: t.type, color: t.color, c: structuredClone(clips[0]), clips: clips.map(c => ({ c: structuredClone(c), off: c.start - min })), rows: t.rows?.map(r => r.id),
    sname: clips[0].buf ? soundName(clips[0].buf) : '', snames: Object.fromEntries(clips.filter(c => c.buf).map(c => [c.buf, soundName(c.buf)])),
    inst: t.inst, tname: t.name, rowSounds: t.rows?.map(r => ({ id: r.id, sound: r.sound, vol: r.vol })), // enough to rebuild the track in another project
  };
};
let clipboard = null;
export const trackFor = type => (T(ui.tid)?.type === type ? T(ui.tid) : S.tracks.find(x => x.type === type));
/** Paste an item (one clip or a selection) onto a track at `start`. Never covers another clip: it lands in the next free spot. */
export function pasteItem(it, t, start) {
  if (t && t.type !== it.type) return toast(`That is ${KIND[it.type]} material: pick a ${KIND[it.type]} track`);
  snap();
  if (!t) { // no matching track here (e.g. pasted into another project): make one like the source
    const name = it.tname || KIND[it.type];
    t = it.type === 'drums' ? pushTrack('drums', { name, rows: it.rowSounds?.length ? it.rowSounds.map(r => ({ ...r })) : drumRows() })
      : it.type === 'audio' ? pushTrack('audio', { name }) : pushTrack('inst', { name, inst: E.INSTRUMENTS[it.inst] ? it.inst : 'lead' });
  }
  const list = it.clips ?? [{ c: it.c, off: 0 }], grid = it.c.buf ? 1 : 16;
  const span = Math.max(...list.map(({ c, off }) => off + E.clipLen(c, S)));
  const s0 = freeStart(t.clips, S, Math.max(0, Math.floor(start / grid) * grid), span, grid);
  const made = list.map(({ c: src, off }) => {
    const c = structuredClone(src);
    if (c.steps && it.rows) c.steps = remapSteps(c.steps, it.rows, t.rows); // drum steps are keyed by row id
    if (c.buf?.startsWith('u:') && !S.sounds[c.buf]) S.sounds[c.buf] = it.snames?.[c.buf] || it.sname || 'Audio';
    c.id = uid(); c.start = s0 + off; t.clips.push(c);
    return c;
  });
  ui.tid = t.id; ui.cid = made[0].id; ui.sel = new Set(made.map(c => c.id));
  if (!E.playing()) ui.pos = Math.ceil(s0 + span); // paste again to chain copies
  changed(); loadAssets();
}
export function copyClip(cut) {
  const t = T(ui.tid), group = selClips();
  if (!group.length) return toast('Select a clip first');
  clipboard = itemOf(t, group);
  try { localStorage.setItem('hum.clip', JSON.stringify(clipboard)); } catch { /* this tab only */ } // shared with other tabs
  toast(`${cut ? 'Cut' : 'Copied'} ${group.length > 1 ? group.length + ' clips' : 'clip'}. ⌘V pastes at the playhead`);
  if (cut) deleteClip();
}
/** The copied clip: shared between tabs through localStorage, this tab's own copy as a fallback. */
export function readClipboard() {
  try { return JSON.parse(localStorage.getItem('hum.clip')) || clipboard; } catch { return clipboard; }
}
export function pasteClip() {
  const it = readClipboard();
  if (!it) return toast('Nothing copied yet: select a clip and press ⌘C');
  pasteItem(it, trackFor(it.type), ui.pos);
}
/** Duplicate: a copy right after the selection, in the next free spot. */
export function duplicateClip() {
  const t = T(ui.tid), group = selClips();
  if (group.length) pasteItem(itemOf(t, group), t, Math.max(...group.map(c => c.start + E.clipLen(c, S))));
}
export function deleteClip() { const t = T(ui.tid), group = selClips(); if (group.length) edit(() => (t.clips = t.clips.filter(x => !group.includes(x)))); }
export const storeClips = (t, clips) => storeItem(itemOf(t, clips));
/** Put an item in the box under a fresh name. */
export function storeItem(it) {
  const n = S.box.filter(b => b.type === it.type).length + 1;
  edit(() => S.box.push({ id: uid(), name: it.clips?.length > 1 ? `Section ${n}` : it.c.buf ? it.sname : `${it.type === 'drums' ? 'Beat' : 'Melody'} ${n}`, ...structuredClone(it) }));
  if (!boxOpen()) setBox(true); // so you can see where it went
  toast('Stored in the box. Drag it back onto any track');
}
