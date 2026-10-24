// Add without a barcode: title search, ISBN entry, manual entry (spec §4-5).

import { h, sheet, toast, segmented } from './dom.js';
import { LABELS, newBook, todayStr } from '../core/model.js';
import { toIsbn13 } from '../core/isbn.js';
import { workKeyOf } from '../core/volume.js';
import { normalizeForSearch } from '../core/normalize.js';
import { OfflineError } from '../lookup.js';

const READ_OPTIONS = [['unread', 'まだ'], ['reading', '読書中'], ['read', '読んだ']];

export function openAdd(ctx) {
  const { db, lookup } = ctx;
  const opts = { format: 'paper', ownership: 'owned', readStatus: 'unread' };
  const body = h('div');
  const s = sheet(h('div', {},
    segmented([['search', '書名で探す'], ['isbn', 'ISBNで登録'], ['manual', '手で入れる']], 'search', v => show(v)),
    h('div', { style: { height: '8px' } }),
    body), { title: '本を追加' });

  const options = () => h('div', {},
    h('div', { class: 'section-title' }, '紙か電子か'),
    segmented(Object.entries(LABELS.format), opts.format, v => { opts.format = v; }),
    h('div', { class: 'section-title' }, '持っているか'),
    segmented(Object.entries(LABELS.ownership), opts.ownership, v => { opts.ownership = v; }),
    h('div', { class: 'section-title' }, '読んだか'),
    segmented(READ_OPTIONS, opts.readStatus, v => { opts.readStatus = v; }));

  const stamp = () => ({
    format: opts.format, ownership: opts.ownership, readStatus: opts.readStatus,
    readAt: opts.readStatus === 'read' ? todayStr() : '',
    releasedAt: opts.ownership === 'released' ? todayStr() : '',
  });

  async function finish(book, { enqueue = false } = {}) {
    const saved = await db.putBook(book);
    if (enqueue) lookup.enqueue(saved.id);
    toast(`登録しました：${saved.title || saved.isbn}`);
    s.close();
    ctx.refresh();
    ctx.openDetail(saved.id);
  }

  async function openExisting(isbn) {
    const existing = await db.getBookByIsbn(isbn);
    if (!existing) return false;
    toast('登録済みです');
    s.close();
    ctx.openDetail(existing.id);
    return true;
  }

  function showSearch() {
    const title = h('input', { type: 'search', placeholder: '書名（一部でよい）', enterkeyhint: 'search' });
    const author = h('input', { type: 'text', placeholder: '著者（わかれば）' });
    const status = h('p', { class: 'muted small' });
    const results = h('ul', { class: 'list-plain' });
    const picked = h('div');
    const run = async () => {
      if (!title.value.trim()) { status.textContent = '書名を入れてください'; return; }
      status.textContent = '国立国会図書館に問い合わせています…（時間がかかることがあります）';
      results.replaceChildren();
      picked.replaceChildren();
      try {
        const items = await lookup.searchByTitle(title.value.trim(), author.value.trim());
        status.textContent = items.length ? `${items.length}件見つかりました。登録する本を選んでください` : '見つかりませんでした。「手で入れる」から登録できます';
        results.replaceChildren(...items.map(info => h('li', { class: 'result-item', onClick: () => pick(info) },
          h('div', { style: { fontWeight: '600' } }, info.volume !== null && !/\d\s*$/.test(info.title) ? `${info.title} ${info.volume}巻` : info.title),
          h('div', { class: 'small muted' }, [(info.authors ?? []).join('、'), info.publisher, info.issued].filter(Boolean).join('・')))));
      } catch (err) {
        status.textContent = err instanceof OfflineError ? '電波がないため探せません' : '国立国会図書館につながりませんでした。少し待ってからもう一度お試しください';
      }
    };
    const pick = info => {
      results.replaceChildren();
      status.textContent = '';
      picked.replaceChildren(h('div', { class: 'card' },
        h('div', { style: { fontWeight: '700' } }, info.title),
        h('div', { class: 'small muted' }, [(info.authors ?? []).join('、'), info.publisher, info.issued].filter(Boolean).join('・'))),
      options(),
      h('button', { class: 'btn primary wide', style: { marginTop: '14px' }, onClick: async () => {
        if (info.isbn && await openExisting(info.isbn)) return;
        await finish(newBook({
          ...info, ...stamp(), lookup: 'ok', workKey: workKeyOf(info.workTitle || info.title, info.authors),
        }), { enqueue: Boolean(info.isbn) }); // fills the cover from openBD
      } }, 'この本を登録する'));
    };
    title.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    body.replaceChildren(
      h('label', { class: 'field' }, h('span', {}, '書名'), title),
      h('label', { class: 'field' }, h('span', {}, '著者'), author),
      h('button', { class: 'btn primary wide', onClick: run }, '探す'),
      status, results, picked);
  }

  function showIsbn() {
    const input = h('input', { type: 'text', inputmode: 'numeric', placeholder: '978… または 10桁' });
    const status = h('p', { class: 'small muted' });
    body.replaceChildren(
      h('label', { class: 'field' }, h('span', {}, 'ISBN（ハイフンがあってもよい）'), input),
      options(),
      h('button', { class: 'btn primary wide', style: { marginTop: '14px' }, onClick: async () => {
        const isbn = toIsbn13(input.value);
        if (!isbn) { status.textContent = 'ISBNの数字が正しくありません'; return; }
        if (await openExisting(isbn)) return;
        status.textContent = '本の情報を調べています…';
        const info = await lookup.fetchInfo(isbn);
        await finish(newBook({ ...(info ?? {}), isbn, ...stamp(), lookup: info ? 'ok' : 'pending' }), { enqueue: !info });
      } }, '登録する'),
      status);
  }

  function showManual() {
    const f = {};
    const field = (label, key, attrs = {}) => {
      f[key] = h('input', { type: 'text', ...attrs });
      return h('label', { class: 'field' }, h('span', {}, label), f[key]);
    };
    const warn = h('p', { class: 'small', style: { color: 'var(--warn)' } });
    let confirmed = false;
    const saveBtn = h('button', { class: 'btn primary wide', style: { marginTop: '14px' } }, '登録する');
    saveBtn.addEventListener('click', async () => {
      const title = f.title.value.trim();
      if (!title) { warn.textContent = '書名を入れてください'; return; }
      const volumeText = f.volume.value.normalize('NFKC').trim();
      const volume = volumeText === '' || Number.isNaN(Number(volumeText)) ? null : Number(volumeText);
      if (!confirmed) {
        const key = normalizeForSearch(title);
        const same = (await db.allBooks()).find(b => normalizeForSearch(b.title) === key && (b.volume ?? null) === volume);
        if (same) {
          warn.textContent = '同じ本かもしれません（同じ書名・巻がすでにあります）。それでも登録するなら、もう一度押してください';
          saveBtn.textContent = 'それでも登録する';
          confirmed = true;
          return;
        }
      }
      const authors = f.authors.value.split('、').map(x => x.trim()).filter(Boolean);
      const workTitle = f.workTitle.value.trim();
      await finish(newBook({
        title, authors, workTitle, volume, ...stamp(), lookup: 'manual',
        workKey: workKeyOf(workTitle || title, authors),
      }));
    });
    body.replaceChildren(
      field('書名（必須）', 'title'),
      field('著者（複数なら「、」で区切る）', 'authors'),
      h('div', { class: 'field-row' }, field('作品名（続き物なら）', 'workTitle'), field('巻', 'volume', { inputmode: 'numeric' })),
      options(), warn, saveBtn);
  }

  function show(tab) {
    ({ search: showSearch, isbn: showIsbn, manual: showManual })[tab]();
  }
  show('search');
}
