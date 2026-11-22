// Sliders with undo and live read-outs.
import { changed, snap } from './edit.js';
import { h, pct } from './util.js';

export const fill = inp => inp.style.setProperty('--p', ((inp.value - inp.min) / (inp.max - inp.min)) * 100 + '%');
/** Range input. Undo snapshot on grab; lazy = only apply on release (for settings that reprocess audio). */
export function range(value, [min, max, step], set, { lazy, done, ...props } = {}) {
  const inp = h('input', {
    type: 'range', min, max, step, value, ...props,
    onpointerdown: snap,
    oninput: () => { fill(inp); if (!lazy) { set(+inp.value); changed(true); } },
    onchange: () => { if (lazy) set(+inp.value); done ? done() : changed(!lazy); },
  });
  fill(inp);
  return inp;
}
/** Labelled ruler slider with a live read-out. */
export function param(label, value, lim, set, fmt = pct, opts = {}) {
  const out = h('output', { textContent: fmt(value) });
  const inp = range(value, lim, set, { ...opts, ariaLabel: label });
  inp.addEventListener('input', () => (out.textContent = fmt(+inp.value)));
  return h('label', { className: 'param' }, h('span', { className: 'lab', textContent: label }), out, inp);
}
