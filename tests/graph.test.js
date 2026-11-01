import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, layoutGraph } from '../src/core/graph.js';

const book = (id, title, memo) => ({ id, title, memo });

test('books with [[ ]] words and the words become nodes, joined by edges', () => {
  const g = buildGraph([book('a', '本A', '[[負債]]と[[視点]]'), book('b', '本B', '[[負債]]'), book('c', '本C', 'なし')]);
  assert.deepEqual(g.nodes.filter(n => n.kind === 'book').map(n => n.id), ['a', 'b']);
  assert.deepEqual(g.nodes.filter(n => n.kind === 'word').map(n => n.label), ['負債', '視点']);
  assert.equal(g.edges.length, 3);
  assert.equal(g.nodes.find(n => n.label === '負債').degree, 2);
});

test('the same word written differently is one node', () => {
  const g = buildGraph([book('a', '本A', '[[ファスト教養]]'), book('b', '本B', '[[ﾌｧｽﾄ教養]]')]);
  assert.equal(g.nodes.filter(n => n.kind === 'word').length, 1);
});

test('layout keeps every node inside the box and gives the same picture every time', () => {
  const g = buildGraph([book('a', '本A', '[[負債]][[視点]]'), book('b', '本B', '[[負債]]'), book('c', '本C', '[[視点]][[筋トレ]]')]);
  const p1 = layoutGraph(g, 300, 300);
  const p2 = layoutGraph(g, 300, 300);
  assert.deepEqual(p1, p2);
  for (const { x, y } of Object.values(p1)) assert.ok(x >= 0 && x <= 300 && y >= 0 && y <= 300);
});
