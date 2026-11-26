// The project screen: list, open, copy, delete.
import * as E from './engine.js';
import { madeBy, openPrefs } from './dialogs.js';
import { changed } from './edit.js';
import { ago, exportHum } from './hum.js';
import { APP, S, blank, demo, redo, setS, ui, undo } from './state.js';
import { curId, flush, loadAssets, readIdx, readProj, setCurId, store, sweepAudio } from './storage.js';
import { syncTransport } from './timeline.js';
import { $, h, toast } from './util.js';
import { checkProject, safeCover } from './humfile.js';
import { startFrames } from './render.js';

/** Another tab saved this project after we loaded it: never overwrite silently. */
export function askConflict(id, prev, mine, done) {
  const opt = (label, hint, fn) => h('button', { className: 'opt', onclick: () => { dlg.remove(); fn(); done(); } }, h('b', { textContent: label }), h('small', { textContent: hint }));
  const dlg = h('div', { className: 'dlg' }, h('div', { className: 'dbox', role: 'alertdialog', ariaLabel: 'Project changed in another tab' },
    h('div', { className: 'dttl', textContent: `"${mine.name}" was changed in another tab` }),
    opt('keep my version', "overwrites the other tab's changes", () => store(mine, id, prev)),
    opt("use the other tab's version", 'drops what you changed here since the last save', () => { if (curId === id) openProject(id, true); })));
  document.body.append(dlg); dlg.querySelector('.opt').focus();
}
export async function openProject(id, discard) { // discard = leave the open project without saving it
  const p = checkProject(readProj(id)); // storage can be damaged or from an older version
  if (!p) return toast('Could not open that project');
  if (!discard) flush();
  E.stop();
  setS(p); S.box ??= []; setCurId(id); undo.length = redo.length = 0; ui.pos = 0; ui.missing = [];
  ui.tid = S.tracks[0]?.id ?? null; ui.cid = S.tracks[0]?.clips[0]?.id ?? null;
  $('#pm').hidden = true; startFrames(); syncTransport(); changed();
  loadAssets().then(() => changed());
}
function createProject(withDemo) { withDemo ? demo() : blank(); const id = store(S); setS(null); if (id) openProject(id); }
const thumb = id => { const c = safeCover(readProj(id)?.meta?.cover); return h('i', { className: 'thumb', style: c ? `background-image:url("${c}")` : '' }); };
const artist = id => h('span', { className: 'lab', textContent: readProj(id)?.meta?.artist || '' });
export function showHome() {
  flush(); E.stop(); setCurId(null); syncTransport();
  const idx = readIdx().sort((a, b) => b.at - a.at);
  const row = p => h('div', { className: 'pmrow proj', tabIndex: 0, onclick: () => openProject(p.id), onkeydown: e => e.key === 'Enter' && e.target === e.currentTarget && openProject(p.id) },
    h('span', { className: 'pn' }, thumb(p.id), h('input', {
      className: 'pname', value: p.name, ariaLabel: 'Project name', spellcheck: false, maxLength: 60,
      onclick: e => e.stopPropagation(), onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); },
      onchange: e => { const q = readProj(p.id); if (q) { q.name = e.target.value.trim() || 'untitled'; store(q, p.id); } showHome(); },
    }), artist(p.id)),
    h('span', { className: 'lab', textContent: p.tracks }), h('span', { className: 'lab', textContent: p.bars }), h('span', { className: 'lab', textContent: p.bpm }), h('span', { className: 'lab', textContent: ago(p.at) }),
    h('span', { className: 'acts' },
      h('button', { className: 'btn sm', textContent: 'save .hum', title: 'Download this project as a .hum file', onclick: e => { e.stopPropagation(); exportHum(readProj(p.id), p.id); } }),
      h('button', { className: 'btn sm', textContent: 'copy', title: 'Duplicate this project', onclick: e => { e.stopPropagation(); const q = readProj(p.id); q.name += ' copy'; store(q); showHome(); } }),
      h('button', { className: 'btn sm', textContent: 'del', title: 'Delete this project', onclick: e => {
        e.stopPropagation();
        if (!confirm(`Delete "${p.name}"? Save a .hum first if you want to keep it. This cannot be undone.`)) return;
        localStorage.removeItem('hum.p.' + p.id); localStorage.setItem('hum.projects', JSON.stringify(readIdx().filter(x => x.id !== p.id))); sweepAudio(); showHome();
      } })));
  $('#pm').replaceChildren(
    h('div', { className: 'masthead' }, h('img', { src: 'logo.png', alt: '', width: 72, height: 72 }), h('span', { className: 'brand' }, 'hum', h('i', { className: 'cur' })), h('span', { className: 'lab', textContent: `a tiny beat maker · v${APP.version}` })),
    h('div', { className: 'pmhead' }, h('span', { className: 'grow' }),
      h('button', { className: 'btn', textContent: 'preferences', title: 'Theme and settings that apply to every project', onclick: () => openPrefs('theme') }),
      h('button', { className: 'btn', textContent: 'import .hum', title: 'Open a project file from your computer', onclick: () => $('#hfile').click() }),
      h('button', { className: 'btn', textContent: 'demo song', onclick: () => createProject(true) }),
      h('button', { className: 'btn pri', textContent: 'new project', onclick: () => createProject() })),
    h('div', { className: 'pmrow pmcols' }, ...['name', 'tracks', 'bars', 'bpm', 'last used', ''].map(t => h('span', { textContent: t }))),
    ...idx.map(row),
    ...(idx.length ? [] : [h('div', { className: 'none', textContent: 'No projects yet. Start a new one, load the demo song, or import a .hum file.' })]),
    h('div', { className: 'pmfoot' }, 'projects are stored in this browser. save .hum to keep a file on your disk, import .hum to bring one back. drop a .hum file anywhere on this page. ',
      h('a', { className: 'link', href: 'https://forms.gle/zRYggNHsp3oqUY5m8', target: '_blank', rel: 'noopener', textContent: 'send feedback' })),
    madeBy());
  $('#pm').hidden = false;
}
