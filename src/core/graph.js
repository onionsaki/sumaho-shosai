// グラフビュー (活用, 鬼さん 2026-11-01): books and the [[ ]] words of their memos as points, joined by lines.
// A small force layout written here so nothing is loaded from outside; fine for the tens of books with memos
// expected. Seeded, so the picture does not jump around each time the tab is opened.

import { linkWords } from './links.js';
import { normalizeForSearch } from './normalize.js';

export function buildGraph(books) {
  const nodes = [];
  const edges = [];
  const words = new Map();
  for (const b of books) {
    const ws = linkWords(b.memo);
    if (!ws.length) continue;
    nodes.push({ id: b.id, kind: 'book', label: b.title || '（書名なし）', degree: ws.length });
    for (const w of ws) {
      const key = `w:${normalizeForSearch(w)}`;
      if (!words.has(key)) { const n = { id: key, kind: 'word', label: w, degree: 0 }; words.set(key, n); nodes.push(n); }
      words.get(key).degree++;
      edges.push([b.id, key]);
    }
  }
  return { nodes, edges };
}

// Positions { id: {x, y} } inside width × height.
export function layoutGraph({ nodes, edges }, width, height, iterations = 300) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pos = new Map(nodes.map(n => [n.id, { x: width * (0.2 + 0.6 * rand()), y: height * (0.2 + 0.6 * rand()) }]));
  const k = Math.sqrt((width * height) / Math.max(nodes.length, 1)) * 0.8;
  for (let it = 0; it < iterations; it++) {
    const t = (1 - it / iterations) * k * 0.5;
    const move = new Map(nodes.map(n => [n.id, { x: 0, y: 0 }]));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id), b = pos.get(nodes[j].id);
        let dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const f = (k * k) / d;
        dx = (dx / d) * f; dy = (dy / d) * f;
        move.get(nodes[i].id).x += dx; move.get(nodes[i].id).y += dy;
        move.get(nodes[j].id).x -= dx; move.get(nodes[j].id).y -= dy;
      }
    }
    for (const [s, e] of edges) {
      const a = pos.get(s), b = pos.get(e);
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d * d) / k;
      move.get(s).x -= (dx / d) * f; move.get(s).y -= (dy / d) * f;
      move.get(e).x += (dx / d) * f; move.get(e).y += (dy / d) * f;
    }
    for (const n of nodes) {
      const p = pos.get(n.id), m = move.get(n.id);
      const len = Math.hypot(m.x, m.y) || 1;
      // a weak pull to the middle keeps separate groups on screen
      p.x += (m.x / len) * Math.min(len, t) + (width / 2 - p.x) * 0.01;
      p.y += (m.y / len) * Math.min(len, t) + (height / 2 - p.y) * 0.01;
      p.x = Math.min(width - 20, Math.max(20, p.x));
      p.y = Math.min(height - 28, Math.max(18, p.y)); // room for the label under a book
    }
  }
  const out = {};
  for (const [id, p] of pos) out[id] = { x: Math.round(p.x), y: Math.round(p.y) };
  return out;
}
