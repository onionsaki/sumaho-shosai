// 欲しい本: the list under 確認（本屋）, its editor, and moving 持っていない books over (鬼さん 2026-10-25).

import { h, fill, sheet, toast, confirmDialog, formatDate } from './dom.js';
import { icon } from './icons.js';
import { displayTitle } from './shelf.js';
import { newWish, splitWishes, markBought, wishCandidates, wishFromBook } from '../core/wish.js';
import { todayStr } from '../core/model.js';

export function openWishEditor(ctx, wish, onSaved = () => {}, isNew = false) {
  const { db } = ctx;
  const title = h('input', { type: 'text', value: wish.title, placeholder: '書名（わかる範囲で）' });
  const expect = h('textarea', { rows: 3, value: wish.expect, placeholder: '例：図解が多くて、仕事の説明に使えそう' });
  const where = h('input', { type: 'text', value: wish.where, placeholder: '例：駅前の古本屋 550円' });
  const body = h('div', { class: 'form' });
  const s = sheet(body, { title: wish.boughtAt ? '買ったもの' : '欲しい本', thumbClose: true });
  async function save() {
    const name = title.value.trim();
    if (!name) { toast('書名を入れてください'); return; }
    await db.putWish({ ...wish, title: name, expect: expect.value.trim(), where: where.value.trim() });
    toast(isNew ? '欲しい本に追加しました' : '保存しました');
    s.close();
    onSaved();
  }
  s.setAction('保存', save);
  fill(body,
    h('label', { class: 'field' }, h('span', {}, '書名'), title),
    h('label', { class: 'field' }, h('span', {}, '何を期待して買うか'), expect),
    h('label', { class: 'field' }, h('span', {}, '見つけた場所や値段'), where),
    wish.isbn ? h('p', { class: 'muted small' }, `ISBN ${wish.isbn}　本屋で読み取ると「欲しい本」と出ます`) : null,
    wish.boughtAt ? h('p', { class: 'muted small' }, `${formatDate(wish.boughtAt)} に買いました`) : null,
    h('button', { class: 'btn primary wide', style: { marginTop: '12px' }, onClick: save }, '保存'),
    !isNew && !wish.boughtAt ? h('button', { class: 'btn wide', style: { marginTop: '8px' }, onClick: async () => {
      await db.putWish(markBought(wish, '', todayStr()));
      toast('買ったものに移しました');
      s.close();
      onSaved();
    } }, '買った') : null,
    !isNew ? h('button', { class: 'btn danger wide', style: { marginTop: '16px' }, onClick: async () => {
      if (!(await confirmDialog(`「${wish.title}」を欲しい本から消します。`, '消す'))) return;
      await db.deleteWish(wish.id);
      s.close();
      onSaved();
    } }, '消す') : null);
  if (isNew && !wish.title) title.focus();
}

// Ticked books leave the shelf and become wishes (their memo becomes the expectation).
function openMoveSheet(ctx, candidates, onDone) {
  const { db } = ctx;
  const picked = new Set(candidates.filter(c => c.ticked).map(c => c.book.id));
  const submit = h('button', { class: 'btn primary wide', style: { marginTop: '16px' } });
  const update = () => { submit.textContent = `選んだ${picked.size}冊を欲しい本に移す`; submit.disabled = !picked.size; };
  const rows = candidates.map(({ book, ticked }) => {
    const box = h('input', { type: 'checkbox', checked: ticked });
    box.addEventListener('change', () => { if (box.checked) picked.add(book.id); else picked.delete(book.id); update(); });
    return h('li', {}, h('label', { class: 'check-row' }, box, h('span', { class: 'check-title' }, displayTitle(book))));
  });
  const s = sheet(h('div', {},
    h('p', {}, '本棚で「持っていない」になっている本です。欲しい本に移すと、本棚からは消えます。'),
    h('p', { class: 'muted small' }, '持っている作品の続きの巻（「既刊を探す」で足した巻など）は、最初はチェックを外してあります。'),
    h('ul', { class: 'check-list' }, rows), submit), { title: '本棚から移す', thumbClose: true });
  submit.addEventListener('click', async () => {
    submit.disabled = true;
    const chosen = candidates.filter(c => picked.has(c.book.id));
    for (const { book } of chosen) {
      await db.putWish(wishFromBook(book, displayTitle(book)));
      await db.deleteBook(book.id);
    }
    toast(`${chosen.length}冊を欲しい本に移しました`);
    s.close();
    onDone();
  });
  update();
}

// The list shown under the check card. Returns { el, refresh }.
export function wishList(ctx) {
  const { db } = ctx;
  const el = h('div', { class: 'wish-list' });
  async function refresh() {
    const [wishes, books] = await Promise.all([db.allWishes(), db.allBooks()]);
    const { open, bought } = splitWishes(wishes);
    const candidates = wishCandidates(books);
    const row = w => h('li', {}, h('button', { class: 'wish-row', onClick: () => openWishEditor(ctx, w, refresh) },
      h('span', { class: 'wish-title' }, w.title),
      w.expect ? h('span', { class: 'muted small wish-expect' }, w.expect) : null,
      w.where || w.boughtAt ? h('span', { class: 'muted small' }, [w.boughtAt ? `${formatDate(w.boughtAt)} 購入` : '', w.where].filter(Boolean).join('・')) : null));
    fill(el,
      h('div', { class: 'section-title wish-head' }, `欲しい本（${open.length}）`,
        h('button', { class: 'round-btn small-round', 'aria-label': '欲しい本を足す', onClick: () => openWishEditor(ctx, newWish(), refresh, true) }, icon('plus'))),
      open.length ? h('ul', { class: 'wish-ul card' }, open.map(row))
        : h('p', { class: 'muted small' }, '本屋で「持っていない」と出た本や、気になった本をここに残せます。右の＋から書名だけでも足せます。'),
      bought.length ? h('details', { class: 'card', style: { marginTop: '12px' } },
        h('summary', { style: { cursor: 'pointer', fontWeight: '700', minHeight: '40px' } }, `買ったもの（${bought.length}）`),
        h('ul', { class: 'wish-ul' }, bought.map(row))) : null,
      candidates.length ? h('button', { class: 'link-btn', style: { marginTop: '10px' }, onClick: () => openMoveSheet(ctx, candidates, refresh) },
        `本棚の「持っていない」から移す（${candidates.length}冊）`) : null);
  }
  refresh();
  return { el, refresh };
}
