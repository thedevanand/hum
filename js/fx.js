// Effects: definitions, parameters, factory presets and the Web Audio chain builder.
// No DOM in here. The same chains run live (track buses, clip and sound chains) and in the offline WAV export.
//
// An effect on a track, clip or sound is { id, fx: <key of FX>, on: true, p: { ...params } }.
// build(ctx, params, kit, env) returns { in, out, set?(params, env) }; set retunes it live without a rebuild.

const lowpass = (ctx, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = f; n.Q.value = q; return n; };

/** Per-effect helpers: tracked LFOs (so they can be stopped), smooth param moves, a dry/wet mixer. */
function kit(ctx, t0, stopAt) {
  const oscs = [];
  const ramp = (prm, v) => prm.setTargetAtTime(v, ctx.currentTime, 0.03);
  return {
    ramp,
    osc(type, freq) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.start(t0);
      if (stopAt !== Infinity) o.stop(stopAt);
      oscs.push(o); return o;
    },
    mix(m) {
      const i = ctx.createGain(), o = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
      i.connect(dry).connect(o); wet.connect(o);
      dry.gain.value = 1 - m; wet.gain.value = m;
      return { in: i, out: o, wet, set: v => { ramp(dry.gain, 1 - v); ramp(wet.gain, v); } };
    },
    done: fx => ({ ...fx, dispose: () => oscs.forEach(o => { try { o.stop(); } catch { /* already stopped */ } }) }),
  };
}

const driveCurve = a => {
  const k = 1 + a * 24, n = 2048, c = new Float32Array(n), d = Math.tanh(k);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / d;
  return c;
};
const crushCurve = bits => {
  const q = 2 ** (bits - 1), n = 4096, c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.round(((i / (n - 1)) * 2 - 1) * q) / q;
  return c;
};
const irs = new Map();
function impulse(ctx, size) {
  const key = ctx.sampleRate + ':' + size.toFixed(1);
  if (!irs.has(key)) {
    const n = Math.floor(ctx.sampleRate * size), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3; }
    irs.set(key, b);
  }
  return irs.get(key);
}

