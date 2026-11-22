// Audio engine: sound loading, mixer graph, instruments, scheduler, recording, export.
// The project (S) is owned by app.js; the same schedule code drives live playback and offline export.
import { autotune, pitchShift, midiToHz, encodeWav } from './dsp.js';
import { active, buildChain, chainTail } from './fx.js';
import { clipLen, songSteps, stepSec } from './timing.js';
export { clipLen, songSteps, stepSec };

export const ac = new (window.AudioContext || window.webkitAudioContext)();
export const eng = { S: null, loop: true, onEnd: null }; // current project, set by app.js

// id → AudioBuffer. 'lib:<file>' library, 'inst:<name>:<midi>' sampler notes, 'u:<id>' user audio,
// anything containing '|' is a processed copy (reverse / pitch / autotune) made by syncDerived.
export const buffers = new Map();

export const INSTRUMENTS = {
  piano: { name: 'Piano', sampler: 'piano', lo: 36, hi: 84, r: 0.35 },
  flute: { name: 'Flute', sampler: 'flute', lo: 60, hi: 96, r: 0.12 },
  lead: { name: 'Synth lead', wave: 'sawtooth', a: 0.01, r: 0.2, cut: 2600 },
  bass: { name: 'Synth bass', wave: 'square', a: 0.005, r: 0.12, cut: 600 },
  pad: { name: 'Soft pad', wave: 'sawtooth', a: 0.35, r: 0.9, cut: 1400 },
  keys: { name: 'Glass keys', wave: 'triangle', a: 0.005, r: 0.5, cut: 5000 },
};

// ---------- loading ----------
const loading = new Map();
function load(id, url) {
  if (!loading.has(id)) {
    loading.set(id, fetch(url)
      .then(r => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(b => ac.decodeAudioData(b))
      .then(buf => (buffers.set(id, buf), buf))
      .catch(e => { loading.delete(id); throw e; }));
  }
  return loading.get(id);
}
export const loadSound = id => (id.startsWith('lib:') ? load(id, 'sounds/' + id.slice(4)) : Promise.resolve(buffers.get(id)));
export function loadInstrument(key) {
  const d = INSTRUMENTS[key], jobs = [];
  if (d.sampler) for (let m = d.lo; m <= d.hi; m += 3) jobs.push(load(`inst:${d.sampler}:${m}`, `sounds/_inst/${d.sampler}/${m}.mp3`));
  return Promise.all(jobs);
}

// ---------- mixer graph (built once live, once more per export) ----------
function impulse(ctx) {
  const n = Math.floor(ctx.sampleRate * 2.4), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3; }
  return b;
}
export function buildGraph(ctx) {
  const master = ctx.createGain(), limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.15;
  master.connect(limiter).connect(ctx.destination);
  const reverb = ctx.createConvolver(); reverb.buffer = impulse(ctx); reverb.connect(master);
  const delay = ctx.createDelay(2), feedback = ctx.createGain(); feedback.gain.value = 0.38;
  delay.connect(feedback).connect(delay); delay.connect(master);
  return { ctx, master, limiter, reverb, delay, tracks: new Map(), chains: new Map(), sources: new Set() };
}
export function trackIn(g, id) {
  let t = g.tracks.get(id);
  if (!t) {
    // voices -> in -> [track effects] -> vol -> master and the reverb/echo sends
    const input = g.ctx.createGain(), vol = g.ctx.createGain(), rev = g.ctx.createGain(), dly = g.ctx.createGain();
    input.connect(vol); vol.connect(g.master); vol.connect(rev).connect(g.reverb); vol.connect(dly).connect(g.delay);
    g.tracks.set(id, (t = { in: input, vol, rev, dly, sig: '', chain: null }));
  }
  return t;
}
export function applyMix(g, S) {
  g.master.gain.value = S.vol;
  g.delay.delayTime.value = 45 / S.bpm; // dotted eighth
  const solo = S.tracks.some(t => t.solo);
  for (const t of S.tracks) {
    const n = trackIn(g, t.id);
    n.vol.gain.value = t.mute || (solo && !t.solo) ? 0 : t.vol;
    n.rev.gain.value = t.reverb; n.dly.gain.value = t.echo;
  }
  syncFx(g, S);
}
/** Track effect chains: rebuilt when the set of effects changes, only retuned when just a knob moved. */
function syncFx(g, S) {
  const env = { bpm: S.bpm };
  for (const tr of S.tracks) {
    const n = trackIn(g, tr.id), list = active(tr.fx), sig = list.map(f => f.id + f.fx).join();
    if (sig === n.sig) { n.chain?.set(list, env); continue; }
    n.in.disconnect(); n.chain?.dispose(); n.sig = sig;
    n.chain = list.length ? buildChain(g.ctx, list, env) : null;
    if (n.chain) { n.in.connect(n.chain.in); n.chain.out.connect(n.vol); } else n.in.connect(n.vol);
  }
}
const fxList = lists => active(lists.filter(Boolean).flat()); // a clip or sound without effects passes undefined
/** Audio clips: a short-lived chain per clip play, through that clip's and that sound's own effects. */
function viaFx(g, dest, S, lists, t, dur) {
  const list = fxList(lists);
  if (!list.length) return dest;
  const env = { bpm: S.bpm }, ch = buildChain(g.ctx, list, env, t, t + dur + chainTail(list, env));
  ch.out.connect(dest);
  return ch.in;
}
/** Drum and note clips: one chain per clip (and sound) that every hit goes through, so a reverb or echo runs once, not once per note. */
function sharedFx(g, key, dest, S, lists) {
  const list = fxList(lists);
  if (!list.length) return dest;
  const sig = list.map(f => f.id + f.fx).join(), env = { bpm: S.bpm };
  let e = g.chains.get(key);
  if (e && e.sig !== sig) { e.chain.dispose(); e = null; }
  if (e) e.chain.set(list, env);
  else { const chain = buildChain(g.ctx, list, env); chain.out.connect(dest); g.chains.set(key, (e = { sig, chain })); }
  return e.chain.in;
}
export const live = buildGraph(ac);
export const analyser = ac.createAnalyser();
analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.75; live.limiter.connect(analyser);

