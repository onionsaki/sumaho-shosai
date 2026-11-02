// Book detail sheet (spec §4-4).

import { h, fill, sheet, toast, confirmDialog, segmented, formatDate } from './dom.js';
import { coverEl, displayTitle } from './shelf.js';
import { LABELS, newBook, todayStr } from '../core/model.js';
import { toIsbn13, isMagazineCode, magazineBase, magazineKey } from '../core/isbn.js';
import { workKeyOf } from '../core/volume.js';
import { pickSeriesVolumes } from '../core/series.js';
import { normalizeForSearch } from '../core/normalize.js';
import { icon } from './icons.js';
import { pickPhoto } from './photo.js';
import { withSections, wrapLink, randomPrompt } from '../core/memo.js';
import { classify } from '../core/ndc.js';
import { connectedBooks } from '../core/links.js';
import { seriesVolume } from '../core/editions.js';
import { newWish, openWishesFor } from '../core/wish.js';

const OWNERSHIP_OPTIONS = Object.entries(LABELS.ownership);
const READ_OPTIONS = Object.entries(LABELS.read);
const FORMAT_OPTIONS = Object.entries(LABELS.format);

const yearMonth = ym => (/^\d{4}-\d{2}$/.test(ym ?? '') ? `${ym.slice(0, 4)}年${Number(ym.slice(5))}月` : ym || '発行年不明');

// 新しい版を確かめる: asks NDL and keeps the newest other edition (or null) on the book with the day it was checked.
// Used from the book detail and from 設定 (all 古いかも books at once).
export async function checkNewerEdition(book, { db, lookup }) {
  const list = await lookup.searchNewerEditions(book);
  const n = list[0];
  const newerEdition = n ? { isbn: n.isbn, title: n.title, issued: n.issued, edition: n.edition || (/版/.test(n.volumeLabel ?? '') ? n.volumeLabel : ''), pages: n.pages ?? null, publisher: n.publisher ?? '' } : null;
  const latest = (await db.getBook(book.id)) ?? book;
  return db.putBook({ ...latest, newerEdition, editionCheckedAt: todayStr() });
}

export function newerEditionText(book) {
  const n = book.newerEdition;
  if (!n) return '';
  const pages = n.pages && book.pages ? `${n.pages}ページ（この本は${book.pages}ページ）` : n.pages ? `${n.pages}ページ` : '';
  return [`${yearMonth(n.issued)}${n.edition ? `・${n.edition}` : ''}`, pages].filter(Boolean).join('　');
}

