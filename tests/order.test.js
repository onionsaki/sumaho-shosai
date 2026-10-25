import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOrder, moveItem } from '../src/core/order.js';

test('applyOrder follows the saved order and keeps new sections at the end', () => {
  assert.deepEqual(applyOrder(['a', 'b', 'c'], undefined), ['a', 'b', 'c']);
  assert.deepEqual(applyOrder(['a', 'b', 'c'], ['c', 'a']), ['c', 'a', 'b']);
  assert.deepEqual(applyOrder(['a', 'b'], ['gone', 'b', 'b']), ['b', 'a']);
});

test('moveItem swaps with a neighbour and stops at the ends', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c']);
});
