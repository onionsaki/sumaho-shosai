// Colour patterns (鬼さん 2026-10-24: 緑が主軸、白・黒も選べると最高). Colours themselves live in styles.css.

export const THEMES = [['green', '緑'], ['deepgreen', '濃い緑'], ['kinari', '生成り'], ['white', '白'], ['blue', '青'], ['navy', '紺'], ['black', '黒']];
const BAR = { green: '#e3ebe6', deepgreen: '#17302a', kinari: '#efe8dc', white: '#eceeef', blue: '#e4eaee', navy: '#1a2233', black: '#1f2326' };

export function applyTheme(name) {
  const theme = BAR[name] ? name : 'green';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme]);
  return theme;
}
