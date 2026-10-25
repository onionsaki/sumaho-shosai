import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { parseNdlOpenSearch, ndlSeriesSearchUrl } from '../src/core/ndl.js';
import { pickSeriesVolumes, groupWorks } from '../src/core/series.js';
import { workKeyOf } from '../src/core/volume.js';
import { newBook } from '../src/core/model.js';

// NDL answer for 進撃の巨人 / 諫山創 / 講談社 (2026-10-25): 152 records, mostly spin-offs, guides and limited editions.
const items = parseNdlOpenSearch(readFileSync(new URL('./fixtures/ndl-series-shingeki.xml', import.meta.url), 'utf8'), DOMParser);
const workKey = workKeyOf('進撃の巨人', ['諫山創']);

test('series search URL asks for title, author and publisher with a large page', () => {
  const url = ndlSeriesSearchUrl({ title: '進撃の巨人', author: '諫山創 著', publisher: '講談社' });
  assert.match(url, /title=%E9%80%B2%E6%92%83/);
  assert.match(url, /creator=%E8%AB%AB%E5%B1%B1%E5%89%B5(&|$)/); // role word removed
  assert.match(url, /publisher=/);
  assert.match(url, /cnt=500/);
});

test('keeps only the main volumes, one per volume number, in order', () => {
  const vols = pickSeriesVolumes(items, { workKey, refIsbns: ['9784063842760'] });
  assert.deepEqual(vols.map(v => v.volume), Array.from({ length: 34 }, (_, i) => i + 1));
  assert.ok(vols.every(v => v.isbn && v.title.startsWith('進撃の巨人')));
  assert.ok(!vols.some(v => /Before the fall|限定版|悔いなき|バイリンガル|Full color/i.test(v.title)));
});

test('prefers the regular edition over a pricier limited edition of the same volume', () => {
  const vols = pickSeriesVolumes(items, { workKey, refIsbns: ['9784063842760'] });
  assert.equal(vols.find(v => v.volume === 12).isbn, '9784063949766');
  assert.equal(vols.find(v => v.volume === 8).isbn, '9784063847123');
});

test('leaves out volumes already registered and known ISBNs', () => {
  const vols = pickSeriesVolumes(items, {
    workKey, refIsbns: ['9784063842760'], haveVolumes: new Set([1, 2, 3]), haveIsbns: new Set(['9784063844696']),
  });
  assert.equal(vols[0].volume, 5);
  assert.equal(vols.length, 30);
});

test('drops an ISBN that NDL lists under several volume numbers (box sets)', () => {
  const base = { title: 'ONE PIECE', authors: ['尾田栄一郎'], workTitle: 'ONE PIECE', price: 390, issued: '1997-12' };
  const sample = [
    { ...base, isbn: '9784088725093', volume: 1 },
    { ...base, isbn: '9784088824482', volume: 1, price: null },
    { ...base, isbn: '9784088824482', volume: 2, price: null },
    { ...base, isbn: '9784088725444', volume: 2 },
    { ...base, title: 'One piece', workTitle: 'One piece', isbn: '9784081150434', volume: 1, price: 454 },
  ];
  const vols = pickSeriesVolumes(sample, { workKey: workKeyOf('ONE PIECE', ['尾田栄一郎']), refIsbns: ['9784088725093'] });
  assert.deepEqual(vols.map(v => [v.volume, v.isbn]), [[1, '9784088725093'], [2, '9784088725444']]);
});

test('works list not-owned volumes beside the owned ones', () => {
  const key = workKey;
  const books = [1, 2, 3].map(v => newBook({ title: '進撃の巨人', workKey: key, volume: v }))
    .concat([5, 6, 7].map(v => newBook({ title: '進撃の巨人', workKey: key, volume: v, ownership: 'not_owned' })));
  const [w] = groupWorks(books);
  assert.equal(w.summary.text, '1〜3');
  assert.deepEqual(w.notOwnedVolumes, [5, 6, 7]);
});
