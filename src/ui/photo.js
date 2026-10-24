// Take or choose a photo and shrink it before it is stored with the book (鬼さん 2026-10-25:
// covers for books without a barcode, and a record of a book before it is given away).

const MAX_SIDE = 640;
const QUALITY = 0.8;

export function pickPhoto() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      resolve(file ? await shrink(file).catch(() => null) : null);
    });
    input.click();
  });
}

async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', QUALITY);
}
