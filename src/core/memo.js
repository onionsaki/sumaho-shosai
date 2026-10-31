// 「問いで書く」: headings put into a book's memo so what was learned is written down right after reading
// (鬼さん 2026-10-31). The memo stays one plain text, so the CSV carries the headings to Claude Code.

export const MEMO_SECTIONS = ['学び', '心に残る文', '自分の体験', '疑問・反論', '取り組みたいこと', '期待との差', '意味があったか'];

const heading = name => `■${name}`;

// Adds the headings the memo does not have yet, after what is already written.
// expect: what the 欲しい本 entry hoped for, shown under 期待との差 so the answer can be checked against it.
export function withSections(memo = '', expect = '') {
  const text = String(memo ?? '').replace(/\s+$/, '');
  const missing = MEMO_SECTIONS.filter(name => !text.split('\n').some(line => line.trim() === heading(name)));
  if (!missing.length) return text;
  const blocks = missing.map(name => (name === '期待との差' && expect
    ? `${heading(name)}\n（買う前の期待：${expect}）\n`
    : `${heading(name)}\n`));
  return [text, ...blocks].filter(Boolean).join('\n');
}
