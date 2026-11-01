// 設定 tab: tags, stale rule, CSV, backup, stats (spec §4-6, §6).

import { h, fill, toast, confirmDialog, saveFile, savedMessage, formatDate, sheet, segmented } from './dom.js';
import { booksToCsv, csvFileName, parseCsv, rowsToBooks } from '../core/csv.js';
import { makeBackup, validateBackup, backupFileName, restoredSettings } from '../core/backup.js';
import { openAbout, rakutenCredit } from './about.js';
import { todayStr } from '../core/model.js';
import { THEMES, applyTheme } from './theme.js';
import { applyOrder, moveItem } from '../core/order.js';
import { needsClass, ALL_CLASSES } from '../core/ndc.js';
import { isMagazineCode } from '../core/isbn.js';
import { isOpenWish } from '../core/wish.js';

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
    const staleRules = await db.staleRules(); // first, since it may add the 法律・参照資料 tag
    const [books, tags, examTagId, staleYears, lastBackupAt, theme, rakutenAppId, rakutenAccessKey, googleBooksKey] = await Promise.all([
      db.allBooks(), db.allTags(), db.getSetting('examTagId'), db.getSetting('staleYears'), db.getSetting('lastBackupAt'),
      db.getSetting('theme'), db.getSetting('rakutenAppId'), db.getSetting('rakutenAccessKey'), db.getSetting('googleBooksKey'),
    ]);
    const sectionOrder = await db.getSetting('settingsOrder');
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

    // --- stale rules: one tag, its own number of years ---
    const saveRules = async rules => { await db.setSetting('staleRules', rules); render(); };
    const yearsPick = (r, i) => h('select', { 'aria-label': '年数', onChange: e => saveRules(staleRules.map((x, j) => (j === i ? { ...x, years: Number(e.target.value) } : x))) },
      Array.from({ length: 10 }, (_, k) => k + 1).map(n => h('option', { value: n, selected: n === r.years }, `${n}年`)));
    const dropRule = i => h('button', { class: 'icon-btn', 'aria-label': 'この組を外す', onClick: () => saveRules(staleRules.filter((_, j) => j !== i)) }, '×');
    const classRows = staleRules.map((r, i) => (r.classCode ? h('div', { class: 'rule-row' },
      h('select', { 'aria-label': '対象の分類', onChange: e => saveRules(staleRules.map((x, j) => (j === i ? { ...x, classCode: e.target.value } : x))) },
        ALL_CLASSES.filter(c => c.code === r.classCode || !staleRules.some(x => x.classCode === c.code))
          .map(c => h('option', { value: c.code, selected: c.code === r.classCode }, `${c.code} ${c.name}`))),
      yearsPick(r, i), dropRule(i)) : null)).filter(Boolean);
    const freeClass = ALL_CLASSES.find(c => !staleRules.some(r => r.classCode === c.code));
    const addClassRule = freeClass
      ? h('button', { class: 'btn wide', style: { marginTop: '10px' }, onClick: () => saveRules([...staleRules, { classCode: freeClass.code, years: 3 }]) }, '分類を足す')
      : null;
    const ruleRows = staleRules.map((r, i) => (r.classCode ? null : h('div', { class: 'rule-row' },
      h('select', { 'aria-label': '対象のタグ', onChange: e => saveRules(staleRules.map((x, j) => (j === i ? { ...x, tagId: e.target.value } : x))) },
        tags.filter(t => t.id === r.tagId || !staleRules.some(x => x.tagId === t.id))
          .map(t => h('option', { value: t.id, selected: t.id === r.tagId }, t.name))),
      h('select', { 'aria-label': '年数', onChange: e => saveRules(staleRules.map((x, j) => (j === i ? { ...x, years: Number(e.target.value) } : x))) },
        Array.from({ length: 10 }, (_, k) => k + 1).map(n => h('option', { value: n, selected: n === r.years }, `${n}年`))),
      h('button', { class: 'icon-btn', 'aria-label': 'この組を外す', onClick: () => saveRules(staleRules.filter((_, j) => j !== i)) }, '×')))).filter(Boolean);
    const freeTags = tags.filter(t => !staleRules.some(r => r.tagId === t.id));
    const addRule = freeTags.length
      ? h('button', { class: 'btn wide', style: { marginTop: '10px' }, onClick: () => saveRules([...staleRules, { tagId: freeTags[0].id, years: 3 }]) }, 'タグを足す')
      : null;

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

    const backupInput = filePicker('.json,.txt,application/json,text/plain', async file => {
      let data;
      try { data = JSON.parse(await readFile(file)); } catch { toast('バックアップのファイルではありません'); return; }
      const check = validateBackup(data);
      if (!check.ok) { toast(check.reason); return; }
      if (!(await confirmDialog(`今のデータを全部、このバックアップ（${data.books.length}冊、${formatDate(todayStr(new Date(data.exportedAt)))}作成）の中身に置き換えます。よろしいですか？`, '置き換える'))) return;
      try {
        await db.replaceAll({ books: data.books, tags: data.tags, settings: restoredSettings(data.settings, await db.allSettings()), photos: data.photos ?? [], wishes: data.wishes ?? [] });
      } catch {
        toast('戻せませんでした。今のデータはそのままです');
        return;
      }
      toast('戻しました');
      setTimeout(() => location.reload(), 600);
    });

    // --- colour pattern ---
    const current = applyTheme(theme);
    const SWATCH = { green: '#2f5d50', deepgreen: '#17302a', kinari: '#e9dcc6', white: '#f4f5f6', blue: '#5486bd', navy: '#1a2233', black: '#1f2326' };
    const themePick = h('div', { class: 'theme-pick' }, THEMES.map(([v, label]) => h('button', {
      class: v === current ? 'on' : '', onClick: async () => { await db.setSetting('theme', v); applyTheme(v); render(); },
    }, h('span', { class: 'swatch', style: { background: SWATCH[v] } }), label)));

    // --- Rakuten covers (keys stay on this phone) ---
    const appIdInput = h('input', { type: 'text', value: rakutenAppId ?? '', autocomplete: 'off', spellcheck: false });
    const keyInput = h('input', { type: 'text', value: rakutenAccessKey ?? '', autocomplete: 'off', spellcheck: false });
    const googleInput = h('input', { type: 'text', value: googleBooksKey ?? '', autocomplete: 'off', spellcheck: false });
    const noCover = books.filter(b => b.isbn && !b.coverUrl);
    // 欲しい本 too (鬼さん 2026-11-01): asked again even if looked for before, since this is pressed on purpose.
    const wishesNoCover = (await db.allWishes()).filter(w => isOpenWish(w) && w.isbn && !w.coverUrl);
    const coverTotal = noCover.length + wishesNoCover.length;
    let filling = false;
    const fillBtn = h('button', { class: 'btn wide', style: { marginTop: '10px' }, disabled: !((rakutenAppId && rakutenAccessKey) || googleBooksKey) || !coverTotal, onClick: async () => {
      if (filling) return;
      filling = true;
      let added = 0;
      for (const [i, b] of noCover.entries()) {
        if (disposed) break;
        fillBtn.textContent = `表紙を探しています… ${i + 1} / ${coverTotal}`;
        if (await lookup.fillCover(b.id)) added++;
      }
      for (const [i, w] of wishesNoCover.entries()) {
        if (disposed) break;
        fillBtn.textContent = `表紙を探しています… ${noCover.length + i + 1} / ${coverTotal}`;
        const url = await lookup.coverFor(w.isbn);
        if (url === null) break; // offline
        const latest = (await db.allWishes()).find(x => x.id === w.id);
        if (!latest || latest.isbn !== w.isbn) continue;
        await db.putWish({ ...latest, coverUrl: url, coverCheckedAt: todayStr() });
        if (url) added++;
      }
      filling = false;
      toast(`表紙を ${added}冊 に付けました${coverTotal - added ? `（${coverTotal - added}冊は見つかりませんでした）` : ''}`);
      render();
    } }, `表紙のない本に表紙を付ける（${noCover.length}冊${wishesNoCover.length ? `＋欲しい本${wishesNoCover.length}冊` : ''}・約${Math.max(1, Math.ceil(coverTotal / 60))}分）`);

    // --- 分類 for books registered before it was saved (2026-10-31) ---
    const noClass = books.filter(b => needsClass(b, isMagazineCode));
    let classing = false;
    const classBtn = h('button', { class: 'btn wide', style: { marginTop: '10px' }, disabled: !noClass.length, onClick: async () => {
      if (classing) return;
      classing = true;
      let found = 0;
      let none = 0;
      for (const [i, b] of noClass.entries()) {
        if (disposed) break;
        classBtn.textContent = `分類を調べています… ${i + 1} / ${noClass.length}`;
        const r = await lookup.fillClass(b.id);
        if (r === 'found') found++;
        else if (r === 'none') none++;
      }
      classing = false;
      const failed = noClass.length - found - none;
      toast([`分類を${found}冊に付けました。`, none ? `${none}冊は国立国会図書館に分類がありませんでした。` : '',
        failed ? `${failed}冊は返事がなかったので、もう一度押すと続きから調べます。` : ''].join(''));
      render();
    } }, noClass.length ? `分類を付ける（${noClass.length}冊・約${Math.max(1, Math.ceil(noClass.length / 12))}分。画面はこのままで）` : '分類はすべて調べ済みです');

    // Sections in the order 鬼さん chose (設定の並び順); the name card and the credits stay put.
    const titled = (title, ...body) => [h('div', { class: 'section-title' }, title), ...body];
    const sections = {
      color: ['色', () => titled('色', themePick)],
      data: ['データ', () => titled('データ', h('div', { class: 'card' },
        h('div', { class: 'stat' }, h('span', {}, '登録の合計'), h('span', {}, `${books.length.toLocaleString()}冊`)),
        h('div', { class: 'stat' }, h('span', {}, 'データの保護'), h('span', {}, persisted === null ? '不明' : persisted ? '有効' : '無効')),
        h('p', { class: 'muted small', style: { marginBottom: 0 } }, '分類は国立国会図書館の番号から付きます。新しく登録した本には自動で付きます。雑誌にはありません。'),
        classBtn))],
      backup: ['バックアップ', () => titled('バックアップ', h('div', { class: 'card' },
        h('p', { class: 'small', style: { marginTop: 0 } }, `前回：${lastBackupAt ? formatDate(todayStr(new Date(lastBackupAt))) : 'まだありません'}`),
        h('p', { class: 'muted small' }, 'データはこのスマホの中だけにあります。ときどきバックアップを作って、Googleドライブに保存してください。'),
        h('p', { class: 'muted small' }, '押すと送り先を選ぶ画面が出ます。「ドライブ」を選び、フォルダ（例：スマホ書斎）を選んで保存します。'),
        h('div', { class: 'row-buttons' },
          h('button', { class: 'btn primary', onClick: async () => {
            const backup = makeBackup({ books: await db.allBooks(), tags: await db.allTags(), settings: await db.allSettings(), photos: await db.allPhotos(), wishes: await db.allWishes() }, new Date().toISOString());
            const how = await saveFile(backupFileName(todayStr()), JSON.stringify(backup), 'application/json');
            if (how === 'cancelled') return;
            await db.setSetting('lastBackupAt', backup.exportedAt);
            toast(`バックアップを作りました。${savedMessage(how)}`);
            render();
          } }, 'バックアップを作る'),
          h('button', { class: 'btn', onClick: () => backupInput.click() }, 'バックアップから戻す')),
        backupInput))],
      csv: ['CSV', () => titled('CSV', h('div', { class: 'card' },
        h('div', { class: 'row-buttons' },
          h('button', { class: 'btn', onClick: async () => { const how = await saveFile(csvFileName(todayStr()), booksToCsv(books, tags), 'text/csv'); if (how !== 'cancelled') toast(savedMessage(how)); } }, '全部をCSVで書き出す'),
          h('button', { class: 'btn', onClick: () => csvInput.click() }, 'CSVを取り込む')),
        h('p', { class: 'muted small' }, '書き出すときも送り先を選ぶ画面が出ます。週次整理で読むので、ドライブの「スマホ書斎」フォルダに保存してください。'),
        h('p', { class: 'muted small' }, '取り込みはスマホ書斎で書き出したCSVの形に限ります。今の本棚に追加され、同じISBNの本は飛ばします。'),
        csvInput))],
      rakuten: ['本の表紙（楽天ブックス）', () => titled('本の表紙（楽天ブックス）', h('div', { class: 'card' },
        h('p', { class: 'muted small', style: { marginTop: 0 } }, '楽天ウェブサービスで作ったアプリIDとアクセスキーを入れると、表紙が出ない本を楽天から探します。キーはこのスマホの中だけに保存し、バックアップにも入れません（スマホを替えたら入れ直してください）。'),
        h('label', { class: 'field' }, h('span', {}, 'アプリID'), appIdInput),
        h('label', { class: 'field' }, h('span', {}, 'アクセスキー'), keyInput),
        h('button', { class: 'btn primary wide', onClick: async () => {
          await db.setSetting('rakutenAppId', appIdInput.value.trim());
          await db.setSetting('rakutenAccessKey', keyInput.value.trim());
          toast(appIdInput.value.trim() && keyInput.value.trim() ? '保存しました。これから登録する本の表紙も楽天から探します' : '楽天を使わない設定にしました');
          render();
        } }, '保存する'),
        fillBtn))],
      google: ['本の表紙（Google Books）', () => titled('本の表紙（Google Books）', h('div', { class: 'card' },
        h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Google Cloud で作った Books API のキーを入れると、openBD と楽天で表紙が見つからない本を Google Books から探します。キーはこのスマホの中だけに保存し、バックアップにも入れません。'),
        h('label', { class: 'field' }, h('span', {}, 'APIキー'), googleInput),
        h('button', { class: 'btn primary wide', onClick: async () => {
          await db.setSetting('googleBooksKey', googleInput.value.trim());
          toast(googleInput.value.trim() ? '保存しました。表紙が見つからない本は Google Books からも探します' : 'Google Books を使わない設定にしました');
          render();
        } }, '保存する'),
        h('p', { class: 'muted small' }, '「表紙のない本に表紙を付ける」は、楽天の欄のボタンから。楽天→Google Books の順に探します。欲しい本の表紙も一緒に探します。')))],
      stale: ['古いかもの判定', () => titled('古いかもの判定', h('div', { class: 'card' },
        h('p', { class: 'muted small', style: { marginTop: 0 } }, 'このタグの本は、発行からこの年数がたったら「古いかも」と出します'),
        ruleRows.length ? ruleRows : h('p', { class: 'small' }, '（使っていません）'),
        addRule,
        h('p', { class: 'muted small', style: { marginTop: '18px' } }, 'タグがなくても、この分類の本は同じように判定します。分類が付いた本だけが対象です'),
        classRows.length ? classRows : h('p', { class: 'small' }, '（使っていません）'),
        addClassRule))],
      tags: ['タグの整理', () => [h('details', { class: 'card', style: { marginTop: '22px' }, open: openTagsOnRender, onToggle: e => { openTagsOnRender = e.target.open; } },
        h('summary', { style: { cursor: 'pointer', fontWeight: '700', minHeight: '40px' } }, `タグの整理（${tags.length}個）`),
        tagAdd,
        tagRows)]],
    };
    const order = applyOrder(Object.keys(sections), sectionOrder);

    function openOrderSheet() {
      let ids = [...order];
      const listEl = h('ul', { class: 'pick-list' });
      const draw = () => fill(listEl, ...ids.map((id, i) => h('li', { class: 'order-row' },
        h('span', { class: 'name' }, sections[id][0]),
        h('button', { class: 'icon-btn', 'aria-label': '上へ', disabled: i === 0, onClick: () => move(i, -1) }, '↑'),
        h('button', { class: 'icon-btn', 'aria-label': '下へ', disabled: i === ids.length - 1, onClick: () => move(i, 1) }, '↓'))));
      async function move(i, d) {
        ids = moveItem(ids, i, d);
        draw();
        await db.setSetting('settingsOrder', ids);
        render();
      }
      draw();
      sheet(h('div', {}, listEl,
        h('button', { class: 'btn wide', style: { marginTop: '14px' }, onClick: async () => {
          ids = Object.keys(sections);
          draw();
          await db.setSetting('settingsOrder', ids);
          render();
        } }, '最初の並びに戻す')), { title: '設定の並び順', thumbClose: true });
    }

    fill(container,
      h('div', { class: 'card', style: { marginTop: '6px' } },
        h('div', { class: 'about-name' }, '自宅の書斎をスマホに入れよう'),
        h('div', { class: 'muted small' }, '所有している書籍、漫画、雑誌などを家から離れても参照できるアプリ。略して『スマホ書斎』。')),
      ...order.flatMap(id => sections[id][1]()),
      h('button', { class: 'btn wide', style: { marginTop: '24px' }, onClick: openOrderSheet }, '設定の並び順を変える'),

      h('button', { class: 'btn wide', style: { marginTop: '10px' }, onClick: openAbout }, 'このアプリについて（プライバシーポリシー・免責・クレジット）'),
      h('p', { class: 'muted small', style: { marginTop: '16px' } },
        '本の情報は、国立国会図書館サーチのAPIと openBD を利用して取得しています。', rakutenAppId ? h('span', {}, ' 表紙の一部は楽天ブックスから取得しています：', rakutenCredit()) : '', googleBooksKey ? ' 表紙の一部は Google Books から取得しています。' : ''),
    );
  }

  render();
  return () => { disposed = true; };
}
