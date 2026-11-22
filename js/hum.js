// The .hum project file: export, import, and the drop-a-file menu.
import * as E from './engine.js';
import { encodeWav } from './dsp.js';
import { openProject, showHome } from './projects.js';
import { APP, FORMAT, KEYS, S, pretty } from './state.js';
import { curId, customIds, keepSound, readIdx, readProj, save, sound, store, sweepAudio, usage } from './storage.js';
import { $, h, toast } from './util.js';
import { checkProject, isAudioData, packHum } from './humfile.js';

const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
export const ago = t => { const m = (Date.now() - t) / 6e4; return m < 1 ? 'just now' : m < 60 ? `${Math.floor(m)}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };
const download = (blob, name) => { const a = h('a', { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); };
const dataUrl = blob => new Promise(res => Object.assign(new FileReader(), { onload: e => res(e.target.result) }).readAsDataURL(blob));

export const libRefs = p => {
  const ids = new Set();
  for (const t of p.tracks) { for (const c of t.clips) if (c.buf?.startsWith('lib:')) ids.add(c.buf); for (const r of t.rows || []) if (r.sound.startsWith('lib:')) ids.add(r.sound); }
  return [...ids].sort();
};
export const mb = n => (n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
export const wavBytes = b => 44 + b.length * b.numberOfChannels * 2;
export const fmtDate = iso => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'n/a');

/** .hum = JSON: a header (format, app version, song details, cover, media list with sizes and links), the project, and every recorded/imported sound as a 16-bit WAV. Library sounds are linked by path. */
export async function exportHum(p, id) {
  toast('Packing project…', 60000);
  const audio = {}, embedded = [];
  for (const sid of customIds(p)) {
    const buf = await sound(sid).catch(() => null), name = p.sounds[sid] || 'Audio', used = usage(sid, p);
    if (!buf) { embedded.push({ id: sid, name, status: 'missing', used }); continue; }
    audio[sid] = await dataUrl(new Blob([encodeWav(Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)), buf.sampleRate)], { type: 'audio/wav' }));
    embedded.push({ id: sid, name, status: 'embedded', file: slug(name) + '.wav', mime: 'audio/wav', bytes: wavBytes(buf), seconds: +buf.duration.toFixed(3), sampleRate: buf.sampleRate, channels: buf.numberOfChannels, used });
  }
  const lost = embedded.filter(m => m.status === 'missing');
  p.meta ??= {}; p.meta.revision = (p.meta.revision || 0) + 1; // counts how often this project was saved as a file
  if (id) store(p, id); else save();
  const m = p.meta, bars = E.songSteps(p) / 16;
  const env = {
    hum: 1, format: FORMAT, app: APP, exported: new Date().toISOString(), size: 0,
    meta: {
      title: p.name, artist: m.artist || '', genre: m.genre || '', tags: m.tags || [], description: m.description || '', cover: m.cover || null,
      created: m.created, modified: m.modified, revision: m.revision, bpm: p.bpm, key: KEYS[p.key], scale: p.scale, tracks: p.tracks.length, bars, seconds: +(bars * 16 * E.stepSec(p)).toFixed(2),
    },
    media: { embedded, library: libRefs(p).map(path => ({ path, name: pretty(path.slice(4)) })), audioBytes: embedded.reduce((n, x) => n + (x.bytes || 0), 0) },
    project: p,
  };
  const json = packHum(env, audio);
  download(new Blob([json], { type: 'application/json' }), slug(p.name) + '.hum');
  toast(lost.length ? `Saved ${slug(p.name)}.hum, but ${lost.length} missing audio file${lost.length === 1 ? ' was' : 's were'} left out` : `Saved ${slug(p.name)}.hum (${mb(env.size)})`, lost.length ? 6000 : 2600);
}
async function importHum(f) {
  let d;
  try { d = JSON.parse(await f.text()); } catch { /* falls through to the check below */ }
  if (d?.project && !d.project.name) d.project.name = d.meta?.title;
  const project = d?.hum === 1 ? checkProject(d.project) : null; // everything in the file is untrusted until checked
  if (!project) { toast(`${f.name} is not a hum project file`, 4000); return null; }
  if (d.format > FORMAT) toast(`${f.name} was saved by a newer hum: some details may not load`, 5000);
  for (const [id, url] of Object.entries(d.audio || {})) {
    if (!isAudioData(url)) { toast(`Skipped a sound in ${f.name}: it is not stored in the file`, 4000); continue; } // never fetch a URL from a file
    try { keepSound(await E.ac.decodeAudioData(await (await fetch(url)).arrayBuffer()), project.sounds[id] || 'Audio', id); }
    catch { toast(`A sound in ${f.name} could not be decoded`, 4000); }
  }
  return store(project);
}
export async function importHumFiles(files) {
  const ids = [];
  for (const f of files) { const id = await importHum(f); if (id) ids.push(id); }
  if (!ids.length) return;
  if (curId) return chooseImport(ids); // a project is open: ask what to do with the dropped file
  if (ids.length === 1) return openProject(ids[0]);
  toast(`Imported ${ids.length} projects`); showHome();
}
/** Dropped .hum while editing: the file is already stored as a project; pick where it goes. */
function chooseImport(ids) {
  const names = ids.map(id => readProj(id)?.name).join(', '), close = fn => () => { dlg.remove(); fn?.(); };
  const opt = (label, hint, fn) => h('button', { className: 'opt', onclick: close(fn) }, h('b', { textContent: label }), h('small', { textContent: hint }));
  const dlg = h('div', { className: 'dlg', onkeydown: e => e.key === 'Escape' && cancel.click() },
    h('div', { className: 'dbox', role: 'dialog', ariaLabel: 'Import project' },
      h('div', { className: 'dttl', textContent: `import ${names}` }),
      opt('open here', `"${S.name}" stays in your project list, autosaved`, () => openProject(ids[0])),
      opt('save current as .hum, then open here', 'downloads a file of the project you are leaving', async () => { await exportHum(S); openProject(ids[0]); }),
      opt('open in a new tab', 'keeps this project open where it is', () => window.open('?open=' + ids[0], '_blank')),
      opt('add to my projects only', 'import it, change nothing here', () => toast(`Added ${names} to your projects`)),
      opt('cancel', 'discard the dropped file', () => { for (const id of ids) localStorage.removeItem('hum.p.' + id); localStorage.setItem('hum.projects', JSON.stringify(readIdx().filter(x => !ids.includes(x.id)))); sweepAudio(); })));
  const cancel = dlg.lastChild.lastChild;
  document.body.append(dlg); dlg.querySelector('.opt').focus();
}
