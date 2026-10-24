// ISBN rules and barcode classification (spec §4-1 注).

const ean13CheckOk = digits => {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(digits[12]);
};

export function isValidIsbn13(s) {
  return /^97[89]\d{10}$/.test(s) && ean13CheckOk(s);
}

const isbn10CheckOk = s => {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const v = s[i] === 'X' ? 10 : Number(s[i]);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
};

const ean13Check = first12 => {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
};

export function toIsbn13(input) {
  const s = String(input ?? '').normalize('NFKC').toUpperCase().replace(/[\s-]/g, '');
  if (/^\d{13}$/.test(s)) return isValidIsbn13(s) ? s : null;
  if (/^\d{9}[\dX]$/.test(s) && isbn10CheckOk(s)) {
    const first12 = '978' + s.slice(0, 9);
    return first12 + ean13Check(first12);
  }
  return null;
}

export function classifyBarcode(raw) {
  const s = String(raw ?? '');
  if (isValidIsbn13(s)) return { kind: 'isbn', isbn: s };
  if (/^19\d{11}$/.test(s)) return { kind: 'price' };
  if (/^491\d{10}$/.test(s)) return { kind: 'magazine', code: s };
  return { kind: 'other' };
}

export const isMagazineCode = code => /^491[0-9]{10}$/.test(String(code ?? ''));

// Japanese magazine barcode: 491 + spare digit + magazine number (5) + issue month (2) + last digit of year + check digit.
// Rakuten only knows issues on sale, so older issues are named from these parts (鬼さん 2026-10-25).
export function parseMagazineCode(code, currentYear = new Date().getFullYear()) {
  if (!isMagazineCode(code)) return null;
  const s = String(code);
  const magazineCode = s.slice(4, 9);
  const month = Number(s.slice(9, 11));
  let year = Math.floor(currentYear / 10) * 10 + Number(s[11]);
  // Issues go on sale a little ahead (a January issue in December), never most of a year ahead.
  if (year > currentYear + 1 || (year === currentYear + 1 && month > 3)) year -= 10;
  return { magazineCode, month, year };
}

export const magazineTitle = ({ magazineCode, month, year }, baseTitle = '') =>
  `${baseTitle || `雑誌${magazineCode}`} ${year}年${month}月号`;

// The magazine's own name without the issue part; '' for the placeholder name.
export function magazineBase(title) {
  const base = String(title ?? '').normalize('NFKC')
    .replace(/\s*\d{4}\s*年\s*(\d{1,2}(\s*[/／]\s*\d{1,2})?\s*月?\s*号?)?.*$/, '')
    .replace(/\s*\d{1,2}(\s*[/／]\s*\d{1,2})?\s*月?号\s*$/, '')
    .trim();
  return /^雑誌\d{5}$/.test(base) ? '' : base;
}

// All issues of one magazine share this key, so they group as one work on the shelf.
export const magazineKey = code => `magazine:${String(code).slice(4, 9)}`;
