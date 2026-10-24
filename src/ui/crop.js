// Cut the book out of a photo: four corner points, found automatically when possible, dragged by hand otherwise.
// 鬼さん 2026-10-25: like Microsoft Lens, keep the book and drop the background.

import { h, sheet } from './dom.js';
import { detectQuad } from '../core/detect.js';
import { quadSize, warpQuad } from '../core/warp.js';

const OUT_SIDE = 640;
const QUALITY = 0.82;
const INSET = [[0.08, 0.08], [0.92, 0.08], [0.92, 0.92], [0.08, 0.92]];

const toDataUrl = (imageData) => {
  const c = document.createElement('canvas');
  c.width = imageData.width;
  c.height = imageData.height;
  c.getContext('2d').putImageData(new ImageData(imageData.data, imageData.width, imageData.height), 0, 0);
  return c.toDataURL('image/jpeg', QUALITY);
};

// Whole photo, only shrunk (for "そのまま使う").
const plain = canvas => {
  const s = Math.min(1, OUT_SIDE / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * s);
  c.height = Math.round(canvas.height * s);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', QUALITY);
};

export function openCrop(canvas) {
  return new Promise(resolve => {
    const W = canvas.width, H = canvas.height;
    const source = canvas.getContext('2d').getImageData(0, 0, W, H);
    const found = detectQuad(source);
    // Corners kept as fractions of the photo so they survive any display size.
    let quad = (found ?? INSET.map(([x, y]) => [x * W, y * H])).map(([x, y]) => [x / W, y / H]);

    const view = h('canvas', { class: 'crop-photo' });
    view.width = W;
    view.height = H;
    view.getContext('2d').drawImage(canvas, 0, 0);
    const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    lines.setAttribute('class', 'crop-lines');
    lines.setAttribute('viewBox', '0 0 100 100');
    lines.setAttribute('preserveAspectRatio', 'none');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    lines.append(poly);
    const handles = quad.map(() => h('span', { class: 'crop-handle', role: 'slider', 'aria-label': '本の角' }));
    const stage = h('div', { class: 'crop-stage' }, view, lines, ...handles);
    stage.style.maxWidth = `calc(56vh * ${W / H})`; // tall photos stay within the screen without stretching

    const draw = () => {
      poly.setAttribute('points', quad.map(([x, y]) => `${x * 100},${y * 100}`).join(' '));
      handles.forEach((el, i) => { el.style.left = `${quad[i][0] * 100}%`; el.style.top = `${quad[i][1] * 100}%`; });
    };
    handles.forEach((el, i) => {
      el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('on'); });
      el.addEventListener('pointermove', e => {
        if (!el.hasPointerCapture(e.pointerId)) return;
        const r = stage.getBoundingClientRect();
        quad[i] = [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
        draw();
      });
      const end = () => el.classList.remove('on');
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    });
    draw();

    let decided = false;
    const finish = value => { if (decided) return; decided = true; s.close(); resolve(value); };
    const cut = () => {
      const px = quad.map(([x, y]) => [x * W, y * H]);
      const { width, height } = quadSize(px, OUT_SIDE);
      finish(toDataUrl(warpQuad(source, px, Math.max(1, width), Math.max(1, height))));
    };

    const s = sheet(h('div', {},
      h('p', { class: 'muted small', style: { marginTop: 0 } },
        found ? '本の角を自動で合わせました。ずれていたら、丸い点を指で動かしてください。' : '丸い点を、本の四隅まで指で動かしてください。'),
      stage,
      h('div', { class: 'row-buttons', style: { marginTop: '14px' } },
        h('button', { class: 'btn', onClick: () => finish(plain(canvas)) }, 'そのまま使う'),
        h('button', { class: 'btn', onClick: () => { quad = INSET.map(p => [...p]); draw(); } }, '点を戻す')),
      h('button', { class: 'btn primary wide', style: { marginTop: '10px' }, onClick: cut }, '切り抜いて使う')), { title: '表紙を切り抜く' });
    s.setAction('決定', cut);
    s.onClose(() => finish(null));
  });
}
