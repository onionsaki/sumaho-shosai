// 分類: the National Diet Library's classification number (NDC) shown as a name (鬼さん 2026-10-31).
// Two digits (100区分) by default; the fields 鬼さん reads most go down to three digits.
// Kept apart from tags: tags are 鬼さん's own (積読・発信ネタ…), the 分類 comes with the book data.

const DIVISIONS = {
  '00': '総記', '01': '図書館', '02': '図書・書誌学', '03': '百科事典', '04': '論文集・雑著',
  '05': '逐次刊行物・年鑑', '06': '団体・博物館', '07': 'ジャーナリズム・新聞', '08': '叢書・全集', '09': '貴重書・郷土資料',
  '10': '哲学', '11': '哲学各論', '12': '東洋思想', '13': '西洋哲学', '14': '心理学',
  '15': '倫理学・道徳', '16': '宗教', '17': '神道', '18': '仏教', '19': 'キリスト教',
  '20': '歴史・世界史', '21': '日本史', '22': 'アジア史', '23': 'ヨーロッパ史', '24': 'アフリカ史',
  '25': '北アメリカ史', '26': '南アメリカ史', '27': 'オセアニア史', '28': '伝記', '29': '地理・紀行',
  '30': '社会科学', '31': '政治', '32': '法律', '33': '経済', '34': '財政',
  '35': '統計', '36': '社会', '37': '教育', '38': '風俗習慣・民俗学', '39': '国防・軍事',
  '40': '自然科学', '41': '数学', '42': '物理学', '43': '化学', '44': '天文学・宇宙',
  '45': '地球科学', '46': '生物科学', '47': '植物学', '48': '動物学', '49': '医学・薬学',
  '50': '技術・工学', '51': '土木工学', '52': '建築学', '53': '機械工学', '54': '電気・電子工学',
  '55': '船舶工学', '56': '金属・鉱山工学', '57': '化学工業', '58': '製造工業', '59': '生活・家政',
  '60': '産業', '61': '農業', '62': '園芸', '63': '蚕糸業', '64': '畜産業',
  '65': '林業', '66': '水産業', '67': '商業', '68': '運輸・交通', '69': '通信事業',
  '70': '芸術・美術', '71': '彫刻', '72': '絵画', '73': '版画', '74': '写真',
  '75': '工芸', '76': '音楽', '77': '演劇・映画', '78': 'スポーツ', '79': '諸芸・娯楽',
  '80': '言語', '81': '日本語', '82': '中国語', '83': '英語', '84': 'ドイツ語',
  '85': 'フランス語', '86': 'スペイン語', '87': 'イタリア語', '88': 'ロシア語', '89': 'その他の言語',
  '90': '文学', '91': '日本文学', '92': '中国文学', '93': '英米文学', '94': 'ドイツ文学',
  '95': 'フランス文学', '96': 'スペイン文学', '97': 'イタリア文学', '98': 'ロシア文学', '99': 'その他の文学',
};

// Longer codes first, so 336.9 wins over 336.
export const DETAILED = [
  ['336.9', '会計'], ['007', '情報科学'], ['019', '読書法'], ['159', '人生訓・自己啓発'], ['336', '経営'],
  ['338', '金融・投資'], ['345', '税'], ['726', '漫画'], ['913', '日本の小説'],
];

const clean = ndc => String(ndc ?? '').normalize('NFKC').trim();

// '338.15' → { code: '338', name: '金融・投資' }; '' or anything unreadable → null.
export function classify(ndc) {
  const s = clean(ndc);
  if (!/^\d{2}/.test(s)) return null;
  const hit = DETAILED.find(([code]) => s.startsWith(code)); // NDC always puts a dot after three digits
  if (hit) return { code: hit[0], name: hit[1] };
  const two = s.slice(0, 2);
  return DIVISIONS[two] ? { code: two, name: DIVISIONS[two] } : null;
}

export const classLabel = ndc => {
  const c = classify(ndc);
  return c ? `${c.code} ${c.name}` : '';
};

// The classes present among the books, by code, with how many books each has (for the shelf filter).
export function classCounts(books) {
  const counts = new Map();
  for (const b of books) {
    const c = classify(b.ndc);
    if (!c) continue;
    const prev = counts.get(c.code);
    counts.set(c.code, { ...c, count: (prev?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => a.code.localeCompare(b.code));
}

// Books that can still be given a 分類 by asking the library again (magazines have none).
export const needsClass = (book, isMagazine = () => false) =>
  Boolean(book.isbn) && !clean(book.ndc) && !book.ndcChecked && !isMagazine(book.isbn);
