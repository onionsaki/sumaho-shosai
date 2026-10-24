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
