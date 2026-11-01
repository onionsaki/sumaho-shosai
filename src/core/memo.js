// 「問いで書く」: headings put into a book's memo so what was learned is written down right after reading
// (鬼さん 2026-10-31). The memo stays one plain text, so the CSV carries the headings to Claude Code.

export const MEMO_SECTIONS = ['学び', '心に残る文', '自分の体験', '疑問・反論', '取り組みたいこと', '期待との差', '意味があったか'];

// Each heading also asks a question, so it is easier to start writing (鬼さん 2026-11-01). The name stays first,
// so memos written with the bare 「■学び」 still count as having that heading, and the weekly review finds them.
export const MEMO_QUESTIONS = {
  '学び': 'ひとつだけ持ち帰るなら？',
  '心に残る文': '思わず線を引きたくなった一文は？',
  '自分の体験': '「あのときの自分だ」と思った場面は？',
  '疑問・反論': '「本当に？」と引っかかったところは？',
  '取り組みたいこと': '明日ひとつ試すなら？',
  '期待との差': '買う前の想像は、当たった？外れた？',
  '意味があったか': '読む前と、何が変わった？',
};

const heading = name => `■${name}：${MEMO_QUESTIONS[name]}`;
const hasHeading = (line, name) => {
  const t = line.trim();
  return t === `■${name}` || t.startsWith(`■${name}：`) || t.startsWith(`■${name}:`);
};

// Adds the headings the memo does not have yet, after what is already written.
// expect: what the 欲しい本 entry hoped for, shown under 期待との差 so the answer can be checked against it.
export function withSections(memo = '', expect = '') {
  const text = String(memo ?? '').replace(/\s+$/, '');
  const lines = text.split('\n');
  const missing = MEMO_SECTIONS.filter(name => !lines.some(line => hasHeading(line, name)));
  if (!missing.length) return text;
  const blocks = missing.map(name => (name === '期待との差' && expect
    ? `${heading(name)}\n（買う前の期待：${expect}）\n`
    : `${heading(name)}\n`));
  return [text, ...blocks].filter(Boolean).join('\n');
}

// Shown in an empty memo, a different one each time the book is opened (鬼さん 2026-11-01).
export const MEMO_PROMPTS = [
  'この本から持ち帰る視点を、ひとつだけ。一行で十分です',
  '読み終えた今の気持ちを、ひとことだけ',
  '思わず線を引きたくなった一文を、書き写してみませんか',
  '「これは使える」と思ったことを、ひとつだけ',
  '1か月後の自分へ、この本の要点を一行で',
  '買った理由を、覚えているうちに一行で',
  '読む前の自分に、ひとこと教えるなら？',
  'この本を一言で言うと？　自分の言葉でどうぞ',
  'ページの端を折ったところを、ひとつだけ',
  '「なるほど」と声が出たところは？',
  '明日の仕事で、ひとつ試せそうなことは？',
  '著者に、ひとつだけ質問するなら？',
  '「ここは違う気がする」と思ったところは？',
  '家族に話すなら、どこを話しますか？',
  '期待どおりだった？　ひとことで',
  'この本を棚に戻す前に、残しておきたいことは？',
];

export const randomPrompt = (random = Math.random) => MEMO_PROMPTS[Math.floor(random() * MEMO_PROMPTS.length)];

// 「[[ ]]で囲む」: words wrapped in [[ ]] become links when the memo is written out to Obsidian,
// so books that share a word are joined in the graph view (鬼さん 2026-11-01).
// Selected text is wrapped (spaces around it stay outside); with nothing selected an empty [[]] goes in.
export function wrapLink(text = '', start = 0, end = start) {
  const value = String(text ?? '');
  const picked = value.slice(start, end);
  const word = picked.trim();
  if (word.startsWith('[[') && word.endsWith(']]')) return { text: value, cursor: end };
  const lead = picked.length - picked.trimStart().length;
  const tail = picked.length - picked.trimEnd().length;
  const from = start + lead;
  const to = word ? end - tail : start;
  const link = `[[${word}]]`;
  return { text: value.slice(0, from) + link + value.slice(to), cursor: word ? from + link.length : from + 2 };
}
