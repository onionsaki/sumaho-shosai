// Merge fetched metadata into a book without touching the user's own fields.

import { workKeyOf } from './volume.js';

const META = [
  'title', 'titleKana', 'authors', 'authorsKana', 'publisher', 'issued',
  'pages', 'price', 'workTitle', 'volume', 'volumeLabel', 'coverUrl', 'ndc',
];

const isEmpty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export function mergeBookInfo(book, ndl, openbd, { overwrite = false } = {}) {
  const merged = { ...book };
  for (const field of META) {
    const value = !isEmpty(ndl?.[field]) ? ndl[field] : openbd?.[field];
    if (isEmpty(value)) continue;
    if (overwrite || isEmpty(merged[field])) merged[field] = Array.isArray(value) ? [...value] : value;
  }
  merged.workKey = workKeyOf(merged.workTitle || merged.title, merged.authors);
  merged.lookup = (ndl?.title || openbd?.title) ? 'ok' : 'not_found';
  if (ndl?.title) merged.ndcChecked = true; // the library was asked, so a missing 分類 is not worth asking again
  merged.updatedAt = new Date().toISOString();
  return merged;
}
