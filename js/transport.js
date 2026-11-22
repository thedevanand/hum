// Play, stop, record and WAV export.
import * as E from './engine.js';
import { changed, snap } from './edit.js';
import { S, T, pushTrack, ui } from './state.js';
import { keepSound, loadAssets } from './storage.js';
import { syncTransport } from './timeline.js';
import { $, h, toast, uid } from './util.js';

let recStart = 0;
export function togglePlay() {
  if (E.recording()) return finishRec();
  if (E.playing()) { ui.pos = Math.floor(E.position() ?? ui.pos); E.stop(); } else E.play(ui.pos);
  syncTransport();
}
export function stopAll() {
  if (E.recording()) return finishRec();
  E.stop(); ui.pos = 0; syncTransport();
}
export async function toggleRec() {
  if (E.recording()) return finishRec();
  try { await E.startRec(); } catch { return toast('Microphone blocked. Allow mic access for this page to record.', 5000); }
  recStart = Math.floor(ui.pos); E.play(recStart); syncTransport();
  toast('Recording… wear headphones so the beat stays out of the mic', 4000);
}
async function finishRec() {
  const done = E.stopRec(); E.stop(); syncTransport();
  let buf;
  try { buf = await done; } catch { return toast('Recording failed: nothing was captured'); }
  // shortcut: fixed latency guess (scheduler lead-in + output latency), add a calibration step if takes land audibly late
  const lag = Math.min(0.05 + (E.ac.outputLatency || 0), buf.duration / 2);
  snap();
  const id = keepSound(buf, `Recording ${Object.keys(S.sounds).length + 1}`), sel = T(ui.tid);
  const t = sel?.type === 'audio' ? sel : pushTrack('audio', { name: 'Voice' });
  const c = { id: uid(), start: recStart, buf: id, off: lag, dur: buf.duration - lag, gain: 1, rate: 1, pitch: 0, tune: 0, rev: false, fadeIn: 0, fadeOut: 0 };
  t.clips.push(c); ui.tid = t.id; ui.cid = c.id; ui.pos = recStart;
  changed();
}
export async function exportWav() {
  toast('Rendering your song…', 60000);
  try {
    await loadAssets();
    const a = h('a', { href: URL.createObjectURL(await E.renderWav(S)), download: 'hum-song.wav' });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('Saved hum-song.wav');
  } catch (e) { console.error(e); toast('Export failed: ' + e.message); }
}