// ---------- voices ----------
function track(g, node) { g.sources.add(node); node.onended = () => g.sources.delete(node); }

/** One-shot or clip region. off/dur in buffer seconds; with dur, edges get a fade (5 ms minimum, no clicks). */
export function playBuf(g, dest, buf, t, { gain = 1, rate = 1, off = 0, dur, fadeIn = 0, fadeOut = 0 } = {}) {
  const s = g.ctx.createBufferSource(), v = g.ctx.createGain();
  s.buffer = buf; s.playbackRate.value = rate; s.connect(v).connect(dest);
  if (dur === undefined) v.gain.value = gain;
  else {
    const len = dur / rate, fi = Math.min(Math.max(fadeIn, 0.005), len / 2), fo = Math.min(Math.max(fadeOut, 0.005), len / 2);
    v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(gain, t + fi);
    v.gain.setValueAtTime(gain, t + len - fo); v.gain.linearRampToValueAtTime(0, t + len);
  }
  s.start(t, off, dur); track(g, s);
  return s;
}

/** Plays a note on an instrument track. With dur it releases itself; without, call the returned function to release. */
export function playNote(g, dest, tr, midi, t, dur) {
  const def = { ...INSTRUMENTS[tr.inst], ...tr.synth }, ctx = g.ctx, env = ctx.createGain();
  env.connect(dest);
  let srcs, peak, attack;
  if (def.sampler) {
    const base = Math.min(def.hi, Math.max(def.lo, def.lo + Math.round((midi - def.lo) / 3) * 3));
    const buf = buffers.get(`inst:${def.sampler}:${base}`);
    if (!buf) return () => {};
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = 2 ** ((midi - base) / 12); s.connect(env);
    srcs = [s]; peak = 0.9; attack = 0.004;
  } else {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = def.cut; f.Q.value = 1.2; f.connect(env);
    srcs = [-6, 6].map(cents => { const o = ctx.createOscillator(); o.type = def.wave; o.frequency.value = midiToHz(midi); o.detune.value = cents; o.connect(f); return o; });
    peak = 0.22; attack = Math.min(def.a, dur ?? def.a);
  }
  env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(peak, t + attack);
  srcs.forEach(s => { s.start(t); track(g, s); });
  const release = at => { env.gain.setTargetAtTime(0, at, def.r / 4); srcs.forEach(s => s.stop(at + def.r * 1.5 + 0.05)); };
  if (dur !== undefined) release(t + dur);
  return () => { (env.gain.cancelAndHoldAtTime || env.gain.cancelScheduledValues).call(env.gain, ctx.currentTime); release(ctx.currentTime); };
}

