import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSections, wrapLink, MEMO_SECTIONS } from '../src/core/memo.js';

test('an empty memo gets all seven headings in order', () => {
  const out = withSections('');
  assert.deepEqual(out.split('\n').filter(l => l.startsWith('■')), MEMO_SECTIONS.map(n => `■${n}`));
  assert.equal(MEMO_SECTIONS.length, 7);
});

test('what is already written stays first, and only missing headings are added', () => {
  const out = withSections('なぜ買ったか：図解が多そう\n■学び\n型が大事\n');
  assert.ok(out.startsWith('なぜ買ったか：図解が多そう\n■学び\n型が大事'));
  assert.equal(out.split('\n').filter(l => l === '■学び').length, 1);
  assert.ok(out.includes('■意味があったか'));
  assert.equal(withSections(out), out.trimEnd());
});

test('the 欲しい本 expectation is shown under 期待との差', () => {
  assert.ok(withSections('', '仕事の説明に使えそう').includes('■期待との差\n（買う前の期待：仕事の説明に使えそう）'));
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
