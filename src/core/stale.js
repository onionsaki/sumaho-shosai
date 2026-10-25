// "古いかも" rule (spec §3 古い参考書の判定). Since 2026-10-25 each tag has its own number of years
// (鬼さん: 法律・参照資料 3年, 試験用 2年, 参考書 3年); a book is old when any of its tags says so.

const dueDate = (issued, years) => {
  const m = String(issued ?? '').match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return null;
  return `${Number(m[1]) + years}-${m[2] ?? '01'}-01`;
};

export function isStale(book, rules, today) {
  if (book.ownership !== 'owned') return false;
  return (rules ?? []).some(r => {
    if (!r.tagId || !book.tagIds.includes(r.tagId)) return false;
    const due = dueDate(book.issued, r.years);
    return due !== null && due <= today;
  });
}

export const LAW_TAG = '法律・参照資料';

// The first rules, built once from the old single-tag setting. tagIdOf(name) finds or makes a tag.
export async function defaultStaleRules({ examTagId, staleYears }, tagIdOf) {
  const rules = [];
  if (examTagId) rules.push({ tagId: examTagId, years: staleYears ?? 2 });
  rules.push({ tagId: await tagIdOf('参考書'), years: 3 });
  rules.push({ tagId: await tagIdOf(LAW_TAG), years: 3 });
  return rules.filter((r, i) => r.tagId && rules.findIndex(x => x.tagId === r.tagId) === i);
}
