// CSV export/import in the app's own format (spec §6 CSVの形, CSVの取り込み).

import { LABELS, newBook, todayStr } from './model.js';
import { toIsbn13 } from './isbn.js';
import { workKeyOf } from './volume.js';

export const CSV_HEADER = [
  'ISBN', '書名', '書名の読み', '著者', '出版社', '発行年月', 'ページ数', '定価', '作品名', '巻', '種類',
  '持っているか', '読んだか', 'タグ', 'メモ', '登録日', '読んだ日', '手放した日', '更新日',
];

const JOIN = '、';
const escape = v => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const localDate = iso => (iso ? todayStr(new Date(iso)) : '');

export function booksToCsv(books, tags) {
  const tagName = new Map(tags.map(t => [t.id, t.name]));
  const rows = books.map(b => [
    b.isbn ?? '', b.title, b.titleKana, (b.authors ?? []).join(JOIN), b.publisher, b.issued,
    b.pages, b.price, b.workTitle, b.volume, LABELS.format[b.format], LABELS.ownership[b.ownership],
    LABELS.read[b.readStatus], b.tagIds.map(id => tagName.get(id)).filter(Boolean).join(JOIN), b.memo,
    localDate(b.createdAt), b.readAt, b.releasedAt, localDate(b.updatedAt),
  ]);
  return '﻿' + [CSV_HEADER, ...rows].map(r => r.map(escape).join(',')).join('\r\n') + '\r\n';
}

export function parseCsv(text) {
  const s = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const invert = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));
const FROM = { format: invert(LABELS.format), ownership: invert(LABELS.ownership), read: invert(LABELS.read) };
const num = s => (s === '' || s === undefined || Number.isNaN(Number(s)) ? null : Number(s));
const split = s => String(s ?? '').split(JOIN).map(x => x.trim()).filter(Boolean);
const dateToIso = d => {
  const m = String(d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).toISOString() : null;
};

export function rowsToBooks(rows) {
  if (!rows.length || rows[0].join(',') !== CSV_HEADER.join(',')) {
    throw new Error('CSVの見出しがスマホ書斎の形と違います');
  }
  return rows.slice(1).filter(r => r.some(c => c !== '')).map(r => {
    const cell = i => (r[i] ?? '').trim();
    const isbn = toIsbn13(cell(0)) ?? '';
    const title = cell(1);
    const authors = split(cell(3));
    const workTitle = cell(8);
    const now = new Date().toISOString();
    const book = newBook({
      isbn,
      title,
      titleKana: cell(2),
      authors,
      publisher: cell(4),
      issued: cell(5),
      pages: num(cell(6)),
      price: num(cell(7)),
      workTitle,
      workKey: workKeyOf(workTitle || title, authors),
      volume: num(cell(9)),
      format: FROM.format[cell(10)] ?? 'paper',
      ownership: FROM.ownership[cell(11)] ?? 'owned',
      readStatus: FROM.read[cell(12)] ?? 'unread',
      memo: (r[14] ?? '').replace(/\r\n?/g, '\n'),
      createdAt: dateToIso(cell(15)) ?? now,
      readAt: cell(16),
      releasedAt: cell(17),
      updatedAt: dateToIso(cell(18)) ?? now,
      lookup: isbn ? (title ? 'ok' : 'pending') : 'manual',
    });
    return { book, tagNames: split(cell(13)) };
  });
}

export const csvFileName = today => `蔵書_${today.replace(/-/g, '')}.csv`;
