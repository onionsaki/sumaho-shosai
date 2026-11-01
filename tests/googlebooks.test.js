import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleBooksIsbnUrl, parseGoogleCover } from '../src/core/googlebooks.js';

test('Google Books is asked by ISBN with the key', () => {
  const url = new URL(googleBooksIsbnUrl('9784763135476', 'KEY'));
  assert.equal(url.searchParams.get('q'), 'isbn:9784763135476');
  assert.equal(url.searchParams.get('key'), 'KEY');
});

test('the cover is turned to https without the curl effect, and missing covers give an empty string', () => {
  const json = { items: [{ volumeInfo: { imageLinks: { thumbnail: 'http://books.google.com/books/content?id=x&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api' } } }] };
  assert.equal(parseGoogleCover(json), 'https://books.google.com/books/content?id=x&printsec=frontcover&img=1&zoom=1&source=gbs_api');
  assert.equal(parseGoogleCover({}), '');
  assert.equal(parseGoogleCover({ items: [{ volumeInfo: {} }] }), '');
});
