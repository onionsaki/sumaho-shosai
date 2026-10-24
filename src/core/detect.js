// Find a book's four corners in a photo (鬼さん 2026-10-25: "B" — Lens-style automatic cut-out).
// Light on purpose (no image library). Steps:
//  1. background: the photo's edges, allowing light that changes across the frame (a fitted colour gradient);
//  2. the book: every sizeable region that differs from the background, with small gaps closed,
//     so stripes or patches on the cover that match the cloth do not split it apart;
//  3. corners: the largest quadrilateral inside the convex outline of that region.
// The user can still drag the corners afterwards.

const WORK_SIDE = 200; // detection runs on a small copy; corners are scaled back

// Least-squares plane c = a + b·x + d·y for one colour channel over the border pixels.
function fitPlane(samples, c) {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sv = 0, sxv = 0, syv = 0;
  for (const [x, y, p] of samples) {
    const v = p[c];
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sv += v; sxv += x * v; syv += y * v;
  }
  // Solve the 3x3 normal equations by Cramer's rule.
  const m = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]], r = [sv, sxv, syv];
  const det3 = a => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const D = det3(m);
  if (Math.abs(D) < 1e-9) return [sv / n, 0, 0];
  const col = k => det3(m.map((row, i) => row.map((v, j) => (j === k ? r[i] : v)))) / D;
  return [col(0), col(1), col(2)];
}

// Otsu's threshold over values 0..255+ (clamped), maximising the between-group variance.
function otsu(values) {
  const bins = new Float64Array(256);
  for (const v of values) bins[Math.min(255, Math.max(0, Math.round(v)))]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * bins[i];
  let wB = 0, sumB = 0, best = 0, cut = 0;
  for (let t = 0; t < 256; t++) {
    wB += bins[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * bins[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; cut = t; }
  }
  return cut;
}

function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (const p of pts.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const area4 = q => Math.abs(q.reduce((s, p, i) => { const n = q[(i + 1) % 4]; return s + p[0] * n[1] - n[0] * p[1]; }, 0)) / 2;

// Largest quadrilateral with corners on the hull: start from the extreme points, then move each corner
// along the hull while the area grows.
function biggestQuad(hull) {
  const n = hull.length;
  if (n < 4) return null;
  const pick = f => hull.reduce((bi, p, i) => (f(p) > f(hull[bi]) ? i : bi), 0);
  let idx = [pick(p => -p[0] - p[1]), pick(p => p[0] - p[1]), pick(p => p[0] + p[1]), pick(p => p[1] - p[0])];
  if (new Set(idx).size < 4) idx = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)];
  let best = area4(idx.map(i => hull[i]));
  for (let round = 0; round < 6; round++) {
    let improved = false;
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j < n; j++) {
        if (idx.includes(j)) continue;
        const trial = [...idx];
        trial[k] = j;
        // keep the corners in hull order so the quad does not fold over itself
        const order = trial.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
        const rotations = [0, 1, 2, 3].some(r => order.every((v, i) => v === (i + r) % 4));
        if (!rotations) continue;
        const a = area4(trial.map(i => hull[i]));
        if (a > best + 1e-9) { best = a; idx = trial; improved = true; }
      }
    }
    if (!improved) break;
  }
  return idx.map(i => hull[i]);
}

// Corners in the order top-left, top-right, bottom-right, bottom-left.
function orderCorners(q) {
  const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
  const byAngle = [...q].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  const start = byAngle.reduce((bi, p, i) => (p[0] + p[1] < byAngle[bi][0] + byAngle[bi][1] ? i : bi), 0);
  return [0, 1, 2, 3].map(i => byAngle[(start + i) % 4]);
}

