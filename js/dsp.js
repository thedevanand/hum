// Pure signal processing: no DOM, no Web Audio. Runs in the browser and in node (test/dsp.test.mjs).

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
export const hzToMidi = f => 69 + 12 * Math.log2(f / 440);
export const midiToHz = m => 440 * 2 ** ((m - 69) / 12);
export const inScale = (midi, key, scale) => SCALES[scale].includes((((midi - key) % 12) + 12) % 12);

/** Nearest in-scale note to a fractional midi pitch. */
export function snapMidi(m, key, scale) {
  let best = Math.round(m), dist = Infinity;
  for (let c = Math.round(m) - 2; c <= Math.round(m) + 2; c++) {
    if (inScale(c, key, scale) && Math.abs(c - m) < dist) { dist = Math.abs(c - m); best = c; }
  }
  return best;
}

/** Fundamental in Hz of x[at .. at+n), or 0 when silent or unpitched (normalized autocorrelation). */
export function detectPitch(x, at, n, sr, lo = 70, hi = 900) {
  const minLag = Math.max(2, Math.floor(sr / hi)), maxLag = Math.min(Math.floor(sr / lo), (n >> 1) - 1);
  let energy = 0;
  for (let i = 0; i < n; i++) energy += x[at + i] * x[at + i];
  if (energy / n < 1e-5) return 0;
  const nsdf = new Float32Array(maxLag + 2);
  let max = 0;
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let ac = 0, m = 0;
    for (let i = 0; i < n - lag; i++) { const a = x[at + i], b = x[at + i + lag]; ac += a * b; m += a * a + b * b; }
    nsdf[lag] = m ? (2 * ac) / m : 0;
    if (nsdf[lag] > max) max = nsdf[lag];
  }
  if (max < 0.6) return 0;
  // first strong peak, not the tallest: the tallest is often an octave too low
  for (let lag = minLag; lag <= maxLag; lag++) {
    const a = nsdf[lag - 1], b = nsdf[lag], c = nsdf[lag + 1];
    if (b > 0.9 * max && b >= a && b >= c) return sr / (lag + (0.5 * (a - c)) / (a - 2 * b + c || 1));
  }
  return 0;
}

/**
 * Pitch shift that keeps duration: two crossfaded read heads on a 40 ms delay line.
 * ratio is a number, or a function of the sample index for a moving shift.
 * shortcut: audible warble beyond about ±5 semitones, upgrade to a phase vocoder if large shifts must sound clean.
 */
export function pitchShift(x, sr, ratio) {
  const W = Math.round(sr * 0.04), y = new Float32Array(x.length), fn = typeof ratio === 'function';
  let phase = 0;
  for (let i = 0; i < x.length; i++) {
    phase += (1 - (fn ? ratio(i) : ratio)) / W;
    phase -= Math.floor(phase);
    let s = 0;
    for (let k = 0; k < 2; k++) {
      const p = (phase + k * 0.5) % 1, pos = i - p * W, j = Math.floor(pos);
      if (j < 0) continue;
      const a = x[j], b = x[j + 1] ?? a;
      s += (a + (b - a) * (pos - j)) * (0.5 - 0.5 * Math.cos(2 * Math.PI * p));
    }
    y[i] = s;
  }
  return y;
}

/** Autotune: pull each moment of a monophonic signal toward the nearest note of the scale. amount 0..1. */
export function autotune(x, sr, key, scale, amount = 1) {
  // detect on a ~11 kHz copy: 16x less work, plenty for voice fundamentals
  const D = Math.max(1, Math.floor(sr / 11025)), small = new Float32Array(Math.floor(x.length / D));
  for (let i = 0; i < small.length; i++) { let s = 0; for (let k = 0; k < D; k++) s += x[i * D + k]; small[i] = s / D; }
  const N = 512, hop = 128, frames = Math.max(0, Math.floor((small.length - N) / hop) + 1);
  if (!frames) return x.slice();
  const ratios = new Float32Array(frames).fill(1);
  for (let f = 0; f < frames; f++) {
    const hz = detectPitch(small, f * hop, N, sr / D);
    if (hz) { const m = hzToMidi(hz); ratios[f] = 2 ** (((snapMidi(m, key, scale) - m) * amount) / 12); }
  }
  let r = 1;
  return pitchShift(x, sr, i => {
    const f = Math.min(frames - 1, Math.max(0, Math.floor((i / D - N / 2) / hop)));
    r += (ratios[f] - r) * 0.002; // ~11 ms glide between notes
    return r;
  });
}

/** 16-bit PCM WAV file bytes from per-channel Float32Arrays. */
export function encodeWav(chans, sr) {
  const n = chans[0].length, c = chans.length, bytes = n * c * 2, v = new DataView(new ArrayBuffer(44 + bytes));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, c, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * c * 2, true); v.setUint16(32, c * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, bytes, true);
  for (let i = 0, o = 44; i < n; i++)
    for (let k = 0; k < c; k++, o += 2) v.setInt16(o, Math.max(-1, Math.min(1, chans[k][i])) * 32767, true);
  return v.buffer;
}