/** Library/user sound straight to the master, one at a time. */
let prev = null, prevToken = 0;
export async function preview(id, onend) {
  stopPreview(); ac.resume();
  const mine = ++prevToken, buf = await loadSound(id);
  if (!buf || mine !== prevToken) return onend?.();
  const s = ac.createBufferSource(); s.buffer = buf; s.connect(live.master);
  s.onended = () => { if (prev === s) prev = null; onend?.(); };
  s.start(); prev = s;
}
export function stopPreview() { prevToken++; prev?.stop(); prev = null; }

// ---------- timeline maths (16 steps per bar) ----------

// ---------- processed copies of audio clips ----------
export const bufKey = (c, S) => (!c.rev && !c.pitch && !c.tune ? c.buf : [c.buf, c.rev ? 'r' : '', c.pitch, c.tune ? `${c.tune}:${S.key}:${S.scale}` : ''].join('|'));
export const clipBuffer = (c, S) => buffers.get(bufKey(c, S));
export const needsDerive = S => S.tracks.some(t => t.clips.some(c => c.buf && buffers.has(c.buf) && !buffers.has(bufKey(c, S))));
/** Renders missing reverse / pitch / autotune copies and drops ones no clip uses. Blocking: call needsDerive first to show a busy state. */
export function syncDerived(S) {
  // shortcut: runs on the main thread (roughly 1 s per minute of audio), move to a Worker if people autotune whole songs
  const used = new Set();
  for (const t of S.tracks) for (const c of t.clips) {
    if (!c.buf) continue;
    const key = bufKey(c, S), src = buffers.get(c.buf);
    used.add(key);
    if (!src || buffers.has(key)) continue;
    const out = new AudioBuffer({ length: src.length, numberOfChannels: src.numberOfChannels, sampleRate: src.sampleRate });
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      let d = src.getChannelData(ch);
      if (c.tune) d = autotune(d, src.sampleRate, S.key, S.scale, c.tune);
      if (c.pitch) d = pitchShift(d, src.sampleRate, 2 ** (c.pitch / 12));
      if (c.rev) d = d.slice().reverse();
      out.copyToChannel(d, ch);
    }
    buffers.set(key, out);
  }
  for (const k of buffers.keys()) if (k.includes('|') && !used.has(k)) buffers.delete(k);
}

// ---------- scheduling ----------
/** Starts everything that begins on `step` at context time t. mid=true also picks up audio clips already under the playhead. */
export function scheduleStep(g, S, step, t, mid) {
  const sd = stepSec(S);
  for (const tr of S.tracks) {
    const dest = trackIn(g, tr.id).in;
    for (const c of tr.clips) {
      if (c.buf) {
        const buf = clipBuffer(c, S);
        if (!buf) continue;
        const o = { gain: c.gain, rate: c.rate, off: c.off, dur: c.dur, fadeIn: c.fadeIn, fadeOut: c.fadeOut };
        const fxs = [S.mfx?.[c.buf], c.fx];
        if (Math.floor(c.start) === step) { const at = t + (c.start - step) * sd; playBuf(g, viaFx(g, dest, S, fxs, at, c.dur / c.rate), buf, at, o); }
        else if (mid && c.start < step && c.start + clipLen(c, S) > step) {
          const skip = (step - c.start) * sd * c.rate;
          playBuf(g, viaFx(g, dest, S, fxs, t, (c.dur - skip) / c.rate), buf, t, { ...o, off: c.off + skip, dur: c.dur - skip, fadeIn: 0 });
        }
        continue;
      }
      const at = step - c.start;
      if (at < 0 || at >= c.len) continue;
      if (tr.type === 'drums') {
        for (const row of tr.rows) if (c.steps[row.id]?.[at]) { const b = buffers.get(row.sound); if (b) playBuf(g, sharedFx(g, c.id + '|' + row.sound, dest, S, [S.mfx?.[row.sound], c.fx]), b, t, { gain: row.vol }); }
      } else for (const n of c.notes) if (n.t === at) { const len = Math.min(n.d, c.len - n.t) * sd; playNote(g, sharedFx(g, c.id, dest, S, [c.fx]), tr, n.n, t, len); }
    }
  }
}

