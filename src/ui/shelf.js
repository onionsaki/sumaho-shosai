// Placeholder until its task builds this screen.
import { h } from './dom.js';

export function mount(container) {
  container.append(h('p', { class: 'muted' }, 'この画面は準備中です。'));
  return () => {};
}
