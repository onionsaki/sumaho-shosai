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

test('rakutenMagazineUrl searches magazines by JAN', async () => {
  const { rakutenMagazineUrl } = await import('../src/core/rakuten.js');
  const url = new URL(rakutenMagazineUrl('4910203141163', { appId: 'APP', accessKey: 'KEY' }));
  assert.equal(url.pathname, '/services/api/BooksMagazine/Search/20170404');
  assert.equal(url.searchParams.get('jan'), '4910203141163');
  assert.equal(url.searchParams.get('accessKey'), 'KEY');
});

test('parseRakutenMagazine reads title, publisher, month and cover', async () => {
  const { parseRakutenMagazine } = await import('../src/core/rakuten.js');
  const json = { Items: [{ title: '週刊少年ジャンプ 2026年 11/16号', publisherName: '集英社', salesDate: '2026年11月02日', largeImageUrl: 'https://t/j.jpg' }] };
  assert.deepEqual(parseRakutenMagazine(json), { title: '週刊少年ジャンプ 2026年 11/16号', publisher: '集英社', issued: '2026-11', coverUrl: 'https://t/j.jpg' });
  assert.equal(parseRakutenMagazine({ Items: [] }), null);
  assert.equal(parseRakutenMagazine({ Items: [{ Item: { title: 'x', publisherName: '', salesDate: '2026年05月号' } }] }).issued, '2026-05');
});
