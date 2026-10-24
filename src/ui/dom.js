// Tiny DOM helpers shared by every screen.

import { icon } from './icons.js';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (value === true) el.setAttribute(key, '');
    else if (key in el && key !== 'list' && key !== 'type') el[key] = value;
    else el.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

// replaceChildren that skips null/false placeholders (conditional pieces of a screen).
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false));
  return el;
}

export function toast(message, { action, ms = 3500 } = {}) {
  const root = document.getElementById('toasts');
  const item = h('div', { class: 'toast', role: 'status' }, h('span', {}, message));
  if (action) {
    item.append(h('button', { class: 'toast-action', onClick: () => { action.onClick(); item.remove(); } }, action.label));
  }
  root.append(item);
  setTimeout(() => item.remove(), action ? ms * 2 : ms);
}

// Open sheets, newest last. Each one gets a history entry so the phone's back gesture closes it
// (鬼さん 2026-10-25: closing should not need a reach to the top-left corner).
const openSheets = [];
let sheetSeq = 0;
window.addEventListener('popstate', e => {
  // An entry left behind by a sheet closed with its own button: step over it.
  if (e.state?.deadSheet) { history.back(); return; }
  const keep = e.state?.sheet ?? 0;
  for (const s of [...openSheets].reverse()) if (s.id > keep) s.close(true);
});

export function sheet(content, { title = '', thumbClose = false } = {}) {
  const root = document.getElementById('sheets');
  const id = ++sheetSeq;
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const actionSlot = h('span', { class: 'sheet-action' });
  const panel = h('section', { class: thumbClose ? 'sheet has-thumb' : 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'sheet-head' },
      h('button', { class: 'round-btn', 'aria-label': '閉じる', onClick: () => close() }, icon('close')),
      h('h2', {}, title),
      actionSlot),
    h('div', { class: 'sheet-body' }, content),
    // Second close button where the thumb rests (right-handed, bottom right).
    thumbClose ? h('button', { class: 'round-btn thumb-close', 'aria-label': '閉じる', onClick: () => close() }, icon('close')) : null);
  // A button at the top right (Yomoo-style 登録), so a long form needs no scrolling to save.
  const setAction = (label, onClick) => fill(actionSlot, label ? h('button', { class: 'head-action', onClick }, label) : null);
  const listeners = new Set();
  let closed = false;
  function close(fromHistory = false) {
    if (closed) return;
    closed = true;
    openSheets.splice(openSheets.findIndex(s => s.id === id), 1);
    if (!fromHistory && history.state?.sheet === id) history.replaceState({ deadSheet: true }, '');
    backdrop.remove();
    panel.remove();
    for (const cb of listeners) cb();
  }
  openSheets.push({ id, close });
  history.pushState({ sheet: id }, '');
  backdrop.addEventListener('click', () => close());
  root.append(backdrop, panel);
  return { close: () => close(), onClose: cb => listeners.add(cb), body: panel.querySelector('.sheet-body'), setAction };
}

export function confirmDialog(message, okLabel = 'OK') {
  return new Promise(resolve => {
    let decided = false;
    const finish = value => { if (decided) return; decided = true; s.close(); resolve(value); };
    const s = sheet(h('div', { class: 'confirm' },
      h('p', {}, message),
      h('div', { class: 'row-buttons' },
        h('button', { class: 'btn', onClick: () => finish(false) }, 'やめる'),
        h('button', { class: 'btn primary', onClick: () => finish(true) }, okLabel))),
    { title: '確認' });
    s.onClose(() => finish(false));
  });
}

export function downloadText(fileName, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = h('a', { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'segmented', role: 'radiogroup' });
  const render = current => {
    wrap.replaceChildren(...options.map(([v, label]) => h('button', {
      class: v === current ? 'seg on' : 'seg',
      role: 'radio',
      'aria-checked': String(v === current),
      onClick: () => { render(v); onChange(v); },
    }, label)));
  };
  render(value);
  return wrap;
}

export function formatDate(ymd) {
  return ymd ? ymd.replace(/-/g, '/') : '';
}
