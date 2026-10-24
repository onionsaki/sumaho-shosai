// Colour patterns (鬼さん 2026-10-24: 緑が主軸、白・黒も選べると最高). Colours themselves live in styles.css.

export const THEMES = [['green', '緑'], ['white', '白'], ['black', '黒'], ['blue', '青']];
const BAR = { green: '#e3ebe6', white: '#eceeef', black: '#1f2326', blue: '#e4eaee' };

export function applyTheme(name) {
  const theme = BAR[name] ? name : 'green';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme]);
  return theme;
}
