// The free colour (鬼さん 2026-11-07): one chosen ground colour, from which the rest of the screen's colours are worked out
// so text stays readable whatever the sliders say. Colour maths only, so it runs in the tests.

export const DEFAULT_CUSTOM = { h: 340, s: 40, l: 90 };

const clampNumber = (value, low, high, fallback) => {
  const n = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(n) ? fallback : Math.min(high, Math.max(low, n));
};

export function normalizeCustom(saved) {
  return {
    h: clampNumber(saved?.h, 0, 360, DEFAULT_CUSTOM.h),
    s: clampNumber(saved?.s, 0, 100, DEFAULT_CUSTOM.s),
    l: clampNumber(saved?.l, 5, 95, DEFAULT_CUSTOM.l),
  };
}

export function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const part = n => {
    const k = (n + h / 30) % 12;
    const value = light - sat * Math.min(light, 1 - light) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${part(0)}${part(8)}${part(4)}`;
}

const luminance = hex => {
  const channel = at => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};

export function contrast(a, b) {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Starting from lightness `l`, moves towards black or white until the colour reads against `on`.
function readable(h, s, l, on, target, towardsWhite) {
  const step = towardsWhite ? 1 : -1;
  for (let at = l; at >= 0 && at <= 100; at += step) {
    const hex = hslToHex(h, s, at);
    if (contrast(hex, on) >= target) return hex;
  }
  return towardsWhite ? '#ffffff' : '#000000';
}

const clampLight = l => Math.min(98, Math.max(2, l));

export function customThemeVars(custom) {
  const { h, s, l } = normalizeCustom(custom);
  const bg = hslToHex(h, s, l);
  const dark = contrast(bg, '#ffffff') >= contrast(bg, '#000000');
  const away = dark ? 1 : -1; // the direction that moves a colour away from the ground
  const tone = Math.min(s, 30); // text and lines carry a hint of the colour, not all of it
  const accentSat = s < 8 ? s : Math.max(s, 35);
  const shade = amount => hslToHex(h, s, clampLight(l + away * amount));
  const onBg = (start, target, sat = tone) => readable(h, sat, start, bg, target, dark);

  const accent = onBg(dark ? 75 : 32, 3.5, accentSat);
  const coverB = shade(14);

  return {
    '--bg': bg,
    '--card': hslToHex(h, s, clampLight(l + 2.5)),
    '--ink': onBg(dark ? 92 : 13, 4.5),
    '--muted': onBg(dark ? 70 : 42, 3.5),
    '--line': shade(8),
    '--accent': accent,
    '--accent-ink': onBg(dark ? 80 : 28, 4.5, accentSat),
    '--accent-soft': shade(7),
    '--on-accent': contrast(accent, '#ffffff') >= contrast(accent, '#000000') ? '#ffffff' : '#000000',
    '--accent-glow': dark ? 'rgba(0, 0, 0, .4)' : `${accent}55`,
    '--tab-off': onBg(dark ? 60 : 55, 2.5),
    '--underline': onBg(dark ? 50 : 62, 2),
    '--ghost': dark ? 'rgba(255, 255, 255, .08)' : 'rgba(0, 0, 0, .06)',
    '--cover-a': shade(8),
    '--cover-b': coverB,
    '--cover-ink': readable(h, tone, dark ? 85 : 25, coverB, 4.5, contrast(coverB, '#ffffff') >= contrast(coverB, '#000000')),
    '--toast': readable(h, tone, 28, '#ffffff', 4.5, false),
    '--warn': readable(38, 75, dark ? 68 : 34, bg, 3.5, dark),
    '--warn-soft': dark ? '#3b3526' : '#f3e6d2',
    '--danger': readable(352, 75, dark ? 77 : 52, bg, 3.5, dark),
    '--danger-soft': dark ? '#432c33' : '#f3dade',
    '--ok': readable(140, 50, dark ? 74 : 33, bg, 3.5, dark),
    '--ok-soft': dark ? '#223a33' : '#d4ead9',
    '--sh-dark': dark ? 'rgba(0, 0, 0, .5)' : `${hslToHex(h, tone, Math.max(l - 28, 15))}73`,
    '--sh-light': dark ? 'rgba(255, 255, 255, .05)' : l >= 75 ? 'rgba(255, 255, 255, .85)' : 'rgba(255, 255, 255, .25)',
    '--gold': dark ? '#cdb57f' : '#a88b52',
    'color-scheme': dark ? 'dark' : 'light',
  };
}
