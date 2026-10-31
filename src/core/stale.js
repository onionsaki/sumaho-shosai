// "古いかも" rule (spec §3 古い参考書の判定). Since 2026-10-25 each tag has its own number of years
// (鬼さん: 法律・参照資料 3年, 試験用 2年, 参考書 3年); a book is old when any of its tags says so.
// Since 2026-10-31 a rule can name a 分類 instead ({ classCode: '32', years: 3 }), so a law book is caught
// even when nobody tagged it. A class rule covers everything under it (32 covers 324.5).

const dueDate = (issued, years) => {
  const m = String(issued ?? '').match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return null;
  return `${Number(m[1]) + years}-${m[2] ?? '01'}-01`;
};

export function isStale(book, rules, today) {
  if (book.ownership !== 'owned') return false;
  return (rules ?? []).some(r => {
    const hit = r.classCode ? String(book.ndc ?? '').startsWith(r.classCode) : r.tagId && book.tagIds.includes(r.tagId);
    if (!hit) return false;
    const due = dueDate(book.issued, r.years);
    return due !== null && due <= today;
  });
}

export const LAW_TAG = '法律・参照資料';

// Added once to the saved rules when 分類 arrived (鬼さん 2026-10-31: 法律 and 税 go stale like law books).
export const DEFAULT_CLASS_RULES = [{ classCode: '32', years: 3 }, { classCode: '345', years: 3 }];

// The first rules, built once from the old single-tag setting. tagIdOf(name) finds or makes a tag.
export async function defaultStaleRules({ examTagId, staleYears }, tagIdOf) {
  const rules = [];
  if (examTagId) rules.push({ tagId: examTagId, years: staleYears ?? 2 });
  rules.push({ tagId: await tagIdOf('参考書'), years: 3 });
  rules.push({ tagId: await tagIdOf(LAW_TAG), years: 3 });
  return rules.filter((r, i) => r.tagId && rules.findIndex(x => x.tagId === r.tagId) === i);
}
