// Entry point: wires the DOM, keyboard and boot.
import * as E from './engine.js';
import { ICON } from './icons.js';
import { addTrack, copyClip, deleteClip, duplicateClip, importFiles, pasteClip, storeClips } from './clips.js';
import { boxOpen, pasteToBox, setBox } from './box.js';
import { fill } from './controls.js';
import { openChangelog, openCredits, openPrefs, openShortcuts } from './dialogs.js';
import { applyTheme } from './theme.js';
import { changed, edit, markSel, selClips, snap, travel } from './edit.js';
import { renderEditor } from './editor.js';
import { exportHum, importHumFiles } from './hum.js';
import { renderLib } from './library.js';
import { openMedia } from './media.js';
import { openProject, showHome } from './projects.js';
import { readColors, render, startFrames } from './render.js';
import { tileKey } from './tiles.js';
import { APP, G, HEAD, KEYS, LIB, LIBMAP, S, T, blank, demo, looping, redo, ui, undo } from './state.js';
import { curId, readIdx, readProj, store, sweepAudio } from './storage.js';
import { renderArr, syncTransport } from './timeline.js';
import { exportWav, stopAll, togglePlay, toggleRec } from './transport.js';
import { $, clamp, h, toast } from './util.js';

$('#stop').innerHTML = ICON.stop + 'stop'; $('#rec').innerHTML = ICON.mic + 'rec';
$('#key').append(...KEYS.map((k, i) => h('option', { value: i, textContent: k })));
$('#scale').append(...[['minor', 'minor'], ['major', 'major'], ['chromatic', 'all notes']].map(([v, l]) => h('option', { value: v, textContent: l })));
$('#adders').append(...[['Drums', 'drums', () => addTrack('drums')], ['Piano', 'piano', () => addTrack('inst', 'piano')], ['Flute', 'flute', () => addTrack('inst', 'flute')],
  ['Synth', 'synth', () => addTrack('inst', 'lead')], ['Audio', 'file', () => $('#file').click()]]
  .map(([label, , fn]) => h('button', { className: 'btn sm', onclick: fn, title: label === 'Audio' ? 'Import an audio file as a new track' : `Add a ${label.toLowerCase()} track` }, '+ ' + label)));

$('#ver').textContent = 'v' + APP.version;
$('#loop').innerHTML = ICON.repeat + 'loop'; $('#prefs').innerHTML = ICON.gear;
$('#loop').onclick = () => { S.loop = !looping(); changed(true); syncTransport(); };
E.eng.onEnd = () => { ui.pos = 0; syncTransport(); };
$('#prefs').onclick = () => openPrefs('theme'); $('#credits').onclick = openCredits; $('#changelog').onclick = openChangelog; $('#boxbtn').onclick = () => setBox(!boxOpen()); $('#boxclose').onclick = () => setBox(false); $('#keys').onclick = openShortcuts;
$('#play').onclick = togglePlay; $('#stop').onclick = stopAll; $('#rec').onclick = toggleRec;
$('#undo').onclick = () => travel(undo, redo); $('#redo').onclick = () => travel(redo, undo);
$('#export').onclick = exportWav;
$('#home').onclick = showHome; $('#media').onclick = openMedia; $('#savefile').onclick = () => exportHum(S);
$('#pname').onchange = e => { S.name = e.target.value.trim() || 'untitled'; e.target.value = S.name; changed(true); };
$('#store').onclick = () => (selClips().length ? storeClips(T(ui.tid), selClips()) : toast('Select a clip first'));
$('#hfile').onchange = e => { importHumFiles([...e.target.files]); e.target.value = ''; };
$('#bpm').onchange = e => edit(() => (S.bpm = clamp(+e.target.value || 100, 40, 240)));
$('#key').onchange = e => edit(() => (S.key = +e.target.value));
$('#scale').onchange = e => edit(() => (S.scale = e.target.value));
$('#master').onpointerdown = snap;
$('#master').oninput = e => { S.vol = +e.target.value; fill(e.target); changed(true); };
const zoom = v => { ui.sp = clamp(v, 3, 22); $('#zoom').value = ui.sp; fill($('#zoom')); renderArr(); };
$('#zoom').oninput = e => zoom(+e.target.value);
$('#zout').onclick = () => zoom(ui.sp - 2); $('#zin').onclick = () => zoom(ui.sp + 2);
$('#zoom').value = ui.sp; fill($('#zoom'));
// ⌘/ctrl + wheel (or trackpad pinch) zooms the timeline around the pointer
let zoomRaf = 0;
$('#scroll').addEventListener('wheel', e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  const sc = $('#scroll'), x = e.clientX - sc.getBoundingClientRect().left, step = (x + sc.scrollLeft - HEAD) / ui.sp;
  ui.sp = clamp(ui.sp * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)), 3, 22);
  cancelAnimationFrame(zoomRaf);
  zoomRaf = requestAnimationFrame(() => { $('#zoom').value = ui.sp; fill($('#zoom')); renderArr(); sc.scrollLeft = Math.max(0, step * ui.sp + HEAD - x); }); // keep the step under the pointer in place
}, { passive: false });
$('#q').oninput = e => { ui.q = e.target.value; renderLib(); };
$('#import').onclick = () => $('#file').click();
$('#file').onchange = e => { importFiles([...e.target.files]); e.target.value = ''; };
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => {
  e.preventDefault();
  const files = [...e.dataTransfer.files], hum = files.filter(f => f.name.endsWith('.hum'));
  if (hum.length) importHumFiles(hum); else if (files.length && curId) importFiles(files);
});

