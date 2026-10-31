// 本棚 tab: search, filters, book and work views (spec §4-3).

import { h, fill, downloadText, sheet, segmented } from './dom.js';
import { openTagPicker as pickTags } from './tags.js';
import { icon } from './icons.js';
import { filterBooks, sortBooks, SORTS } from '../core/search.js';
import { isStale } from '../core/stale.js';
import { groupWorks } from '../core/series.js';
import { classCounts } from '../core/ndc.js';
import { booksToCsv, csvFileName } from '../core/csv.js';
import { shouldRemindBackup } from '../core/backup.js';
import { normalizeForSearch } from '../core/normalize.js';
import { LABELS, todayStr, coverSrc } from '../core/model.js';

const PAGE = 200;

// Kept across tab switches during one visit. Opens on 持っている only (鬼さん 2026-10-25), so volumes added by
// 「既刊を探す」 as 持っていない stay out of the way until that button is pressed.
const state = {
  query: '', ownership: ['owned'], readStatus: [], tagIds: [], classCodes: [], staleOnly: false, needsReviewOnly: false,
  view: 'books', order: 'kana',
};

let photoSource = null;
export const setPhotoSource = fn => { photoSource = fn; };

export function coverEl(book, big = false) {
  const placeholder = () => h('div', { class: big ? 'cover big' : 'cover' }, (book.title || book.isbn || '？').slice(0, 8));
  const make = src => {
    const img = h('img', { class: big ? 'cover big' : 'cover', src, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(placeholder()));
    return img;
  };
  let el = coverSrc(book) ? make(coverSrc(book)) : placeholder();
  // Photos sit in their own store; fetch one only when its row is drawn.
  if (book.hasPhoto && photoSource) photoSource(book.id).then(url => { if (url) { const n = make(url); el.replaceWith(n); el = n; } });
  return el;
}

export function displayTitle(book) {
  const title = book.title || '（書名なし）';
  if (book.volume === null || book.volume === undefined) return title;
  return /\d\s*$/.test(title) ? title : `${title} ${book.volumeLabel && !/^巻/.test(book.volumeLabel) ? book.volumeLabel : `${book.volume}巻`}`;
}

export function mount(container, ctx) {
  const { db, lookup } = ctx;
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  if (params.get('review') === '1') { Object.assign(state, { needsReviewOnly: true, query: '', ownership: [] }); history.replaceState(null, '', '#shelf'); }
  if (params.get('stale') === '1') { Object.assign(state, { staleOnly: true, query: '', ownership: [] }); history.replaceState(null, '', '#shelf'); }

  let books = [];
  let tags = [];
  let settings = {};
  let shown = PAGE;
  let disposed = false;

  const search = h('input', { type: 'search', placeholder: '書名・著者・読み・メモで探す', value: state.query, enterkeyhint: 'search' });
  const banners = h('div');
  const filters = h('div', { class: 'status-row' });
  const active = h('div', { class: 'chips active-filters' });
  const toolbar = h('div', { class: 'toolbar' });
  const list = h('ul', { class: 'book-list' });
  const more = h('div', { class: 'more' });
  const fab = h('button', { class: 'fab', 'aria-label': '本を追加', onClick: () => ctx.openAdd() }, icon('plus'));

  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.query = search.value; shown = PAGE; render(); }, 150);
  });

  const ctxFor = () => ({ staleRules: settings.staleRules, today: todayStr() });
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  // Yomoo-style: big status buttons with counts (one at a time); everything else lives in the 絞り込み sheet.
  function renderFilters() {
    fill(filters, ...Object.entries(LABELS.ownership).map(([v, label]) => {
      const n = books.filter(b => b.ownership === v).length;
      const on = state.ownership.length === 1 && state.ownership[0] === v;
      return h('button', { class: on ? 'status-btn on' : 'status-btn', onClick: () => { state.ownership = on ? [] : [v]; render(); } },
        label, h('span', { class: 'n' }, String(n)));
    }));
  }

  // What is narrowing the list right now, each removable on its own.
  function renderActive() {
    const chip = (label, onRemove) => h('button', { class: 'chip on', onClick: () => { onRemove(); render(); } }, `${label} ×`);
    const items = [
      ...state.readStatus.map(v => chip(LABELS.read[v], () => { state.readStatus = state.readStatus.filter(x => x !== v); })),
      ...state.tagIds.map(id => tags.find(t => t.id === id)).filter(Boolean)
        .map(t => chip(t.name, () => { state.tagIds = state.tagIds.filter(x => x !== t.id); })),
      ...state.classCodes.map(code => chip(classCounts(books).find(c => c.code === code)?.name ?? code,
        () => { state.classCodes = state.classCodes.filter(x => x !== code); })),
      state.staleOnly ? chip('古いかも', () => { state.staleOnly = false; }) : null,
      state.needsReviewOnly ? chip('あとで確認', () => { state.needsReviewOnly = false; }) : null,
    ].filter(Boolean);
    fill(active, ...items);
    active.hidden = !items.length;
  }

  function openFilterSheet() {
    const body = h('div');
    const s = sheet(body, { title: '絞り込み' });
    const draw = () => {
      const chip = (label, on, onClick) => h('button', { class: on ? 'chip on' : 'chip', onClick: () => { onClick(); render(); draw(); } }, label);
      const reviewCount = books.filter(b => b.lookup === 'not_found').length;
      const classes = classCounts(books.filter(b => !state.ownership.length || state.ownership.includes(b.ownership)));
      const tagNames = state.tagIds.map(id => tags.find(t => t.id === id)?.name).filter(Boolean);
      fill(body,
        h('div', { class: 'section-title', style: { marginTop: '4px' } }, '読んだか'),
        h('div', { class: 'chips' }, Object.entries(LABELS.read).map(([v, label]) =>
          chip(label, state.readStatus.includes(v), () => { state.readStatus = toggle(state.readStatus, v); }))),
        h('div', { class: 'section-title' }, 'タグ（選んだものが全部付いている本）'),
        h('div', { class: 'chips' },
          ...tagNames.map(n => h('span', { class: 'chip on' }, n)),
          h('button', { class: 'chip ghost', onClick: () => pickTags({
            title: 'タグで絞り込む', tags, selected: state.tagIds,
            onToggle: id => { state.tagIds = toggle(state.tagIds, id); render(); draw(); },
          }) }, tagNames.length ? '変更' : `タグを選ぶ（全${tags.length}個）`)),
        h('div', { class: 'section-title' }, '分類（国立国会図書館）'),
        classes.length ? h('div', { class: 'chips' }, classes.map(c =>
          chip(`${c.name} ${c.count}`, state.classCodes.includes(c.code), () => { state.classCodes = toggle(state.classCodes, c.code); })))
          : h('p', { class: 'muted small' }, 'まだ分類の付いた本がありません。設定の「分類を付ける」で付けられます'),
        h('div', { class: 'section-title' }, 'その他'),
        h('div', { class: 'chips' },
          chip('古いかも', state.staleOnly, () => { state.staleOnly = !state.staleOnly; }),
          reviewCount ? chip(`あとで確認 ${reviewCount}`, state.needsReviewOnly, () => { state.needsReviewOnly = !state.needsReviewOnly; }) : null),
        h('div', { class: 'section-title' }, '表示'),
        segmented([['books', '1冊ずつ'], ['works', '作品でまとめる']], state.view, v => { state.view = v; render(); }),
        h('div', { class: 'row-buttons', style: { marginTop: '22px' } },
          h('button', { class: 'btn', onClick: () => {
            Object.assign(state, { ownership: [], readStatus: [], tagIds: [], classCodes: [], staleOnly: false, needsReviewOnly: false });
            render(); draw();
          } }, '条件を外す'),
          h('button', { class: 'btn', onClick: () => downloadText(csvFileName(todayStr()), booksToCsv(currentBooks, tags), 'text/csv') }, 'この一覧をCSVに')),
        h('button', { class: 'btn primary wide', style: { marginTop: '12px' }, onClick: () => s.close() }, `${currentBooks.length}冊を見る`));
    };
    draw();
  }

  function openSortSheet() {
    const s = sheet(h('ul', { class: 'pick-list' }, SORTS.map(([v, label]) => h('li', {},
      h('button', { onClick: () => { state.order = v; render(); s.close(); } },
        h('span', {}, label), v === state.order ? icon('check') : null)))), { title: '並び替え' });
  }

  function renderBanners() {
    fill(banners);
    if (shouldRemindBackup({ lastBackupAt: settings.lastBackupAt ?? '', books, today: todayStr() })) {
      banners.append(h('div', { class: 'banner' },
        h('span', {}, 'しばらくバックアップを取っていません'),
        h('button', { class: 'btn', onClick: () => { location.hash = 'settings'; } }, '設定へ')));
    }
  }

  function bookRow(book) {
    const badges = [];
    if (book.ownership !== 'owned') badges.push(h('span', { class: `badge ${book.ownership}` }, LABELS.ownership[book.ownership]));
    if (book.format === 'ebook') badges.push(h('span', { class: 'badge ebook' }, '電子'));
    if (isStale(book, settings.staleRules, todayStr())) badges.push(h('span', { class: 'badge stale' }, '古いかも'));
    if (book.lookup === 'not_found') badges.push(h('span', { class: 'badge review' }, 'あとで確認'));
    if (book.lookup === 'pending') badges.push(h('span', { class: 'badge' }, '情報を取得中'));
    return h('li', { class: 'book-row', onClick: () => ctx.openDetail(book.id) },
      coverEl(book),
      h('div', { class: 'meta' },
        h('div', { class: 'title' }, displayTitle(book)),
        h('div', { class: 'sub' }, (book.authors ?? []).join('、') || book.isbn || ''),
        badges.length ? h('div', { class: 'badges' }, badges) : null));
  }

  function workRow(work) {
    const { text, missing } = work.summary;
    const line = text ? `${text}巻を持っている${missing.length ? `（${missing.join('、')}が抜け）` : ''}` : '持っている巻なし';
    return h('li', { class: 'book-row', onClick: () => {
      state.query = work.workTitle; search.value = work.workTitle; state.view = 'books'; render();
    } },
      coverEl(work.books[0]),
      h('div', { class: 'meta' },
        h('div', { class: 'title' }, work.workTitle),
        h('div', { class: 'sub' }, `${work.books.length}冊・${(work.books[0].authors ?? []).join('、')}`),
        h('div', { class: 'badges' }, h('span', { class: 'badge' }, line))));
  }

  function rows(filtered) {
    if (state.view === 'books') return filtered.map(b => ({ key: b.id, el: () => bookRow(b) }));
    const works = groupWorks(filtered);
    const singles = filtered.filter(b => b.volume === null || b.volume === undefined);
    const items = [
      ...works.map(w => ({ sort: normalizeForSearch(w.books[0].titleKana || w.workTitle), el: () => workRow(w) })),
      ...singles.map(b => ({ sort: normalizeForSearch(b.titleKana || b.title), el: () => bookRow(b) })),
    ];
    if (state.order === 'kana') items.sort((a, b) => a.sort.localeCompare(b.sort, 'ja'));
    return items;
  }

  let currentRows = [];
  let currentBooks = [];
  let drawn = 0;
  function renderList() {
    if (!currentRows.length) {
      fill(list, h('li', { class: 'empty' }, icon('books'), h('p', {}, books.length ? 'この条件の本はありません' : '本棚は空です'),
        books.length ? null : h('p', { class: 'small' }, '「読み取る」でバーコードを読むか、右下の＋から登録できます')));
      more.textContent = '';
      return;
    }
    fill(list, ...currentRows.slice(0, shown).map(r => r.el()));
    drawn = Math.min(shown, currentRows.length);
    more.textContent = currentRows.length > shown ? 'さらに読み込み中…' : '';
  }

  // Scrolling further adds the next page under the list; the rows already drawn stay as they are.
  function appendMore() {
    const next = currentRows.slice(drawn, shown);
    list.append(...next.map(r => r.el()));
    drawn += next.length;
    more.textContent = currentRows.length > shown ? 'さらに読み込み中…' : '';
  }

  function render() {
    if (disposed) return;
    const filtered = sortBooks(filterBooks(books, state, ctxFor()), state.order);
    currentBooks = filtered;
    currentRows = rows(filtered);
    renderFilters();
    renderActive();
    const orderLabel = SORTS.find(([v]) => v === state.order)?.[1] ?? '';
    fill(toolbar,
      h('span', { class: 'count' }, `${filtered.length}冊・${orderLabel}${state.view === 'works' ? '・作品でまとめ中' : ''}`));
    renderList();
  }

  const io = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting) && currentRows.length > shown) { shown += PAGE; appendMore(); }
  });
  io.observe(more);

  async function load() {
    [books, tags] = await Promise.all([db.allBooks(), db.allTags()]);
    settings = {
      staleRules: await db.staleRules(),
      lastBackupAt: await db.getSetting('lastBackupAt'),
    };
    if (disposed) return;
    renderBanners();
    render();
  }

  let reloadTimer = null;
  // Background lookups finish one book at a time: swap that book in memory instead of reloading every book.
  const off = lookup.onUpdate(updated => {
    const i = books.findIndex(b => b.id === updated.id);
    if (i >= 0) books[i] = updated; else books.push(updated);
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => { if (!disposed) render(); }, 800);
  });

  const filterBtn = h('button', { class: 'round-btn', 'aria-label': '絞り込み', onClick: openFilterSheet }, icon('filter'));
  const sortBtn = h('button', { class: 'round-btn', 'aria-label': '並び替え', onClick: openSortSheet }, icon('sort'));
  container.append(
    h('div', { class: 'shelf-top' }, h('div', { class: 'search-row with-icon' }, icon('search'), search), filterBtn, sortBtn),
    banners, filters, active, toolbar, list, more, fab);
  load();

  return () => {
    disposed = true;
    off();
    io.disconnect();
    clearTimeout(timer);
    clearTimeout(reloadTimer);
  };
}
