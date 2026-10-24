import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rakutenIsbnUrl, parseRakutenCover } from '../src/core/rakuten.js';

test('rakutenIsbnUrl asks the Books search by ISBN with both keys', () => {
  const url = new URL(rakutenIsbnUrl('9784763135476', { appId: 'APP', accessKey: 'KEY' }));
  assert.equal(url.origin + url.pathname, 'https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404');
  assert.equal(url.searchParams.get('isbn'), '9784763135476');
  assert.equal(url.searchParams.get('applicationId'), 'APP');
  assert.equal(url.searchParams.get('accessKey'), 'KEY');
  assert.equal(url.searchParams.get('formatVersion'), '2');
});

test('parseRakutenCover takes the large image of the first item', () => {
  const json = { Items: [{ largeImageUrl: 'https://thumbnail.image.rakuten.co.jp/a.jpg?_ex=200x200', mediumImageUrl: 'https://x/m.jpg' }] };
  assert.equal(parseRakutenCover(json), 'https://thumbnail.image.rakuten.co.jp/a.jpg?_ex=200x200');
});

test('parseRakutenCover accepts the old nested shape and falls back to the medium image', () => {
  assert.equal(parseRakutenCover({ Items: [{ Item: { mediumImageUrl: 'https://x/m.jpg' } }] }), 'https://x/m.jpg');
});

test('parseRakutenCover ignores no-image placeholders, empty results and errors', () => {
  assert.equal(parseRakutenCover({ Items: [{ largeImageUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/noimage_01.gif?_ex=200x200' }] }), '');
  assert.equal(parseRakutenCover({ Items: [] }), '');
  assert.equal(parseRakutenCover({ error: 'wrong_parameter' }), '');
  assert.equal(parseRakutenCover(null), '');
});
