// Double-read confirmation for barcodes (spec 2章 出来栄えの基準: 同じ番号を2回続けて読めたときだけ確定).

export function createConfirmer({ required = 2, windowMs = 1500, cooldownMs = 3000 } = {}) {
  let lastCode = null;
  let lastAt = -Infinity;
  let count = 0;
  const emittedAt = new Map();

  return {
    push(code, nowMs) {
      const coolingDown = emittedAt.has(code) && nowMs - emittedAt.get(code) < cooldownMs;
      count = code === lastCode && nowMs - lastAt <= windowMs ? count + 1 : 1;
      lastCode = code;
      lastAt = nowMs;
      if (coolingDown) { count = 0; return null; }
      if (count < required) return null;
      emittedAt.set(code, nowMs);
      count = 0;
      return code;
    },
  };
}
