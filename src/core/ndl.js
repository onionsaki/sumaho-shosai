// National Diet Library (NDLサーチ) OpenSearch: URLs and parsing (spec §5).

import { cleanNdlName, stripAuthorRole } from './normalize.js';
import { parseVolume, splitTitleVolume } from './volume.js';
import { toIsbn13 } from './isbn.js';

const BASE = 'https://ndlsearch.ndl.go.jp/api/opensearch';
const NS = {
  dc: 'http://purl.org/dc/elements/1.1/',
  dcndl: 'http://ndl.go.jp/dcndl/terms/',
  dcterms: 'http://purl.org/dc/terms/',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
};

export const ndlIsbnUrl = isbn => `${BASE}?isbn=${encodeURIComponent(isbn)}`;

export function ndlTitleSearchUrl(title, author = '', cnt = 20) {
  const parts = [`title=${encodeURIComponent(title)}`];
  if (author) parts.push(`creator=${encodeURIComponent(author)}`);
  parts.push(`cnt=${cnt}`);
  return `${BASE}?${parts.join('&')}`;
}

// Every volume of one work: NDL returns spin-offs and guides too, so ask for a big page (pickSeriesVolumes sorts it out).
export function ndlSeriesSearchUrl({ title, author = '', publisher = '' }) {
  const parts = [`title=${encodeURIComponent(title)}`];
  const name = stripAuthorRole(author);
  if (name) parts.push(`creator=${encodeURIComponent(name)}`);
  if (publisher) parts.push(`publisher=${encodeURIComponent(publisher)}`);
  parts.push('cnt=500');
  return `${BASE}?${parts.join('&')}`;
}

export const ndlThumbnailUrl = isbn => `https://ndlsearch.ndl.go.jp/thumbnail/${isbn}.jpg`;

const all = (el, ns, name) => Array.from(el.getElementsByTagNameNS(NS[ns], name));
const first = (el, ns, name) => (all(el, ns, name)[0]?.textContent ?? '').trim();
const nfkc = s => String(s ?? '').normalize('NFKC');

export function parseIssued(raw) {
  const m = nfkc(raw).match(/(\d{4})(?:\s*[.\-/年]\s*(\d{1,2}))?/);
  if (!m) return '';
  return m[2] ? `${m[1]}-${m[2].padStart(2, '0')}` : m[1];
}

const parsePages = raw => {
  const m = nfkc(raw).match(/(\d+)\s*p/i);
  return m ? Number(m[1]) : null;
};

const parsePrice = raw => {
  const m = nfkc(raw).match(/(\d[\d,]*)\s*円/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
};

function parseItem(item) {
  const title = first(item, 'dc', 'title');
  const volumeLabel = first(item, 'dcndl', 'volume');
  let volume = parseVolume(volumeLabel);
  let workTitle = title;
  if (volume === null) ({ workTitle, volume } = splitTitleVolume(title));
  const isbnEl = all(item, 'dc', 'identifier').find(e =>
    (e.getAttributeNS(NS.xsi, 'type') || e.getAttribute('xsi:type') || '').includes('ISBN'));
  return {
    isbn: (isbnEl && toIsbn13(isbnEl.textContent)) || '',
    title,
    titleKana: first(item, 'dcndl', 'titleTranscription').replace(/[\s　]/g, ''),
    authors: all(item, 'dc', 'creator').map(e => cleanNdlName(e.textContent)).filter(Boolean),
    authorsKana: all(item, 'dcndl', 'creatorTranscription').map(e => cleanNdlName(e.textContent)).filter(Boolean),
    publisher: first(item, 'dc', 'publisher'),
    issued: parseIssued(first(item, 'dcterms', 'issued')),
    pages: parsePages(first(item, 'dc', 'extent')),
    price: parsePrice(first(item, 'dcndl', 'price')),
    volume,
    volumeLabel,
    workTitle,
    coverUrl: '',
  };
}

export function parseNdlOpenSearch(xmlText, DOMParserImpl) {
  const doc = new DOMParserImpl().parseFromString(xmlText, 'text/xml');
  return Array.from(doc.getElementsByTagName('item')).map(parseItem);
}

export function pickBestNdlItem(items) {
  let best = null;
  let bestScore = -1;
  for (const item of items) {
    const score = (item.titleKana ? 2 : 0) + (item.title === item.title.normalize('NFKC') ? 1 : 0);
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return best;
}
