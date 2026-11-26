// Pure maths for moving and pasting painted tiles (piano-roll notes {t, d, n} and drum pads {t, n: row index, r: row id}).
// Kept free of the DOM so it can be tested in Node.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The move closest to (dt, dn) that keeps every tile inside 0..tMax and nMin..nMax, so a group never gets squashed against an edge. */
export function fitDelta(items, dt, dn, tMax, nMin, nMax) {
  if (!items.length) return [0, 0];
  const ts = items.map(i => i.t), ns = items.map(i => i.n);
  return [clamp(dt, -Math.min(...ts), tMax - Math.max(...ts)), clamp(dn, nMin - Math.min(...ns), nMax - Math.max(...ns))];
}

/** Copyable form: times relative to the earliest tile, and how far the group reaches (for chaining pastes). */
export function pack(items) {
  const min = Math.min(...items.map(i => i.t));
  return { items: items.map(i => ({ ...i, t: i.t - min })), span: Math.max(...items.map(i => i.t + (i.d || 1))) - min };
}

/** Notes pasted at step `at` of a clip `len` steps long. Notes that would start past the end are dropped, long ones are trimmed. */
export function landNotes(items, at, len) {
  const notes = items.map(i => ({ t: at + i.t, d: i.d, n: i.n })).filter(i => i.t < len).map(i => ({ ...i, d: Math.min(i.d, len - i.t) }));
  return { notes, dropped: items.length - notes.length };
}

/** Pads pasted at step `at`. A pad goes back on its own row; if that row is gone (another track) it takes the row at the same position. */
export function landPads(items, at, len, rowIds) {
  const pads = [];
  for (const i of items) {
    const r = rowIds.includes(i.r) ? i.r : rowIds[i.ri];
    if (r && at + i.t < len) pads.push({ r, t: at + i.t });
  }
  return { pads, dropped: items.length - pads.length };
}
