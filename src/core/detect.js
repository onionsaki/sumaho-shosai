// Find a book's four corners in a photo (鬼さん 2026-10-25: "B" — Lens-style automatic cut-out).
// Light on purpose (no image library): the photo's edges are taken as background, the largest region that
// differs from them is the book, and its four extreme points are the corners. The user can still drag them.

const WORK_SIDE = 240; // detection runs on a small copy; corners are scaled back

export function detectQuad(img) {
  const scale = Math.min(1, WORK_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const px = (x, y) => {
    const sx = Math.min(img.width - 1, Math.floor((x + 0.5) / scale));
    const sy = Math.min(img.height - 1, Math.floor((y + 0.5) / scale));
    const i = (sy * img.width + sx) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };

  // Background colour from a band around the edges.
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.04));
  const border = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x < band || y < band || x >= w - band || y >= h - band) border.push(px(x, y));
  }
  const mean = [0, 1, 2].map(c => border.reduce((s, p) => s + p[c], 0) / border.length);
  const spread = Math.sqrt(border.reduce((s, p) => s + (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2 + (p[2] - mean[2]) ** 2, 0) / border.length);
  const limit = Math.max(45, spread * 2.5);

  const fg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = px(x, y);
    fg[y * w + x] = Math.hypot(p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]) > limit ? 1 : 0;
  }

  // Largest connected region of "not background".
  const seen = new Uint8Array(w * h);
  let best = null;
  for (let start = 0; start < w * h; start++) {
    if (!fg[start] || seen[start]) continue;
    const stack = [start];
    const pts = [];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      pts.push(i);
      const x = i % w, y = (i - x) / w;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (fg[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (!best || pts.length > best.length) best = pts;
  }
  if (!best || best.length < w * h * 0.08 || best.length > w * h * 0.97) return null;

  // Extreme points: top-left has the smallest x+y, bottom-right the largest, and so on.
  let tl, tr, br, bl;
  for (const i of best) {
    const x = i % w, y = (i - x) / w;
    if (!tl || x + y < tl[0] + tl[1]) tl = [x, y];
    if (!br || x + y > br[0] + br[1]) br = [x, y];
    if (!tr || x - y > tr[0] - tr[1]) tr = [x, y];
    if (!bl || x - y < bl[0] - bl[1]) bl = [x, y];
  }
  const back = ([x, y], dx, dy) => [Math.min(img.width, Math.max(0, (x + dx) / scale)), Math.min(img.height, Math.max(0, (y + dy) / scale))];
  return [back(tl, 0, 0), back(tr, 1, 0), back(br, 1, 1), back(bl, 0, 1)];
}
