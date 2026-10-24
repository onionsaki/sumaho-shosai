// Register-mode rules for one scanned ISBN (spec §4-1 読み取った結果ごとの動き).

import { newBook } from './model.js';

export function applyScan(existing, session, isbn, today) {
  const { ownership, readStatus, tagIds = [] } = session;
  if (!existing) {
    const book = newBook({
      isbn,
      ownership,
      readStatus,
      tagIds: [...tagIds],
      lookup: 'pending',
      readAt: readStatus === 'read' ? today : '',
      releasedAt: ownership === 'released' ? today : '',
    });
    return { action: 'created', book, before: null, changed: true };
  }

  const mergedTags = [...existing.tagIds, ...tagIds.filter(t => !existing.tagIds.includes(t))];
  const ownershipChanged = existing.ownership !== ownership;
  const changed = ownershipChanged || mergedTags.length !== existing.tagIds.length;
  const book = { ...existing, ownership, tagIds: mergedTags };
  if (ownershipChanged && ownership === 'released') book.releasedAt = today;
  return { action: 'duplicate', book, before: existing, changed };
}
