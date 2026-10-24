// 読み取る tab: register mode (片付けのとき) and check mode (本屋で). Spec §4-1, §4-2.

import { h, toast, segmented, formatDate } from './dom.js';
import { startCamera } from '../camera.js';
import { createFeedback } from '../feedback.js';
import { classifyBarcode, toIsbn13 } from '../core/isbn.js';
import { createConfirmer } from '../core/confirm.js';
import { applyScan } from '../core/session.js';
import { checkResult } from '../core/check.js';
import { workKeyOf } from '../core/volume.js';
import { newBook, todayStr, LABELS } from '../core/model.js';

const MODES = [['register', '登録（片付け）'], ['check', '確認（本屋）']];
const OWNERSHIP_OPTIONS = [['owned', '持っている'], ['released', '手放した'], ['not_owned', '持っていない']];
const READ_OPTIONS = [['read', '読んだ'], ['reading', '読書中'], ['unread', 'まだ']];

export function mount(container, ctx) {
  const { db, lookup } = ctx;
  ctx.feedback ??= createFeedback();
  const feedback = ctx.feedback;
  let stopCamera = null;
  let wakeLock = null;
  let disposed = false;
  let cleanup = () => {};
  const body = h('div');

  async function keepAwake() {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }
  }
  const onVisible = () => { if (document.visibilityState === 'visible' && stopCamera) keepAwake(); };
  document.addEventListener('visibilitychange', onVisible);

  async function stop() {
    if (stopCamera) { stopCamera(); stopCamera = null; }
    try { await wakeLock?.release(); } catch { /* already released */ }
    wakeLock = null;
  }

  // A slow phone may need over a second per read, so the two matching reads may be up to 3 s apart.
  async function start(video, handle, statusEl) {
    feedback.unlock();
    const confirmer = createConfirmer({ windowMs: 3000 });
    let chain = Promise.resolve();
    if (statusEl) statusEl.textContent = 'カメラを準備しています…';
    try {
      stopCamera = await startCamera(video, {
        onCode: raw => {
          const code = confirmer.push(raw, performance.now());
          if (!code) return;
          chain = chain.then(() => handle(code)).catch(err => toast(`エラー：${err?.message ?? err}`));
        },
        onStatus: st => {
          if (statusEl) statusEl.textContent = `読み取り：${st.kind}・${st.ticks}回・1回${st.ms}ms・最後に見えた番号 ${st.last || 'なし'}`;
        },
        onError: err => { if (statusEl) statusEl.textContent = `読み取りエラー：${err?.message ?? err}`; },
      });
      await keepAwake();
      return true;
    } catch {
      toast('カメラを使えませんでした。Chromeの設定でカメラを許可してください');
      return false;
    }
  }

  // Typing the number works the same as scanning it (for barcodes the camera cannot read).
  function manualEntry(label, handle) {
    const input = h('input', { type: 'text', inputmode: 'numeric', placeholder: '978…（ハイフンなしでも可）' });
    const go = () => {
      const isbn = toIsbn13(input.value);
      if (!isbn) { toast('ISBNの数字が正しくありません'); return; }
      input.value = '';
      feedback.unlock();
      handle(isbn).catch(err => toast(`エラー：${err?.message ?? err}`));
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    return h('div', { class: 'search-row', style: { marginTop: '8px' } }, input, h('button', { class: 'btn', onClick: go }, label));
  }

  // ---------- register mode ----------
  async function renderRegister() {
    const session = { ...(await db.getSetting('lastSession')) };
    const tags = await db.allTags();
    const tagWrap = h('div', { class: 'chips' });
    const renderTags = () => tagWrap.replaceChildren(...tags.map(t => h('button', {
      class: session.tagIds.includes(t.id) ? 'chip on' : 'chip',
      onClick: () => {
        session.tagIds = session.tagIds.includes(t.id) ? session.tagIds.filter(x => x !== t.id) : [...session.tagIds, t.id];
        renderTags();
      },
    }, t.name)));
    renderTags();
    const newTag = h('input', { type: 'text', placeholder: '新しいタグ' });
    const addTag = async () => {
      const name = newTag.value.trim();
      if (!name) return;
      const tag = await db.createTag(name);
      if (!tags.some(t => t.id === tag.id)) tags.push(tag);
      if (!session.tagIds.includes(tag.id)) session.tagIds.push(tag.id);
      newTag.value = '';
      renderTags();
    };

    body.replaceChildren(
      h('button', { class: 'btn primary wide', onClick: async () => {
        await db.setSetting('lastSession', session);
        runRegister(session, tags);
      } }, '始める（カメラが開きます）'),
      h('p', { class: 'muted small' }, 'この回に読み取る本へ、まとめて付ける内容を下で選べます。前回の選び方を覚えています。'),
      h('div', { class: 'section-title' }, '持っているか'),
      segmented(OWNERSHIP_OPTIONS, session.ownership, v => { session.ownership = v; }),
      h('div', { class: 'section-title' }, '読んだか（新しく登録する本だけ）'),
      segmented(READ_OPTIONS, session.readStatus, v => { session.readStatus = v; }),
      h('div', { class: 'section-title' }, 'タグ'),
      tagWrap,
      h('div', { class: 'search-row', style: { marginTop: '8px' } }, newTag, h('button', { class: 'btn', onClick: addTag }, '追加')),
    );
  }

  function runRegister(session, tags) {
    const entries = [];
    const video = h('video');
    const count = h('div', { class: 'scan-count' });
    const log = h('ul', { class: 'scan-log' });
    const undoBtn = h('button', { class: 'btn', disabled: true }, '取り消し');
    const statusEl = h('div', { class: 'muted small' });
    const tagNames = session.tagIds.map(id => tags.find(t => t.id === id)?.name).filter(Boolean);

    const stateOf = e => {
      if (e.action === 'duplicate') return ['duplicate', '登録済み'];
      if (e.lookup === 'ok') return ['created', '登録しました'];
      if (e.lookup === 'not_found') return ['missing', '見つかりません（あとで確認）'];
      return ['waiting', navigator.onLine ? '情報を取得中' : '電波待ち'];
    };
    const render = () => {
      count.textContent = `今回 ${entries.filter(e => e.action === 'created').length}冊`;
      undoBtn.disabled = !entries.length;
      log.replaceChildren(...entries.slice(0, 5).map(e => {
        const [cls, label] = stateOf(e);
        return h('li', {}, h('span', { class: `state ${cls}` }, label), h('span', {}, e.title || e.isbn));
      }));
    };
    const off = lookup.onUpdate(book => {
      for (const e of entries) if (e.bookId === book.id) { e.lookup = book.lookup; e.title = book.title; }
      render();
    });
    cleanup = () => off();

    async function handle(code) {
      const c = classifyBarcode(code);
      if (c.kind === 'magazine') { feedback.error(); toast('雑誌のバーコードです。手で登録してください'); return; }
      if (c.kind !== 'isbn') return;
      const existing = await db.getBookByIsbn(c.isbn);
      const r = applyScan(existing, session, c.isbn, todayStr());
      const saved = r.changed ? await db.putBook(r.book) : r.book;
      if (r.action === 'created') { lookup.enqueue(saved.id); feedback.success(); } else feedback.duplicate();
      entries.unshift({ isbn: c.isbn, bookId: saved.id, action: r.action, before: r.before, changed: r.changed, title: saved.title, lookup: saved.lookup });
      render();
    }

    undoBtn.addEventListener('click', async () => {
      const e = entries.shift();
      if (!e) return;
      if (e.before === null) await db.deleteBook(e.bookId);
      else if (e.changed) await db.putBook(e.before);
      toast(`取り消しました：${e.title || e.isbn}`);
      render();
    });

    async function finish() {
      off();
      cleanup = () => {};
      await stop();
      const created = entries.filter(e => e.action === 'created');
      const missing = created.filter(e => e.lookup === 'not_found').length;
      const waiting = created.filter(e => e.lookup === 'pending').length;
      body.replaceChildren(h('div', { class: 'card summary' },
        h('div', { class: 'scan-count' }, '今回の結果'),
        h('div', {}, `登録 ${created.length}冊・登録済み ${entries.length - created.length}冊・見つからなかった ${missing}冊`),
        waiting ? h('div', { class: 'muted small' }, `${waiting}冊は本の情報を取得中です。アプリを開いている間に埋まります。`) : null,
        h('div', { class: 'row-buttons', style: { marginTop: '12px' } },
          h('button', { class: 'btn primary', onClick: renderRegister }, '続けて読み取る'),
          missing ? h('button', { class: 'btn', onClick: () => { location.hash = 'shelf?review=1'; } }, 'あとで確認を見る') : null)));
    }

    body.replaceChildren(
      h('div', { class: 'camera-box' }, video, h('div', { class: 'guide' })),
      h('div', { class: 'muted small', style: { marginTop: '6px' } },
        `${LABELS.ownership[session.ownership]}・${LABELS.read[session.readStatus]}${tagNames.length ? `・${tagNames.join('、')}` : ''}`),
      statusEl,
      count,
      h('div', { class: 'row-buttons' }, undoBtn, h('button', { class: 'btn primary', onClick: finish }, '終える')),
      manualEntry('登録', handle),
      log,
    );
    render();
    start(video, handle, statusEl).then(ok => { if (!ok) statusEl.textContent = 'カメラを使えません。下の欄に番号を打って登録できます'; });
  }

  // ---------- check mode ----------
  function renderCheck() {
    const video = h('video');
    const card = h('div');
    const statusEl = h('div', { class: 'muted small' });
    let running = false;
    const startBtn = h('button', { class: 'btn primary wide', onClick: async () => {
      if (running) return;
      running = await start(video, handle, statusEl);
      if (running) startBtn.remove();
    } }, '確認を始める');

    const workLines = (book, work) => {
      if (!work) return [];
      const lines = [];
      if (work.summary.text) lines.push(`この作品：${work.summary.text}巻を持っている`);
      const missing = [...work.summary.missing];
      if (book && book.ownership !== 'owned' && book.volume !== null && !missing.includes(book.volume)) missing.push(book.volume);
      if (missing.length) lines.push(`${missing.sort((a, b) => a - b).join('、')}巻は持っていない`);
      return lines.map(t => h('div', { class: 'work' }, t));
    };

    async function addWanted(info, isbn) {
      const saved = await db.putBook(newBook({
        ...(info ?? {}), isbn, ownership: 'not_owned', readStatus: 'unread', lookup: info ? 'ok' : 'pending',
      }));
      if (!info) lookup.enqueue(saved.id);
      toast('読みたいに追加しました');
      card.replaceChildren();
    }

    async function handle(code) {
      const c = classifyBarcode(code);
      if (c.kind === 'magazine') { feedback.error(); toast('雑誌のバーコードです'); return; }
      if (c.kind !== 'isbn') return;
      const book = await db.getBookByIsbn(c.isbn);
      const workBooks = book?.workKey ? await db.booksByWorkKey(book.workKey) : [];
      const r = checkResult(book, workBooks);
      const big = {
        owned: '持っている', owned_ebook: '電子で持っている', released: '手放した',
        not_owned: '持っていない', unregistered: '持っていない',
      }[r.status];
      const note = {
        owned: book ? `${formatDate(todayStr(new Date(book.createdAt)))} に登録` : '',
        owned_ebook: '',
        released: book?.releasedAt ? `（${formatDate(book.releasedAt)}）` : '',
        not_owned: '（読みたいに登録済み）',
        unregistered: navigator.onLine ? '調べています…' : '登録なし',
      }[r.status];
      const sound = { owned: 'success', owned_ebook: 'success', released: 'duplicate', not_owned: 'duplicate', unregistered: 'error' }[r.status];
      feedback[sound]();

      const titleEl = h('div', { class: 'title' }, book?.title || '');
      const noteEl = h('div', { class: 'small' }, note);
      const extra = h('div');
      card.replaceChildren(h('div', { class: `result-card ${r.status}` },
        h('div', { class: 'big' }, big), titleEl, noteEl, ...workLines(book, r.work), extra));

      if (r.status !== 'unregistered') return;
      const addBtn = info => h('button', { class: 'btn', style: { marginTop: '10px' }, onClick: () => addWanted(info, c.isbn) }, '読みたいに追加');
      if (!navigator.onLine) { extra.append(addBtn(null)); return; }
      const info = await lookup.fetchInfo(c.isbn);
      if (disposed) return;
      titleEl.textContent = info?.title ?? '';
      noteEl.textContent = info ? '' : '登録なし';
      if (info && info.volume !== null) {
        const key = workKeyOf(info.workTitle || info.title, info.authors);
        const siblings = await db.booksByWorkKey(key);
        if (siblings.length) {
          const pseudo = { ...info, workKey: key, ownership: 'not_owned' };
          extra.append(...workLines(pseudo, checkResult(pseudo, siblings).work));
        }
      }
      extra.append(addBtn(info));
    }

    body.replaceChildren(
      h('p', { class: 'muted small' }, '本屋で、持っているかを確かめます。何も保存しません。'),
      h('div', { class: 'camera-box' }, video, h('div', { class: 'guide' })),
      statusEl,
      h('div', { style: { marginTop: '10px' } }, startBtn),
      manualEntry('確認', handle),
      card,
    );
  }

  async function switchMode(next) {
    cleanup();
    cleanup = () => {};
    await stop();
    if (disposed) return;
    await db.setSetting('lastScanMode', next);
    if (next === 'register') await renderRegister();
    else renderCheck();
  }

  const modeSlot = h('div');
  container.append(modeSlot, h('div', { style: { height: '12px' } }), body);
  db.getSetting('lastScanMode').then(saved => {
    if (disposed) return;
    const initial = saved === 'check' ? 'check' : 'register';
    modeSlot.append(segmented(MODES, initial, v => switchMode(v)));
    switchMode(initial);
  });

  return () => {
    disposed = true;
    cleanup();
    stop();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
