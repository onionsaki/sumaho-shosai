// A saved order of ids applied to the current list (設定の並び順, 鬼さん 2026-10-25).
// Ids no longer present are dropped; ids not yet saved keep their default place at the end.

export function applyOrder(defaultIds, saved) {
  const known = new Set(defaultIds);
  const head = (Array.isArray(saved) ? saved : []).filter((id, i, a) => known.has(id) && a.indexOf(id) === i);
  return [...head, ...defaultIds.filter(id => !head.includes(id))];
}

export function moveItem(ids, index, delta) {
  const to = index + delta;
  if (to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
