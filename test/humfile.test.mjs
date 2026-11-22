// .hum files are untrusted input. Run: node test/humfile.test.mjs
import assert from 'node:assert/strict';
import { checkProject, isAudioData, packHum, safeCover } from '../js/humfile.js';

// not projects
for (const bad of [null, 'x', 5, [], {}, { tracks: 'no' }]) assert.equal(checkProject(bad), null, JSON.stringify(bad));

// a bare project is filled in
const p = checkProject({ tracks: [] });
assert.deepEqual([p.name, p.bpm, p.scale, p.vol, p.box, p.sounds], ['imported', 100, 'minor', 0.8, [], {}]);
assert.equal(checkProject({ tracks: [], bpm: 9999 }).bpm, 240);
assert.equal(checkProject({ tracks: [], scale: 'phrygian' }).scale, 'minor');
assert.equal(checkProject({ tracks: [], minBars: 'x' }).minBars, 4);
assert.equal('minBars' in checkProject({ tracks: [] }), false, 'blank minBars stays blank (use the global default)');

// tracks and clips: bad ones dropped, good ones completed, unknown fields kept
const q = checkProject({ tracks: [
  null, { id: 't0', type: 'nope', clips: [] }, { type: 'drums', clips: [] },
  { id: 'd', type: 'drums', extra: 1, clips: [{ id: 'c1', start: 0 }, { id: 'c2', start: 'x', len: 16, steps: { r: [1], bad: 'no' } }, { id: 'c3', buf: 'u:z', start: 0, len: 16 }, { start: 0 }], rows: [{ id: 'r', sound: 'lib:a' }, { id: 'r2' }] },
  { id: 'i', type: 'inst', clips: [{ id: 'n', start: 0, len: 32, notes: [{ t: 0, d: 2, n: 60 }, { t: 'x' }, null] }] },
  { id: 'a', type: 'audio', clips: [{ id: 'w', start: 4, buf: 'u:z', dur: 1 }, { id: 'w0', buf: 'u:z', dur: 0 }, { id: 'w1', start: 0, len: 16 }] },
] });
assert.deepEqual(q.tracks.map(t => t.id), ['d', 'i', 'a']);
assert.equal(q.tracks[0].extra, 1);
assert.deepEqual(q.tracks[0].rows, [{ id: 'r', sound: 'lib:a', vol: 0.8 }]);
assert.deepEqual(q.tracks[0].clips.map(c => c.id), ['c1', 'c2']);
assert.deepEqual(q.tracks[0].clips[1].steps, { r: [1] }, 'a row that is not a list is dropped');
assert.equal(q.tracks[0].clips[1].start, 0, 'bad start becomes 0');
assert.deepEqual(q.tracks[0].clips[0].steps, {}, 'pattern clips always have steps');
assert.equal(q.tracks[1].clips[0].notes.length, 1, 'bad notes dropped');
assert.deepEqual(q.tracks[2].clips.map(c => c.id), ['w'], 'audio clips need a sound and a length');
assert.equal(q.tracks[2].clips[0].rate, 1);

// nothing in the file can make the page load a URL
assert.equal(safeCover('data:image/jpeg;base64,/9j/4AAQ=='), 'data:image/jpeg;base64,/9j/4AAQ==');
for (const bad of ['https://example.com/a.png', 'data:image/svg+xml;base64,AAAA', 'x");background:url("https://x', 'data:image/png;base64,AA"AA', null, 5]) assert.equal(safeCover(bad), '', String(bad));
assert.equal(checkProject({ tracks: [], meta: { cover: 'https://example.com/a.png', tags: ['a', 3] } }).meta.cover, undefined);
assert.deepEqual(checkProject({ tracks: [], meta: { tags: ['a', 3] } }).meta.tags, ['a']);
assert.ok(isAudioData('data:audio/wav;base64,AAAA'));
for (const bad of ['http://127.0.0.1/x', 'file:///etc/passwd', 'data:text/html,hi', '', null]) assert.equal(isAudioData(bad), false, String(bad));

// packing: the size field is the exact byte length, including non-ASCII text
const env = { hum: 1, size: 0, meta: { title: 'Café ♪ 日本' }, project: { name: 'ñ' } };
const json = packHum(env, { 'u:a': 'data:audio/wav;base64,AAAA' });
assert.equal(JSON.parse(json).size, Buffer.byteLength(json));
assert.equal(JSON.parse(json).audio['u:a'], 'data:audio/wav;base64,AAAA');
console.log('humfile ok');
