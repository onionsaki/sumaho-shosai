# Vendored code

Copied into the app so it works offline and never loads code from a CDN.

| Folder | Package | Version | Files | License |
| --- | --- | --- | --- | --- |
| `barcode-detector/` | `barcode-detector` (BarcodeDetector polyfill) | 3.2.2 | `dist/es/ponyfill.js`, `dist/es/zxing-exported.js`, `LICENSE` | MIT |
| `barcode-detector/` | `zxing-wasm` (dependency of the above) | 3.1.3 | `dist/reader/zxing_reader.wasm` (SHA-256 `2ebda08a93eea3efcd8399cda6b276e6a0b1de4fec60b4d8988a047de4c6d1ba`, matches `ZXING_WASM_SHA256` in the polyfill), `LICENSE` → `LICENSE-zxing-wasm` | MIT |

`src/camera.js` calls `setZXingModuleOverrides` so the `.wasm` loads from this folder instead of jsDelivr.
Used only when the phone's Chrome has no native `BarcodeDetector` with `ean_13`.
