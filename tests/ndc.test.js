import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { classify, classLabel, classCounts, needsClass } from '../src/core/ndc.js';
import { parseNdlOpenSearch, pickBestNdlItem } from '../src/core/ndl.js';
import { mergeBookInfo } from '../src/core/merge.js';
import { filterBooks } from '../src/core/search.js';
import { newBook } from '../src/core/model.js';

test('two digits by default, three for the fields 鬼さん reads most', () => {
  assert.deepEqual(classify('726.1'), { code: '726', name: '漫画' });
  assert.deepEqual(classify('338.15'), { code: '338', name: '金融・投資' });
  assert.deepEqual(classify('336.91'), { code: '336.9', name: '会計' });
  assert.deepEqual(classify('336.3'), { code: '336', name: '経営' });
  assert.deepEqual(classify('019.13'), { code: '019', name: '読書法' });
  assert.deepEqual(classify('324.52'), { code: '32', name: '法律' });
  assert.deepEqual(classify('913.6'), { code: '913', name: '日本の小説' });
  assert.deepEqual(classify('911.56'), { code: '91', name: '日本文学' });
  assert.equal(classify(''), null);
  assert.equal(classify('UG15'), null);
  assert.equal(classLabel('345.1'), '345 税');
});

test('the library record gives the NDC10 number (manga and a reading book)', () => {
  const read = name => parseNdlOpenSearch(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'), DOMParser);
  assert.equal(pickBestNdlItem(read('ndl-9784088725093.xml')).ndc, '726.1'); // the first record has none; another one does
  assert.equal(read('ndl-9784763135476.xml')[0].ndc, '019.13');
  const merged = mergeBookInfo(newBook({ isbn: '9784088725093' }), pickBestNdlItem(read('ndl-9784088725093.xml')), null);
  assert.equal(merged.ndc, '726.1');
  assert.equal(merged.ndcChecked, true);
});

test('shelf filter by 分類, counts, and which books still need asking', () => {
  const manga = newBook({ isbn: '9784088725093', ndc: '726.1' });
  const money = newBook({ isbn: '9784000000001', ndc: '338.1' });
  const none = newBook({ isbn: '9784000000002' });
  assert.deepEqual(filterBooks([manga, money, none], { classCodes: ['726'] }).map(b => b.id), [manga.id]);
  assert.deepEqual(classCounts([manga, money, none]).map(c => [c.code, c.count]), [['338', 1], ['726', 1]]);
  assert.equal(needsClass(none), true);
  assert.equal(needsClass({ ...none, ndcChecked: true }), false);
  assert.equal(needsClass(manga), false);
  assert.equal(needsClass(newBook({ isbn: '4910000000000' }), code => code.startsWith('491')), false);
});

test('古いかも by 分類: 32 covers 324.5 without any tag; other classes are not caught', async () => {
  const { isStale } = await import('../src/core/stale.js');
  const rules = [{ classCode: '32', years: 3 }, { classCode: '345', years: 3 }];
  const law = newBook({ ndc: '324.52', issued: '2020-04' });
  const tax = newBook({ ndc: '345.1', issued: '2023-01' });
  const manga = newBook({ ndc: '726.1', issued: '2000-01' });
  assert.equal(isStale(law, rules, '2026-10-31'), true);
  assert.equal(isStale(tax, rules, '2026-10-31'), true);
  assert.equal(isStale({ ...tax, issued: '2024-01' }, rules, '2026-10-31'), false);
  assert.equal(isStale(manga, rules, '2026-10-31'), false);
  assert.equal(isStale(newBook({ issued: '2000-01' }), rules, '2026-10-31'), false);
});
