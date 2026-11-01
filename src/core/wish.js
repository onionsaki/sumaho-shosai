// 欲しい本: a list kept apart from the shelf (鬼さん 2026-10-25). Each one can say what is expected of it,
// and where it was seen and for how much. Once the book is registered as 持っている it moves to 買ったもの,
// expectation included, so it can be looked back on.

import { newId, todayStr } from './model.js';

export function newWish(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    isbn: '',
    title: '',
    author: '', // 国立国会図書館で探したときの正しい著者名（2026-10-26）
    expect: '', // 何を期待して買うか
    where: '', // 見つけた場所や値段
    coverUrl: '', // 表紙（2026-11-01）: looked up once by ISBN, openBD → 楽天 → Google Books
    coverCheckedAt: '', // set once the cover has been looked for, found or not, so it is not asked again
    createdAt: now,
    updatedAt: now,
    boughtAt: '', // set when the book is registered as 持っている
    ...partial,
  };
}

export const isOpenWish = w => !w.boughtAt;

// A wish whose cover has not been looked for yet (wishes from before 2026-11-01 have neither field), or was
// not found more than 30 days ago (a key may have been added since, or a cover published).
export const COVER_RETRY_DAYS = 30;
export function needsCover(w, today = todayStr()) {
  if (!isOpenWish(w) || !w.isbn || w.coverUrl) return false;
  if (!w.coverCheckedAt) return true;
  return (Date.parse(today) - Date.parse(w.coverCheckedAt)) / 86400000 >= COVER_RETRY_DAYS;
}

export const openWishesFor = (wishes, isbn) => (isbn ? wishes.filter(w => isOpenWish(w) && w.isbn === isbn) : []);

// Newest first; bought ones by the day they were bought.
export function splitWishes(wishes) {
  const open = wishes.filter(isOpenWish).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const bought = wishes.filter(w => !isOpenWish(w)).sort((a, b) => b.boughtAt.localeCompare(a.boughtAt) || b.createdAt.localeCompare(a.createdAt));
  return { open, bought };
}

export const markBought = (wish, bookId, date = todayStr()) => ({ ...wish, boughtAt: date, bookId, updatedAt: new Date().toISOString() });

// 持っていない books that could move to the wish list. Pre-ticked unless the user owns another volume of the
// same work (those are most likely volumes added by 「既刊を探す」, not books picked in a shop).
export function wishCandidates(books) {
  const ownedWorks = new Set(books.filter(b => b.ownership === 'owned' && b.workKey).map(b => b.workKey));
  return books.filter(b => b.ownership === 'not_owned')
    .map(book => ({ book, ticked: !(book.workKey && ownedWorks.has(book.workKey) && book.volume !== null && book.volume !== undefined) }));
}

export const wishFromBook = (book, title) => newWish({ isbn: book.isbn ?? '', title, author: (book.authors ?? []).join('、'), expect: book.memo ?? '', coverUrl: book.coverUrl ?? '', createdAt: book.createdAt });
