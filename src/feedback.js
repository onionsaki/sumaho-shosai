// Beeps and vibration so results are clear without looking (spec §4-1).

export function createFeedback() {
  let ctx = null;

  const tone = (freq, ms, at = 0) => {
    if (!ctx) return;
    const start = ctx.currentTime + at / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + ms / 1000 + 0.02);
  };
  const vibrate = pattern => { try { navigator.vibrate?.(pattern); } catch { /* unsupported */ } };

  return {
    unlock() {
      try {
        ctx ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
      } catch { ctx = null; }
    },
    success() { tone(1320, 80); vibrate(40); },
    duplicate() { tone(880, 70); tone(880, 70, 130); vibrate([40, 60, 40]); },
    error() { tone(330, 400); vibrate(300); },
  };
}
