// Where pasted clips go. Pure functions, no DOM and no audio.
import { clipLen } from './timing.js';

/** First start at or after `s` where a clip of `len` steps fits without covering another clip. grid = snap size in steps. */
export function freeStart(clips, S, s, len, grid) {
  for (let moved = true; moved;) {
    moved = false;
    for (const o of clips) { const end = o.start + clipLen(o, S); if (s < end && o.start < s + len) { s = Math.ceil(end / grid) * grid; moved = true; } }
  }
  return s;
}

/** Drum steps are keyed by row id. Map a copied clip's steps onto a track's rows: same id first, else same position. Steps with no row are dropped. */
export function remapSteps(steps, rowIds, rows) {
  const out = {};
  rowIds.forEach((rid, i) => { const r = rows.find(r => r.id === rid) ?? rows[i]; if (r && steps[rid]) out[r.id] = steps[rid]; });
  return out;
}
