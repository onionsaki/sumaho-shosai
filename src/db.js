// IndexedDB store: books, tags, settings (spec §3, §6).

import { SEED_TAGS, newId } from './core/model.js';
import { normalizeForSearch } from './core/normalize.js';

const req = r => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

const done = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

function upgrade(db) {
  const books = db.createObjectStore('books', { keyPath: 'id' });
  books.createIndex('isbn', 'isbn', { unique: true });
  books.createIndex('workKey', 'workKey');
  books.createIndex('lookup', 'lookup');
  const tags = db.createObjectStore('tags', { keyPath: 'id' });
  const settings = db.createObjectStore('settings', { keyPath: 'key' });

  const seeded = SEED_TAGS.map((name, order) => ({ id: newId(), name, order }));
  for (const tag of seeded) tags.put(tag);
  const exam = seeded.find(t => t.name === '試験用');
  const initial = {
    examTagId: exam.id,
    staleYears: 2,
    lastBackupAt: '',
    lastSession: { ownership: 'owned', readStatus: 'read', tagIds: [] },
  };
  for (const [key, value] of Object.entries(initial)) settings.put({ key, value });
}

const stripIsbn = book => {
  const copy = { ...book };
  if (!copy.isbn) delete copy.isbn;
  return copy;
};
const cleanBook = book => ({ ...stripIsbn(book), updatedAt: new Date().toISOString() });

export async function openDb(name = 'sumaho-shosai') {
  const open = indexedDB.open(name, 1);
  open.onupgradeneeded = () => upgrade(open.result);
  const idb = await req(open);

  const store = (names, mode = 'readonly') => {
    const tx = idb.transaction(names, mode);
    return { tx, get: n => tx.objectStore(n) };
  };

  const api = {
    close: () => idb.close(),

    async getBook(id) {
      return req(store('books').get('books').get(id));
    },
    async getBookByIsbn(isbn) {
      return req(store('books').get('books').index('isbn').get(isbn));
    },
    async putBook(book) {
      const copy = cleanBook(book);
      const { tx, get } = store('books', 'readwrite');
      get('books').put(copy);
      await done(tx);
      return copy;
    },
    async deleteBook(id) {
      const { tx, get } = store('books', 'readwrite');
      get('books').delete(id);
      await done(tx);
    },
    async allBooks() {
      return req(store('books').get('books').getAll());
    },
    async booksByWorkKey(key) {
      return req(store('books').get('books').index('workKey').getAll(key));
    },
    async booksByLookup(state) {
      return req(store('books').get('books').index('lookup').getAll(state));
    },
    async addBooksSkippingDuplicates(books) {
      const existing = new Set((await api.allBooks()).map(b => b.isbn).filter(Boolean));
      const { tx, get } = store('books', 'readwrite');
      let added = 0;
      let skipped = 0;
      for (const book of books) {
        if (book.isbn && existing.has(book.isbn)) { skipped++; continue; }
        if (book.isbn) existing.add(book.isbn);
        get('books').put(cleanBook(book));
        added++;
      }
      await done(tx);
      return { added, skipped };
    },

    async allTags() {
      const tags = await req(store('tags').get('tags').getAll());
      return tags.sort((a, b) => a.order - b.order);
    },
    async putTag(tag) {
      const { tx, get } = store('tags', 'readwrite');
      get('tags').put(tag);
      await done(tx);
      return tag;
    },
    async createTag(name) {
      const trimmed = String(name ?? '').trim();
      const key = normalizeForSearch(trimmed);
      const tags = await api.allTags();
      const found = tags.find(t => normalizeForSearch(t.name) === key);
      if (found) return found;
      const order = tags.reduce((max, t) => Math.max(max, t.order), -1) + 1;
      return api.putTag({ id: newId(), name: trimmed, order });
    },
    async deleteTag(id) {
      await api.mergeTags(id, null);
    },
    async mergeTags(fromId, intoId) {
      const books = await api.allBooks();
      const { tx, get } = store(['books', 'tags'], 'readwrite');
      for (const book of books) {
        if (!book.tagIds.includes(fromId)) continue;
        const replaced = book.tagIds.map(t => (t === fromId ? intoId : t)).filter(Boolean);
        get('books').put({ ...book, tagIds: [...new Set(replaced)], updatedAt: new Date().toISOString() });
      }
      get('tags').delete(fromId);
      await done(tx);
    },

    async getSetting(key) {
      const row = await req(store('settings').get('settings').get(key));
      return row?.value;
    },
    async setSetting(key, value) {
      const { tx, get } = store('settings', 'readwrite');
      get('settings').put({ key, value });
      await done(tx);
    },
    async allSettings() {
      return req(store('settings').get('settings').getAll());
    },

    async replaceAll({ books, tags, settings }) {
      const { tx, get } = store(['books', 'tags', 'settings'], 'readwrite');
      for (const n of ['books', 'tags', 'settings']) get(n).clear();
      for (const book of books) get('books').put(stripIsbn(book));
      for (const tag of tags) get('tags').put(tag);
      for (const row of settings) get('settings').put(row);
      await done(tx);
    },
  };
  return api;
}
