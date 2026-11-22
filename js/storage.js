// Saved projects (localStorage) and recorded / imported audio (IndexedDB).
import * as E from './engine.js';
import { S, ui } from './state.js';
import { askConflict } from './projects.js';
import { renderTop } from './timeline.js';
import { $, toast, uid } from './util.js';

const db = new Promise((res, rej) => {
  const r = indexedDB.open('hum', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('audio');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const idb = (mode, fn) => db.then(d => new Promise((res, rej) => {
  const rq = fn(d.transaction('audio', mode).objectStore('audio'));
  rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
}));
export let saveTimer, curId = null; // curId = project being edited; null while on the project screen
export const setCurId = v => { curId = v; };
export const readIdx = () => { try { return JSON.parse(localStorage.getItem('hum.projects')) || []; } catch { return []; } };
export const readProj = id => { try { return JSON.parse(localStorage.getItem('hum.p.' + id)); } catch { return null; } };
/** Write a project and its list entry (bars, tracks, bpm for the project screen). */
/** prev = revision currently stored. Every write raises it by one, so a tab can tell when another tab wrote in between. */
export function store(p, id = uid(), prev = readProj(id)?.meta?.rev ?? 0) {
  p.name ||= 'untitled'; p.box ??= [];
  p.meta ??= {}; p.meta.created ??= new Date().toISOString(); p.meta.modified ??= p.meta.created; p.meta.rev = prev + 1;
  try {
    localStorage.setItem('hum.p.' + id, JSON.stringify(p));
    localStorage.setItem('hum.projects', JSON.stringify([{ id, name: p.name, at: Date.now(), tracks: p.tracks.length, bars: E.songSteps(p) / 16, bpm: p.bpm }, ...readIdx().filter(x => x.id !== id)]));
    return id;
  } catch { toast('Could not save: browser storage is full'); return null; }
}
let asking = false; // a "changed in another tab" question is open
export function flush() {
  clearTimeout(saveTimer);
  if (!curId || asking) return;
  const prev = readProj(curId)?.meta?.rev ?? 0;
  if (prev !== (S.meta?.rev ?? 0)) { asking = true; return askConflict(curId, prev, S, () => (asking = false)); } // another tab saved this project since we last did
  store(S, curId, prev);
}
export const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); };
const AUDIO_AT = 'hum.audioAt'; // sound id -> when it was stored
const readAudioAt = () => { try { return JSON.parse(localStorage.getItem(AUDIO_AT)) || {}; } catch { return {}; } };
/** Delete stored audio that no project points at any more. */
export function sweepAudio() {
  flush();
  const keep = new Set(curId ? Object.keys(S.sounds) : []);
  try { const b = JSON.parse(localStorage.getItem('hum.clip'))?.c?.buf; if (b) keep.add(b); } catch { /* no clipboard */ }
  for (const { id } of readIdx()) for (const k of Object.keys(readProj(id)?.sounds || {})) keep.add(k);
  const at = readAudioAt(), recent = Date.now() - 6e4; // audio saved in the last minute may belong to a project another tab has not saved yet
  idb('readwrite', s => s.getAllKeys()).then(keys => keys.filter(k => !keep.has(k) && !(at[k] > recent)).forEach(k => idb('readwrite', s => s.delete(k)))).catch(() => {});
  try { localStorage.setItem(AUDIO_AT, JSON.stringify(Object.fromEntries(Object.entries(at).filter(([, t]) => t > recent)))); } catch { /* list only grows by a few entries */ }
}
export async function sound(id) {
  if (E.buffers.has(id)) return E.buffers.get(id);
  if (id.startsWith('lib:')) return E.loadSound(id);
  const d = await idb('readonly', s => s.get(id));
  if (!d) return;
  const buf = new AudioBuffer({ length: d.ch[0].length, numberOfChannels: d.ch.length, sampleRate: d.sr });
  d.ch.forEach((ch, i) => buf.copyToChannel(ch, i));
  E.buffers.set(id, buf);
  return buf;
}
export function keepSound(buf, name, id) { // id given = restoring from a .hum file, the project already lists it
  E.buffers.set(id ??= 'u:' + uid(), buf); if (arguments.length < 3) S.sounds[id] = name;
  try { localStorage.setItem(AUDIO_AT, JSON.stringify({ ...readAudioAt(), [id]: Date.now() })); } catch { /* sweep falls back to project lists only */ }
  // shortcut: raw float PCM (about 20 MB per stereo minute), compress before storing if people import whole albums
  idb('readwrite', s => s.put({ sr: buf.sampleRate, ch: Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)) }, id))
    .catch(() => toast('Could not store that audio: it will be gone after a reload'));
  return id;
}
export async function loadAssets() {
  const jobs = Object.keys(S.sounds).map(sound);
  for (const t of S.tracks) {
    if (t.inst) jobs.push(E.loadInstrument(t.inst));
    for (const r of t.rows || []) jobs.push(sound(r.sound));
    for (const c of t.clips) if (c.buf) jobs.push(sound(c.buf));
  }
  const res = await Promise.allSettled(jobs);
  ui.missing = missingIds(); renderTop();
  if (ui.missing.length) toast(`${ui.missing.length} audio file${ui.missing.length === 1 ? ' is' : 's are'} missing. Open media to relink or remove`, 7000);
  else if (res.some(r => r.status === 'rejected')) toast('Some sounds failed to load');
}
/** Recorded or imported sounds this project refers to (listed, or used by a clip or drum row). */
export function customIds(p = S) {
  const ids = new Set(Object.keys(p.sounds));
  for (const t of p.tracks) { for (const c of t.clips) if (c.buf?.startsWith('u:')) ids.add(c.buf); for (const r of t.rows || []) if (r.sound.startsWith('u:')) ids.add(r.sound); }
  return [...ids];
}
export const missingIds = () => customIds().filter(id => !E.buffers.has(id));
export const usage = (id, p = S) => p.tracks.reduce((n, t) => n + t.clips.filter(c => c.buf === id).length + (t.rows || []).filter(r => r.sound === id).length, 0);
