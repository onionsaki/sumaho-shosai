// Colour patterns (鬼さん 2026-10-24: 緑が主軸、白・黒も選べると最高). Colours themselves live in styles.css,
// except 自由 (2026-11-07), whose colours are worked out from the one the sliders chose.

import { customThemeVars, normalizeCustom } from '../core/custom-theme.js';

export const THEMES = [['white', '白'], ['kinari', 'ベージュ'], ['green', '緑'], ['deepgreen', '深緑'], ['blue', '青'], ['navy', '紺'], ['black', '黒'], ['custom', '自由']];
const BAR = { green: '#e3ebe6', deepgreen: '#17302a', kinari: '#efe8dc', white: '#eceeef', blue: '#e4eaee', navy: '#1a2233', black: '#1f2326' };

let inlineNames = [];

export function applyTheme(name, custom) {
  const theme = name === 'custom' || BAR[name] ? name : 'green';
  const root = document.documentElement;
  const vars = theme === 'custom' ? customThemeVars(normalizeCustom(custom)) : {};
  for (const prop of inlineNames) root.style.removeProperty(prop);
  inlineNames = Object.keys(vars);
  for (const prop of inlineNames) root.style.setProperty(prop, vars[prop]);
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--bg'] ?? BAR[theme]);
  return theme;
}