export function detectQuad(img) {
  const scale = Math.min(1, WORK_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  // Average the source pixels that fall in each small cell (smooths cloth texture and noise).
  const small = new Float32Array(w * h * 3);
  const counts = new Uint32Array(w * h);
  for (let y = 0; y < img.height; y++) {
    const cy = Math.min(h - 1, Math.floor(y * scale));
    for (let x = 0; x < img.width; x++) {
      const cx = Math.min(w - 1, Math.floor(x * scale));
      const i = (y * img.width + x) * 4, j = cy * w + cx;
      small[j * 3] += img.data[i]; small[j * 3 + 1] += img.data[i + 1]; small[j * 3 + 2] += img.data[i + 2];
      counts[j]++;
    }
  }
  for (let j = 0; j < w * h; j++) for (let c = 0; c < 3; c++) small[j * 3 + c] /= counts[j] || 1;
  const px = (x, y) => { const j = (y * w + x) * 3; return [small[j], small[j + 1], small[j + 2]]; };

  // 1. background colour as a gradient over the frame, fitted to a band along the edges
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.05));
  const border = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x < band || y < band || x >= w - band || y >= h - band) border.push([x, y, px(x, y)]);
  }
  // How far a colour is from the background there: plain colour distance, plus extra weight on
  // saturation, so a pale pink cover stands out from grey cloth (real photo, 2026-10-25).
  // A shadow on the cloth only gets darker without changing hue, so going darker counts for less.
  const sat = p => Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]);
  const diff = (p, e) => {
    const lp = (p[0] + p[1] + p[2]) / 3, le = (e[0] + e[1] + e[2]) / 3;
    const dc = Math.hypot(p[0] - lp - (e[0] - le), p[1] - lp - (e[1] - le), p[2] - lp - (e[2] - le));
    const dl = lp >= le ? lp - le : (le - lp) * 0.45;
    return Math.hypot(dc * 1.4, dl) + 1.5 * Math.abs(sat(p) - sat(e));
  };
  const median = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
  // Fit twice: the second fit leaves out things lying in the edge band (a plug, a hand, a corner of the book).
  let planes = [0, 1, 2].map(c => fitPlane(border, c));
  let expected = (x, y) => planes.map(([a, b, d]) => a + b * x + d * y);
  const first = border.map(([x, y, p]) => diff(p, expected(x, y)));
  const cut = Math.max(12, median(first) * 2.5);
  const clean = border.filter((_, i) => first[i] <= cut);
  if (clean.length > border.length * 0.3) {
    planes = [0, 1, 2].map(c => fitPlane(clean, c));
    expected = (x, y) => planes.map(([a, b, d]) => a + b * x + d * y);
  }
  const typical = median(clean.map(([x, y, p]) => diff(p, expected(x, y))));
  const dmap = new Float32Array(w * h);
  const shadow = new Uint8Array(w * h); // only darker, same hue: never grown into below
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = px(x, y), e = expected(x, y);
    dmap[y * w + x] = diff(p, e);
    const lp = (p[0] + p[1] + p[2]) / 3, le = (e[0] + e[1] + e[2]) / 3;
    shadow[y * w + x] = lp < le - 6 && Math.abs(sat(p) - sat(e)) < 14 ? 1 : 0;
  }
  // The cut between "cloth" and "book" is read from this photo (Otsu: the split that best separates two groups),
  // never below what the cloth's own texture reaches.
  const limit = Math.max(26, typical * 2.5, otsu(dmap));

  let mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = dmap[i] > limit ? 1 : 0;
  // Two levels: grow from the clearly-book parts into anything joined to them that is only a little off the
  // cloth, so a white cover on light grey is kept while loose shine on the cloth is not (real photo 2026-10-25).
  const weak = Math.max(20, typical * 3);
  const stack = [];
  for (let i = 0; i < w * h; i++) if (mask[i]) stack.push(i);
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    for (const j of [x + 1 < w ? i + 1 : -1, x > 0 ? i - 1 : -1, i + w < w * h ? i + w : -1, i - w]) {
      if (j >= 0 && !mask[j] && !shadow[j] && dmap[j] > weak) { mask[j] = 1; stack.push(j); }
    }
  }

  // 2. close small gaps (dilate then erode) so a cover split by cloth-coloured stripes joins up
  const r = Math.max(1, Math.round(Math.min(w, h) * 0.035));
  // A square window splits into a row pass and a column pass (same result, far fewer steps on a phone).
  const pass = (src, grow, horizontal) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = grow ? 0 : 1;
      for (let d = -r; d <= r; d++) {
        const nx = horizontal ? x + d : x, ny = horizontal ? y : y + d;
        const s = nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : src[ny * w + nx];
        if (grow && s) { v = 1; break; }
        if (!grow && !s) { v = 0; break; }
      }
      out[y * w + x] = v;
    }
    return out;
  };
  const morph = (src, grow) => pass(pass(src, grow, true), grow, false);
  mask = morph(morph(mask, true), false); // close: join pieces of the cover
  mask = morph(morph(mask, false), true); // open: drop thin streaks (shine on a quilt, folds, a cable)

  // keep the largest region plus any other sizeable piece (a cover can still come apart in places)
  const seen = new Uint8Array(w * h);
  const regions = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start], pts = [];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      pts.push(i);
      const x = i % w, y = (i - x) / w;
      if (x + 1 < w && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (y + 1 < h && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
    }
    regions.push(pts);
  }
  regions.sort((a, b) => b.length - a.length);
  if (!regions.length || regions[0].length < w * h * 0.06) return null;
  const keep = regions.filter(p => p.length >= Math.max(regions[0].length * 0.25, w * h * 0.004));
  const total = keep.reduce((s, p) => s + p.length, 0);
  if (total > w * h * 0.97) return null;

  // 3. corners: biggest quadrilateral inside the convex outline
  const points = [];
  for (const pts of keep) for (const i of pts) {
    const x = i % w, y = (i - x) / w;
    // only outline pixels matter for the hull
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) points.push([x + 0.5, y + 0.5]);
  }
  const quad = biggestQuad(convexHull(points));
  if (!quad || area4(quad) < w * h * 0.05) return null;
  return orderCorners(quad).map(([x, y]) => [
    Math.min(img.width, Math.max(0, x / scale)),
    Math.min(img.height, Math.max(0, y / scale)),
  ]);
}
