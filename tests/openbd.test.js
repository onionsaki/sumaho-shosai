import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOpenBd, openBdUrl } from '../src/core/openbd.js';

const read = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

test('openBD null', () => {
  assert.equal(parseOpenBd(read('openbd-null.json')), null);
  assert.equal(parseOpenBd(null), null);
});

test('openBD hit', () => {
  const b = parseOpenBd(read('openbd-9784088725093.json'));
  assert.equal(b.isbn, '9784088725093');
  assert.equal(b.title, 'One piece 巻1');
  assert.equal(b.workTitle, 'One piece');
  assert.equal(b.volume, 1);
  assert.equal(b.publisher, '集英社');
  assert.equal(b.issued, '1997-12');
  assert.deepEqual(b.authors, ['尾田栄一郎']);
  assert.equal(b.coverUrl, '');
});

test('openBD cover and pubdate forms', () => {
  const b = parseOpenBd([{ summary: { isbn: '9784763135476', title: 't', volume: '3', pubdate: '20160601', cover: 'https://cover.openbd.jp/9784763135476.jpg', author: '渡邊康弘／著' } }]);
  assert.equal(b.issued, '2016-06');
  assert.equal(b.volume, 3);
  assert.equal(b.coverUrl, 'https://cover.openbd.jp/9784763135476.jpg');
  assert.deepEqual(b.authors, ['渡邊康弘']);
});

test('url', () => {
  assert.equal(openBdUrl('9784763135476'), 'https://api.openbd.jp/v1/get?isbn=9784763135476');
});
