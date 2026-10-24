// Shared data shape and labels. See docs/plans for the Book definition.

export const OWNERSHIP = ['owned', 'released', 'not_owned'];
export const READ = ['unread', 'reading', 'read'];
export const FORMATS = ['paper', 'ebook'];

export const LABELS = {
  ownership: { owned: '持っている', released: '手放した', not_owned: '持っていない' },
  read: { unread: 'まだ', reading: '読書中', read: '読んだ' },
  format: { paper: '紙', ebook: '電子' },
};

export const SEED_TAGS = [
  'マンガ', '自己啓発', '時短術', '参考書', '投資術', 'キャラクターもの',
  'TRPG', '試験用', '噛み砕き理解用', 'あとで読む', '手放す候補',
];

const pad = n => String(n).padStart(2, '0');

export function todayStr(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function newId() {
  return globalThis.crypto.randomUUID();
}

export function newBook(partial = {}) {
  const now = new Date().toISOString();
  const book = {
    id: newId(),
    isbn: '',
    title: '', titleKana: '',
    authors: [], authorsKana: [],
    publisher: '', issued: '',
    pages: null, price: null,
    workTitle: '', workKey: '',
    volume: null, volumeLabel: '',
    coverUrl: '',
    hasPhoto: false, // a picture taken on the phone lives in the photos store (db.getPhoto)
    format: 'paper',
    ownership: 'owned',
    readStatus: 'unread',
    tagIds: [], memo: '',
    createdAt: now, updatedAt: now,
    readAt: '', releasedAt: '',
    lookup: 'manual',
    ...partial,
  };
  if (!book.isbn) delete book.isbn;
  return book;
}

export const coverSrc = (book, photoUrl = '') => photoUrl || book.coverUrl || '';
