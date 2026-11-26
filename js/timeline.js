// Top bar read-outs and the track timeline.
import * as E from './engine.js';
import { fxDrop, dropFxOnLane } from './fxpanel.js';
import { showClipMenu, showLaneMenu } from './ctxmenu.js';
import { ICON } from './icons.js';
import { dragBox } from './box.js';
import { addSound, importFiles, overBox, pasteItem, storeClips } from './clips.js';
import { fill, range } from './controls.js';
import { drawClip } from './draw.js';
import { changed, edit, multiSelect, seek, select, snap } from './edit.js';
import { renderEditor } from './editor.js';
import { dragId } from './library.js';
import { COLORS, HEAD, S, looping, redo, soundName, trackIcon, ui, undo, viewSteps } from './state.js';
import { MAC, $, clamp, drag, h, uid } from './util.js';

export function renderTop() {
  for (const [id, v] of [['bpm', S.bpm], ['key', S.key], ['scale', S.scale], ['master', S.vol]]) { const el = $('#' + id); if (document.activeElement !== el) el.value = v; }
  fill($('#master'));
  if (document.activeElement !== $('#pname')) $('#pname').value = S.name;
  const miss = ui.missing?.length || 0; $('#media').textContent = miss ? `media · ${miss} missing` : 'media'; $('#media').classList.toggle('warn', !!miss);
  $('#undo').disabled = !undo.length; $('#redo').disabled = !redo.length;
  syncTransport();
}
export function syncTransport() {
  const on = E.playing();
  $('#play').innerHTML = on ? ICON.pause + 'pause' : ICON.play + 'play'; $('#play').classList.toggle('on', on); $('#play').ariaLabel = on ? 'Pause' : 'Play';
  $('#rec').classList.toggle('on', E.recording()); $('#loop').classList.toggle('on', looping());
}

