// Rear camera + barcode detection loop (spec §7 作りの方針).
// Native BarcodeDetector when it supports EAN-13, otherwise the vendored polyfill (never a CDN).

const POLYFILL = '../vendor/barcode-detector/ponyfill.js';
const WASM = new URL('../vendor/barcode-detector/zxing_reader.wasm', import.meta.url).href;
const isDev = () => location.hostname === 'localhost';

let detectorPromise = null;

async function createDetector() {
  if ('BarcodeDetector' in globalThis) {
    try {
      const formats = await globalThis.BarcodeDetector.getSupportedFormats();
      if (formats.includes('ean_13')) {
        detectorKind = '端末の機能';
        return new globalThis.BarcodeDetector({ formats: ['ean_13'] });
      }
    } catch { /* fall through to the polyfill */ }
  }
  detectorKind = '予備の部品';
  const mod = await import(POLYFILL);
  mod.setZXingModuleOverrides({ locateFile: (path, prefix) => (path.endsWith('.wasm') ? WASM : prefix + path) });
  return new mod.BarcodeDetector({ formats: ['ean_13'] });
}

export function getDetector() {
  detectorPromise ??= createDetector();
  return detectorPromise;
}

let detectorKind = '';

// Only the middle band of the frame (where the guide box is) is examined, scaled down.
// Smaller images make each read much faster, especially with the polyfill.
function cropBand(video, canvas) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return video;
  const sx = vw * 0.08;
  const sw = vw * 0.84;
  const sy = vh * 0.25;
  const sh = vh * 0.5;
  const scale = Math.min(1, 800 / sw);
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function startCamera(video, { onCode, onError, onStatus }) {
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    if (!isDev()) throw err;
  }

  let stopped = false;
  let busy = false;
  let timer = null;
  if (stream) {
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.srcObject = stream;
    await video.play();
    const detector = await getDetector();
    const canvas = document.createElement('canvas');
    let ticks = 0;
    let last = '';
    let lastMs = 0;
    timer = setInterval(async () => {
      if (stopped || busy || video.readyState < 2) return;
      busy = true;
      const t0 = performance.now();
      try {
        // Every 4th try looks at the whole frame in case the book is outside the band.
        const source = ticks % 4 === 3 ? video : cropBand(video, canvas);
        for (const code of await detector.detect(source)) { last = code.rawValue; onCode(code.rawValue); }
      } catch (err) {
        onError?.(err);
      } finally {
        ticks++;
        lastMs = Math.round(performance.now() - t0);
        onStatus?.({ kind: detectorKind, ticks, last, ms: lastMs });
        busy = false;
      }
    }, 120);
  }
  if (isDev()) window.__fakeScan = raw => onCode(String(raw));

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
    stream?.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    if (isDev()) delete window.__fakeScan;
  };
}