// computer keyboard: shortcuts, and A W S E D F T G Y H U J K O L P plays the selected instrument
const NOTE_KEYS = 'awsedftgyhujkolp', held = {};
addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); const d = document.querySelector('.dlg[data-t="keyboard shortcuts"]'); return d ? d.remove() : openShortcuts(); }
  if (document.querySelector('.dlg')) return;
  if (e.target.matches('input:not([type=range]), select, textarea')) return;
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (tileKey(e, mod, k)) return void e.preventDefault(); // selected notes / pads in the open pattern come first
  if (k === ' ') { e.preventDefault(); if (document.activeElement?.tagName === 'BUTTON') document.activeElement.blur(); togglePlay(); }
  else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? travel(redo, undo) : travel(undo, redo); }
  else if (mod && k === 'd') { e.preventDefault(); duplicateClip(); }
  else if (mod && k === 'a') { const t = T(ui.tid); if (t?.clips.length) { e.preventDefault(); ui.sel = new Set(t.clips.map(c => c.id)); ui.cid ||= t.clips[0].id; markSel(); renderEditor(); } }
  else if (mod && k === 'c') copyClip();
  else if (mod && k === 'x') copyClip(true);
  else if (mod && k === 'v') (e.target.closest?.('#box') ? pasteToBox() : pasteClip());
  else if (mod && k === 's') { e.preventDefault(); exportHum(S); }
  else if ((k === 'delete' || k === 'backspace') && !e.target.closest?.('input, select, button, textarea, #box')) deleteClip(); // not while a slider, button or the box has focus
  else if (!mod && !e.repeat && NOTE_KEYS.includes(k) && T(ui.tid)?.inst && !held[k]) {
    const t = T(ui.tid);
    E.ac.resume(); held[k] = E.playNote(E.live, E.trackIn(E.live, t.id).in, t, 60 + NOTE_KEYS.indexOf(k), E.ac.currentTime);
  }
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); held[k]?.(); delete held[k]; });
addEventListener('resize', () => renderArr());
addEventListener('storage', e => { if (curId && e.key === 'hum.p.' + curId) toast('This project was changed in another tab. Your next change will ask which version to keep.', 7000); }); // fires in the other tabs only

// ---------- boot ----------
applyTheme(); readColors(); setBox(G.boxOpen ?? innerWidth > 1100, false);
$('#changelog').textContent = 'changelog · v' + APP.version;
blank(); // placeholder so the editor DOM has something to draw while the project screen is up
const legacy = localStorage.getItem('hum.project'); // single-project saves from before the project screen
if (legacy) { try { const p = JSON.parse(legacy); if (p?.tracks) store({ name: 'my song', ...p }); localStorage.removeItem('hum.project'); } catch { /* corrupt: drop it */ } }
if (!readIdx().length) { demo(); store(S); blank(); }
E.eng.S = S; E.eng.loop = looping(); E.applyMix(E.live, S);
render(); startFrames();
const want = new URLSearchParams(location.search).get('open'); // set when a project is opened in a new tab
if (want && readProj(want)) { history.replaceState(null, '', location.pathname); openProject(want); } else showHome();
LIB.push(...await fetch('sounds/index.json').then(r => r.json()).catch(() => (toast('Sound library failed to load'), [])));
for (const s of LIB) LIBMAP.set('lib:' + s.file, s);
$('#libcount').textContent = `${LIB.length} files`;
if (curId) render();
sweepAudio();
