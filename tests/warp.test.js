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

// Harder, closer to real photos (鬼さん 2026-10-25: the corners appeared but needed moving by hand).
function scene({ width = 240, height = 320, corners, bg, cover }) {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 11;
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
    const i = (y * width + x) * 4;
    const c = inside(x, y) ? cover(x, y, rnd) : bg(x, y, rnd);
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { width, height, data };
}
const assertCorners = (quad, corners, tol = 9) => {
  assert.ok(quad, 'found a quad');
  quad.forEach((p, i) => {
    const d = Math.hypot(p[0] - corners[i][0], p[1] - corners[i][1]);
    assert.ok(d < tol, `corner ${i} off by ${d.toFixed(1)}px: ${p.map(Math.round)} vs ${corners[i]}`);
  });
};
const blueCloth = (x, y, r) => [50 + r() * 25, 80 + r() * 25, 160 + r() * 30];
const busyCover = (x, y, r) => {
  if ((x + y) % 40 < 12) return [60, 90, 170]; // stripes the same blue as the cloth
  return x % 30 < 15 ? [235, 60, 50] : [250, 225, 80].map(v => v - r() * 20);
};

test('detectQuad copes with a cover that has patches the colour of the cloth', () => {
  const corners = [[50, 45], [190, 60], [180, 280], [40, 265]];
  assertCorners(detectQuad(scene({ corners, bg: blueCloth, cover: busyCover })), corners);
});

test('detectQuad copes with uneven light across the cloth', () => {
  const corners = [[60, 50], [185, 45], [195, 270], [55, 280]];
  const bg = (x, y, r) => { const k = 0.55 + 0.45 * (x / 240); return [70 * k + r() * 15, 100 * k + r() * 15, 190 * k + r() * 15]; };
  assertCorners(detectQuad(scene({ corners, bg, cover: busyCover })), corners);
});

test('detectQuad copes with a two-colour checked cloth', () => {
  const corners = [[45, 70], [175, 40], [200, 250], [70, 285]];
  const bg = (x, y, r) => ((Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? [200 + r() * 20, 200 + r() * 20, 205] : [120 + r() * 20, 125 + r() * 20, 140]);
  const cover = (x, y, r) => [30 + r() * 20, 110 + r() * 20, 70 + r() * 15];
  assertCorners(detectQuad(scene({ corners, bg, cover })), corners);
});

test('detectQuad finds a book turned about 30 degrees', () => {
  const corners = [[95, 30], [215, 100], [150, 280], [25, 205]];
  assertCorners(detectQuad(scene({ corners, bg: blueCloth, cover: (x, y, r) => [240 - r() * 20, 230 - r() * 20, 210] })), corners, 10);
});

// From real photos (2026-10-25): pale pink cover on a grey quilt with a shadow in one corner of the frame.
test('detectQuad keeps a pale cover and ignores a shadow on grey cloth', () => {
  const corners = [[55, 40], [190, 36], [200, 250], [45, 262]];
  const bg = (x, y, r) => { const shade = x > 170 && y > 230 ? 0.62 : 1; return [192 * shade + r() * 14, 197 * shade + r() * 14, 194 * shade + r() * 14]; };
  const cover = (x, y, r) => ((x * 7 + y * 3) % 97 < 8 ? [40, 30, 30] : [238 - r() * 8, 182 - r() * 8, 192 - r() * 8]);
  assertCorners(detectQuad(scene({ corners, bg, cover })), corners, 10);
});

// From a real photo (2026-10-25): white cover on light grey quilt, only the green band stood out.
test('detectQuad keeps a white cover above a coloured band on light grey cloth', () => {
  const corners = [[70, 35], [180, 35], [185, 270], [60, 268]];
  const bg = (x, y, r) => [200 + r() * 12, 204 + r() * 12, 201 + r() * 12];
  const cover = (x, y, r) => (y > 150 ? [170, 205, 60] : (x * 5 + y * 3) % 89 < 6 ? [30, 30, 30] : [247 - r() * 5, 247 - r() * 5, 245 - r() * 5]);
  assertCorners(detectQuad(scene({ corners, bg, cover })), corners, 10);
});
