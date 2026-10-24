// Boot and tab router (spec §4).

import { openDb } from './db.js';
import { createLookupQueue } from './lookup.js';
import { toast } from './ui/dom.js';
import { applyTheme } from './ui/theme.js';

const TABS = {
  scan: () => import('./ui/scan.js'),
  shelf: () => import('./ui/shelf.js'),
  settings: () => import('./ui/settings.js'),
};

const view = document.getElementById('view');
let unmount = null;
let mountToken = 0;

function currentTab() {
  const tab = location.hash.replace('#', '').split('?')[0];
  return TABS[tab] ? tab : 'scan';
}

async function mountTab(ctx) {
  const tab = currentTab();
  const token = ++mountToken;
  for (const a of document.querySelectorAll('.tabbar a')) a.classList.toggle('on', a.dataset.tab === tab);
  const mod = await TABS[tab]();
  if (token !== mountToken) return;
  if (unmount) unmount();
  view.replaceChildren();
  unmount = mod.mount(view, ctx) ?? null;
}

async function boot() {
  const db = await openDb();
  try { await navigator.storage?.persist?.(); } catch { /* not critical */ }
  applyTheme(await db.getSetting('theme'));
  (await import('./ui/shelf.js')).setPhotoSource(id => db.getPhoto(id));
  const lookup = createLookupQueue({
    db,
    getRakutenKeys: async () => {
      const appId = await db.getSetting('rakutenAppId');
      const accessKey = await db.getSetting('rakutenAccessKey');
      return appId && accessKey ? { appId, accessKey } : null;
    },
  });

  const ctx = {
    db,
    lookup,
    feedback: null,
    navigate(tab) {
      if (location.hash === `#${tab}`) mountTab(ctx);
      else location.hash = tab;
    },
    async openDetail(bookId) {
      const { openDetail } = await import('./ui/detail.js');
      openDetail(bookId, ctx);
    },
    async openAdd(prefill) {
      const { openAdd } = await import('./ui/add.js');
      openAdd(ctx, prefill);
    },
    refresh: () => mountTab(ctx),
  };
  window.addEventListener('hashchange', () => mountTab(ctx));
  window.addEventListener('online', () => lookup.resumePending());
  await mountTab(ctx);
  lookup.resumePending();

  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) toast('新しい版になりました', { action: { label: '再読み込み', onClick: () => location.reload() } });
    });
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot().catch(err => {
  view.textContent = `起動できませんでした：${err?.message ?? err}`;
});
