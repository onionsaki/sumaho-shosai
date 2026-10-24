// Check-mode answer for one scanned book (spec §4-2).

import { groupWorks } from './series.js';

const statusOf = book => {
  if (!book) return 'unregistered';
  if (book.ownership === 'owned') return book.format === 'ebook' ? 'owned_ebook' : 'owned';
  return book.ownership; // 'released' | 'not_owned'
};

export function checkResult(book, workBooks) {
  let work = null;
  if (book && book.volume !== null && book.volume !== undefined && workBooks.length) {
    const key = book.workKey || book.title;
    work = groupWorks(workBooks).find(w => w.workKey === key) ?? null;
  }
  return { status: statusOf(book), book, work };
}
