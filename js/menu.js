// A small context menu: items are { label, key?, run, disabled?, danger? } or '-' for a divider.
import { h } from './util.js';

let open = null;
export function closeMenu() { open?.(); }

export function openMenu(x, y, items) {
  closeMenu();
  const el = h('div', { className: 'cmenu', role: 'menu' }, items.map(it => (it === '-' ? h('hr') : h('button', {
    className: 'mi' + (it.danger ? ' danger' : ''), role: 'menuitem', disabled: !!it.disabled,
    onclick: () => { closeMenu(); it.run(); },
  }, h('span', { textContent: it.label }), it.key && h('kbd', { textContent: it.key })))));
  document.body.append(el);
  const r = el.getBoundingClientRect();
  el.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px'; el.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  const btns = () => [...el.querySelectorAll('.mi:not(:disabled)')];
  const away = e => { if (!el.contains(e.target)) closeMenu(); };
  const key = e => {
    if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault(); e.stopPropagation();
    const b = btns(), i = b.indexOf(document.activeElement);
    b[(i + (e.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length]?.focus();
  };
  addEventListener('pointerdown', away, true); addEventListener('keydown', key, true); addEventListener('resize', closeMenu); addEventListener('wheel', closeMenu, { passive: true }); addEventListener('blur', closeMenu);
  open = () => {
    el.remove(); open = null;
    removeEventListener('pointerdown', away, true); removeEventListener('keydown', key, true); removeEventListener('resize', closeMenu); removeEventListener('wheel', closeMenu); removeEventListener('blur', closeMenu);
  };
  btns()[0]?.focus();
}
