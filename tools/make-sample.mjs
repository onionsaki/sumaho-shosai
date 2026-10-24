// Writes tests/fixtures/sample-books.csv (30 books) for dev/seed.html and screen checks.
// ISBNs use the unassigned 978-4-99999 block, except the real one for the reading book.

import { writeFileSync } from 'node:fs';
import { booksToCsv } from '../src/core/csv.js';
import { newBook, SEED_TAGS } from '../src/core/model.js';
import { workKeyOf } from '../src/core/volume.js';

const ean = p => {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(p[i]) * (i % 2 ? 3 : 1);
  return p + ((10 - (s % 10)) % 10);
};
let seq = 100;
const isbn = () => ean(`978499999${String(seq++).padStart(3, '0')}`);
const tags = SEED_TAGS.map((name, order) => ({ id: name, name, order }));
const books = [];

for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14]) {
  books.push(newBook({
    isbn: isbn(), title: 'ONE PIECE', titleKana: 'ワンピース', authors: ['尾田栄一郎'], authorsKana: ['オダエイイチロウ'],
    publisher: '集英社', issued: '2000-01', pages: 200, price: 460, workTitle: 'ONE PIECE', volume: v,
    readStatus: 'read', tagIds: ['マンガ'], lookup: 'ok',
  }));
}
const VOLUME_13_ISBN = isbn(); // deliberately not in the sample
const add = o => books.push(newBook({ isbn: isbn(), lookup: 'ok', authors: ['著者'], ...o }));
add({ title: '日商簿記2級 商業簿記テキスト', titleKana: 'ニッショウボキニキュウショウギョウボキテキスト', issued: '2021-04', price: 1800, tagIds: ['試験用', '参考書'] });
add({ title: 'FP2級 過去問題集', titleKana: 'エフピーニキュウカコモンダイシュウ', issued: '2023-09', price: 2000, tagIds: ['試験用'] });
add({ title: '宅建士 合格テキスト', titleKana: 'タッケンシゴウカクテキスト', issued: '2026-03', price: 2600, tagIds: ['試験用', '参考書'] });
add({ title: '速読の教科書', titleKana: 'ソクドクノキョウカショ', ownership: 'released', readStatus: 'read', releasedAt: '2026-09-30', price: 1500 });
add({ title: '古い自己啓発本', titleKana: 'フルイジコケイハツボン', ownership: 'released', readStatus: 'read', releasedAt: '2026-08-01', tagIds: ['自己啓発'] });
add({ title: '読みたい投資の本', titleKana: 'ヨミタイトウシノホン', ownership: 'not_owned', tagIds: ['投資術'] });
add({ title: '読みたい時短の本', titleKana: 'ヨミタイジタンノホン', ownership: 'not_owned', tagIds: ['時短術'] });
add({ title: '電子で持っている本', titleKana: 'デンシデモッテイルホン', format: 'ebook', readStatus: 'reading' });
books.push(newBook({ isbn: isbn(), lookup: 'pending' })); // title unknown: shows up in あとで確認
books.push(newBook({
  isbn: '9784763135476', title: '1冊20分、読まずに「わかる!」すごい読書術',
  titleKana: 'イッサツニジップンヨマズニワカルスゴイドクショジュツ', authors: ['渡邊康弘'], authorsKana: ['ワタナベヤスヒロ'],
  publisher: 'サンマーク出版', issued: '2016-06', pages: 254, price: 1400, readStatus: 'reading',
  memo: 'レゾナンスリーディング\nネットで一時期話題になったが、眉唾のため購入してみた', lookup: 'ok',
}));
add({ title: '投資の基本', titleKana: 'トウシノキホン', price: 1600, tagIds: ['投資術'], readStatus: 'read' });
add({ title: '時短仕事術', titleKana: 'ジタンシゴトジュツ', price: 1500, tagIds: ['時短術', 'あとで読む'] });
add({ title: 'TRPGルールブック', titleKana: 'ティーアールピージールールブック', price: 4500, tagIds: ['TRPG'] });
add({ title: 'キャラクター図鑑', titleKana: 'キャラクターズカン', price: 2200, tagIds: ['キャラクターもの', '手放す候補'] });
add({ title: '噛み砕き会計入門', titleKana: 'カミクダキカイケイニュウモン', price: 1700, tagIds: ['噛み砕き理解用'] });
add({ title: 'マネジメントの本', titleKana: 'マネジメントノホン', price: 2000, readStatus: 'read' });
add({ title: '家族と読んだ絵本', titleKana: 'カゾクトヨンダエホン', price: 1200, readStatus: 'read' });

for (const b of books) b.workKey = workKeyOf(b.workTitle || b.title, b.authors);

writeFileSync(new URL('../tests/fixtures/sample-books.csv', import.meta.url), booksToCsv(books, tags));
console.log(`${books.length} books written; volume 13 ISBN (not in sample): ${VOLUME_13_ISBN}`);
