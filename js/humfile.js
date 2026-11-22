// The .hum project file: what to trust when reading one, and how to pack one. Pure, so it can be tested in Node.
// A .hum file may come from anyone: nothing in it is trusted until it has been through here.

export const FORMAT = 2;
const SCALES = ['minor', 'major', 'chromatic'], TYPES = ['drums', 'inst', 'audio'];
const num = (v, d, lo = -Infinity, hi = Infinity) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const str = (v, d = '') => (typeof v === 'string' ? v : d);
const list = v => (Array.isArray(v) ? v : []);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Only an inline image is allowed as a cover: a project file must not make the page load a URL. */
export const safeCover = c => (typeof c === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(c) ? c : '');
/** Audio inside a .hum is an inline data URL. Anything else (http:, file:…) would make the page fetch it. */
export const isAudioData = u => typeof u === 'string' && /^data:audio\//.test(u);

const fx = l => list(l).filter(f => f && typeof f.fx === 'string').map(f => ({ ...f, id: str(f.id, f.fx), on: f.on !== false, p: obj(f.p) }));

function clip(c, type) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string') return null;
  const out = { ...c, start: num(c.start, 0, 0), fx: fx(c.fx) };
  if (!out.fx.length) delete out.fx;
  if (type === 'audio') {
    if (typeof c.buf !== 'string') return null;
    Object.assign(out, { off: num(c.off, 0, 0), dur: num(c.dur, 0, 0), gain: num(c.gain, 1, 0, 4), rate: num(c.rate, 1, 0.1, 8), pitch: num(c.pitch, 0, -24, 24), tune: num(c.tune, 0, 0, 1), fadeIn: num(c.fadeIn, 0, 0), fadeOut: num(c.fadeOut, 0, 0), rev: !!c.rev });
    return out.dur > 0 ? out : null;
  }
  if (c.buf !== undefined) return null; // an audio clip on a pattern track
  out.len = Math.max(1, Math.round(num(c.len, 16)));
  if (type === 'drums') out.steps = Object.fromEntries(Object.entries(obj(c.steps)).filter(([, a]) => Array.isArray(a)));
  else out.notes = list(c.notes).filter(n => n && Number.isFinite(n.t) && Number.isFinite(n.d) && Number.isFinite(n.n));
  return out;
}

function track(t, i) {
  if (!t || typeof t !== 'object' || !TYPES.includes(t.type) || typeof t.id !== 'string') return null;
  const out = {
    ...t, name: str(t.name, 'Track').slice(0, 60), color: Math.round(num(t.color, i % 6, 0, 5)), vol: num(t.vol, 0.8, 0, 1), mute: !!t.mute, solo: !!t.solo,
    reverb: num(t.reverb, 0, 0, 1), echo: num(t.echo, 0, 0, 1), fx: fx(t.fx), clips: list(t.clips).map(c => clip(c, t.type)).filter(Boolean),
  };
  if (t.type === 'drums') out.rows = list(t.rows).filter(r => r && typeof r.id === 'string' && typeof r.sound === 'string').map(r => ({ ...r, vol: num(r.vol, 0.8, 0, 1) }));
  if (t.type === 'inst') out.inst = str(t.inst, 'lead');
  return out;
}

/** Returns a safe, complete project, or null when `p` is not a project at all. Keeps fields it does not know. */
export function checkProject(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.tracks)) return null;
  const meta = { ...obj(p.meta), tags: list(p.meta?.tags).filter(t => typeof t === 'string') };
  const cover = safeCover(meta.cover);
  if (cover) meta.cover = cover; else delete meta.cover;
  const sounds = Object.fromEntries(Object.entries(obj(p.sounds)).filter(([, v]) => typeof v === 'string'));
  const out = {
    ...p, name: str(p.name).trim().slice(0, 60) || 'imported', bpm: num(p.bpm, 100, 40, 240), key: Math.round(num(p.key, 0, 0, 11)), scale: SCALES.includes(p.scale) ? p.scale : 'minor',
    vol: num(p.vol, 0.8, 0, 1), sounds, meta, tracks: p.tracks.map(track).filter(Boolean),
    box: list(p.box).filter(b => b && typeof b.id === 'string' && TYPES.includes(b.type) && clip(b.c, b.type)),
  };
  if (p.minBars !== undefined) out.minBars = Math.round(num(p.minBars, 4, 0, 64)); // blank means "use the global default"
  return out;
}

/** The finished file text. env.size is set to the exact byte length, working it out without stringifying the (large) audio more than once. */
export function packHum(env, audio) {
  const tail = ',"audio":' + JSON.stringify(audio) + '}', enc = new TextEncoder();
  let head = '', size = 0;
  for (let i = 0; i < 5; i++) { env.size = size; head = JSON.stringify(env).slice(0, -1); const n = enc.encode(head).length + enc.encode(tail).length; if (n === size) break; size = n; }
  return head + tail;
}
