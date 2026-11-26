// Moving and pasting tiles. Run: node test/tilemath.test.mjs
import assert from 'node:assert/strict';
import { fitDelta, landNotes, landPads, pack } from '../js/tilemath.js';

const tiles = [{ t: 2, n: 60 }, { t: 5, n: 64 }];
assert.deepEqual(fitDelta(tiles, 3, 2, 31, 36, 84), [3, 2], 'room to move: unchanged');
assert.deepEqual(fitDelta(tiles, -9, 0, 31, 36, 84), [-2, 0], 'stops when the earliest tile hits step 0');
assert.deepEqual(fitDelta(tiles, 99, 0, 31, 36, 84), [26, 0], 'stops when the last tile hits the end');
assert.deepEqual(fitDelta(tiles, 0, 40, 31, 36, 84), [0, 20], 'stops when the highest note hits the top');
assert.deepEqual(fitDelta(tiles, 0, -40, 31, 36, 84), [0, -24], 'stops when the lowest note hits the bottom');
assert.deepEqual(fitDelta([], 4, 4, 31, 0, 9), [0, 0], 'nothing selected');

const p = pack([{ t: 6, d: 2, n: 60 }, { t: 8, d: 4, n: 62 }]);
assert.deepEqual(p.items.map(i => i.t), [0, 2], 'times become relative');
assert.equal(p.span, 6, 'span reaches the end of the last note');
assert.equal(pack([{ t: 3, r: 'a' }]).span, 1, 'a pad is one step wide');

const l = landNotes(p.items, 12, 16);
assert.deepEqual(l.notes, [{ t: 12, d: 2, n: 60 }, { t: 14, d: 2, n: 62 }], 'second note trimmed to the clip end');
assert.equal(landNotes(p.items, 15, 16).dropped, 1, 'a note starting past the end is dropped');

const pads = [{ t: 0, r: 'k', ri: 0 }, { t: 2, r: 'gone', ri: 1 }, { t: 3, r: 'x', ri: 9 }];
const lp = landPads(pads, 4, 16, ['k', 's']);
assert.deepEqual(lp.pads, [{ r: 'k', t: 4 }, { r: 's', t: 6 }], 'unknown row falls back to the same position, missing position is skipped');
assert.equal(lp.dropped, 1);
assert.equal(landPads([{ t: 3, r: 'k', ri: 0 }], 14, 16, ['k']).dropped, 1, 'pad past the end is dropped');
console.log('tilemath ok');
