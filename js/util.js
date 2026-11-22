// Small DOM, drag and toast helpers shared by every UI module.
import { ICON } from './icons.js';

export const $ = s => document.querySelector(s);
export const h = (tag, props = {}, ...kids) => {
  const { data, ...rest } = props, el = Object.assign(document.createElement(tag), rest);
  for (const k in data) el.dataset[k] = data[k];
  el.append(...kids.flat().filter(k => k != null && k !== false));
  return el;
};
export const uid = () => Math.random().toString(36).slice(2, 9);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const pct = v => Math.round(v * 100) + '%';
export const secs = v => v.toFixed(2) + 's';
export const clock = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
export const ico = name => h('span', { innerHTML: ICON[name] });
export const drag = (move, up) => {
  const end = e => { for (const t of ['pointermove', 'pointerup', 'pointercancel']) removeEventListener(t, t === 'pointermove' ? move : end); up?.(e); };
  addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);
};
let toastTimer;
export function toast(msg, ms = 2600) {
  const el = $('#toast'); clearTimeout(toastTimer);
  if (msg) el.textContent = msg;
  el.classList.toggle('show', !!msg);
  if (msg) toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
export const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
