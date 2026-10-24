// "古いかも" rule for exam books (spec §3 古い参考書の判定).

export function isStale(book, examTagId, years, today) {
  if (book.ownership !== 'owned' || !book.tagIds.includes(examTagId)) return false;
  const m = String(book.issued ?? '').match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return false;
  const month = m[2] ?? '01';
  const due = `${Number(m[1]) + years}-${month}-01`;
  return due <= today;
}
