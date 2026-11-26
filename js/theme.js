// Themes: a name on <html> picks the colours and roundness in style.css. The track colours live here because JS paints them.
import { COLORS, G, saveG } from './state.js';

export const THEMES = {
  terminal: { note: 'flat, square, dark', radius: 0, swatch: ['#0a0a0a', '#d6d6d1', '#6ee787', '#e6b450'], tracks: ['#e6b450', '#59c2ff', '#d2a6ff', '#95e6cb', '#f07178', '#aad94c'] },
  paper: { note: 'light, softly rounded', radius: 4, swatch: ['#f4f1ea', '#26231d', '#1c8a4a', '#a86f00'], tracks: ['#b97a00', '#1f78c1', '#8a52c4', '#16906f', '#d0404c', '#5a9a14'] },
  dusk: { note: 'deep violet, very round', radius: 10, swatch: ['#15131f', '#e4e1f5', '#7ef0c9', '#ffc66b'], tracks: ['#ffc66b', '#6bc8ff', '#c79bff', '#7ef0c9', '#ff6f91', '#b5e86a'] },
};
/** The current value of a CSS variable, for canvas drawing. */
export const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export function applyTheme(name = G.theme) {
  const t = THEMES[name] || THEMES.terminal;
  document.documentElement.dataset.theme = THEMES[name] ? name : 'terminal';
  COLORS.splice(0, COLORS.length, ...t.tracks);
}
export function setTheme(name) { G.theme = name; saveG(); applyTheme(name); }
