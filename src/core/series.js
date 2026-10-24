// Works (series) and owned-volume summaries (spec §4-2, §4-3).

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
    return {
      workKey,
      workTitle: sorted[0].workTitle || sorted[0].title,
      books: sorted,
      ownedVolumes,
      summary: summarizeVolumes(ownedVolumes),
    };
  });
}