const DIV = [[1, '1/16'], [2, '1/8'], [3, 'dotted 1/8'], [4, '1/4'], [6, 'dotted 1/4'], [8, '1/2']];
// unit drives the read-out; log = slider moves in octaves (frequencies)
export const FX = {
  filter: {
    name: 'Filter', desc: 'low-pass, high-pass or band-pass with resonance',
    params: [{ k: 'type', label: 'Type', options: [['lowpass', 'low-pass'], ['highpass', 'high-pass'], ['bandpass', 'band-pass']], def: 'lowpass' },
      { k: 'freq', label: 'Cutoff', min: 40, max: 16000, log: true, unit: 'hz', def: 1200 }, { k: 'q', label: 'Reso', min: 0.1, max: 18, step: 0.1, unit: 'x', def: 0.8 }],
    build(ctx, p, k) {
      const f = ctx.createBiquadFilter(); f.type = p.type; f.frequency.value = p.freq; f.Q.value = p.q;
      return k.done({ in: f, out: f, set: p => { f.type = p.type; k.ramp(f.frequency, p.freq); k.ramp(f.Q, p.q); } });
    },
  },
  wobble: {
    name: 'Wobble', desc: 'low-pass swept by an LFO: dubstep bass, talking pads',
    params: [{ k: 'freq', label: 'Cutoff', min: 60, max: 8000, log: true, unit: 'hz', def: 500 }, { k: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.7 },
      { k: 'rate', label: 'Rate', min: 0.1, max: 16, step: 0.1, unit: 'hz', def: 2.5 }, { k: 'q', label: 'Reso', min: 0.5, max: 14, step: 0.1, unit: 'x', def: 5 }],
    build(ctx, p, k) {
      const f = lowpass(ctx, p.freq, p.q), l = k.osc('sine', p.rate), g = ctx.createGain();
      g.gain.value = p.depth * 2400; l.connect(g).connect(f.detune);
      return k.done({ in: f, out: f, set: p => { k.ramp(f.frequency, p.freq); k.ramp(f.Q, p.q); k.ramp(l.frequency, p.rate); k.ramp(g.gain, p.depth * 2400); } });
    },
  },
  drive: {
    name: 'Drive', desc: 'warm to nasty saturation',
    params: [{ k: 'amount', label: 'Drive', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.5 }, { k: 'tone', label: 'Tone', min: 500, max: 16000, log: true, unit: 'hz', def: 8000 }, { k: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: 'pct', def: 1 }],
    build(ctx, p, k) {
      const m = k.mix(p.mix), s = ctx.createWaveShaper(), tone = lowpass(ctx, p.tone), trim = ctx.createGain();
      let amount = p.amount;
      s.oversample = '4x'; s.curve = driveCurve(amount); trim.gain.value = 0.8;
      m.in.connect(s); s.connect(tone).connect(trim).connect(m.wet);
      return k.done({ in: m.in, out: m.out, set: p => { if (p.amount !== amount) { amount = p.amount; s.curve = driveCurve(amount); } k.ramp(tone.frequency, p.tone); m.set(p.mix); } });
    },
  },
  crush: {
    name: 'Crush', desc: 'bit crusher: grit and old-console crunch',
    params: [{ k: 'bits', label: 'Bits', min: 2, max: 12, step: 1, unit: 'bit', def: 6 }, { k: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: 'pct', def: 1 }],
    build(ctx, p, k) {
      const m = k.mix(p.mix), s = ctx.createWaveShaper();
      let bits = p.bits; s.curve = crushCurve(bits);
      m.in.connect(s); s.connect(m.wet);
      return k.done({ in: m.in, out: m.out, set: p => { if (p.bits !== bits) { bits = p.bits; s.curve = crushCurve(bits); } m.set(p.mix); } });
    },
  },
  echo: {
    name: 'Echo', desc: 'tempo-synced delay with a dark feedback tail',
    params: [{ k: 'time', label: 'Time', options: DIV, def: 3 }, { k: 'feedback', label: 'Repeats', min: 0, max: 0.95, step: 0.01, unit: 'pct', def: 0.45 },
      { k: 'tone', label: 'Tone', min: 400, max: 12000, log: true, unit: 'hz', def: 4000 }, { k: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.35 }],
    tail: (p, env) => Math.min(5, ((p.time * 15) / env.bpm) * (1 + 5 * p.feedback)),
    build(ctx, p, k, env) {
      const m = k.mix(p.mix), d = ctx.createDelay(4), fb = ctx.createGain(), tone = lowpass(ctx, p.tone);
      const time = p => Math.min(3.9, (p.time * 15) / env.bpm);
      d.delayTime.value = time(p); fb.gain.value = p.feedback;
      m.in.connect(d); d.connect(tone); tone.connect(fb); fb.connect(d); tone.connect(m.wet);
      return k.done({ in: m.in, out: m.out, set: (p, e) => { env = e ?? env; k.ramp(d.delayTime, time(p)); k.ramp(fb.gain, p.feedback); k.ramp(tone.frequency, p.tone); m.set(p.mix); } });
    },
  },
  reverb: {
    name: 'Reverb', desc: 'room to cathedral',
    params: [{ k: 'size', label: 'Size', min: 0.3, max: 5, step: 0.1, unit: 'sec', def: 2 }, { k: 'damp', label: 'Damp', min: 800, max: 16000, log: true, unit: 'hz', def: 6000 }, { k: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.3 }],
    tail: p => p.size + 0.3,
    build(ctx, p, k) {
      const m = k.mix(p.mix), conv = ctx.createConvolver(), damp = lowpass(ctx, p.damp);
      let size = p.size; conv.buffer = impulse(ctx, size);
      m.in.connect(conv); conv.connect(damp).connect(m.wet);
      return k.done({ in: m.in, out: m.out, set: p => { if (p.size !== size) { size = p.size; conv.buffer = impulse(ctx, size); } k.ramp(damp.frequency, p.damp); m.set(p.mix); } });
    },
  },
  chorus: {
    name: 'Chorus', desc: 'two detuned copies: wide and shimmery',
    params: [{ k: 'rate', label: 'Rate', min: 0.1, max: 6, step: 0.1, unit: 'hz', def: 0.8 }, { k: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.6 }, { k: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.5 }],
    build(ctx, p, k) {
      const m = k.mix(p.mix), l = k.osc('sine', p.rate), d1 = ctx.createDelay(0.06), d2 = ctx.createDelay(0.06), g1 = ctx.createGain(), g2 = ctx.createGain();
      d1.delayTime.value = 0.018; d2.delayTime.value = 0.026; g1.gain.value = p.depth * 0.006; g2.gain.value = -p.depth * 0.006;
      l.connect(g1).connect(d1.delayTime); l.connect(g2).connect(d2.delayTime);
      m.in.connect(d1); m.in.connect(d2); d1.connect(m.wet); d2.connect(m.wet);
      return k.done({ in: m.in, out: m.out, set: p => { k.ramp(l.frequency, p.rate); k.ramp(g1.gain, p.depth * 0.006); k.ramp(g2.gain, -p.depth * 0.006); m.set(p.mix); } });
    },
  },
  flanger: {
    name: 'Flanger', desc: 'jet sweep: short swept delay with feedback',
    params: [{ k: 'rate', label: 'Rate', min: 0.05, max: 5, step: 0.05, unit: 'hz', def: 0.3 }, { k: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.7 },
      { k: 'feedback', label: 'Feedback', min: 0, max: 0.9, step: 0.01, unit: 'pct', def: 0.5 }, { k: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.5 }],
    build(ctx, p, k) {
      const m = k.mix(p.mix), l = k.osc('sine', p.rate), d = ctx.createDelay(0.02), g = ctx.createGain(), fb = ctx.createGain();
      d.delayTime.value = 0.003; g.gain.value = p.depth * 0.0025; fb.gain.value = p.feedback;
      l.connect(g).connect(d.delayTime); m.in.connect(d); d.connect(fb); fb.connect(d); d.connect(m.wet);
      return k.done({ in: m.in, out: m.out, set: p => { k.ramp(l.frequency, p.rate); k.ramp(g.gain, p.depth * 0.0025); k.ramp(fb.gain, p.feedback); m.set(p.mix); } });
    },
  },
  phaser: {
    name: 'Phaser', desc: 'four all-pass stages sweeping: swirling notches',
    params: [{ k: 'rate', label: 'Rate', min: 0.05, max: 6, step: 0.05, unit: 'hz', def: 0.5 }, { k: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.8 }, { k: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.6 }],
    build(ctx, p, k) {
      const m = k.mix(p.mix), l = k.osc('sine', p.rate), g = ctx.createGain(); g.gain.value = p.depth * 300;
      const stages = [0, 1, 2, 3].map(i => { const f = ctx.createBiquadFilter(); f.type = 'allpass'; f.frequency.value = 450 + i * 330; f.Q.value = 0.8; g.connect(f.frequency); return f; });
      l.connect(g); m.in.connect(stages[0]); stages.reduce((a, b) => (a.connect(b), b)).connect(m.wet);
      return k.done({ in: m.in, out: m.out, set: p => { k.ramp(l.frequency, p.rate); k.ramp(g.gain, p.depth * 300); m.set(p.mix); } });
    },
  },
  tremolo: {
    name: 'Tremolo', desc: 'volume pulsing, from gentle to choppy',
    params: [{ k: 'rate', label: 'Rate', min: 0.5, max: 20, step: 0.1, unit: 'hz', def: 5 }, { k: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.6 },
      { k: 'shape', label: 'Shape', options: [['sine', 'sine'], ['triangle', 'triangle'], ['square', 'chop']], def: 'sine' }],
    build(ctx, p, k) {
      const g = ctx.createGain(), l = k.osc(p.shape, p.rate), lg = ctx.createGain();
      g.gain.value = 1 - p.depth / 2; lg.gain.value = p.depth / 2; l.connect(lg).connect(g.gain);
      return k.done({ in: g, out: g, set: p => { l.type = p.shape; k.ramp(l.frequency, p.rate); k.ramp(g.gain, 1 - p.depth / 2); k.ramp(lg.gain, p.depth / 2); } });
    },
  },
  autopan: {
    name: 'Auto-pan', desc: 'sweeps the sound left and right',
    params: [{ k: 'rate', label: 'Rate', min: 0.1, max: 10, step: 0.1, unit: 'hz', def: 1 }, { k: 'depth', label: 'Width', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.8 }],
    build(ctx, p, k) {
      const pan = ctx.createStereoPanner(), l = k.osc('sine', p.rate), g = ctx.createGain(); g.gain.value = p.depth; l.connect(g).connect(pan.pan);
      return k.done({ in: pan, out: pan, set: p => { k.ramp(l.frequency, p.rate); k.ramp(g.gain, p.depth); } });
    },
  },
  ringmod: {
    name: 'Ring mod', desc: 'metallic, robotic, alien',
    params: [{ k: 'freq', label: 'Freq', min: 20, max: 2000, log: true, unit: 'hz', def: 150 }, { k: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.7 }],
    build(ctx, p, k) {
      const m = k.mix(p.mix), g = ctx.createGain(), c = k.osc('sine', p.freq); g.gain.value = 0; c.connect(g.gain);
      m.in.connect(g); g.connect(m.wet);
      return k.done({ in: m.in, out: m.out, set: p => { k.ramp(c.frequency, p.freq); m.set(p.mix); } });
    },
  },
  compressor: {
    name: 'Compressor', desc: 'glue and punch: evens out loud and quiet',
    params: [{ k: 'threshold', label: 'Thresh', min: -60, max: 0, step: 1, unit: 'db', def: -24 }, { k: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, unit: 'x', def: 4 }, { k: 'makeup', label: 'Makeup', min: 0, max: 18, step: 0.5, unit: 'db', def: 3 }],
    build(ctx, p, k) {
      const c = ctx.createDynamicsCompressor(), g = ctx.createGain();
      c.knee.value = 8; c.attack.value = 0.006; c.release.value = 0.18; c.threshold.value = p.threshold; c.ratio.value = p.ratio; g.gain.value = 10 ** (p.makeup / 20); c.connect(g);
      return k.done({ in: c, out: g, set: p => { c.threshold.value = p.threshold; c.ratio.value = p.ratio; k.ramp(g.gain, 10 ** (p.makeup / 20)); } });
    },
  },
  eq: {
    name: 'EQ', desc: 'bass, mids and treble',
    params: [{ k: 'low', label: 'Low', min: -12, max: 12, step: 0.5, unit: 'db', def: 0 }, { k: 'mid', label: 'Mid', min: -12, max: 12, step: 0.5, unit: 'db', def: 0 }, { k: 'high', label: 'High', min: -12, max: 12, step: 0.5, unit: 'db', def: 0 }],
    build(ctx, p, k) {
      const mk = (type, f, q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
      const lo = mk('lowshelf', 200, 0.7), mid = mk('peaking', 1200, 0.9), hi = mk('highshelf', 5000, 0.7);
      lo.gain.value = p.low; mid.gain.value = p.mid; hi.gain.value = p.high; lo.connect(mid).connect(hi);
      return k.done({ in: lo, out: hi, set: p => { k.ramp(lo.gain, p.low); k.ramp(mid.gain, p.mid); k.ramp(hi.gain, p.high); } });
    },
  },
  tape: {
    name: 'Tape', desc: 'wow and flutter, warm saturation, rolled-off highs',
    params: [{ k: 'wobble', label: 'Wobble', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.35 }, { k: 'tone', label: 'Tone', min: 1500, max: 16000, log: true, unit: 'hz', def: 7000 }, { k: 'drive', label: 'Warmth', min: 0, max: 1, step: 0.01, unit: 'pct', def: 0.3 }],
    build(ctx, p, k) {
      const d = ctx.createDelay(0.05), wow = k.osc('sine', 0.7), flut = k.osc('sine', 6.3), g1 = ctx.createGain(), g2 = ctx.createGain(), sat = ctx.createWaveShaper(), tone = lowpass(ctx, p.tone);
      d.delayTime.value = 0.012; g1.gain.value = p.wobble * 0.0035; g2.gain.value = p.wobble * 0.0004; let warm = p.drive; sat.curve = driveCurve(warm * 0.5);
      wow.connect(g1).connect(d.delayTime); flut.connect(g2).connect(d.delayTime); d.connect(sat).connect(tone);
      return k.done({ in: d, out: tone, set: p => { k.ramp(g1.gain, p.wobble * 0.0035); k.ramp(g2.gain, p.wobble * 0.0004); if (p.drive !== warm) { warm = p.drive; sat.curve = driveCurve(warm * 0.5); } k.ramp(tone.frequency, p.tone); } });
    },
  },
  widen: {
    name: 'Widener', desc: 'delays one side a few ms: instantly wider',
    params: [{ k: 'width', label: 'Width', min: 0, max: 30, step: 0.5, unit: 'ms', def: 12 }],
    build(ctx, p, k) {
      const input = ctx.createGain(), split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2), d = ctx.createDelay(0.04);
      input.channelCount = 2; input.channelCountMode = 'explicit'; // mono sources become two channels first
      d.delayTime.value = p.width / 1000;
      input.connect(split); split.connect(merge, 0, 0); split.connect(d, 1); d.connect(merge, 0, 1);
      return k.done({ in: input, out: merge, set: p => k.ramp(d.delayTime, p.width / 1000) });
    },
  },
};
export const FX_ORDER = ['filter', 'eq', 'compressor', 'drive', 'crush', 'tape', 'echo', 'reverb', 'chorus', 'flanger', 'phaser', 'tremolo', 'autopan', 'wobble', 'ringmod', 'widen'];

