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
      if (formats.includes('ean_13')) return new globalThis.BarcodeDetector({ formats: ['ean_13'] });
    } catch { /* fall through to the polyfill */ }
  }
  const mod = await import(POLYFILL);
  mod.setZXingModuleOverrides({ locateFile: (path, prefix) => (path.endsWith('.wasm') ? WASM : prefix + path) });
  return new mod.BarcodeDetector({ formats: ['ean_13'] });
}

export function getDetector() {
  detectorPromise ??= createDetector();
  return detectorPromise;
}

export async function startCamera(video, { onCode, onError }) {
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
    timer = setInterval(async () => {
      if (stopped || busy || video.readyState < 2) return;
      busy = true;
      try {
        for (const code of await detector.detect(video)) onCode(code.rawValue);
      } catch (err) {
        onError?.(err);
      } finally {
        busy = false;
      }
    }, 150);
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