// ---------- timeline ----------
export const playhead = h('div', { className: 'playhead' });
export function renderArr() {
  const sp = ui.sp, len = E.songSteps(S), steps = viewSteps(S) + 64;
  $('#inner').style.setProperty('--sp', sp + 'px');
  const ruler = h('div', {
    className: 'ruler',
    onpointerdown: e => {
      const left = ruler.lastChild.getBoundingClientRect().left, go = ev => seek(clamp(Math.round((ev.clientX - left) / ui.sp), 0, steps - 1));
      go(e); drag(go);
    },
  }, h('div', { className: 'corner lab', textContent: `${S.tracks.length} track${S.tracks.length === 1 ? '' : 's'} · ${len / 16} bars` }),
  h('div', { className: 'bars' }, Array.from({ length: steps / 16 }, (_, i) => h('span', { textContent: i + 1, style: `width:${16 * sp}px` }))));
  $('#inner').replaceChildren(ruler, ...S.tracks.map(t => trackRow(t, steps)), h('div', { className: 'beyond', style: `left:${HEAD + len * sp}px` }), playhead);
}
function trackRow(t, steps) {
  const lane = h('div', {
    className: 'lane', style: `width:${steps * ui.sp}px`,
    onpointerdown: () => select(t.id),
    oncontextmenu: e => e.target === lane && showLaneMenu(e, t, lane),
    ondblclick: e => {
      if (t.type === 'audio' || e.target !== lane) return;
      const c = { id: uid(), start: Math.floor((e.clientX - lane.getBoundingClientRect().left) / ui.sp / 16) * 16, len: t.type === 'drums' ? 16 : 32, ...(t.type === 'drums' ? { steps: {} } : { notes: [] }) };
      edit(() => { t.clips.push(c); ui.tid = t.id; ui.cid = c.id; });
    },
    ondragover: e => { e.preventDefault(); lane.classList.add('over'); },
    ondragleave: () => lane.classList.remove('over'),
    ondrop: e => {
      if (dropFxOnLane(t, e)) return lane.classList.remove('over');
      if ([...e.dataTransfer.files].some(f => f.name.endsWith('.hum'))) return; // let the page-level handler offer choices
      e.preventDefault(); e.stopPropagation(); lane.classList.remove('over');
      const step = Math.max(0, Math.round((e.clientX - lane.getBoundingClientRect().left) / ui.sp));
      if (dragBox) { const it = S.box.find(b => b.id === dragBox); if (it) pasteItem(it, t, step); }
      else if (dragId) addSound(dragId, t.id, step); else if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files, t.id, step);
    },
  }, t.clips.map(c => clipEl(t, c)), !t.clips.length && h('span', { className: 'hint', textContent: t.type === 'audio' ? 'Drop a sound here, or press record' : 'Double-click to add a pattern' }));
  return h('div', { className: 'track' + (t.id === ui.tid ? ' sel' : ''), style: `--c:${COLORS[t.color]}`, data: { tid: t.id } },
    h('div', { className: 'thead', ...fxDrop(() => ({ scope: 'track', tid: t.id })), onpointerdown: () => select(t.id, ui.tid === t.id ? ui.cid : t.clips[0]?.id ?? null) },
      h('span', { className: 'tile', innerHTML: ICON[trackIcon(t)] }),
      h('input', { className: 'tname', value: t.name, ariaLabel: 'Track name', onchange: e => edit(() => (t.name = e.target.value || 'Track')) }),
      h('button', { className: 'ms' + (t.mute ? ' on' : ''), textContent: 'M', title: 'Mute', ariaLabel: 'Mute', ariaPressed: t.mute, onclick: () => edit(() => (t.mute = !t.mute)) }),
      h('button', { className: 'ms solo' + (t.solo ? ' on' : ''), textContent: 'S', title: 'Solo', ariaLabel: 'Solo', ariaPressed: t.solo, onclick: () => edit(() => (t.solo = !t.solo)) }),
      h('button', { className: 'ms del', innerHTML: ICON.x, title: 'Delete track', ariaLabel: 'Delete track', onclick: () => edit(() => (S.tracks = S.tracks.filter(x => x !== t))) }),
      range(t.vol, [0, 1, 0.01], v => (t.vol = v), { className: 'slim', ariaLabel: 'Track volume', title: 'Volume' })),
    lane);
}
function clipEl(t, c) {
  const cv = h('canvas');
  const el = h('div', {
    className: 'clip' + (ui.sel.has(c.id) ? ' sel' : ''), data: { cid: c.id },
    style: `left:${c.start * ui.sp}px;width:${E.clipLen(c, S) * ui.sp}px`,
    oncontextmenu: e => showClipMenu(e, t, c),
    ...fxDrop(() => ({ scope: 'clip', tid: t.id, cid: c.id })),
    onpointerdown: e => {
      if (e.button) return;
      e.stopPropagation();
      if ((e.metaKey || (e.ctrlKey && !MAC) || e.shiftKey) && ui.tid === t.id) return multiSelect(t, c, e.shiftKey && !e.metaKey && !e.ctrlKey);
      const inGroup = ui.sel.size > 1 && ui.sel.has(c.id);
      if (inGroup) { ui.cid = c.id; renderEditor(); } else select(t.id, c.id);
      const resize = e.target.classList.contains('grip'), x0 = e.clientX, len0 = c.buf ? c.dur : c.len, grid = c.buf ? 1 : 16;
      const group = resize ? [c] : t.clips.filter(x => ui.sel.has(x.id) || x === c), starts = group.map(x => x.start), min0 = Math.min(...starts);
      let moved = false;
      drag(ev => {
        const dx = (ev.clientX - x0) / ui.sp;
        if (!moved && Math.abs(ev.clientX - x0) < 3) return;
        if (!moved) { moved = true; snap(); }
        if (!resize) {
          const d = Math.max(-min0, Math.round(dx / grid) * grid); // the whole selection moves together
          group.forEach((x, i) => { x.start = starts[i] + d; const n = document.querySelector(`.clip[data-cid="${x.id}"]`); if (n) n.style.left = x.start * ui.sp + 'px'; });
        } else {
          if (c.buf) c.dur = clamp(len0 + dx * E.stepSec(S) * c.rate, 0.05, E.buffers.get(c.buf).duration - c.off);
          else c.len = Math.max(16, Math.round((len0 + dx) / 16) * 16);
          el.style.width = E.clipLen(c, S) * ui.sp + 'px';
        }
        $('#box').classList.toggle('over', !resize && overBox(ev));
      }, ue => {
        $('#box').classList.remove('over');
        if (!moved) { if (inGroup) select(t.id, c.id); return; } // plain click on a selected clip collapses to that one
        if (!resize && overBox(ue)) { undo.pop(); group.forEach((x, i) => (x.start = starts[i])); storeClips(t, group); } else changed(); // dropped on the box: store copies, the clips stay put
      });
    },
  }, cv, h('span', { className: 'nm', textContent: c.buf ? soundName(c.buf) : t.type === 'drums' ? 'Beat' : 'Melody' }), h('span', { className: 'bdg' }, c.pitch ? h('span', { className: 'fxb', textContent: (c.pitch > 0 ? '+' : '') + c.pitch + 'st', title: 'Pitch' }) : null, c.fx?.some(f => f.on !== false) && h('span', { className: 'fxb', textContent: 'fx', title: 'Has effects' })), h('i', { className: 'grip', title: 'Drag to resize' }));
  requestAnimationFrame(() => drawClip(cv, t, c));
  return el;
}
