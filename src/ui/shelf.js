// 本棚 tab: search, filters, book and work views (spec §4-3).

import { h, fill, downloadText } from './dom.js';
import { openTagPicker as pickTags } from './tags.js';
import { filterBooks, sortBooks } from '../core/search.js';
import { isStale } from '../core/stale.js';
import { groupWorks } from '../core/series.js';
import { booksToCsv, csvFileName } from '../core/csv.js';
import { shouldRemindBackup } from '../core/backup.js';
import { normalizeForSearch } from '../core/normalize.js';
import { LABELS, todayStr } from '../core/model.js';

const PAGE = 200;

// Kept across tab switches during one visit.
const state = {
  query: '', ownership: [], readStatus: [], tagIds: [], staleOnly: false, needsReviewOnly: false,
  view: 'books', order: 'kana',
};

export function coverEl(book, big = false) {
  const placeholder = () => h('div', { class: big ? 'cover big' : 'cover' }, (book.title || book.isbn || '？').slice(0, 8));
  if (!book.coverUrl) return placeholder();
  const img = h('img', { class: big ? 'cover big' : 'cover', src: book.coverUrl, alt: '', loading: 'lazy' });
  img.addEventListener('error', () => img.replaceWith(placeholder()));
  return img;
}

export function displayTitle(book) {
  const title = book.title || '（書名なし）';
  if (book.volume === null || book.volume === undefined) return title;
  return /\d\s*$/.test(title) ? title : `${title} ${book.volumeLabel && !/^巻/.test(book.volumeLabel) ? book.volumeLabel : `${book.volume}巻`}`;
}

export function mount(container, ctx) {
  const { db, lookup } = ctx;
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  if (params.get('review') === '1') { Object.assign(state, { needsReviewOnly: true, query: '' }); history.replaceState(null, '', '#shelf'); }

  let books = [];
  let tags = [];
  let settings = {};
  let shown = PAGE;
  let disposed = false;

  const search = h('input', { type: 'search', placeholder: '書名・著者・読み・メモで探す', value: state.query, enterkeyhint: 'search' });
  const banners = h('div');
  const filters = h('div', { class: 'filters' });
  const toolbar = h('div', { class: 'toolbar' });
  const list = h('ul', { class: 'book-list' });
  const more = h('div', { class: 'more' });
  const fab = h('button', { class: 'fab', 'aria-label': '本を追加', onClick: () => ctx.openAdd() }, '＋');

  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.query = search.value; shown = PAGE; render(); }, 150);
  });

  const ctxFor = () => ({ examTagId: settings.examTagId, staleYears: settings.staleYears, today: todayStr() });
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const anyFilter = () => state.ownership.length || state.readStatus.length || state.tagIds.length || state.staleOnly || state.needsReviewOnly;

  function renderFilters() {
    const chip = (label, on, onClick) => h('button', { class: on ? 'chip on' : 'chip', onClick }, label);
    const reviewCount = books.filter(b => b.lookup === 'not_found').length;
    const tagLabel = state.tagIds.length
      ? state.tagIds.map(id => tags.find(t => t.id === id)?.name).filter(Boolean).join('・')
      : 'タグ';
    fill(filters, 
      ...Object.entries(LABELS.ownership).map(([v, label]) => chip(label, state.ownership.includes(v), () => { state.ownership = toggle(state.ownership, v); render(); })),
      ...Object.entries(LABELS.read).map(([v, label]) => chip(label, state.readStatus.includes(v), () => { state.readStatus = toggle(state.readStatus, v); render(); })),
      chip(`${tagLabel} ▾`, state.tagIds.length > 0, openTagPicker),
      chip('古いかも', state.staleOnly, () => { state.staleOnly = !state.staleOnly; render(); }),
      reviewCount ? chip(`あとで確認 ${reviewCount}`, state.needsReviewOnly, () => { state.needsReviewOnly = !state.needsReviewOnly; render(); }) : null,
      anyFilter() ? chip('条件を外す', false, () => {
        Object.assign(state, { ownership: [], readStatus: [], tagIds: [], staleOnly: false, needsReviewOnly: false });
        render();
      }) : null,
    );
  }

  function openTagPicker() {
    pickTags({
      title: 'タグで絞り込む', tags, selected: state.tagIds, note: '選んだタグが全部付いている本を出します。',
      onToggle: id => { state.tagIds = toggle(state.tagIds, id); render(); },
    });
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
    if (isStale(book, settings.examTagId, settings.staleYears, todayStr())) badges.push(h('span', { class: 'badge stale' }, '古いかも'));
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
  function renderList() {
    fill(list, ...currentRows.slice(0, shown).map(r => r.el()));
    more.textContent = currentRows.length > shown ? 'さらに読み込み中…' : '';
  }

  function render() {
    if (disposed) return;
    const filtered = sortBooks(filterBooks(books, state, ctxFor()), state.order);
    currentRows = rows(filtered);
    renderFilters();
    fill(toolbar, 
      h('span', { class: 'count' }, `${filtered.length}冊`),
      h('div', { class: 'row-buttons', style: { flex: '0 0 auto' } },
        h('button', { class: 'chip', onClick: () => { state.view = state.view === 'books' ? 'works' : 'books'; render(); } },
          state.view === 'books' ? '作品でまとめる' : '1冊ずつ'),
        h('button', { class: 'chip', onClick: () => { state.order = state.order === 'kana' ? 'recent' : 'kana'; render(); } },
          state.order === 'kana' ? '五十音順' : '新しい順'),
        h('button', { class: 'chip', onClick: () => downloadText(csvFileName(todayStr()), booksToCsv(filtered, tags), 'text/csv') }, 'CSV')),
    );
    renderList();
  }

  const io = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting) && currentRows.length > shown) { shown += PAGE; renderList(); }
  });
  io.observe(more);

  async function load() {
    [books, tags] = await Promise.all([db.allBooks(), db.allTags()]);
    settings = {
      examTagId: await db.getSetting('examTagId'),
      staleYears: (await db.getSetting('staleYears')) ?? 2,
      lastBackupAt: await db.getSetting('lastBackupAt'),
    };
    if (disposed) return;
    renderBanners();
    render();
  }

  let reloadTimer = null;
  const off = lookup.onUpdate(() => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(load, 500);
  });

  container.append(h('div', { class: 'search-row' }, search), banners, filters, toolbar, list, more, fab);
  load();

  return () => {
    disposed = true;
    off();
    io.disconnect();
    clearTimeout(timer);
    clearTimeout(reloadTimer);
  };
}
