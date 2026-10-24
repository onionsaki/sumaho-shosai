// Volume parsing and work grouping keys (spec §5 マンガの作品と巻の判定).

import { normalizeForSearch, stripAuthorRole } from './normalize.js';

const KANJI_DIGIT = { '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
const KANJI_UNIT = { '十': 10, '百': 100, '千': 1000 };

function kanjiToNumber(s) {
  let total = 0;
  let current = 0;
  for (const ch of s) {
    if (ch in KANJI_DIGIT) current = current * 10 + KANJI_DIGIT[ch];
    else { total += (current || 1) * KANJI_UNIT[ch]; current = 0; }
  }
  return total + current;
}

export function parseVolume(label) {
  const s = String(label ?? '').normalize('NFKC').trim();
  if (!s) return null;
  const position = s.match(/^第?([上中下])巻?$/);
  if (position) return { '上': 1, '中': 2, '下': 3 }[position[1]];
  const digits = s.match(/\d+/);
  if (digits) return Number(digits[0]);
  const kanji = s.match(/[〇一二三四五六七八九十百千]+/);
  if (kanji) return kanjiToNumber(kanji[0]);
  return null;
}

const D = '[0-9０-９]+';
const TRAILING_VOLUME = [
  new RegExp(`^(.*?)[\\s　]*[（(]\\s*第?(${D})[巻集]?\\s*[）)]$`),
  new RegExp(`^(.*\\S)[\\s　]+第?(${D})[巻集]?$`),
  new RegExp(`^(.*?\\D)第?(${D})[巻集]$`),
];

export function splitTitleVolume(title) {
  const t = String(title ?? '').trim();
  for (const re of TRAILING_VOLUME) {
    const m = t.match(re);
    if (m && m[1].trim()) return { workTitle: m[1].trim(), volume: Number(m[2].normalize('NFKC')) };
  }
  return { workTitle: t, volume: null };
}

export function workKeyOf(workTitle, authors) {
  const first = Array.isArray(authors) && authors.length ? authors[0] : '';
  return `${normalizeForSearch(workTitle)}|${normalizeForSearch(stripAuthorRole(first))}`;
}