let timer = 0, nextStep = 0, nextTime = 0, first = false, marks = [], endTime = Infinity;
function tick() {
  const S = eng.S;
  if (ac.currentTime >= endTime) { // played to the end without looping: sounds already scheduled ring out
    clearInterval(timer); timer = 0; marks = []; endTime = Infinity;
    return eng.onEnd?.();
  }
  // background tabs throttle timers to ~1 s, so schedule further ahead there
  while (nextTime < ac.currentTime + (document.hidden ? 1.5 : 0.12) && endTime === Infinity) {
    scheduleStep(live, S, nextStep, nextTime, first); first = false;
    marks.push([nextStep, nextTime]);
    const len = songSteps(S);
    nextTime += stepSec(S);
    if (nextStep + 1 >= len && !(eng.loop || rec)) endTime = nextTime; // a recording keeps rolling past the end of the arrangement
    else nextStep = (nextStep + 1) % len;
  }
}
export function play(from = 0) {
  stop(); ac.resume();
  nextStep = Math.floor(from) % songSteps(eng.S); nextTime = ac.currentTime + 0.05; first = true;
  timer = setInterval(tick, 25); tick();
}
export function stop() {
  clearInterval(timer); timer = 0; marks = []; endTime = Infinity;
  for (const e of live.chains.values()) e.chain.dispose();
  live.chains.clear();
  for (const s of live.sources) { s.onended = null; s.stop(); }
  live.sources.clear();
}
export const playing = () => !!timer;
/** Fractional step under the playhead, or null when stopped. */
export function position() {
  if (!timer || !marks.length) return null;
  while (marks.length > 1 && marks[1][1] <= ac.currentTime) marks.shift();
  return marks[0][0] + Math.min(1, Math.max(0, (ac.currentTime - marks[0][1]) / stepSec(eng.S)));
}

// ---------- recording ----------
let rec = null;
export const recording = () => !!rec;
export async function startRec() {
  // processing off: browsers' call-quality filters wreck singing and instruments
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const mr = new MediaRecorder(stream), chunks = [];
  mr.ondataavailable = e => chunks.push(e.data);
  const done = new Promise((res, rej) => {
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      new Blob(chunks).arrayBuffer().then(b => ac.decodeAudioData(b)).then(res, rej);
    };
  });
  mr.start(); rec = { mr, done };
}
/** Resolves with the recorded AudioBuffer. */
export function stopRec() { const r = rec; rec = null; r.mr.stop(); return r.done; }

// ---------- export ----------
export async function renderWav(S) {
  const sd = stepSec(S), steps = songSteps(S), sr = 44100;
  const lists = [S.tracks.map(t => t.fx), S.tracks.flatMap(t => t.clips.map(c => c.fx)), Object.values(S.mfx || {})].flat();
  const tail = Math.max(2.5, ...lists.map(l => chainTail(active(l), { bpm: S.bpm }))); // room for reverb and echo tails, longer when effects ring on
  const g = buildGraph(new OfflineAudioContext(2, Math.ceil((steps * sd + tail) * sr), sr));
  applyMix(g, S);
  for (let i = 0; i < steps; i++) scheduleStep(g, S, i, i * sd, false);
  const out = await g.ctx.startRendering();
  return new Blob([encodeWav([out.getChannelData(0), out.getChannelData(1)], sr)], { type: 'audio/wav' });
}
