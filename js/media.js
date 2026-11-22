// The media manager: this project's recorded and imported audio.
import * as E from './engine.js';
import { ICON } from './icons.js';
import { changed, edit, snap } from './edit.js';
import { renderLib } from './library.js';
import { S, soundName, ui } from './state.js';
import { customIds, keepSound, missingIds, usage } from './storage.js';
import { renderTop } from './timeline.js';
import { $, clock, h, toast } from './util.js';

async function addMedia(f) {
  try { const buf = await E.ac.decodeAudioData(await f.arrayBuffer()); snap(); keepSound(buf, f.name.replace(/\.\w+$/, '')); changed(); }
  catch { toast(`Could not read ${f.name}: not an audio file this browser can decode`); }
}
/** Put a file's audio under an existing sound id: fixes a missing file, or swaps one for another. */
async function relink(id, f) {
  try {
    const buf = await E.ac.decodeAudioData(await f.arrayBuffer());
    snap(); keepSound(buf, '', id); S.sounds[id] ||= f.name.replace(/\.\w+$/, '');
    for (const k of [...E.buffers.keys()]) if (k.startsWith(id + '|')) E.buffers.delete(k); // reverse/pitch/autotune copies of the old audio
    ui.missing = missingIds(); changed(); toast(`${soundName(id)} restored`);
  } catch { toast(`Could not read ${f.name}`); }
}
function removeMedia(id, n) {
  if (n && !confirm(`"${soundName(id)}" is used ${n} time${n === 1 ? '' : 's'}. Remove it and those clips and drum rows?`)) return;
  edit(() => {
    for (const t of S.tracks) { t.clips = t.clips.filter(c => c.buf !== id); if (t.rows) t.rows = t.rows.filter(r => r.sound !== id); }
    S.box = S.box.filter(b => b.c.buf !== id); delete S.sounds[id];
  });
  ui.missing = missingIds(); renderTop();
}
export function openMedia() {
  let playing = null, fixId = null;
  const close = () => { E.stopPreview(); dlg.remove(); renderLib(); }, rfile = $('#rfile');
  const add = h('input', { type: 'file', accept: 'audio/*', multiple: true, hidden: true, onchange: async e => { for (const f of e.target.files) await addMedia(f); e.target.value = ''; paint(); } });
  rfile.onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f && fixId) await relink(fixId, f); paint(); };
  const box = h('div', { className: 'dbox wide', role: 'dialog', ariaLabel: 'Project media' });
  const dlg = h('div', { className: 'dlg', onclick: e => e.target === dlg && close(), onkeydown: e => e.key === 'Escape' && close() }, box, add);
  const row = id => {
    const buf = E.buffers.get(id), n = usage(id);
    return h('div', { className: 'mrow' + (buf ? '' : ' gone') },
      h('button', {
        className: 'cbtn sm', innerHTML: playing === id ? ICON.stop : ICON.play, disabled: !buf, ariaLabel: 'Preview',
        onclick: () => { if (playing === id) { E.stopPreview(); playing = null; return paint(); } playing = id; paint(); E.preview(id, () => { if (playing === id) { playing = null; paint(); } }); },
      }),
      h('input', { className: 'bname', value: soundName(id), ariaLabel: 'Name', spellcheck: false, maxLength: 60, onkeydown: e => e.key === 'Enter' && e.target.blur(), onchange: e => edit(() => (S.sounds[id] = e.target.value.trim() || soundName(id))) }),
      h('span', { className: 'lab', textContent: buf ? clock(buf.duration) : 'missing' }),
      h('span', { className: 'lab', textContent: n ? `used ${n}×` : 'unused' }),
      h('span', { className: 'acts' },
        h('button', { className: 'btn sm', textContent: buf ? 'replace' : 'relink', title: buf ? 'Swap in a different file' : 'Pick the original file again', onclick: () => { fixId = id; rfile.click(); } }),
        h('button', { className: 'btn sm', textContent: 'remove', onclick: () => { removeMedia(id, n); paint(); } })));
  };
  function paint() {
    const ids = customIds(), miss = ids.filter(id => !E.buffers.has(id)), sorted = [...ids.filter(id => !E.buffers.has(id)), ...ids.filter(id => E.buffers.has(id))];
    box.replaceChildren(
      h('div', { className: 'dttl' }, `media · ${S.name} · ${ids.length} file${ids.length === 1 ? '' : 's'}`, h('span', { className: 'grow' }),
        h('button', { className: 'btn sm', textContent: 'add audio', onclick: () => add.click() }), h('button', { className: 'btn sm', textContent: 'close', onclick: close })),
      miss.length && h('div', { className: 'warnbar', textContent: `${miss.length} audio file${miss.length === 1 ? ' is' : 's are'} missing: not stored in this browser (storage was cleared, or the .hum was saved without them). Relink each one to the original file, or remove it.` }),
      h('div', { className: 'mlist' }, ...(sorted.length ? sorted.map(row) : [h('div', { className: 'none', textContent: 'No custom audio yet. Record, import, or add audio files; library sounds are not listed here.' })])));
  }
  paint(); document.body.append(dlg); dlg.querySelector('button:not(:disabled)')?.focus();
}
