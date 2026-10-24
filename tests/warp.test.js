import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homography, mapPoint, warpQuad, quadSize } from '../src/core/warp.js';
import { detectQuad } from '../src/core/detect.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('homography maps the four corners exactly', () => {
  const from = [[0, 0], [100, 0], [100, 150], [0, 150]];
  const to = [[12, 7], [90, 20], [95, 160], [5, 140]];
  const H = homography(from, to);
  from.forEach((p, i) => {
    const [x, y] = mapPoint(H, p[0], p[1]);
    assert.ok(near(x, to[i][0], 1e-6) && near(y, to[i][1], 1e-6), `corner ${i}: ${x},${y}`);
  });
});

test('quadSize keeps the book shape from the average edge lengths', () => {
  assert.deepEqual(quadSize([[0, 0], [200, 0], [200, 300], [0, 300]], 640), { width: 200, height: 300 });
  const big = quadSize([[0, 0], [1000, 0], [1000, 1500], [0, 1500]], 640);
  assert.equal(big.height, 640);
  assert.equal(big.width, 427);
});

// A 40x60 image: white everywhere except a red square at x 10..19, y 20..29.
function testImage() {
  const width = 40, height = 60, data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 20; y < 30; y++) for (let x = 10; x < 20; x++) {
    const i = (y * width + x) * 4; data[i + 1] = 0; data[i + 2] = 0;
  }
  return { width, height, data };
}

test('warpQuad cuts out the chosen area', () => {
  const out = warpQuad(testImage(), [[10, 20], [20, 20], [20, 30], [10, 30]], 10, 10);
  assert.equal(out.width, 10);
  assert.equal(out.height, 10);
  const px = (x, y) => Array.from(out.data.slice((y * 10 + x) * 4, (y * 10 + x) * 4 + 3));
  assert.deepEqual(px(5, 5), [255, 0, 0]);
  assert.deepEqual(px(0, 0), [255, 0, 0]);
});

// Background with mild noise, and a tilted "book" of a different colour in the middle.
function bookOnCloth(corners) {
  const width = 200, height = 260, data = new Uint8ClampedArray(width * height * 4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const inside = (x, y) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4];
      const s = Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax));
      if (s === 0) continue;
      if (sign === 0) sign = s; else if (s !== sign) return false;
    }
    return true;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, n = rnd() * 30;
    if (inside(x, y)) { data[i] = 230 - n; data[i + 1] = 200 - n; data[i + 2] = 60; }
    else { data[i] = 60 + n; data[i + 1] = 90 + n; data[i + 2] = 170 + n; }
    data[i + 3] = 255;
  }
  return { width, height, data };
}

test('detectQuad finds the corners of a book lying on a plain cloth', () => {
  const corners = [[48, 40], [160, 55], [150, 220], [35, 205]];
  const quad = detectQuad(bookOnCloth(corners));
  assert.ok(quad, 'found a quad');
  quad.forEach((p, i) => {
    const d = Math.hypot(p[0] - corners[i][0], p[1] - corners[i][1]);
    assert.ok(d < 8, `corner ${i} off by ${d.toFixed(1)}px: ${p}`);
  });
});

test('detectQuad gives up on a picture with no clear book', () => {
  const width = 50, height = 50, data = new Uint8ClampedArray(width * height * 4).fill(128);
  assert.equal(detectQuad({ width, height, data }), null);
});
