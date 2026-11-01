import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSections, wrapLink, randomPrompt, MEMO_SECTIONS, MEMO_PROMPTS } from '../src/core/memo.js';

test('an empty memo gets all seven headings in order', () => {
  const out = withSections('');
  assert.deepEqual(out.split('\n').filter(l => l.startsWith('■')).map(l => l.split('：')[0]), MEMO_SECTIONS.map(n => `■${n}`));
  assert.ok(out.startsWith('■学び：ひとつだけ持ち帰るなら？'));
  assert.equal(MEMO_SECTIONS.length, 7);
});

test('what is already written stays first, and only missing headings are added', () => {
  const out = withSections('なぜ買ったか：図解が多そう\n■学び\n型が大事\n');
  assert.ok(out.startsWith('なぜ買ったか：図解が多そう\n■学び\n型が大事'));
  assert.equal(out.split('\n').filter(l => l.startsWith('■学び')).length, 1);
  assert.ok(out.includes('■意味があったか'));
  assert.equal(withSections(out), out.trimEnd());
});

test('the 欲しい本 expectation is shown under 期待との差', () => {
  assert.ok(withSections('', '仕事の説明に使えそう').includes('■期待との差：買う前の想像は、当たった？外れた？\n（買う前の期待：仕事の説明に使えそう）'));
});

test('[[ ]] wraps the selected word and puts the cursor after it', () => {
  const out = wrapLink('積読は負債になる', 3, 5);
  assert.deepEqual(out, { text: '積読は[[負債]]になる', cursor: 9 });
});

test('with nothing selected, an empty [[ ]] goes in with the cursor between the brackets', () => {
  assert.deepEqual(wrapLink('■学び\n', 4, 4), { text: '■学び\n[[]]', cursor: 6 });
});

test('spaces around the selection stay outside the brackets', () => {
  assert.deepEqual(wrapLink('a 負債 b', 1, 5), { text: 'a [[負債]] b', cursor: 8 });
});

test('a selection that already has brackets is not wrapped twice', () => {
  assert.deepEqual(wrapLink('[[負債]]', 0, 6), { text: '[[負債]]', cursor: 6 });
});

test('a memo written with the old bare headings does not get them a second time', () => {
  const old = MEMO_SECTIONS.map(n => `■${n}\nあ`).join('\n');
  assert.equal(withSections(old), old);
});

test('the empty-memo prompt is picked from the list', () => {
  assert.equal(randomPrompt(() => 0), MEMO_PROMPTS[0]);
  assert.equal(randomPrompt(() => 0.999), MEMO_PROMPTS.at(-1));
  assert.equal(MEMO_PROMPTS.length, 16);
});
