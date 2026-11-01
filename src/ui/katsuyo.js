// 活用 tab (鬼さん 2026-11-01): what the collection can be used for, apart from the settings. 蔵書のすがた
// (moved from 設定), 読み返す (one book's memo at random) and グラフビュー (books joined by their [[ ]] words).

import { h, fill, toast, sheet, segmented } from './dom.js';
import { ownedPriceSum, countOwned, tsundokuRate, ownedWithoutPrice, floorTatami, SHELF_ROOM, tsundokuVsRead } from '../core/stats.js';
import { todayStr } from '../core/model.js';
import { isStale } from '../core/stale.js';
import { seriesVolume } from '../core/editions.js';
import { buildGraph, layoutGraph, wordLines } from '../core/graph.js';
import { checkNewerEdition, newerEditionText } from './detail.js';

// A memo counts for 読み返す only when something is written besides the 問いで書く headings.
const memoBody = memo => String(memo ?? '').split('\n')
  .filter(l => !l.trim().startsWith('■') && !l.trim().startsWith('（買う前の期待')).join('\n').trim();

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...children) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
};

export function mount(container, ctx) {
  const { db } = ctx;
  let disposed = false;
  let readBackId = null;

  async function render() {
    const staleRules = await db.staleRules();
    const [books, tags, tsundokuSetting, shelfRoom] = await Promise.all([
      db.allBooks(), db.allTags(), db.getSetting('tsundokuTagId'), db.getSetting('shelfRoom'),
    ]);
    if (disposed) return;

    // --- 蔵書のすがた: how many books, seen from several angles ---
    // Until a tag is chosen, a tag called 積読 is used if there is one.
    const chosen = tags.some(t => t.id === tsundokuSetting) ? tsundokuSetting : null; // a deleted tag counts as not chosen
    const tsundokuTagId = chosen ?? tags.find(t => t.name === '積読')?.id ?? '';
    const rate = tsundokuRate(books, tsundokuTagId);
    const tsundokuSelect = h('select', { onChange: async e => { await db.setSetting('tsundokuTagId', e.target.value); render(); } },
      h('option', { value: '' }, '（タグを選ぶ）'),
      tags.map(t => h('option', { value: t.id, selected: t.id === tsundokuTagId }, t.name)));
    const noPrice = ownedWithoutPrice(books);
    const tatami = floorTatami(books);
    const statRow = (label, value, note) => h('div', { class: 'stat-block' },
      h('div', { class: 'stat' }, h('span', {}, label), h('span', { class: 'stat-value' }, value)),
      note ? h('div', { class: 'muted small stat-note' }, note) : null);
    const staleCount = books.filter(b => isStale(b, staleRules, todayStr())).length;
    const paperCount = books.filter(b => b.ownership === 'owned' && b.format !== 'ebook').length;
    // 積読と読了: two small bars each for money and pages (積読は負債、読めば資産).
    const tr = tsundokuVsRead(books, tsundokuTagId);
    const bars = (label, key, unit, unknownKey) => {
      const max = Math.max(tr.tsundoku[key], tr.read[key], 1);
      const row = (name, v, cls) => h('div', { class: 'bar-row' },
        h('span', { class: 'bar-name' }, name),
        h('span', { class: 'bar-track' }, h('span', { class: `bar-fill ${cls}`, style: { width: `${Math.round((v[key] / max) * 100)}%` } })),
        h('span', { class: 'bar-value' }, `${v[key].toLocaleString()}${unit}`));
      const unknown = tr.tsundoku[unknownKey] + tr.read[unknownKey];
      return h('div', { class: 'bar-group' },
        h('div', { class: 'small muted' }, label),
        row('積読', tr.tsundoku, 'debt'), row('読了', tr.read, 'asset'),
        unknown ? h('div', { class: 'small muted' }, `分からない本が${unknown.toLocaleString()}冊あります`) : null);
    };
    const barBlock = tr ? h('div', { class: 'stat-block' },
      h('div', { class: 'stat' }, h('span', {}, '積読と読了'), h('span', { class: 'muted small' }, `積読 ${tr.tsundoku.count}冊・読了 ${tr.read.count}冊`)),
      bars('定価（税抜）', 'price', '円', 'noPrice'), bars('ページ', 'pages', 'p', 'noPages')) : null;

    // 新しい版をまとめて確かめる: every 古いかも book, one by one (NDL is asked one at a time anyway).
    const staleBooks = books.filter(b => isStale(b, staleRules, todayStr()) && seriesVolume(b) === null);
    const withNewer = books.filter(b => b.newerEdition);
    async function checkAllEditions(btn) {
      btn.disabled = true;
      let found = 0;
      for (const [i, b] of staleBooks.entries()) {
        btn.textContent = `確かめています… ${i + 1}/${staleBooks.length}冊`;
        try { if ((await checkNewerEdition(b, ctx)).newerEdition) found++; } catch { /* next book */ }
      }
      toast(`新しい版が出ている本：${found}冊`);
      render();
    }
    function showNewer() {
      sheet(h('ul', { class: 'check-list' }, withNewer.map(b => h('li', {},
        h('button', { class: 'link-book-row', onClick: () => ctx.openDetail(b.id) },
          h('div', { class: 'title' }, b.title), h('div', { class: 'small muted' }, `新しい版：${newerEditionText(b)}`))))),
      { title: '新しい版が出ている本', thumbClose: true });
    }

    const sugata = h('div', { class: 'card' },
      statRow('持っている本', `${countOwned(books).toLocaleString()}冊`,
        `紙 ${paperCount.toLocaleString()}冊・電子 ${(countOwned(books) - paperCount).toLocaleString()}冊`),
      statRow('積読率', rate ? `${rate.percent}%` : '—',
        h('span', {}, rate ? `紙の本 ${rate.total.toLocaleString()}冊のうち ${rate.count.toLocaleString()}冊。` : '', 'タグ：', tsundokuSelect)),
      statRow('本に掛けたお金', `${ownedPriceSum(books).toLocaleString()}円`,
        `持っている本の定価（税抜）の合計${noPrice ? `。定価の分からない本が${noPrice.toLocaleString()}冊あるので、実際はもう少し多めです` : ''}`),
      statRow('床に並べると', tatami < 0.1 ? '畳 0.1枚分未満' : `畳 ${tatami < 10 ? tatami.toFixed(1) : Math.round(tatami)}枚分`,
        '紙の本を表紙を上にして床に並べた広さ。1冊を四六判（12.8×18.8cm）として数えた、だいたいの目安です'),
      barBlock,
      statRow('古いかもしれない本', `${staleCount.toLocaleString()}冊`,
        staleCount ? h('div', { class: 'memo-tools' },
          h('button', { class: 'link-btn', onClick: () => { location.hash = 'shelf?stale=1'; } }, '本棚で見る'),
          staleBooks.length ? h('button', { class: 'link-btn', onClick: e => checkAllEditions(e.currentTarget) }, `新しい版が出ていないか、まとめて確かめる（${staleBooks.length}冊・1冊数秒）`) : null)
          : '法律・試験用・参考書などで、発行から年数のたった本はありません'),
      withNewer.length ? statRow('新しい版が出ている本', `${withNewer.length.toLocaleString()}冊`,
        h('button', { class: 'link-btn', onClick: showNewer }, '一覧を見る')) : null,
      h('div', { class: 'stat-block' },
        h('div', { class: 'stat' }, h('span', {}, '本棚の空き'), h('span', { class: 'muted small' }, '自分で選ぶ')),
        segmented(SHELF_ROOM, shelfRoom ?? '', v => db.setSetting('shelfRoom', v))));


    // --- 読み返す: one book whose memo has something written, at random ---
    const withMemo = books.filter(b => memoBody(b.memo));
    const readBack = h('div', { class: 'card' });
    const showOne = () => {
      if (!withMemo.length) {
        fill(readBack, h('p', { class: 'muted small', style: { margin: 0 } }, 'メモを書いた本がまだありません。本の詳細で「問いで書く」を押すと書き始められます。'));
        return;
      }
      const others = withMemo.filter(b => b.id !== readBackId);
      const b = (others.length ? others : withMemo)[Math.floor(Math.random() * (others.length || withMemo.length))];
      readBackId = b.id;
      fill(readBack,
        h('div', { class: 'readback-title' }, b.title || '（書名なし）'),
        h('div', { class: 'readback-memo' }, b.memo.trim()),
        h('div', { class: 'row-buttons', style: { marginTop: '10px' } },
          h('button', { class: 'btn', onClick: () => ctx.openDetail(b.id) }, 'この本を開く'),
          withMemo.length > 1 ? h('button', { class: 'btn', onClick: showOne }, 'ほかの本') : null));
    };
    showOne();

    // --- グラフビュー: books and the [[ ]] words of their memos ---
    const graph = buildGraph(books);
    const graphBox = h('div', { class: 'card graph-card' });
    if (!graph.nodes.length) {
      fill(graphBox, h('p', { class: 'muted small', style: { margin: 0 } }, 'メモの中の言葉を [[ ]] で囲むと、同じ言葉を持つ本どうしが線でつながって、ここに出ます。'));
    } else {
      const W = 340, H = Math.min(560, Math.max(260, graph.nodes.length * 28));
      const pos = layoutGraph(graph, W, H);
      const picture = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graph', role: 'img', 'aria-label': '本と言葉のつながり' });
      for (const [a, b] of graph.edges) picture.append(svg('line', { x1: pos[a].x, y1: pos[a].y, x2: pos[b].x, y2: pos[b].y, class: 'graph-edge' }));
      for (const n of graph.nodes) {
        const { x, y } = pos[n.id];
        const label = n.label.length > 12 ? `${n.label.slice(0, 12)}…` : n.label;
        const g = svg('g', { class: `graph-node ${n.kind}`, transform: `translate(${x},${y})` },
          n.kind === 'book' ? svg('rect', { x: -6, y: -6, width: 12, height: 12, rx: 3 }) : svg('circle', { r: 4 + Math.min(n.degree, 6) }),
          svg('text', { y: n.kind === 'book' ? 20 : -10, 'text-anchor': 'middle' }, label));
        if (n.kind === 'book') g.addEventListener('click', () => ctx.openDetail(n.id));
        else g.addEventListener('click', () => showWord(n.id));
        picture.append(g);
      }
      // The memo lines behind each word, under the picture (鬼さん 2026-11-01). Pressing a word jumps here.
      const groups = new Map(wordLines(books).map(w => [w.key, h('div', { class: 'word-lines' },
        h('div', { class: 'word-head' }, `[[${w.word}]]`, h('span', { class: 'muted small' }, `　${new Set(w.items.map(i => i.bookId)).size}冊`)),
        w.items.map(i => h('div', { class: 'word-line' },
          h('button', { class: 'word-book', onClick: () => ctx.openDetail(i.bookId) }, i.title),
          h('div', {}, i.line))))]));
      const showWord = key => {
        const el = groups.get(key);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 1200);
      };
      fill(graphBox, picture,
        h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, `■ 本 ${graph.nodes.filter(n => n.kind === 'book').length}冊　● 言葉 ${graph.nodes.filter(n => n.kind === 'word').length}個。本を押すとその本が開き、言葉を押すと下のメモに移ります。`),
        h('div', { class: 'word-list' }, [...groups.values()]));
    }

    const titled = (title, ...body) => [h('div', { class: 'section-title' }, title), ...body];
    fill(container,
      ...titled('読み返す', readBack),
      ...titled('グラフビュー', graphBox),
      ...titled('蔵書のすがた', sugata));
  }

  render();
  return () => { disposed = true; };
}
