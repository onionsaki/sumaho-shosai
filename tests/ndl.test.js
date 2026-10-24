import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import {
  parseNdlOpenSearch, pickBestNdlItem, ndlIsbnUrl, ndlTitleSearchUrl, ndlThumbnailUrl,
} from '../src/core/ndl.js';

const read = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parses business book', () => {
  const [b] = parseNdlOpenSearch(read('ndl-9784763135476.xml'), DOMParser);
  assert.equal(b.title, '1冊20分、読まずに「わかる!」すごい読書術');
  assert.equal(b.titleKana, 'イッサツニジップンヨマズニワカルスゴイドクショジュツ');
  assert.deepEqual(b.authors, ['渡邊康弘']);
  assert.deepEqual(b.authorsKana, ['ワタナベヤスヒロ']);
  assert.equal(b.publisher, 'サンマーク出版');
  assert.equal(b.issued, '2016-06');
  assert.equal(b.pages, 254);
  assert.equal(b.price, 1400);
  assert.equal(b.isbn, '9784763135476');
  assert.equal(b.volume, null);
  assert.equal(b.workTitle, b.title);
});

test('pickBestNdlItem prefers half-width item with reading', () => {
  const items = parseNdlOpenSearch(read('ndl-9784088725093.xml'), DOMParser);
  assert.ok(items.length >= 2);
  const b = pickBestNdlItem(items);
  assert.equal(b.title, 'ONE PIECE');
  assert.equal(b.titleKana, 'ワンピース');
  assert.deepEqual(b.authors, ['尾田栄一郎']);
  assert.equal(b.volume, 1);
  assert.equal(b.volumeLabel, '巻一');
  assert.equal(b.workTitle, 'ONE PIECE');
  assert.equal(b.isbn, '9784088725093'); // given as 4-08-872509-3
  assert.equal(b.pages, 207);
  assert.equal(b.issued, '1997-12');
});

test('full-width numbers are read', () => {
  const items = parseNdlOpenSearch(read('ndl-9784088725093.xml'), DOMParser);
  const fw = items.find(i => i.title === 'Ｏｎｅ　Ｐｉｅｃｅ');
  assert.equal(fw.issued, '1997-12');
  assert.equal(fw.price, 390);
  assert.equal(fw.pages, 207);
});

test('pickBestNdlItem with nothing', () => {
  assert.equal(pickBestNdlItem([]), null);
});

test('title search returns several items', () => {
  assert.ok(parseNdlOpenSearch(read('ndl-title-search.xml'), DOMParser).length >= 2);
});

test('urls', () => {
  assert.equal(ndlIsbnUrl('9784763135476'), 'https://ndlsearch.ndl.go.jp/api/opensearch?isbn=9784763135476');
  assert.equal(
    ndlTitleSearchUrl('すごい 読書術', '渡邊'),
    'https://ndlsearch.ndl.go.jp/api/opensearch?title=%E3%81%99%E3%81%94%E3%81%84%20%E8%AA%AD%E6%9B%B8%E8%A1%93&creator=%E6%B8%A1%E9%82%8A&cnt=20',
  );
  assert.equal(ndlTitleSearchUrl('x'), 'https://ndlsearch.ndl.go.jp/api/opensearch?title=x&cnt=20');
  assert.equal(ndlThumbnailUrl('9784763135476'), 'https://ndlsearch.ndl.go.jp/thumbnail/9784763135476.jpg');
});
