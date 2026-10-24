// 設定 tab: tags, stale rule, CSV, backup, stats (spec §4-6, §6).

import { h, fill, toast, confirmDialog, downloadText, formatDate, sheet } from './dom.js';
import { booksToCsv, csvFileName, parseCsv, rowsToBooks } from '../core/csv.js';
import { makeBackup, validateBackup, backupFileName } from '../core/backup.js';
import { ownedPriceSum, countOwned } from '../core/stats.js';
import { todayStr } from '../core/model.js';
import { THEMES, applyTheme } from './theme.js';

const readFile = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsText(file, 'utf-8');
});

const filePicker = (accept, onFile) => {
  const input = h('input', { type: 'file', accept, style: { display: 'none' } });
  input.addEventListener('change', () => { const f = input.files?.[0]; input.value = ''; if (f) onFile(f); });
  return input;
};

export function mount(container, ctx) {
  const { db, lookup } = ctx;
  let disposed = false;
  let openTagsOnRender = false; // keep タグの整理 open after editing a tag

  async function render() {
    const [books, tags, examTagId, staleYears, lastBackupAt, theme, rakutenAppId, rakutenAccessKey] = await Promise.all([
      db.allBooks(), db.allTags(), db.getSetting('examTagId'), db.getSetting('staleYears'), db.getSetting('lastBackupAt'),
      db.getSetting('theme'), db.getSetting('rakutenAppId'), db.getSetting('rakutenAccessKey'),
    ]);
    let persisted = null;
    try { persisted = await navigator.storage?.persisted?.(); } catch { persisted = null; }
    if (disposed) return;
    const usage = new Map();
    for (const b of books) for (const t of b.tagIds) usage.set(t, (usage.get(t) ?? 0) + 1);

    // --- tags ---
    const tagRows = tags.map((t, i) => h('div', { class: 'tag-row' },
      h('span', { class: 'name' }, t.name, h('span', { class: 'muted small' }, `  ${usage.get(t.id) ?? 0}冊`)),
      h('button', { class: 'icon-btn', 'aria-label': '上へ', disabled: i === 0, onClick: () => swap(i, i - 1) }, '↑'),
      h('button', { class: 'icon-btn', 'aria-label': '下へ', disabled: i === tags.length - 1, onClick: () => swap(i, i + 1) }, '↓'),
      h('button', { class: 'icon-btn', 'aria-label': '名前を変える', onClick: () => rename(t) }, '✎'),
      h('button', { class: 'icon-btn', 'aria-label': 'まとめる・削除', onClick: () => manage(t) }, '…')));

    async function swap(a, b) {
      const x = tags[a];
      const y = tags[b];
      await db.putTag({ ...x, order: y.order });
      await db.putTag({ ...y, order: x.order });
      render();
    }

    function rename(tag) {
      const input = h('input', { type: 'text', value: tag.name });
      const s = sheet(h('div', {}, input, h('button', { class: 'btn primary wide', style: { marginTop: '12px' }, onClick: async () => {
        const name = input.value.trim();
        if (!name) return;
        await db.putTag({ ...tag, name });
        s.close();
        render();
      } }, '保存する')), { title: 'タグの名前を変える' });
    }

    function manage(tag) {
      const others = tags.filter(t => t.id !== tag.id);
      const select = h('select', {}, others.map(t => h('option', { value: t.id }, t.name)));
      const s = sheet(h('div', {},
        h('p', {}, `「${tag.name}」（${usage.get(tag.id) ?? 0}冊）`),
        h('div', { class: 'section-title' }, '別のタグにまとめる'),
        select,
        h('button', { class: 'btn wide', style: { marginTop: '8px' }, onClick: async () => {
          const into = others.find(t => t.id === select.value);
          if (!into || !(await confirmDialog(`「${tag.name}」を「${into.name}」にまとめます。`, 'まとめる'))) return;
          await db.mergeTags(tag.id, into.id);
          s.close(); toast('まとめました'); render();
        } }, 'まとめる'),
        h('button', { class: 'btn danger wide', style: { marginTop: '16px' }, onClick: async () => {
          if (!(await confirmDialog(`「${tag.name}」を削除します。${usage.get(tag.id) ?? 0}冊からこのタグが外れます。`, '削除する'))) return;
          if (tag.id === examTagId) await db.setSetting('examTagId', '');
          await db.deleteTag(tag.id);
          s.close(); toast('削除しました'); render();
        } }, 'このタグを削除')), { title: 'タグ' });
    }

    // 鬼さん 2026-10-24: tags can also be made here, not only while tagging a book.
    const newTagInput = h('input', { type: 'text', placeholder: '新しいタグの名前', enterkeyhint: 'done' });
    async function addTag() {
      const name = newTagInput.value.trim();
      if (!name) return;
      const before = tags.length;
      const tag = await db.createTag(name);
      toast((await db.allTags()).length > before ? `「${tag.name}」を追加しました` : `「${tag.name}」はもうあります`);
      openTagsOnRender = true;
      render();
    }
    newTagInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTag(); });
    const tagAdd = h('div', { class: 'tag-add' }, newTagInput, h('button', { class: 'btn primary', onClick: addTag }, '追加'));

    // --- stale rule ---
    const examSelect = h('select', { onChange: e => db.setSetting('examTagId', e.target.value) },
      h('option', { value: '' }, '（使わない）'),
      tags.map(t => h('option', { value: t.id, selected: t.id === examTagId }, t.name)));
    const yearsSelect = h('select', { onChange: e => db.setSetting('staleYears', Number(e.target.value)) },
      Array.from({ length: 10 }, (_, i) => i + 1).map(n => h('option', { value: n, selected: n === (staleYears ?? 2) }, `${n}年`)));

    // --- import / backup ---
    const csvInput = filePicker('.csv,text/csv', async file => {
      try {
        const items = rowsToBooks(parseCsv(await readFile(file)));
        for (const item of items) {
          for (const name of item.tagNames) item.book.tagIds.push((await db.createTag(name)).id);
        }
        const r = await db.addBooksSkippingDuplicates(items.map(i => i.book));
        for (const b of await db.booksByLookup('pending')) lookup.enqueue(b.id);
        toast(`追加 ${r.added}冊、重複で飛ばした ${r.skipped}冊`);
        render();
      } catch (err) {
        toast(err?.message?.includes('見出し') ? err.message : 'CSVを読み込めませんでした');
      }
    });

    const backupInput = filePicker('.json,application/json', async file => {
      let data;
      try { data = JSON.parse(await readFile(file)); } catch { toast('バックアップのファイルではありません'); return; }
      const check = validateBackup(data);
      if (!check.ok) { toast(check.reason); return; }
      if (!(await confirmDialog(`今のデータを全部、このバックアップ（${data.books.length}冊、${formatDate(todayStr(new Date(data.exportedAt)))}作成）の中身に置き換えます。よろしいですか？`, '置き換える'))) return;
      try {
        await db.replaceAll({ books: data.books, tags: data.tags, settings: data.settings, photos: data.photos ?? [] });
      } catch {
        toast('戻せませんでした。今のデータはそのままです');
        return;
      }
      toast('戻しました');
      setTimeout(() => location.reload(), 600);
    });

    // --- colour pattern ---
    const current = applyTheme(theme);
    const SWATCH = { green: '#2f5d50', white: '#f4f5f6', black: '#1f2326', blue: '#5486bd' };
    const themePick = h('div', { class: 'theme-pick' }, THEMES.map(([v, label]) => h('button', {
      class: v === current ? 'on' : '', onClick: async () => { await db.setSetting('theme', v); applyTheme(v); render(); },
    }, h('span', { class: 'swatch', style: { background: SWATCH[v] } }), label)));

    // --- Rakuten covers (keys stay on this phone) ---
    const appIdInput = h('input', { type: 'text', value: rakutenAppId ?? '', autocomplete: 'off', spellcheck: false });
    const keyInput = h('input', { type: 'text', value: rakutenAccessKey ?? '', autocomplete: 'off', spellcheck: false });
    const noCover = books.filter(b => b.isbn && !b.coverUrl);
    let filling = false;
    const fillBtn = h('button', { class: 'btn wide', style: { marginTop: '10px' }, disabled: !(rakutenAppId && rakutenAccessKey) || !noCover.length, onClick: async () => {
      if (filling) return;
      filling = true;
      let added = 0;
      for (const [i, b] of noCover.entries()) {
        if (disposed) break;
        fillBtn.textContent = `表紙を探しています… ${i + 1} / ${noCover.length}`;
        if (await lookup.fillCover(b.id)) added++;
      }
      filling = false;
      toast(`表紙を ${added}冊 に付けました${noCover.length - added ? `（${noCover.length - added}冊は見つかりませんでした）` : ''}`);
      render();
    } }, `表紙のない本に表紙を付ける（${noCover.length}冊・約${Math.max(1, Math.ceil(noCover.length / 60))}分）`);

    fill(container, 
      h('div', { class: 'card', style: { marginTop: '6px' } },
        h('div', { class: 'about-name' }, '自宅の書斎をスマホに入れよう'),
        h('div', { class: 'muted small' }, '略して「スマホ書斎」。持っている本とマンガの棚卸し帳')),

      h('div', { class: 'section-title' }, '色'),
      themePick,

      h('div', { class: 'section-title' }, '情報'),
      h('div', { class: 'card' },
        h('div', { class: 'stat' }, h('span', {}, '持っている本'), h('span', {}, `${countOwned(books).toLocaleString()}冊`)),
        h('div', { class: 'stat' }, h('span', {}, '持っている本の定価の合計'), h('span', {}, `${ownedPriceSum(books).toLocaleString()}円`)),
        h('div', { class: 'stat' }, h('span', {}, '登録の合計'), h('span', {}, `${books.length.toLocaleString()}冊`)),
        h('div', { class: 'stat' }, h('span', {}, 'データの保護'), h('span', {}, persisted === null ? '不明' : persisted ? '有効' : '無効'))),

      h('div', { class: 'section-title' }, 'バックアップ'),
      h('div', { class: 'card' },
        h('p', { class: 'small', style: { marginTop: 0 } }, `前回：${lastBackupAt ? formatDate(todayStr(new Date(lastBackupAt))) : 'まだありません'}`),
        h('p', { class: 'muted small' }, 'データはこのスマホの中だけにあります。ときどきバックアップを作って、Googleドライブなどに保存してください。'),
        h('div', { class: 'row-buttons' },
          h('button', { class: 'btn primary', onClick: async () => {
            const backup = makeBackup({ books: await db.allBooks(), tags: await db.allTags(), settings: await db.allSettings(), photos: await db.allPhotos() }, new Date().toISOString());
            downloadText(backupFileName(todayStr()), JSON.stringify(backup), 'application/json');
            await db.setSetting('lastBackupAt', backup.exportedAt);
            toast('バックアップを作りました');
            render();
          } }, 'バックアップを作る'),
          h('button', { class: 'btn', onClick: () => backupInput.click() }, 'バックアップから戻す')),
        backupInput),

      h('div', { class: 'section-title' }, 'CSV'),
      h('div', { class: 'card' },
        h('div', { class: 'row-buttons' },
          h('button', { class: 'btn', onClick: () => downloadText(csvFileName(todayStr()), booksToCsv(books, tags), 'text/csv') }, '全部をCSVで書き出す'),
          h('button', { class: 'btn', onClick: () => csvInput.click() }, 'CSVを取り込む')),
        h('p', { class: 'muted small' }, '取り込みはスマホ書斎で書き出したCSVの形に限ります。今の本棚に追加され、同じISBNの本は飛ばします。'),
        csvInput),

      h('div', { class: 'section-title' }, '本の表紙（楽天ブックス）'),
      h('div', { class: 'card' },
        h('p', { class: 'muted small', style: { marginTop: 0 } }, '楽天ウェブサービスで作ったアプリIDとアクセスキーを入れると、表紙が出ない本を楽天から探します。キーはこのスマホの中だけに保存します。'),
        h('label', { class: 'field' }, h('span', {}, 'アプリID'), appIdInput),
        h('label', { class: 'field' }, h('span', {}, 'アクセスキー'), keyInput),
        h('button', { class: 'btn primary wide', onClick: async () => {
          await db.setSetting('rakutenAppId', appIdInput.value.trim());
          await db.setSetting('rakutenAccessKey', keyInput.value.trim());
          toast(appIdInput.value.trim() && keyInput.value.trim() ? '保存しました。これから登録する本の表紙も楽天から探します' : '楽天を使わない設定にしました');
          render();
        } }, '保存する'),
        fillBtn),

      h('div', { class: 'section-title' }, '古い参考書の判定'),
      h('div', { class: 'card' },
        h('label', { class: 'field' }, h('span', {}, '対象のタグ'), examSelect),
        h('label', { class: 'field' }, h('span', {}, '発行からこの年数がたったら「古いかも」'), yearsSelect)),

      h('details', { class: 'card', style: { marginTop: '22px' }, open: openTagsOnRender, onToggle: e => { openTagsOnRender = e.target.open; } },
        h('summary', { style: { cursor: 'pointer', fontWeight: '700', minHeight: '40px' } }, `タグの整理（${tags.length}個）`),
        tagAdd,
        tagRows),

      h('p', { class: 'muted small', style: { marginTop: '24px' } },
        '本の情報は、国立国会図書館サーチのAPIと openBD を利用して取得しています。', rakutenAppId ? ' 表紙の一部は楽天ブックスから取得しています（Supported by Rakuten Developers）。' : ''),
    );
  }

  render();
  return () => { disposed = true; };
}
