# Vendored code

Copied into the app so it works offline and never loads code from a CDN.

| Folder | Package | Version | Files | License |
| --- | --- | --- | --- | --- |
| `barcode-detector/` | `barcode-detector` (BarcodeDetector polyfill) | 3.2.2 | `dist/es/ponyfill.js`, `dist/es/zxing-exported.js`, `LICENSE` | MIT |
| `barcode-detector/` | `zxing-wasm` (dependency of the above) | 3.1.3 | `dist/reader/zxing_reader.wasm` (SHA-256 `2ebda08a93eea3efcd8399cda6b276e6a0b1de4fec60b4d8988a047de4c6d1ba`, matches `ZXING_WASM_SHA256` in the polyfill), `LICENSE` → `LICENSE-zxing-wasm` | MIT |

`src/camera.js` calls `setZXingModuleOverrides` so the `.wasm` loads from this folder instead of jsDelivr.
Used only when the phone's Chrome has no native `BarcodeDetector` with `ean_13`.

| Folder | Package | Version | Files | License |
| --- | --- | --- | --- | --- |
| `tesseract/` | `tesseract.js` (reads text in a photo) | 5.1.1 | `dist/tesseract.min.js`, `dist/worker.min.js`, `LICENSE.md` → `LICENSE-tesseract.js.md` | Apache-2.0 |
| `tesseract/` | `tesseract.js-core` | 5.1.1 | `tesseract-core-simd-lstm.wasm.js` only (every Chrome since 91 has SIMD) | Apache-2.0 |
| `tesseract/` | `@tesseract.js-data/eng` | 1.0.0 | `4.0.0_best_int/eng.traineddata.gz` | Apache-2.0 |

`src/ocr.js` points tesseract.js at this folder (worker, core and language data), so nothing comes from a CDN.
These ~7MB are not in `APP_FILES`: they load the first time 「数字を写真で読む」 is used and then stay in their own
cache (`sw.js`, `OCR_CACHE`), so a version bump does not download them again.
