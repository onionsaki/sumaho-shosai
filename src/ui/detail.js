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

const OWNERSHIP_OPTIONS = Object.entries(LABELS.ownership);
const READ_OPTIONS = Object.entries(LABELS.read);
const FORMAT_OPTIONS = Object.entries(LABELS.format);

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
    ].filter(Boolean);
    const status = book.lookup === 'pending' ? '本の情報を取得中です'
      : book.lookup === 'not_found' && isMagazineCode(book.isbn) ? '楽天に載っていない号でした。「情報を直す」で雑誌名を入れると、同じ雑誌の別の号もその名前で登録されます'
      : book.lookup === 'not_found' ? '本の情報が見つかりませんでした。「情報を直す」で入力できます' : '';
    fill(head, h('div', { class: 'detail-head' },
      h('button', { class: 'cover-wrap', 'aria-label': '写真を撮って表紙にする', onClick: takePhoto },
        coverEl(book, true), h('span', { class: 'cam' }, icon('camera'))),
      h('div', {},
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

  const memo = h('textarea', { placeholder: 'メモ（なぜ買ったか、活かせるところ、感想など）', value: book.memo });
  let memoTimer = null;
  const saveMemo = () => { clearTimeout(memoTimer); if (memo.value !== book.memo) save({ memo: memo.value }); };
  memo.addEventListener('input', () => { clearTimeout(memoTimer); memoTimer = setTimeout(saveMemo, 500); });
  memo.addEventListener('blur', saveMemo);
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
    const submit = h('button', { class: 'btn primary wide', style: { marginTop: '16px' } });
    const updateSubmit = () => {
      submit.textContent = `選んだ${picked.size}冊を「持っていない」で登録`;
      submit.disabled = !picked.size;
    };
    const rows = vols.map(v => {
      const box = h('input', { type: 'checkbox', checked: true });
      box.addEventListener('change', () => { if (box.checked) picked.add(v.volume); else picked.delete(v.volume); updateSubmit(); });
      return h('li', {}, h('label', { class: 'check-row' }, box,
        h('span', { class: 'check-title' }, `${v.volume}巻`),
        h('span', { class: 'muted small' }, formatDate(v.issued) || '')));
    });
    const setAll = on => {
      for (const li of rows) li.querySelector('input').checked = on;
      picked.clear();
      if (on) vols.forEach(v => picked.add(v.volume));
      updateSubmit();
    };
    submit.addEventListener('click', async () => {
      submit.disabled = true;
      for (const v of vols.filter(x => picked.has(x.volume))) {
        await db.putBook(newBook({
          isbn: v.isbn, title: v.title.replace(/\s+=\s+.*$/, ''), titleKana: v.titleKana,
          authors: [...v.authors], authorsKana: [...v.authorsKana], publisher: v.publisher, issued: v.issued,
          pages: v.pages, price: v.price, volume: v.volume, volumeLabel: v.volumeLabel,
          workTitle, workKey: book.workKey, tagIds: [...book.tagIds],
          ownership: 'not_owned', readStatus: 'unread', lookup: 'ok',
        }));
      }
      changed = true;
      toast(`${picked.size}冊を「持っていない」で登録しました`);
      listSheet.close();
    });
    updateSubmit();
    fill(body,
      h('p', {}, `まだ登録していない巻が${vols.length}冊あります。持っていない巻にチェックを付けたまま登録してください。`),
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
    fill(content,
      head,
      h('div', { class: 'tag-line' }, icon('tag'), tagRow),
      h('div', { style: { height: '18px' } }),
      memo,
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
      h('button', { class: 'btn danger wide', style: { marginTop: '16px' }, onClick: async () => {
        if (!(await confirmDialog(`「${displayTitle(book)}」を削除します。元に戻せません。`, '削除する'))) return;
        await db.deleteBook(book.id);
        changed = true;
        toast('削除しました');
        s.close();
      } }, '削除'),
    );
  }
  render();
}
