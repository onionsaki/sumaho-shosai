import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVolume, splitTitleVolume, workKeyOf } from '../src/core/volume.js';

test('parseVolume variants', () => {
  const cases = [
    ['巻一', 1], ['第十二巻', 12], ['12', 12], ['（12）', 12], ['(12)', 12], ['１２', 12],
    ['12巻', 12], ['第3集', 3], ['vol.5', 5], ['Vol. 7', 7], ['上', 1], ['中', 2], ['下', 3],
    ['百五', 105], ['二十', 20], ['三〇', 30], ['', null], ['特装版', null],
  ];
  for (const [s, n] of cases) assert.equal(parseVolume(s), n, s);
});

test('splitTitleVolume strips only marked trailing volumes', () => {
  assert.deepEqual(splitTitleVolume('進撃の巨人 1'), { workTitle: '進撃の巨人', volume: 1 });
  assert.deepEqual(splitTitleVolume('ハイキュー!!（3）'), { workTitle: 'ハイキュー!!', volume: 3 });
  assert.deepEqual(splitTitleVolume('呪術廻戦 第2巻'), { workTitle: '呪術廻戦', volume: 2 });
  assert.deepEqual(splitTitleVolume('鬼滅の刃 23巻'), { workTitle: '鬼滅の刃', volume: 23 });
  assert.deepEqual(splitTitleVolume('20世紀少年'), { workTitle: '20世紀少年', volume: null });
  assert.deepEqual(splitTitleVolume('1Q84'), { workTitle: '1Q84', volume: null });
  assert.deepEqual(splitTitleVolume('ONE PIECE'), { workTitle: 'ONE PIECE', volume: null });
  assert.deepEqual(splitTitleVolume('One piece 巻1'), { workTitle: 'One piece', volume: 1 });
});

test('workKeyOf ignores width, spacing and roles', () => {
  assert.equal(workKeyOf('ONE PIECE', ['尾田栄一郎']), workKeyOf('Ｏｎｅ　Ｐｉｅｃｅ', ['尾田栄一郎 著']));
  assert.notEqual(workKeyOf('ONE PIECE', ['尾田栄一郎']), workKeyOf('ONE PIECE', ['別の人']));
  assert.equal(workKeyOf('作品', []), '作品|');
});
