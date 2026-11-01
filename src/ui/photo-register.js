// 写真で登録 (鬼さん 2026-11-01): books with no barcode and not in NDL (TRPG books sold by individuals) are
// registered from a photo of the cover, one after another. The title is pasted from Google Lens (copy the text
// there) or typed, and may be left empty to fill in later; the shelf shows the photo meanwhile. Reading the title
// from the photo was tried and dropped: none of 5 real covers came out right (2026-11-01).

import { h, sheet, toast } from './dom.js';
import { newBook, todayStr } from '../core/model.js';
import { workKeyOf } from '../core/volume.js';
import { pickPhoto } from './photo.js';

// Resolves { title, next } or null when the photo is thrown away.
function askTitle(photo, count) {
  return new Promise(resolve => {
    let done = false;
    const finish = value => { if (done) return; done = true; resolve(value); s.close(); };
    const input = h('input', { type: 'text', placeholder: '書名（あとで入れてもよい）', autocomplete: 'off' });
    const paste = h('button', { class: 'btn', onClick: async () => {
      try {
        const text = (await navigator.clipboard.readText()).replace(/\s+/g, ' ').trim();
        if (text) input.value = text; else toast('コピーした文字がありません');
      } catch {
        toast('貼り付けできませんでした。書名の欄を長押しして「貼り付け」を選んでください');
      }
    } }, '貼り付け');
    const s = sheet(h('div', { class: 'photo-register' },
      h('img', { class: 'photo-register-img', src: photo, alt: '' }),
      h('label', { class: 'field' }, h('span', {}, '書名'), h('div', { class: 'paste-row' }, input, paste)),
      h('p', { class: 'muted small' }, 'Googleレンズで表紙の文字をコピーして「貼り付け」。空のままでも登録でき、本棚には写真が出ます。'),
      h('button', { class: 'btn primary wide', onClick: () => finish({ title: input.value.trim(), next: true }) }, '登録して次を撮る'),
      h('div', { class: 'row-buttons', style: { marginTop: '8px' } },
        h('button', { class: 'btn', onClick: () => finish({ title: input.value.trim(), next: false }) }, '登録して終わる'),
        h('button', { class: 'btn', onClick: () => finish(null) }, 'この写真は使わない'))),
    { title: count ? `写真で登録（${count}冊登録済み）` : '写真で登録', thumbClose: true });
    s.onClose(() => finish(null));
  });
}

export async function photoRegister(session, { db, refresh }) {
  let count = 0;
  for (;;) {
    const photo = await pickPhoto();
    if (!photo) break;
    const answer = await askTitle(photo, count);
    if (!answer) break;
    const book = await db.putBook(newBook({
      title: answer.title, ownership: session.ownership, readStatus: session.readStatus,
      readAt: session.readStatus === 'read' ? todayStr() : '', releasedAt: session.ownership === 'released' ? todayStr() : '',
      tagIds: [...session.tagIds], lookup: 'manual', workKey: workKeyOf(answer.title, []),
    }));
    await db.putPhoto(book.id, photo);
    count++;
    if (!answer.next) break;
  }
  if (count) { toast(`写真で${count}冊を登録しました`); refresh?.(); }
}
