import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkWords, connectedBooks } from '../src/core/links.js';

const book = (id, title, memo) => ({ id, title, memo });

test('the words wrapped in [[ ]] are picked out once each, in the order written', () => {
  assert.deepEqual(linkWords('積読は[[負債]]。[[視点]]を一つ得れば[[負債]]は資産'), ['負債', '視点']);
  assert.deepEqual(linkWords('囲みなし'), []);
  assert.deepEqual(linkWords('空の[[]]と[[ 筋トレ ]]'), ['筋トレ']);
  assert.deepEqual(linkWords(undefined), []);
});

test('books that share a word are listed under that word, without the book itself', () => {
  const a = book('a', '本A', '[[負債]]と[[視点]]');
  const b = book('b', '本B', 'ここにも[[負債]]');
  const c = book('c', '本C', '[[視点]]、[[筋トレ]]');
  const d = book('d', '本D', '関係なし');
  assert.deepEqual(connectedBooks(a, [a, b, c, d]), [
    { word: '負債', books: [b] },
    { word: '視点', books: [c] },
  ]);
});

test('kana, width and case differences still connect', () => {
  const a = book('a', '本A', '[[ファスト教養]]');
  const b = book('b', '本B', '[[ﾌｧｽﾄ教養]]');
  const c = book('c', '本C', '[[ROI]]');
  const d = book('d', '本D', '[[roi]]');
  assert.deepEqual(connectedBooks(a, [a, b]), [{ word: 'ファスト教養', books: [b] }]);
  assert.deepEqual(connectedBooks(c, [c, d]), [{ word: 'ROI', books: [d] }]);
});

test('a word no other book has yet is still listed, with no books', () => {
  const a = book('a', '本A', '[[負債]]');
  assert.deepEqual(connectedBooks(a, [a]), [{ word: '負債', books: [] }]);
});
