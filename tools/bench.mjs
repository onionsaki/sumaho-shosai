// Rough timings of the shelf's pure work with many books (鬼さん 2026-10-25: will thousands of books slow it down?).
// Usage: node tools/bench.mjs [count]
import { newBook } from '../src/core/model.js';
import { filterBooks, sortBooks } from '../src/core/search.js';
import { groupWorks } from '../src/core/series.js';
import { booksToCsv } from '../src/core/csv.js';

const N = Number(process.argv[2] ?? 5000);
const kana = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワ';
const pick = (s, i) => s[i % s.length];
const books = Array.from({ length: N }, (_, i) => newBook({
  isbn: String(9784000000000 + i),
  title: `${pick(['転生したら', '鬼の', '会計の', 'はじめての', '世界の'], i)}本 ${i % 40 === 0 ? '' : Math.floor(i / 40)}`,
  titleKana: `${pick(kana, i)}${pick(kana, i * 7)}${pick(kana, i * 13)}ホン`,
  authors: [`著者${i % 300}`], authorsKana: [`${pick(kana, i * 3)}${pick(kana, i * 5)} タロウ`],
  workTitle: i % 3 === 0 ? `シリーズ${i % 150}` : '', volume: i % 3 === 0 ? (i % 30) + 1 : null,
  issued: `20${String(i % 25).padStart(2, '0')}-0${(i % 9) + 1}`,
  tagIds: i % 4 === 0 ? ['t1'] : [], memo: i % 10 === 0 ? 'メモ 活かせるところ 投資術' : '',
  ownership: pick(['owned', 'owned', 'owned', 'released', 'not_owned'], i),
  workKey: i % 3 === 0 ? `シリーズ${i % 150}|著者${i % 300}` : '',
}));

const time = (label, fn, runs = 5) => {
  fn();
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn();
  console.log(`${label.padEnd(34)} ${((performance.now() - t0) / runs).toFixed(1)} ms`);
};

console.log(`${N} books`);
time('filter (no query)', () => filterBooks(books, {}));
time('filter (one-word search)', () => filterBooks(books, { query: 'かいけい' }));
time('filter (typing, 3 keystrokes)', () => ['か', 'かい', 'かいけ'].forEach(q => filterBooks(books, { query: q })));
for (const order of ['kana', 'recent', 'author', 'issuedNew']) time(`sort ${order}`, () => sortBooks(books, order));
time('group works', () => groupWorks(books));
time('CSV export', () => booksToCsv(books, [{ id: 't1', name: 'マンガ' }]), 2);
