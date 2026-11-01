// 数字を写真で読む: for books whose ISBN is printed only as text (鬼さん 2026-11-01). tesseract.js reads the
// photo on the phone; nothing is sent anywhere. Its files (~7MB) load on first use only (vendor/README.md).

import { findIsbnInText } from './core/isbn.js';

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;
const WORK_SIDE = 2000; // the ISBN line is small in a phone photo; much smaller and its digits blur together

let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error('文字を読む部品を読み込めませんでした'));
    document.head.append(el);
  });
}

async function getWorker() {
  workerPromise ??= (async () => {
    if (!window.Tesseract) await loadScript(`${BASE}tesseract.min.js`);
    const worker = await window.Tesseract.createWorker('eng', 1, {
      workerPath: `${BASE}worker.min.js`,
      corePath: `${BASE}tesseract-core-simd-lstm.wasm.js`,
      langPath: BASE.replace(/\/$/, ''),
      workerBlobURL: false,
    });
    // 11 = sparse text: on 鬼さん's photo the whole-page modes lost the ISBN among the big title letters.
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    return worker;
  })().catch(err => { workerPromise = null; throw err; });
  return workerPromise;
}

function toCanvas(bitmap, quarterTurns) {
  const scale = Math.min(1, WORK_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const sideways = quarterTurns % 2 === 1;
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((quarterTurns * Math.PI) / 2);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  return canvas;
}

// Returns the ISBN found in the photo, or null. The photo is also tried turned sideways,
// because the number is often printed along the spine or the book is held on its side.
export async function readIsbnFromPhoto(file) {
  const worker = await getWorker();
  const bitmap = await createImageBitmap(file);
  try {
    for (const turns of [0, 1, 3]) {
      const { data } = await worker.recognize(toCanvas(bitmap, turns));
      const isbn = findIsbnInText(data.text);
      if (isbn) return isbn;
    }
    return null;
  } finally {
    bitmap.close?.();
  }
}

// Opens the camera (or the photo picker) and resolves with the chosen file, or null.
export function takePhoto() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.click();
  });
}
