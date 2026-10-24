// Take or choose a photo, then cut the book out of it before it is stored (鬼さん 2026-10-25:
// covers for books without a barcode, a record of a book before it is given away, and Lens-style cut-out).

import { openCrop } from './crop.js';

const WORK_SIDE = 1600; // enough detail to straighten; the stored picture is shrunk to 640px in crop.js

export function pickPhoto() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try {
        resolve(await openCrop(await toCanvas(file)));
      } catch {
        resolve(null);
      }
    });
    input.click();
  });
}

async function toCanvas(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, WORK_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}
