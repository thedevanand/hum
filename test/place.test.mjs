// Clip placement: pasted clips never cover another clip. Run: node test/place.test.mjs
import assert from 'node:assert/strict';
import { freeStart, remapSteps } from '../js/place.js';
import { clipLen, songSteps } from '../js/timing.js';

const S = { bpm: 120 }, pat = (start, len = 16) => ({ start, len });
const free = (clips, s, len = 16) => freeStart(clips, S, s, len, 16);

assert.equal(free([], 0), 0, 'empty track: stays put');
assert.equal(free([pat(0)], 0), 16, 'covered start moves to the end of the clip');
assert.equal(free([pat(0), pat(16), pat(32)], 0), 48, 'skips a run of clips');
assert.equal(free([pat(0), pat(32)], 0), 16, 'uses a gap that fits');
assert.equal(free([pat(0), pat(32)], 0, 32), 48, 'skips a gap that is too small');
assert.equal(free([pat(0, 32)], 8), 32, 'start inside a clip rounds up to the next bar');
assert.equal(free([pat(16)], 0), 0, 'a clip that ends exactly where the next begins fits');
// audio clips: length depends on tempo (0.5 s at 120 bpm = 4 steps)
const wav = { start: 2, buf: 'u:a', dur: 0.5, rate: 1 };
assert.equal(clipLen(wav, S), 4);
assert.equal(freeStart([wav], S, 3, 4, 1), 6, 'audio snaps to single steps');

// drum rows: same id first, then position, missing rows dropped
const rows = [{ id: 'a' }, { id: 'b' }];
assert.deepEqual(remapSteps({ a: [1], b: [0, 1] }, ['a', 'b'], rows), { a: [1], b: [0, 1] }, 'same rows');
assert.deepEqual(remapSteps({ x: [1], y: [0, 1] }, ['x', 'y'], rows), { a: [1], b: [0, 1] }, 'other project: by position');
assert.deepEqual(remapSteps({ x: [1], y: [1], z: [1] }, ['x', 'y', 'z'], rows), { a: [1], b: [1] }, 'extra rows dropped');
assert.deepEqual(remapSteps({ x: [1] }, ['x', 'y'], [{ id: 'a' }]), { a: [1] }, 'fewer rows than the source');

// song length: whole bars, never less than one, empty bars never counted
assert.equal(songSteps({ bpm: 120, tracks: [] }), 16);
assert.equal(songSteps({ bpm: 120, tracks: [{ clips: [pat(0), pat(32, 10)] }] }), 48);
console.log('place ok');
