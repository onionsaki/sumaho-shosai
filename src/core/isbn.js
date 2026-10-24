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
  if (/^491\d{10}$/.test(s)) return { kind: 'magazine' };
  return { kind: 'other' };
}
