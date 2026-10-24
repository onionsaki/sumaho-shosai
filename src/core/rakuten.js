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

// Magazines (barcode 491…): the code is kept in the book's isbn field so duplicate checks work the same way.
export function rakutenMagazineUrl(jan, { appId, accessKey }) {
  const q = new URLSearchParams({ format: 'json', formatVersion: '2', jan, applicationId: appId, accessKey });
  return `https://openapi.rakuten.co.jp/services/api/BooksMagazine/Search/20170404?${q}`;
}

export function parseRakutenMagazine(json) {
  const first = json?.Items?.[0];
  const item = first?.Item ?? first;
  if (!item?.title) return null;
  const m = String(item.salesDate ?? '').normalize('NFKC').match(/([0-9]{4})年([0-9]{1,2})月/);
  const cover = String(item.largeImageUrl || item.mediumImageUrl || '');
  return {
    title: String(item.title).trim(),
    publisher: String(item.publisherName ?? '').trim(),
    issued: m ? `${m[1]}-${m[2].padStart(2, '0')}` : '',
    coverUrl: /noimage/i.test(cover) ? '' : cover,
  };
}
