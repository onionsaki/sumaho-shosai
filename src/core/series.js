// Works (series) and owned-volume summaries (spec §4-2, §4-3).

import { workKeyOf } from './volume.js';

export function summarizeVolumes(volumes) {
  const nums = [...new Set(volumes)].sort((a, b) => a - b);
  if (!nums.length) return { text: '', missing: [] };
  const parts = [];
  let start = nums[0];
  let prev = nums[0];
  for (const n of [...nums.slice(1), Infinity]) {
    if (n === prev + 1) { prev = n; continue; }
    parts.push(start === prev ? String(start) : `${start}〜${prev}`);
    start = prev = n;
  }
  const have = new Set(nums);
  const missing = [];
  for (let n = nums[0]; n <= nums.at(-1); n++) if (!have.has(n)) missing.push(n);
  return { text: parts.join(', '), missing };
}

export function groupWorks(books) {
  const byKey = new Map();
  for (const book of books) {
    if (book.volume === null || book.volume === undefined) continue;
    const key = book.workKey || book.title;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(book);
  }
  return [...byKey.entries()].map(([workKey, list]) => {
    const sorted = [...list].sort((a, b) => a.volume - b.volume);
    const ownedVolumes = [...new Set(sorted.filter(b => b.ownership === 'owned').map(b => b.volume))];
    const notOwnedVolumes = [...new Set(sorted.filter(b => b.ownership === 'not_owned').map(b => b.volume))]
      .filter(v => !ownedVolumes.includes(v));
    return {
      workKey,
      workTitle: sorted[0].workTitle || sorted[0].title,
      books: sorted,
      ownedVolumes,
      notOwnedVolumes,
      summary: summarizeVolumes(ownedVolumes),
    };
  });
}

const commonPrefix = (a, b) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i;
};

// From an NDL answer for one work, one record per main volume (「この作品の既刊を探す」).
// Spin-offs and guides fail the work key; box sets that NDL files under several volume numbers are dropped;
// when a volume has several editions, the one whose ISBN is closest to the books already held wins, then the cheaper.
export function pickSeriesVolumes(items, { workKey, refIsbns = [], haveVolumes = new Set(), haveIsbns = new Set() }) {
  // 「進撃の巨人 = Attack on titan」: what follows " = " is the same title in another language.
  const baseTitle = i => (i.workTitle || i.title).replace(/\s+=\s+.*$/, '');
  const candidates = items.filter(i => i.isbn && Number.isInteger(i.volume) && i.volume > 0
    && workKeyOf(baseTitle(i), i.authors) === workKey);
  const volumesOf = new Map();
  for (const i of candidates) volumesOf.set(i.isbn, (volumesOf.get(i.isbn) ?? new Set()).add(i.volume));

  const closeness = isbn => Math.max(0, ...refIsbns.map(r => commonPrefix(isbn, r)));
  const better = (a, b) => (closeness(a.isbn) - closeness(b.isbn))
    || ((b.price ?? Infinity) - (a.price ?? Infinity))
    || String(b.issued).localeCompare(String(a.issued));
  const best = new Map();
  for (const i of candidates) {
    if (volumesOf.get(i.isbn).size > 1 || haveIsbns.has(i.isbn) || haveVolumes.has(i.volume)) continue;
    const cur = best.get(i.volume);
    if (!cur || better(i, cur) > 0 || (cur.isbn === i.isbn && i.titleKana && !cur.titleKana)) best.set(i.volume, i);
  }
  return [...best.values()].sort((a, b) => a.volume - b.volume);
}
