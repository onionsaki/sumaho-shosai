// Straighten a photo of a book: the four corners the user (or detect.js) chose become a flat rectangle,
// like a document scanner (鬼さん 2026-10-25: Lens-style background removal). Pure functions on ImageData-shaped objects.

// Solves the 3x3 projective transform that sends from[i] to to[i] (four points each).
export function homography(from, to) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function mapPoint(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Output size from the quad's average edge lengths (corners in order: top-left, top-right, bottom-right, bottom-left),
// shrunk so the longer side is at most maxSide.
export function quadSize(quad, maxSide = 640) {
  const w = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2;
  const h = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

// Copies the quad out of src into a width x height image, sampling with bilinear interpolation.
export function warpQuad(src, quad, width, height) {
  const H = homography([[0, 0], [width, 0], [width, height], [0, height]], quad);
  const out = new Uint8ClampedArray(width * height * 4);
  const { width: sw, height: sh, data } = src;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [u, v] = mapPoint(H, x + 0.5, y + 0.5);
      const fx = Math.min(Math.max(u - 0.5, 0), sw - 1);
      const fy = Math.min(Math.max(v - 0.5, 0), sh - 1);
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
      const ax = fx - x0, ay = fy - y0;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = data[(y0 * sw + x0) * 4 + c] * (1 - ax) + data[(y0 * sw + x1) * 4 + c] * ax;
        const bottom = data[(y1 * sw + x0) * 4 + c] * (1 - ax) + data[(y1 * sw + x1) * 4 + c] * ax;
        out[o + c] = top * (1 - ay) + bottom * ay;
      }
    }
  }
  return { width, height, data: out };
}
