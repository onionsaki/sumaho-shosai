// Book detail sheet (spec §4-4).

import { h, fill, sheet, toast, confirmDialog, segmented, formatDate } from './dom.js';
import { coverEl, displayTitle } from './shelf.js';
import { LABELS, newBook, todayStr } from '../core/model.js';
import { toIsbn13 } from '../core/isbn.js';
import { workKeyOf } from '../core/volume.js';
import { normalizeForSearch } from '../core/normalize.js';

const OWNERSHIP_OPTIONS = Object.entries(LABELS.ownership);
const READ_OPTIONS = [['unread', 'まだ'], ['reading', '読書中'], ['read', '読んだ']];
const FORMAT_OPTIONS = Object.entries(LABELS.format);

export async function openDetail(bookId, ctx) {
  const { db, lookup } = ctx;
  let book = await db.getBook(bookId);
  if (!book) { toast('この本は見つかりませんでした'); return; }
  let tags = await db.allTags();
  let changed = false;
  const content = h('div');
  const s = sheet(content, { title: '本の詳細' });
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
      `登録した日 ${formatDate(todayStr(new Date(book.createdAt)))}`,
    ].filter(Boolean);
    const status = book.lookup === 'pending' ? '本の情報を取得中です' : book.lookup === 'not_found' ? '本の情報が見つかりませんでした。「情報を直す」で入力できます' : '';
    fill(head, h('div', { class: 'detail-head' },
      coverEl(book, true),
      h('div', {},
        h('div', { class: 'title' }, displayTitle(book)),
        h('div', {}, (book.authors ?? []).join('、')),
        ...kv.map(t => h('div', { class: 'kv' }, t)),
        book.format === 'ebook' ? h('span', { class: 'badge ebook' }, '電子') : null,
        status ? h('div', { class: 'small', style: { color: 'var(--warn)', marginTop: '4px' } }, status) : null)));
  }

  const tagRow = h('div', { class: 'chips' });
  function renderTags() {
    const byId = new Map(tags.map(t => [t.id, t]));
    fill(tagRow, 
      ...book.tagIds.map(id => byId.get(id)).filter(Boolean).map(t => h('button', {
        class: 'chip on', 'aria-label': `${t.name}を外す`,
        onClick: async () => { await save({ tagIds: book.tagIds.filter(x => x !== t.id) }); renderTags(); },
      }, `${t.name} ×`)),
      h('button', { class: 'chip', onClick: openTagSheet }, '＋ タグ'));
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

  const memo = h('textarea', { placeholder: 'なぜ買ったか、活かせるところ、感想など', value: book.memo });
  let memoTimer = null;
  const saveMemo = () => { clearTimeout(memoTimer); if (memo.value !== book.memo) save({ memo: memo.value }); };
  memo.addEventListener('input', () => { clearTimeout(memoTimer); memoTimer = setTimeout(saveMemo, 500); });
  memo.addEventListener('blur', saveMemo);
  s.onClose(saveMemo);

  const dates = h('div');
  function renderDates() {
    const dateField = (label, key) => {
      const input = h('input', { type: 'date', value: book[key] });
      input.addEventListener('change', () => save({ [key]: input.value }));
      return h('label', { class: 'field' }, h('span', {}, label), input);
    };
    fill(dates, h('div', { class: 'field-row' },
      book.readStatus === 'read' || book.readAt ? dateField('読んだ日', 'readAt') : h('div'),
      book.ownership === 'released' || book.releasedAt ? dateField('手放した日', 'releasedAt') : h('div')));
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
        const isbn = rawIsbn ? toIsbn13(rawIsbn) : '';
        if (rawIsbn && !isbn) { msg.textContent = 'ISBNの数字が正しくありません'; return; }
        if (isbn && isbn !== book.isbn) {
          const other = await db.getBookByIsbn(isbn);
          if (other && other.id !== book.id) { msg.textContent = 'このISBNの本はもう登録されています'; return; }
        }
        if (!f.title.value.trim()) { msg.textContent = '書名を入れてください'; return; }
        const num = el => (el.value.trim() === '' || Number.isNaN(Number(el.value.normalize('NFKC'))) ? null : Number(el.value.normalize('NFKC')));
        const authors = f.authors.value.split('、').map(x => x.trim()).filter(Boolean);
        const workTitle = f.workTitle.value.trim();
        const title = f.title.value.trim();
        await save({
          title, titleKana: f.titleKana.value.trim(), authors, publisher: f.publisher.value.trim(),
          issued: f.issued.value.trim(), isbn, pages: num(f.pages), price: num(f.price), workTitle,
          volume: num(f.volume), format, workKey: workKeyOf(workTitle || title, authors),
          // A book fixed by hand leaves あとで確認.
          lookup: book.lookup === 'not_found' || (book.lookup === 'pending' && !isbn) ? 'manual' : book.lookup,
        });
        editSheet.close();
        render();
      } }, '保存する'));
    const editSheet = sheet(form, { title: '情報を直す' });
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

  function render() {
    renderHead();
    renderTags();
    renderDates();
    fill(content, 
      head,
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
      h('div', { class: 'section-title' }, 'タグ'),
      tagRow,
      h('div', { class: 'section-title' }, 'メモ'),
      memo,
      h('div', { class: 'row-buttons', style: { marginTop: '8px' } },
        h('button', { class: 'btn', onClick: openEdit }, '情報を直す'),
        h('button', { class: 'btn', disabled: !book.isbn, onClick: () => { lookup.refetch(book.id); toast('本の情報を取り直しています'); } }, '本の情報を取り直す')),
      book.lookup === 'manual' ? h('button', { class: 'btn wide', style: { marginTop: '8px' }, onClick: addNextVolume }, 'この作品の次の巻を追加') : null,
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