export async function openDetail(bookId, ctx) {
  const { db, lookup } = ctx;
  let book = await db.getBook(bookId);
  if (!book) { toast('この本は見つかりませんでした'); return; }
  let tags = await db.allTags();
  let changed = false;
  const content = h('div');
  const s = sheet(content, { title: '本の詳細', thumbClose: true });
  s.onClose(() => { off(); if (changed) ctx.refresh(); });

  // Apply a patch to the latest saved copy so background lookups are never overwritten.
  async function save(patch) {
    const latest = (await db.getBook(bookId)) ?? book;
    book = await db.putBook({ ...latest, ...patch });
    changed = true;
    return book;
  }

  const off = lookup.onUpdate(updated => {
    if (updated.id !== bookId) return;
    book = updated;
    renderHead();
  });

  const head = h('div');
  function renderHead() {
    const kv = [
      [book.publisher, book.issued && book.issued.replace('-', '年') + (book.issued.includes('-') ? '月' : '年')].filter(Boolean).join('・'),
      [book.pages ? `${book.pages}ページ` : '', book.price ? `${book.price.toLocaleString()}円` : ''].filter(Boolean).join('・'),
      book.isbn ? `ISBN ${book.isbn}` : 'ISBNなし',
      classify(book.ndc) ? `分類 ${classify(book.ndc).name}（${book.ndc}）` : '',
    ].filter(Boolean);
    const status = book.lookup === 'pending' ? '本の情報を取得中です'
      : book.lookup === 'not_found' && isMagazineCode(book.isbn) ? '楽天に載っていない号でした。「情報を直す」で雑誌名を入れると、同じ雑誌の別の号もその名前で登録されます'
      : book.lookup === 'not_found' ? '本の情報が見つかりませんでした。「情報を直す」で入力できます' : '';
    fill(head, h('div', { class: 'detail-head' },
      h('button', { class: 'cover-wrap', 'aria-label': '写真を撮って表紙にする', onClick: takePhoto },
        coverEl(book, true), h('span', { class: 'cam' }, icon('camera'))),
      h('div', { class: 'detail-main' },
        h('button', { class: book.favorite ? 'fav-btn on' : 'fav-btn', 'aria-label': book.favorite ? 'お気に入りを外す' : 'お気に入りにする', 'aria-pressed': String(!!book.favorite),
          onClick: async () => { await save({ favorite: !book.favorite }); renderHead(); } }, icon('star')),
        h('div', { class: 'title' }, displayTitle(book)),
        h('div', {}, (book.authors ?? []).join('、')),
        ...kv.map(t => h('div', { class: 'kv' }, t)),
        book.format === 'ebook' ? h('span', { class: 'badge ebook' }, '電子') : null,
        status ? h('div', { class: 'small', style: { color: 'var(--warn)', marginTop: '4px' } }, status) : null)));
  }

  // Tap the cover to use a photo of the book itself (no barcode, no cover found, or a record before giving it away).
  async function takePhoto() {
    const shoot = async () => {
      const photo = await pickPhoto();
      if (!photo) return;
      await db.putPhoto(book.id, photo);
      book = await db.getBook(book.id);
      changed = true;
      renderHead();
      toast('写真を表紙にしました');
    };
    if (!book.hasPhoto) { shoot(); return; }
    const menu = sheet(h('div', { class: 'row-buttons' },
      h('button', { class: 'btn', onClick: async () => { menu.close(); await db.deletePhoto(book.id); book = await db.getBook(book.id); changed = true; renderHead(); } }, '写真を外す'),
      h('button', { class: 'btn primary', onClick: () => { menu.close(); shoot(); } }, '撮り直す')), { title: '表紙の写真' });
  }

  const tagRow = h('div', { class: 'chips' });
  function renderTags() {
    const byId = new Map(tags.map(t => [t.id, t]));
    fill(tagRow, 
      ...book.tagIds.map(id => byId.get(id)).filter(Boolean).map(t => h('button', {
        class: 'chip on', 'aria-label': `${t.name}を外す`,
        onClick: async () => { await save({ tagIds: book.tagIds.filter(x => x !== t.id) }); renderTags(); },
      }, `${t.name} ×`)),
      h('button', { class: 'chip ghost', onClick: openTagSheet }, book.tagIds.length ? '＋' : 'タグ未選択'));
  }

  function openTagSheet() {
    const input = h('input', { type: 'text', placeholder: 'タグを探す・新しく作る' });
    const listEl = h('div', { class: 'chips', style: { marginTop: '10px' } });
    const draw = () => {
      const q = normalizeForSearch(input.value);
      const hits = tags.filter(t => !q || normalizeForSearch(t.name).includes(q));
      const exact = tags.some(t => normalizeForSearch(t.name) === q);
      fill(listEl, 
        ...hits.map(t => h('button', {
          class: book.tagIds.includes(t.id) ? 'chip on' : 'chip',
          onClick: async () => {
            const next = book.tagIds.includes(t.id) ? book.tagIds.filter(x => x !== t.id) : [...book.tagIds, t.id];
            await save({ tagIds: next }); draw(); renderTags();
          },
        }, t.name)),
        q && !exact ? h('button', { class: 'chip', onClick: async () => {
          const tag = await db.createTag(input.value);
          tags = await db.allTags();
          if (!book.tagIds.includes(tag.id)) await save({ tagIds: [...book.tagIds, tag.id] });
          input.value = ''; draw(); renderTags();
        } }, `「${input.value.trim()}」を作る`) : null);
    };
    input.addEventListener('input', draw);
    draw();
    sheet(h('div', {}, input, listEl), { title: 'タグ' });
  }

  const memo = h('textarea', { placeholder: randomPrompt(), value: book.memo });
  let memoTimer = null;
  const saveMemo = () => { clearTimeout(memoTimer); if (memo.value !== book.memo) save({ memo: memo.value }); };
  memo.addEventListener('input', () => { clearTimeout(memoTimer); memoTimer = setTimeout(saveMemo, 500); });
  memo.addEventListener('blur', saveMemo);
  // A memo written with the headings is long: show it whole instead of a small scrolling box.
  const fitMemo = () => {
    if (!memo.value.includes('■') || !memo.isConnected) return;
    memo.style.height = 'auto';
    memo.style.height = `${memo.scrollHeight + 4}px`;
  };
  memo.addEventListener('input', fitMemo);
  // 問いで書く: the expectation written in 欲しい本 comes along under 期待との差.
  async function addSections() {
    const wish = (await db.allWishes()).find(w => w.bookId === book.id || (book.isbn && w.isbn === book.isbn));
    const next = withSections(memo.value, wish?.expect ?? '');
    if (next === memo.value.replace(/\s+$/, '')) { toast('見出しはもう入っています'); return; }
    memo.value = `${next}\n`;
    saveMemo();
    // Cursor goes under the first heading that has nothing written yet.
    const empty = memo.value.search(/■[^\n]*\n(?=\n|■|$)/);
    const at = empty < 0 ? memo.value.length : memo.value.indexOf('\n', empty) + 1;
    fitMemo();
    memo.focus({ preventScroll: true });
    memo.setSelectionRange(at, at);
    memo.scrollTop = 0;
  }
  // [[ ]]で囲む: the word picked in the memo becomes a link for the graph view. pointerdown keeps the
  // keyboard and the selection, which a normal click would take away from the memo.
  function addLink() {
    const { text, cursor } = wrapLink(memo.value, memo.selectionStart, memo.selectionEnd);
    memo.value = text;
    saveMemo();
    fitMemo();
    memo.focus({ preventScroll: true });
    memo.setSelectionRange(cursor, cursor);
    renderLinks();
  }
  // つながる本: other books whose memos share a [[ ]] word. Redrawn when the memo is left or a word is wrapped.
  const links = h('div', { class: 'links' });
  async function renderLinks() {
    const groups = connectedBooks({ ...book, memo: memo.value }, await db.allBooks());
    if (!groups.length) { fill(links); return; }
    fill(links,
      h('div', { class: 'section-title' }, 'つながる本'),
      ...groups.map(({ word, books }) => h('div', { class: 'link-group' },
        h('span', { class: 'link-word' }, `[[${word}]]`),
        books.length
          ? h('div', { class: 'chips link-books' }, ...books.map(b => h('button', { class: 'chip link-book', onClick: () => ctx.openDetail(b.id) }, displayTitle(b))))
          : h('span', { class: 'small muted' }, 'ほかの本にはまだありません'))));
  }
  memo.addEventListener('blur', renderLinks);
  // 新しい版: what was found the last time it was checked, and the button to check (again).
  const edition = h('div', { class: 'edition-box' });
  const canCheckEdition = () => book.title && seriesVolume(book) === null && !isMagazineCode(book.isbn ?? '');
  function renderEdition(status = '') {
    if (!canCheckEdition()) { fill(edition); return; }
    const n = book.newerEdition;
    fill(edition,
      n ? h('div', { class: 'edition-found' },
        h('div', { class: 'edition-head' }, '新しい版が出ています'),
        h('div', {}, newerEditionText(book)),
        n.title !== book.title ? h('div', { class: 'small muted' }, n.title) : null,
        h('button', { class: 'link-btn', onClick: addEditionWish }, '欲しい本に入れる'))
        : book.editionCheckedAt ? h('p', { class: 'small muted' }, `新しい版は見つかりませんでした（${formatDate(book.editionCheckedAt)}に確認）`) : null,
      h('button', { class: 'btn wide', style: { marginTop: '8px' }, onClick: checkEdition }, '新しい版を確かめる'),
      status ? h('p', { class: 'small muted' }, status) : null);
  }
  async function checkEdition() {
    renderEdition('国立国会図書館で同じ書名の本を探しています…');
    try {
      book = await checkNewerEdition(book, ctx);
      changed = true;
      renderEdition();
    } catch (err) {
      renderEdition(err.message === 'offline' ? '電波がないため確かめられません。電波のある場所でもう一度押してください。' : 'うまく探せませんでした。少し時間をおいてもう一度押してください。');
    }
  }
  async function addEditionWish() {
    const n = book.newerEdition;
    if (openWishesFor(await db.allWishes(), n.isbn).length) { toast('欲しい本にもう入っています'); return; }
    await db.putWish(newWish({ isbn: n.isbn, title: n.title, author: (book.authors ?? []).join('、'),
      expect: `新しい版（持っているのは${yearMonth(book.issued)}の版）` }));
    toast('欲しい本に入れました');
  }
  s.onClose(saveMemo);

  // Yomoo-style line: reading state on the left, the day it was registered on the right (鬼さん 2026-10-24: 読んだ日→登録した日).
  const stateLine = h('div', { class: 'state-line' });
  const dates = h('div');
  function renderDates() {
    const registered = h('input', { type: 'date', 'aria-label': '登録した日', value: todayStr(new Date(book.createdAt)) });
    registered.addEventListener('change', () => {
      if (registered.value) save({ createdAt: new Date(`${registered.value}T12:00:00`).toISOString() });
    });
    fill(stateLine,
      h('div', { class: 'item' }, icon('open'), LABELS.read[book.readStatus]),
      h('label', { class: 'item' }, icon('calendar'), h('span', { class: 'muted', style: { fontWeight: '400', fontSize: '11px', lineHeight: '1.2' } }, '登録した日'), registered));
    const released = h('input', { type: 'date', value: book.releasedAt });
    released.addEventListener('change', () => save({ releasedAt: released.value }));
    fill(dates, book.ownership === 'released' || book.releasedAt
      ? h('label', { class: 'field' }, h('span', {}, '手放した日'), released) : null);
  }

  function openEdit() {
    const f = {};
    const field = (label, key, value, attrs = {}) => {
      f[key] = h('input', { type: 'text', value: value ?? '', ...attrs });
      return h('label', { class: 'field' }, h('span', {}, label), f[key]);
    };
    let format = book.format;
    const msg = h('p', { class: 'small', style: { color: 'var(--danger)' } });
    const form = h('div', {},
      field('書名', 'title', book.title),
      field('書名の読み（カタカナ）', 'titleKana', book.titleKana),
      field('著者（複数なら「、」で区切る）', 'authors', (book.authors ?? []).join('、')),
      field('出版社', 'publisher', book.publisher),
      h('div', { class: 'field-row' },
        field('発行年月（例 2016-06）', 'issued', book.issued),
        field('ISBN', 'isbn', book.isbn ?? '', { inputmode: 'numeric' })),
      h('div', { class: 'field-row' },
        field('ページ数', 'pages', book.pages ?? '', { inputmode: 'numeric' }),
        field('定価（円）', 'price', book.price ?? '', { inputmode: 'numeric' })),
      h('div', { class: 'field-row' },
        field('作品名（続き物のまとめ先）', 'workTitle', book.workTitle),
        field('巻', 'volume', book.volume ?? '', { inputmode: 'numeric' })),
      h('div', { class: 'section-title' }, '種類'),
      segmented(FORMAT_OPTIONS, format, v => { format = v; }),
      msg,
      h('button', { class: 'btn primary wide', style: { marginTop: '12px' }, onClick: async () => {
        const rawIsbn = f.isbn.value.trim();
        const digits = rawIsbn.normalize('NFKC').replace(/[\s-]/g, '');
        const isbn = rawIsbn ? (toIsbn13(rawIsbn) ?? (isMagazineCode(digits) ? digits : null)) : ''; // magazines keep their 491… code
        if (rawIsbn && !isbn) { msg.textContent = 'ISBNの数字が正しくありません'; return; }
        if (isbn && isbn !== book.isbn) {
          const other = await db.getBookByIsbn(isbn);
          if (other && other.id !== book.id) { msg.textContent = 'このISBNの本はもう登録されています'; return; }
        }
        if (!f.title.value.trim()) { msg.textContent = '書名を入れてください'; return; }
        const num = el => (el.value.trim() === '' || Number.isNaN(Number(el.value.normalize('NFKC'))) ? null : Number(el.value.normalize('NFKC')));
        const authors = f.authors.value.split('、').map(x => x.trim()).filter(Boolean);
        const title = f.title.value.trim();
        const magazine = isMagazineCode(isbn);
        // A magazine's 作品名 is the magazine itself, so every issue groups together and later issues can borrow it.
        const workTitle = f.workTitle.value.trim() || (magazine ? magazineBase(title) : '');
        await save({
          title, titleKana: f.titleKana.value.trim(), authors, publisher: f.publisher.value.trim(),
          issued: f.issued.value.trim(), isbn, pages: num(f.pages), price: num(f.price), workTitle,
          volume: num(f.volume), format, workKey: magazine ? magazineKey(isbn) : workKeyOf(workTitle || title, authors),
          // A book fixed by hand leaves あとで確認.
          lookup: book.lookup === 'not_found' || (book.lookup === 'pending' && !isbn) ? 'manual' : book.lookup,
        });
        if (magazine && workTitle) {
          for (const other of await db.booksByWorkKey(magazineKey(isbn))) {
            if (other.id !== book.id && other.lookup === 'not_found') lookup.refetch(other.id);
          }
        }
        editSheet.close();
        render();
      } }, '保存する'));
    const editSheet = sheet(form, { title: '情報を直す', thumbClose: true });
    editSheet.setAction('保存', () => form.querySelector('.btn.primary').click());
  }

  async function addNextVolume() {
    const next = (book.volume ?? 0) + 1;
    const workTitle = book.workTitle || book.title;
    const created = await db.putBook(newBook({
      title: `${workTitle} ${next}`, workTitle, workKey: book.workKey || workKeyOf(workTitle, book.authors),
      authors: [...(book.authors ?? [])], authorsKana: [...(book.authorsKana ?? [])], publisher: book.publisher,
      tagIds: [...book.tagIds], format: book.format, ownership: book.ownership, readStatus: book.readStatus,
      readAt: book.readStatus === 'read' ? todayStr() : '', volume: next, lookup: 'manual',
    }));
    changed = true;
    toast(`${next}巻を追加しました`);
    s.close();
    openDetail(created.id, ctx);
  }

  // 「この作品の既刊を探す」: the volumes NDL knows that are not registered yet, added as 持っていない after a check.
  async function findSeries() {
    const status = h('p', { class: 'muted' }, '国立国会図書館で探しています…（巻数の多い作品は20秒ほどかかります）');
    const body = h('div', {}, status);
    const listSheet = sheet(body, { title: 'この作品の既刊', thumbClose: true });
    const workTitle = book.workTitle || book.title;
    const siblings = await db.booksByWorkKey(book.workKey);
    let items;
    try {
      items = await lookup.searchSeries({ title: workTitle, author: book.authors?.[0] ?? '', publisher: book.publisher });
    } catch (err) {
      status.textContent = err.message === 'offline' ? '電波がないため探せません。電波のある場所でもう一度押してください。' : 'うまく探せませんでした。少し時間をおいてもう一度押してください。';
      return;
    }
    const vols = pickSeriesVolumes(items, {
      workKey: book.workKey,
      refIsbns: siblings.map(b => b.isbn).filter(Boolean),
      haveVolumes: new Set(siblings.map(b => b.volume).filter(v => v !== null && v !== undefined)),
      haveIsbns: new Set(siblings.map(b => b.isbn).filter(Boolean)),
    });
    if (!vols.length) {
      status.textContent = 'まだ登録していない巻は見つかりませんでした。出たばかりの巻は、国立国会図書館に載るまで少しかかることがあります。';
      return;
    }
    const picked = new Set(vols.map(v => v.volume));
    // Each volume can go in as 持っている or 持っていない (鬼さん 2026-11-01: one by one, not two buttons).
    const owned = new Set();
    const submit = h('button', { class: 'btn primary wide', style: { marginTop: '16px' } });
    const updateSubmit = () => {
      const n = [...picked].filter(v => owned.has(v)).length;
      submit.textContent = `選んだ${picked.size}冊を登録（持っている ${n}冊・持っていない ${picked.size - n}冊）`;
      submit.disabled = !picked.size;
    };
    const rows = vols.map(v => {
      const box = h('input', { type: 'checkbox', checked: true });
      box.addEventListener('change', () => { if (box.checked) picked.add(v.volume); else picked.delete(v.volume); updateSubmit(); });
      const toggle = h('button', { class: 'own-toggle', onClick: e => {
        e.preventDefault();
        if (owned.has(v.volume)) owned.delete(v.volume); else owned.add(v.volume);
        toggle.textContent = owned.has(v.volume) ? '持っている' : '持っていない';
        toggle.classList.toggle('on', owned.has(v.volume));
        updateSubmit();
      } }, '持っていない');
      return h('li', { class: 'series-row' }, h('label', { class: 'check-row' }, box,
        h('span', { class: 'check-title' }, `${v.volume}巻`),
        h('span', { class: 'muted small' }, formatDate(v.issued) || '')), toggle);
    });
    const setAll = on => {
      for (const li of rows) li.querySelector('input').checked = on;
      picked.clear();
      if (on) vols.forEach(v => picked.add(v.volume));
      updateSubmit();
    };
    submit.addEventListener('click', async () => {
      submit.disabled = true;
      let n = 0;
      for (const v of vols.filter(x => picked.has(x.volume))) {
        await db.putBook(newBook({
          isbn: v.isbn, title: v.title.replace(/\s+=\s+.*$/, ''), titleKana: v.titleKana,
          authors: [...v.authors], authorsKana: [...v.authorsKana], publisher: v.publisher, issued: v.issued,
          pages: v.pages, price: v.price, volume: v.volume, volumeLabel: v.volumeLabel,
          workTitle, workKey: book.workKey, tagIds: [...book.tagIds],
          ownership: owned.has(v.volume) ? 'owned' : 'not_owned', readStatus: 'unread', lookup: 'ok',
        }));
        n++;
      }
      changed = true;
      toast(`${n}冊を登録しました`);
      listSheet.close();
    });
    updateSubmit();
    fill(body,
      h('p', {}, `まだ登録していない巻が${vols.length}冊あります。持っている巻は、右のボタンを押して「持っている」に切り替えてから登録してください。`),
      h('div', { class: 'row-buttons' },
        h('button', { class: 'btn', onClick: () => setAll(true) }, '全部選ぶ'),
        h('button', { class: 'btn', onClick: () => setAll(false) }, '全部外す')),
      h('ul', { class: 'check-list' }, rows),
      submit);
  }

  function render() {
    renderHead();
    renderTags();
    renderDates();
    renderLinks();
    renderEdition();
    fill(content,
      head,
      h('div', { class: 'tag-line' }, icon('tag'), tagRow),
      h('div', { style: { height: '18px' } }),
      memo,
      h('div', { class: 'memo-tools' },
        h('button', { class: 'link-btn', onClick: addSections }, '問いで書く'),
        h('button', { class: 'link-btn', onPointerdown: e => e.preventDefault(), onClick: addLink }, '[[ ]]でつなぐ')),
      h('div', { class: 'memo-purpose small muted' },
        h('div', {}, '問いで書く：答えるだけで、読み返せるメモに'),
        h('div', {}, '[[ ]]でつなぐ：同じ言葉の本どうしがつながる')),
      links,
      stateLine,
      h('div', { class: 'section-title' }, '持っているか'),
      segmented(OWNERSHIP_OPTIONS, book.ownership, async v => {
        await save({ ownership: v, releasedAt: v === 'released' && !book.releasedAt ? todayStr() : book.releasedAt });
        renderDates();
      }),
      h('div', { class: 'section-title' }, '読んだか'),
      segmented(READ_OPTIONS, book.readStatus, async v => {
        await save({ readStatus: v, readAt: v === 'read' && !book.readAt ? todayStr() : book.readAt });
        renderDates();
      }),
      dates,
      h('div', { class: 'row-buttons', style: { marginTop: '22px' } },
        h('button', { class: 'btn', onClick: openEdit }, '情報を直す'),
        h('button', { class: 'btn', disabled: !book.isbn, onClick: () => { lookup.refetch(book.id); toast('本の情報を取り直しています'); } }, '本の情報を取り直す')),
      book.lookup === 'manual' ? h('button', { class: 'btn wide', style: { marginTop: '8px' }, onClick: addNextVolume }, 'この作品の次の巻を追加') : null,
      book.volume !== null && book.volume !== undefined && book.workKey && !isMagazineCode(book.isbn ?? '')
        ? h('button', { class: 'btn wide', style: { marginTop: '8px' }, onClick: findSeries }, 'この作品の既刊を探す') : null,
      edition,
      h('button', { class: 'btn danger wide', style: { marginTop: '16px' }, onClick: async () => {
        if (!(await confirmDialog(`「${displayTitle(book)}」を削除します。元に戻せません。`, '削除する'))) return;
        await db.deleteBook(book.id);
        changed = true;
        toast('削除しました');
        s.close();
      } }, '削除'),
    );
    fitMemo();
  }
  render();
}
