// Small numbers for the settings screen (spec §4-6): how many books, seen from several angles (鬼さん 2026-10-25).

export const countOwned = books => books.filter(b => b.ownership === 'owned').length;

export const ownedPriceSum = books =>
  books.reduce((sum, b) => (b.ownership === 'owned' && typeof b.price === 'number' ? sum + b.price : sum), 0);

const ownedPaper = books => books.filter(b => b.ownership === 'owned' && b.format !== 'ebook');

// 積読率: owned paper books carrying the chosen tag, out of all owned paper books. null when it cannot be worked out.
export function tsundokuRate(books, tagId) {
  const paper = ownedPaper(books);
  if (!tagId || !paper.length) return null;
  const n = paper.filter(b => b.tagIds.includes(tagId)).length;
  return { count: n, total: paper.length, percent: Math.round((n / paper.length) * 100) };
}

// Owned books whose 定価 is unknown, so the money figure reads as "at least".
export const ownedWithoutPrice = books => books.filter(b => b.ownership === 'owned' && typeof b.price !== 'number').length;

// Floor taken if every owned paper book were laid flat, cover up, side by side. Each book counts as
// 四六判 (12.8 × 18.8 cm), between a comic (B6) and a hardcover; one 畳 as 1.62 m² (between 江戸間 and 京間).
export const BOOK_AREA_M2 = 0.128 * 0.188;
export const TATAMI_M2 = 1.62;
export const floorTatami = books => (ownedPaper(books).length * BOOK_AREA_M2) / TATAMI_M2;

// 本棚の空き: chosen by hand, five steps.
export const SHELF_ROOM = [
  ['plenty', '余裕'], ['some', '空きあり'], ['full', '丁度'], ['short', '本棚不足'], ['floor', '床に敷ける'],
];