export const defaultsOf = def => Object.fromEntries(def.params.map(q => [q.k, q.def]));

/** Built-in presets: a name and a chain of [effect, params]. */
export const FACTORY = [
  ['Telephone', [['filter', { type: 'bandpass', freq: 1400, q: 1.2 }], ['drive', { amount: 0.35, tone: 3500, mix: 1 }]]],
  ['Underwater', [['filter', { type: 'lowpass', freq: 520, q: 1.5 }], ['chorus', { rate: 0.4, depth: 0.9, mix: 0.6 }], ['reverb', { size: 2.5, damp: 2500, mix: 0.35 }]]],
  ['Dub echo', [['echo', { time: 4, feedback: 0.62, tone: 1800, mix: 0.45 }], ['reverb', { size: 1.2, damp: 3000, mix: 0.18 }]]],
  ['Lo-fi tape', [['tape', { wobble: 0.55, tone: 5500, drive: 0.45 }], ['crush', { bits: 9, mix: 1 }], ['filter', { type: 'lowpass', freq: 6500, q: 0.7 }]]],
  ['Robot', [['ringmod', { freq: 70, mix: 0.85 }], ['echo', { time: 1, feedback: 0.35, tone: 5000, mix: 0.25 }]]],
  ['Wobble bass', [['wobble', { freq: 350, depth: 0.85, rate: 2, q: 7 }], ['drive', { amount: 0.55, tone: 6000, mix: 1 }]]],
  ['Space', [['chorus', { rate: 0.5, depth: 0.6, mix: 0.4 }], ['echo', { time: 3, feedback: 0.5, tone: 3500, mix: 0.35 }], ['reverb', { size: 4, damp: 5000, mix: 0.5 }]]],
  ['Megaphone', [['filter', { type: 'bandpass', freq: 1700, q: 0.9 }], ['drive', { amount: 0.8, tone: 5000, mix: 1 }], ['compressor', { threshold: -30, ratio: 8, makeup: 6 }]]],
  ['Dreamy', [['phaser', { rate: 0.2, depth: 0.7, mix: 0.5 }], ['tremolo', { rate: 3.5, depth: 0.3, shape: 'sine' }], ['reverb', { size: 3.2, damp: 7000, mix: 0.45 }]]],
  ['Wide pad', [['widen', { width: 18 }], ['chorus', { rate: 0.6, depth: 0.5, mix: 0.45 }]]],
  ['Chopper', [['tremolo', { rate: 8, depth: 1, shape: 'square' }], ['autopan', { rate: 2, depth: 0.9 }]]],
  ['Jet', [['flanger', { rate: 0.2, depth: 0.9, feedback: 0.7, mix: 0.6 }]]],
];

// ---------- chains ----------
const known = list => list.filter(f => FX[f.fx]);
/** Effects that are switched on and exist, in order. */
export const active = list => known(list || []).filter(f => f.on !== false);
export const chainTail = (list, env) => Math.max(0.15, ...list.map(f => FX[f.fx].tail?.({ ...defaultsOf(FX[f.fx]), ...f.p }, env) ?? 0.1));

/** Wires a list of effects in series. t0/stopAt bound the LFOs: a short-lived chain for one note or hit stops them, a track bus runs on. */
export function buildChain(ctx, list, env, t0 = ctx.currentTime, stopAt = Infinity) {
  const parts = list.map(item => { const def = FX[item.fx]; return { def, ...def.build(ctx, { ...defaultsOf(def), ...item.p }, kit(ctx, t0, stopAt), env) }; });
  parts.forEach((q, i) => i && parts[i - 1].out.connect(q.in));
  const last = parts[parts.length - 1];
  return {
    in: parts[0].in, out: last.out,
    set: (next, e) => parts.forEach((q, i) => q.set?.({ ...defaultsOf(q.def), ...next[i].p }, e)),
    dispose: () => { parts.forEach(q => q.dispose()); last.out.disconnect(); },
  };
}
