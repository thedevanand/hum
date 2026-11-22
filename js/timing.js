// Timeline maths, no audio and no DOM (so it can be tested in Node). 16 steps per bar.
export const stepSec = S => 15 / S.bpm;
export const clipLen = (c, S) => (c.buf ? c.dur / c.rate / stepSec(S) : c.len); // steps
/** Length of the music itself in steps: the end of the last clip, rounded up to a bar. Empty bars after it are never played or exported. */
export const songSteps = S => Math.max(16, ...S.tracks.flatMap(t => t.clips.map(c => Math.ceil((c.start + clipLen(c, S)) / 16 - 1e-6) * 16)));
