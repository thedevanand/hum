// What changed in each version, newest first. The changelog window and the GitHub release notes are written from this.
export const CHANGELOG = [
  {
    v: '1.0.1', date: '2026-11-27',
    new: [
      'Pitch for patterns: a Pitch knob in the editor transposes a melody or retunes a drum pattern by up to two octaves. Right-click a pattern for +1 / -1 semitone. A badge on the pattern shows it.',
      'Pitch effect: shifts any clip, track or sound up or down 12 semitones (plus fine tuning) without changing the speed. Comes with the presets Chipmunk, Deep voice and Octave shimmer.',
      'Select tiles in a pattern: shift-drag a box around notes or drum steps, shift-click to add or remove one, Ctrl/⌘ A for all. Drag a selected tile to move the whole selection, nudge with the arrow keys.',
      'Copy, cut, paste and delete tiles (Ctrl/⌘ C, X, V, Delete) at the last step you clicked. It works between patterns and between tabs.',
      'Search box in the effects list, for effects and presets.',
      'Themes: terminal (the original), paper (light) and dusk (violet). Each changes the colours and how round things are.',
      'Preferences window: theme, project settings and global defaults in one place.',
      'The box is now a sidebar you can close and open with the box button.',
      'Changelog, version number, a feedback link and the maker line.',
    ],
    fix: [
      'Clicking an effect no longer scrolls the effects list back to the top.',
      'Credits are a proper page instead of raw text.',
      'The drum editor keeps its scroll position after you change something.',
    ],
  },
  {
    v: '0.3.0', date: '2026-11-22',
    new: ['First public version: drum machine, piano, flute and synth, audio import and recording, clip editing, effects with presets, project manager, .hum files, media manager, loop and zoom.'],
    fix: [],
  },
];
