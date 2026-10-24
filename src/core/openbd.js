// openBD: secondary metadata source, mainly for covers (spec §5).

import { cleanNdlName } from './normalize.js';
import { parseVolume, splitTitleVolume } from './volume.js';
import { parseIssued } from './ndl.js';

export const openBdUrl = isbn => `https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`;

const parsePubdate = raw => {
  const s = String(raw ?? '').normalize('NFKC');
  const m = s.match(/^(\d{4})-?(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : parseIssued(s);
};

export function parseOpenBd(json) {
  const s = Array.isArray(json) ? json[0]?.summary : null;
  if (!s) return null;
  const title = String(s.title ?? '').trim();
  let volume = parseVolume(s.volume);
  let workTitle = title;
  if (volume === null) ({ workTitle, volume } = splitTitleVolume(title));
  const authors = String(s.author ?? '').split(/\s+/)
    .map(a => cleanNdlName(a.split('／')[0]))
    .filter(Boolean);
  return {
    isbn: String(s.isbn ?? ''),
    title,
    titleKana: '',
    authors,
    authorsKana: [],
    publisher: String(s.publisher ?? '').trim(),
    issued: parsePubdate(s.pubdate),
    pages: null,
    price: null,
    volume,
    volumeLabel: String(s.volume ?? ''),
    workTitle,
    coverUrl: String(s.cover ?? ''),
  };
}
