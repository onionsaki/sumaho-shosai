import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForSearch, stripAuthorRole, cleanNdlName } from '../src/core/normalize.js';

test('full-width, case and kana fold together', () => {
  assert.equal(normalizeForSearch('Ｏｎｅ　Ｐｉｅｃｅ'), 'onepiece');
  assert.equal(normalizeForSearch('ワン ピース'), normalizeForSearch('わんぴーす'));
  assert.equal(normalizeForSearch('ワン・ピース／上'), 'わんぴーす上');
});

test('empty and missing input', () => {
  assert.equal(normalizeForSearch(''), '');
  assert.equal(normalizeForSearch(undefined), '');
});

test('stripAuthorRole', () => {
  assert.equal(stripAuthorRole('渡邊康弘 著'), '渡邊康弘');
  assert.equal(stripAuthorRole('尾田栄一郎／作'), '尾田栄一郎');
  assert.equal(stripAuthorRole('山田 太郎 監修'), '山田 太郎');
  assert.equal(stripAuthorRole('著者名'), '著者名');
});

test('cleanNdlName', () => {
  assert.equal(cleanNdlName('渡邊, 康弘'), '渡邊康弘');
  assert.equal(cleanNdlName('尾田/栄一郎'), '尾田栄一郎');
  assert.equal(cleanNdlName('ワタナベ, ヤスヒロ'), 'ワタナベヤスヒロ');
});

test('cleanNdlName drops life years and spaces', () => {
  assert.equal(cleanNdlName('尾田, 栄一郎, 1975-'), '尾田栄一郎');
  assert.equal(cleanNdlName('オダ, エイイチロウ, 1975-'), 'オダエイイチロウ');
  assert.equal(cleanNdlName('夏目, 漱石, 1867-1916'), '夏目漱石');
  assert.equal(cleanNdlName('オダ エイイチロウ'), 'オダエイイチロウ');
  assert.equal(cleanNdlName('尾田,栄一郎,1975-'), '尾田栄一郎');
});
