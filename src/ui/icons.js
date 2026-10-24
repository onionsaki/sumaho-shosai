// Line icons drawn inline (no icon font, works offline). Stroke follows currentColor.

const PATHS = {
  barcode: '<path d="M4 5v14M7 5v14M10 5v14M12.5 5v14M15 5v14M18 5v14M20 5v14" stroke-width="1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.7 6.7a1.4 1.4 0 0 1-2 0z"/><circle cx="8" cy="8" r="1.6"/>',
  books: '<rect x="4" y="4" width="4.5" height="16" rx="1.2"/><rect x="9.5" y="4" width="4.5" height="16" rx="1.2"/><path d="M15.5 5.2l3.6-1 3 15.4-3.6 1z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8l2 .4.6 2.3 1.9 1.1 2.3-.7 1.4 1.5-.7 2.3 1.1 1.9 2.3.6v2l-2.3.6-1.1 1.9.7 2.3-1.4 1.5-2.3-.7-1.9 1.1-.6 2.3-2 .4-2-.4-.6-2.3-1.9-1.1-2.3.7-1.4-1.5.7-2.3-1.1-1.9L1.4 13v-2l2.3-.6 1.1-1.9-.7-2.3L5.5 4.7l2.3.7 1.9-1.1.6-2.3z" stroke-linejoin="round"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  open: '<path d="M2.5 5.5c3-1 6.5-1 9.5 1v13c-3-2-6.5-2-9.5-1zM21.5 5.5c-3-1-6.5-1-9.5 1v13c3-2 6.5-2 9.5-1z" stroke-linejoin="round"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>',
  shop: '<path d="M4 9h16l-1.2 10.5a1.5 1.5 0 0 1-1.5 1.3H6.7a1.5 1.5 0 0 1-1.5-1.3zM8.5 9V7a3.5 3.5 0 0 1 7 0v2"/>',
  pencil: '<path d="M4 20l1-4.5L16 4.5a2 2 0 0 1 3 0l.5.5a2 2 0 0 1 0 3L8.5 19z M14 6.5l3.5 3.5" stroke-linejoin="round"/>',
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `icon ${cls}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${PATHS[name] ?? ''}</svg>`;
  return span;
}
