// 読み取る tab: register mode (片付けのとき) and check mode (本屋で). Spec §4-1, §4-2.

import { h, fill, toast, segmented, formatDate } from './dom.js';
import { startCamera } from '../camera.js';
import { createFeedback } from '../feedback.js';
import { classifyBarcode, toIsbn13 } from '../core/isbn.js';
import { createConfirmer } from '../core/confirm.js';
import { applyScan } from '../core/session.js';
import { checkResult } from '../core/check.js';
import { summarizeVolumes } from '../core/series.js';
import { workKeyOf } from '../core/volume.js';
import { newBook, todayStr, LABELS } from '../core/model.js';
import { openTagPicker, tagSummary } from './tags.js';
import { icon } from './icons.js';
import { wishList, openWishEditor } from './wishes.js';
import { displayTitle } from './shelf.js';
import { newWish, openWishesFor } from '../core/wish.js';

const MODES = [['register', '登録（片付け）'], ['check', '確認（本屋）']];
const OWNERSHIP_OPTIONS = [['owned', '持っている'], ['released', '手放した'], ['not_owned', '持っていない']];
const READ_OPTIONS = ['read', 'reading', 'unread'].map(v => [v, LABELS.read[v]]);

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
          const kind = classifyBarcode(raw).kind;
          if (kind !== 'isbn' && kind !== 'magazine') return; // the price barcode next to the ISBN is ignored
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
    return h('div', { class: 'search-row', style: { marginTop: '14px' } }, input, h('button', { class: 'btn', onClick: go }, label));
  }

  // ---------- register mode ----------
  async function renderRegister() {
    const tags0 = await db.allTags();
    const session = { ownership: 'owned', readStatus: 'read', tagIds: [], ...(await db.getSetting('lastSession')) };
    session.tagIds = session.tagIds.filter(id => tags0.some(t => t.id === id));
    const tags = tags0;
    const tagWrap = h('div');
    const renderTags = () => fill(tagWrap, tagSummary(tags, session.tagIds, () => {
      openTagPicker({
        title: 'この回に付けるタグ', tags, selected: session.tagIds,
        onToggle: id => {
          session.tagIds = session.tagIds.includes(id) ? session.tagIds.filter(x => x !== id) : [...session.tagIds, id];
          renderTags();
        },
        onCreate: name => db.createTag(name),
      });
    }, 'タグを付ける'));
    renderTags();

    fill(body,
      h('button', { class: 'tile', onClick: async () => {
        await db.setSetting('lastSession', session);
        runRegister(session, tags);
      } }, h('div', {}, 'バーコードで登録'), icon('barcode'), h('div', { class: 'sub' }, '押すとカメラが開きます')),
      h('button', { class: 'tile small', onClick: () => ctx.openAdd() },
        h('div', {}, '書名・番号で登録'), icon('plus')),
      h('div', { class: 'section-title' }, 'この回に読み取る本へ、まとめて付ける内容'),
      h('div', { class: 'card' },
        h('div', { class: 'small muted', style: { marginBottom: '6px' } }, '持っているか'),
        segmented(OWNERSHIP_OPTIONS, session.ownership, v => { session.ownership = v; }),
        h('div', { class: 'small muted', style: { margin: '14px 0 6px' } }, '読んだか（新しく登録する本だけ）'),
        segmented(READ_OPTIONS, session.readStatus, v => { session.readStatus = v; }),
        h('div', { class: 'small muted', style: { margin: '14px 0 6px' } }, 'タグ'),
        tagWrap,
        h('p', { class: 'muted small', style: { marginBottom: 0 } }, '前回の選び方を覚えています。')),
    );
  }

  function runRegister(session, tags) {
    const entries = [];
    const video = h('video');
    const count = h('div', { class: 'scan-count' });
    const log = h('ul', { class: 'scan-log' });
    const undoBtn = h('button', { class: 'btn', disabled: true }, '取り消し');
    const statusEl = h('div', { class: 'status-line' });
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
      if (!entries.length) {
        fill(log, h('li', { class: 'scan-hint' }, icon('barcode'), h('p', {}, 'バーコードは連続で読み取れます'), h('p', { class: 'small muted' }, '本の裏のバーコードを、白い枠に合わせてください')));
        return;
      }
      fill(log, ...entries.slice(0, 5).map(e => {
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
      // Magazines are kept under their 491… code and looked up on Rakuten (needs the keys in 設定).
      if (c.kind === 'magazine' && !(await lookup.hasRakuten())) { feedback.error(); toast('雑誌は、設定で楽天のキーを入れると登録できます'); return; }
      if (c.kind !== 'isbn' && c.kind !== 'magazine') return;
      const existing = await db.getBookByIsbn(code);
      const r = applyScan(existing, session, code, todayStr());
      const saved = r.changed ? await db.putBook(r.book) : r.book;
      if (r.action === 'created') { lookup.enqueue(saved.id); feedback.success(); } else feedback.duplicate();
      entries.unshift({ isbn: code, bookId: saved.id, action: r.action, before: r.before, changed: r.changed, title: saved.title, lookup: saved.lookup });
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
      fill(body, h('div', { class: 'card summary' },
        h('div', { class: 'scan-count' }, '今回の結果'),
        h('div', {}, `登録 ${created.length}冊・登録済み ${entries.length - created.length}冊・見つからなかった ${missing}冊`),
        waiting ? h('div', { class: 'muted small' }, `${waiting}冊は本の情報を取得中です。アプリを開いている間に埋まります。`) : null,
        h('div', { class: 'row-buttons', style: { marginTop: '12px' } },
          h('button', { class: 'btn primary', onClick: renderRegister }, '続けて読み取る'),
          missing ? h('button', { class: 'btn', onClick: () => { location.hash = 'shelf?review=1'; } }, 'あとで確認を見る') : null)));
    }

    fill(body, 
      h('div', { class: 'camera-box' }, video, h('div', { class: 'guide' })),
      h('div', { class: 'muted small', style: { marginTop: '6px' } },
        `${LABELS.ownership[session.ownership]}・${LABELS.read[session.readStatus]}${tagNames.length ? `・${tagNames.join('、')}` : ''}`),
      count,
      h('div', { class: 'row-buttons' }, undoBtn, h('button', { class: 'btn primary', onClick: finish }, '終える')),
      manualEntry('登録', handle),
      log,
      statusEl,
    );
    render();
    start(video, handle, statusEl).then(ok => { if (!ok) statusEl.textContent = 'カメラを使えません。下の欄に番号を打って登録できます'; });
  }

  // ---------- check mode ----------
  function renderCheck() {
    const video = h('video');
    const card = h('div');
    const statusEl = h('div', { class: 'status-line' });
    let running = false;
    const cameraSlot = h('div');
    // 鬼さん 2026-10-24: a way to close the camera and the answer once it is known.
    const closeCamera = h('button', { class: 'btn wide', style: { marginTop: '12px' }, onClick: async () => {
      await stop();
      running = false;
      statusEl.textContent = '';
      fill(card);
      fill(cameraSlot, startTile);
    } }, 'カメラを閉じる');
    const startTile = h('button', { class: 'tile', onClick: async () => {
      if (running) return;
      fill(cameraSlot, h('div', { class: 'camera-box' }, video, h('div', { class: 'guide' })));
      running = await start(video, handle, statusEl);
      if (running) cameraSlot.append(closeCamera);
      else fill(cameraSlot, startTile);
    } }, h('div', {}, '本屋で確認'), icon('barcode'), h('div', { class: 'sub' }, '持っているかを確かめます。何も保存しません'));
    fill(cameraSlot, startTile);

    const workLines = (book, work) => {
      if (!work) return [];
      const lines = [];
      if (work.summary.text) lines.push(`この作品：${work.summary.text}巻を持っている`);
      // Gaps between owned volumes, plus volumes registered as 持っていない (「既刊を探す」 adds later ones).
      const missing = [...work.summary.missing, ...(work.notOwnedVolumes ?? [])];
      if (book && book.ownership !== 'owned' && book.volume !== null) missing.push(book.volume);
      const text = summarizeVolumes(missing).text.replace(/, /g, '、');
      if (text) lines.push(`${text}巻は持っていない`);
      return lines.map(t => h('div', { class: 'work' }, t));
    };

    // 欲しいに追加 (was 読みたいに追加 until 2026-10-25): goes to the wish list, not the shelf.
    function addWanted(info, isbn) {
      const title = info?.title ? displayTitle(info) : '';
      openWishEditor(ctx, newWish({ isbn, title }), () => { fill(card); wishes.refresh(); }, true);
    }

    async function handle(code) {
      const c = classifyBarcode(code);
      if (c.kind !== 'isbn' && c.kind !== 'magazine') return;
      const magazine = c.kind === 'magazine';
      enrichToken++; // any newer scan supersedes a pending title lookup
      const book = await db.getBookByIsbn(code);
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
        not_owned: '（本棚に「持っていない」で登録済み）',
        unregistered: navigator.onLine ? '調べています…' : '登録なし',
      }[r.status];
      const sound = { owned: 'success', owned_ebook: 'success', released: 'duplicate', not_owned: 'duplicate', unregistered: 'error' }[r.status];
      feedback[sound]();

      const titleEl = h('div', { class: 'title' }, book?.title || '');
      const noteEl = h('div', { class: 'small' }, note);
      const extra = h('div');
      fill(card, h('div', { class: `result-card ${r.status}` },
        h('button', { class: 'round-btn card-close', 'aria-label': '答えを閉じる', onClick: () => { enrichToken++; fill(card); } }, icon('close')),
        h('div', { class: 'big' }, big), titleEl, noteEl, ...workLines(book, r.work), extra));

      const wished = r.status === 'owned' || r.status === 'owned_ebook' ? [] : openWishesFor(await db.allWishes(), code);
      if (wished.length && r.status === 'unregistered') { titleEl.textContent = wished[0].title; noteEl.textContent = ''; }
      for (const w of wished) {
        extra.append(h('div', { class: 'wish-hit' }, '欲しい本に入っています', w.expect ? h('div', { class: 'small' }, `期待：${w.expect}`) : null));
      }
      if (wished.length || (r.status !== 'unregistered' && r.status !== 'not_owned')) return;
      const addBtn = info => h('button', { class: 'btn', style: { marginTop: '10px' }, onClick: () => addWanted(info, code) }, '欲しいに追加');
      if (r.status === 'not_owned') { extra.append(addBtn(book)); return; }
      if (!navigator.onLine) { extra.append(addBtn(null)); return; }
      const token = enrichToken;
      enrich(code, token, titleEl, noteEl, extra, addBtn, magazine); // not awaited: the next scan answers at once
    }

    let enrichToken = 0;
    async function enrich(isbn, token, titleEl, noteEl, extra, addBtn, magazine = false) {
      const info = magazine ? await lookup.fetchMagazine(isbn) : await lookup.fetchInfo(isbn);
      if (disposed || token !== enrichToken) return; // a newer scan replaced this card
      titleEl.textContent = info?.title ?? '';
      noteEl.textContent = info ? '' : '登録なし';
      if (info && info.volume !== null && info.volume !== undefined) {
        const key = workKeyOf(info.workTitle || info.title, info.authors);
        const siblings = await db.booksByWorkKey(key);
        if (siblings.length) {
          const pseudo = { ...info, workKey: key, ownership: 'not_owned' };
          extra.append(...workLines(pseudo, checkResult(pseudo, siblings).work));
        }
      }
      extra.append(addBtn(info));
    }

    const wishes = wishList(ctx);
    fill(body,
      cameraSlot,
      statusEl,
      manualEntry('確認', handle),
      card,
      wishes.el,
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
