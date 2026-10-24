// Whole-data backup and the reminder rule (spec §6 そのぶん、消える危険がある).

const APP = 'sumaho-shosai';
const VERSION = 1;
const DAY = 86400000;

export function makeBackup({ books, tags, settings }, nowIso) {
  return { app: APP, version: VERSION, exportedAt: nowIso, books, tags, settings };
}

export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, reason: 'バックアップのファイルではありません' };
  if (obj.app !== APP) return { ok: false, reason: 'スマホ書斎のバックアップではありません' };
  if (obj.version !== VERSION) return { ok: false, reason: '対応していない版のバックアップです' };
  if (![obj.books, obj.tags, obj.settings].every(Array.isArray)) return { ok: false, reason: 'バックアップの中身が欠けています' };
  if (!obj.books.every(b => b && typeof b.id === 'string' && typeof b.title === 'string')) {
    return { ok: false, reason: '本のデータが壊れています' };
  }
  return { ok: true };
}

export function shouldRemindBackup({ lastBackupAt, books, today }) {
  if (!books.length) return false;
  const [y, m, d] = today.split('-').map(Number);
  const todayMs = new Date(y, m - 1, d).getTime();
  const ref = lastBackupAt || books.reduce((min, b) => (b.createdAt < min ? b.createdAt : min), books[0].createdAt);
  if (todayMs - new Date(ref).getTime() >= 30 * DAY) return true;
  const added = lastBackupAt ? books.filter(b => b.createdAt > lastBackupAt).length : books.length;
  return added >= 50;
}

export const backupFileName = today => `スマホ書斎_バックアップ_${today.replace(/-/g, '')}.json`;
