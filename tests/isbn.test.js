import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidIsbn13, toIsbn13, classifyBarcode } from '../src/core/isbn.js';

test('valid isbn13', () => {
  assert.equal(isValidIsbn13('9784763135476'), true);
  assert.equal(isValidIsbn13('9784763135477'), false);
});

test('toIsbn13 converts isbn10 and cleans input', () => {
  assert.equal(toIsbn13('4-7631-3547-3'), '9784763135476');
  assert.equal(toIsbn13('978-4-7631-3547-6'), '9784763135476');
  assert.equal(toIsbn13('９７８４７６３１３５４７６'), '9784763135476');
  assert.equal(toIsbn13('4-08-872509-X'), null); // wrong check digit for this ISBN-10
  assert.equal(toIsbn13('123'), null);
});

test('toIsbn13 accepts an X check digit', () => {
  assert.equal(toIsbn13('0-8044-2957-X'), '9780804429573');
  assert.equal(toIsbn13('0-8044-2957-x'), '9780804429573');
});

test('classifyBarcode', () => {
  assert.deepEqual(classifyBarcode('9784763135476'), { kind: 'isbn', isbn: '9784763135476' });
  assert.deepEqual(classifyBarcode('1920030014008'), { kind: 'price' });
  assert.deepEqual(classifyBarcode('4910123450123'), { kind: 'magazine', code: '4910123450123' });
  assert.deepEqual(classifyBarcode('9784763135477'), { kind: 'other' }); // bad check digit
  assert.deepEqual(classifyBarcode('4901234567894'), { kind: 'other' });
});

test('parseMagazineCode reads the magazine number, month and year from a 491 code', async () => {
  const { parseMagazineCode } = await import('../src/core/isbn.js');
  assert.deepEqual(parseMagazineCode('4910240340155', 2026), { magazineCode: '24034', month: 1, year: 2025 });
  assert.deepEqual(parseMagazineCode('4910203141163', 2026), { magazineCode: '20314', month: 11, year: 2026 });
  assert.deepEqual(parseMagazineCode('4910203141170', 2026).year, 2017); // year digit 7 cannot be 2027 yet
  assert.equal(parseMagazineCode('9784763135476', 2026), null);
});

test('magazineTitle names an issue from the base title or the magazine number', async () => {
  const { magazineTitle } = await import('../src/core/isbn.js');
  assert.equal(magazineTitle({ magazineCode: '24034', month: 1, year: 2025 }), '雑誌24034 2025年1月号');
  assert.equal(magazineTitle({ magazineCode: '24034', month: 3, year: 2025 }, '月刊テスト'), '月刊テスト 2025年3月号');
});

test('magazineBase strips the issue part of a magazine title', async () => {
  const { magazineBase, magazineKey } = await import('../src/core/isbn.js');
  assert.equal(magazineBase('月刊テスト 2025年1月号'), '月刊テスト');
  assert.equal(magazineBase('週刊少年ジャンプ 2026年 11/16号'), '週刊少年ジャンプ');
  assert.equal(magazineBase('雑誌24034 2025年1月号'), '');
  assert.equal(magazineKey('4910240340155'), 'magazine:24034');
});
