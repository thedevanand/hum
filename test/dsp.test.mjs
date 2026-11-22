// node test/dsp.test.mjs
import assert from 'node:assert/strict';
import { detectPitch, pitchShift, autotune, snapMidi, encodeWav } from '../js/dsp.js';

const sr = 44100;
const sine = (hz, secs = 1) => Float32Array.from({ length: sr * secs }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / sr));
const pitchOf = x => detectPitch(x, 20000, 4096, sr);
const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) < tol, `${what}: got ${got.toFixed(2)}, want ${want}`);

near(pitchOf(sine(440)), 440, 1, 'detect 440');
near(pitchOf(sine(110)), 110, 1, 'detect 110');
assert.equal(detectPitch(new Float32Array(4096), 0, 4096, sr), 0, 'silence has no pitch');

assert.equal(snapMidi(61.4, 0, 'major'), 62, 'C#+ snaps up to D in C major');
assert.equal(snapMidi(61.4, 0, 'chromatic'), 61);
assert.equal(snapMidi(63.2, 9, 'minor'), 64, 'Eb snaps to E in A minor');

near(pitchOf(pitchShift(sine(440), sr, 2 ** (3 / 12))), 440 * 2 ** (3 / 12), 3, 'shift up 3 semitones');
assert.equal(pitchShift(sine(440), sr, 0.8).length, sr, 'shift keeps duration');

near(pitchOf(autotune(sine(452), sr, 0, 'chromatic', 1)), 440, 2, 'autotune sharp A to A');
near(pitchOf(autotune(sine(270), sr, 0, 'major', 1)), 261.6, 3, 'autotune flat C# to C in C major');
near(pitchOf(autotune(sine(452), sr, 0, 'chromatic', 0)), 452, 1, 'amount 0 leaves pitch alone');

const wav = new DataView(encodeWav([new Float32Array([0, 1, -1]), new Float32Array([0, 0.5, 2])], sr));
assert.equal(wav.byteLength, 44 + 12);
assert.equal(wav.getUint32(40, true), 12);
assert.equal(wav.getInt16(48, true), 32767);
assert.equal(wav.getInt16(54, true), 32767, 'clips over-range samples');

console.log('dsp ok');
