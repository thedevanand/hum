// Right-click menus for clips and empty lane space.
import { duplicateClip, deleteClip, copyClip, pasteItem, readClipboard, storeClips } from './clips.js';
import { S, ui } from './state.js';
import { renderEditor } from './editor.js';
import { edit, select, selClips } from './edit.js';
import { openMenu } from './menu.js';
import { MOD } from './dialogs.js';
import { uid } from './util.js';

const stepAt = (e, lane) => Math.max(0, (e.clientX - lane.getBoundingClientRect().left) / ui.sp);
const pasteAt = (t, step) => { const it = readClipboard(); if (it) pasteItem(it, t.type === it.type ? t : S.tracks.find(x => x.type === it.type), step); };
const tab = name => () => { ui.tab = name; renderEditor(); };

export function showClipMenu(e, t, c) {
  e.preventDefault(); e.stopPropagation();
  if (!ui.sel.has(c.id)) select(t.id, c.id); else ui.cid = c.id;
  const n = selClips().length, many = n > 1 ? ` ${n} clips` : '', step = stepAt(e, e.currentTarget.closest('.lane'));
  openMenu(e.clientX, e.clientY, [
    { label: 'copy' + many, key: MOD + 'C', run: () => copyClip() },
    { label: 'cut' + many, key: MOD + 'X', run: () => copyClip(true) },
    { label: 'paste here', key: MOD + 'V', disabled: !readClipboard(), run: () => pasteAt(t, step) },
    { label: 'duplicate' + many, key: MOD + 'D', run: duplicateClip },
    '-',
    { label: 'store in box', run: () => storeClips(t, selClips()) },
    { label: 'effects…', run: () => { ui.fxScope = 'clip'; tab('fx')(); } },
    { label: 'edit', run: tab('edit') },
    '-',
    { label: 'delete' + many, key: 'del', danger: true, run: deleteClip },
  ]);
}

export function showLaneMenu(e, t, lane) {
  e.preventDefault();
  const step = stepAt(e, lane), bar = Math.floor(step / 16) * 16;
  openMenu(e.clientX, e.clientY, [
    { label: 'paste here', key: MOD + 'V', disabled: !readClipboard(), run: () => pasteAt(t, step) },
    t.type !== 'audio' && { label: 'new pattern here', run: () => { const c = { id: uid(), start: bar, len: t.type === 'drums' ? 16 : 32, ...(t.type === 'drums' ? { steps: {} } : { notes: [] }) }; edit(() => { t.clips.push(c); ui.tid = t.id; ui.cid = c.id; }); } },
  ].filter(Boolean));
}
