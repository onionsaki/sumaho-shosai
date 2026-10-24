// Tag picker sheet with search, so long tag lists stay folded away (鬼さん 2026-10-24: タグは無限に増える).

import { h, fill, sheet } from './dom.js';
import { normalizeForSearch } from '../core/normalize.js';

// tags: Tag[]; selected: string[]; onToggle(id) -> void; onCreate(name) -> Promise<Tag> (optional)
export function openTagPicker({ title = 'タグ', tags, selected, onToggle, onCreate, note = '' }) {
  const chosen = new Set(selected);
  const input = h('input', { type: 'search', placeholder: onCreate ? 'タグを探す・新しく作る' : 'タグを探す' });
  const list = h('div', { class: 'chips', style: { marginTop: '10px' } });
  const draw = () => {
    const q = normalizeForSearch(input.value);
    const hits = tags.filter(t => !q || normalizeForSearch(t.name).includes(q));
    const exact = tags.some(t => normalizeForSearch(t.name) === q);
    fill(list, 
      ...hits.map(t => h('button', {
        class: chosen.has(t.id) ? 'chip on' : 'chip',
        onClick: () => { chosen.has(t.id) ? chosen.delete(t.id) : chosen.add(t.id); onToggle(t.id); draw(); },
      }, t.name)),
      onCreate && q && !exact ? h('button', { class: 'chip', onClick: async () => {
        const tag = await onCreate(input.value.trim());
        if (!tags.some(t => t.id === tag.id)) tags.push(tag);
        if (!chosen.has(tag.id)) { chosen.add(tag.id); onToggle(tag.id); }
        input.value = '';
        draw();
      } }, `「${input.value.trim()}」を作る`) : null,
      hits.length ? null : h('p', { class: 'muted small' }, '見つかりません'));
  };
  input.addEventListener('input', draw);
  draw();
  return sheet(h('div', {}, note ? h('p', { class: 'muted small' }, note) : null, input, list), { title });
}

// Shows only the chosen tags plus one button that opens the picker.
export function tagSummary(tags, selected, onOpen, emptyLabel = 'タグを選ぶ') {
  const names = selected.map(id => tags.find(t => t.id === id)?.name).filter(Boolean);
  return h('div', { class: 'chips' },
    ...names.map(n => h('span', { class: 'chip on' }, n)),
    h('button', { class: 'chip', onClick: onOpen }, names.length ? `変更（全${tags.length}個）` : `${emptyLabel}（全${tags.length}個）`));
}
