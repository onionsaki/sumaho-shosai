// Text normalization for search and grouping (spec §4-3).

const toHiragana = s => s.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));

export function normalizeForSearch(s) {
  const t = String(s ?? '').normalize('NFKC').toLowerCase();
  return toHiragana(t).replace(/[\s・,，、/／]/g, '');
}

const ROLE = /[\s／/]+(?:著|作|画|訳|編|監修|原作|漫画|作画|文|絵)$/;

export function stripAuthorRole(name) {
  return String(name ?? '').trim().replace(ROLE, '').trim();
}

export function cleanNdlName(raw) {
  return String(raw ?? '').replace(/,\s*|\//g, '').trim();
}
