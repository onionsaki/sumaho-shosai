// Rakuten Books: covers only (鬼さん 2026-10-24). The keys live on the phone (settings), never in this public repo.

const ENDPOINT = 'https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404';

export function rakutenIsbnUrl(isbn, { appId, accessKey }) {
  const q = new URLSearchParams({
    format: 'json', formatVersion: '2', isbn, applicationId: appId, accessKey,
    elements: 'largeImageUrl,mediumImageUrl',
  });
  return `${ENDPOINT}?${q}`;
}

export function parseRakutenCover(json) {
  const first = json?.Items?.[0];
  const item = first?.Item ?? first;
  const url = String(item?.largeImageUrl || item?.mediumImageUrl || '');
  return /noimage/i.test(url) ? '' : url;
}
