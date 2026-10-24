// Double-read confirmation for barcodes (spec 2章 出来栄えの基準: 同じ番号を2回続けて読めたときだけ確定).

// Reads are counted per code, so the price barcode printed next to the ISBN does not reset the count.
export function createConfirmer({ required = 2, windowMs = 1500, cooldownMs = 3000 } = {}) {
  const seen = new Map(); // code -> { count, lastAt }
  const emittedAt = new Map();

  return {
    push(code, nowMs) {
      const prev = seen.get(code);
      const count = prev && nowMs - prev.lastAt <= windowMs ? prev.count + 1 : 1;
      const coolingDown = emittedAt.has(code) && nowMs - emittedAt.get(code) < cooldownMs;
      seen.set(code, { count: coolingDown ? 0 : count, lastAt: nowMs });
      if (coolingDown || count < required) return null;
      emittedAt.set(code, nowMs);
      seen.set(code, { count: 0, lastAt: nowMs });
      return code;
    },
  };
}
