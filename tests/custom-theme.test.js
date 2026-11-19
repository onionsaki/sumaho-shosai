import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customThemeVars, hslToHex, contrast, DEFAULT_CUSTOM, normalizeCustom } from '../src/core/custom-theme.js';

const hexOf = v => v; // variables that must stay plain #rrggbb for the contrast check

test('hslToHex matches known colours', () => {
  assert.equal(hslToHex(0, 0, 100), '#ffffff');
  assert.equal(hslToHex(0, 0, 0), '#000000');
  assert.equal(hslToHex(0, 100, 50), '#ff0000');
  assert.equal(hslToHex(120, 100, 25), '#008000');
});

test('the ground is exactly the chosen colour', () => {
  const vars = customThemeVars({ h: 340, s: 40, l: 90 });
  assert.equal(vars['--bg'], hslToHex(340, 40, 90));
});

test('text stays readable on every colour the sliders can make', () => {
  for (let h = 0; h < 360; h += 30) for (const s of [0, 30, 60, 100]) for (let l = 5; l <= 95; l += 5) {
    const v = customThemeVars({ h, s, l });
    const where = `h${h} s${s} l${l}`;
    assert.ok(contrast(hexOf(v['--ink']), v['--bg']) >= 4.5, `ink ${where}`);
    assert.ok(contrast(v['--accent-ink'], v['--bg']) >= 4.5, `accent-ink ${where}`);
    assert.ok(contrast(v['--muted'], v['--bg']) >= 3, `muted ${where}`);
    assert.ok(contrast(v['--on-accent'], v['--accent']) >= 4.5, `on-accent ${where}`);
    assert.ok(contrast(v['--cover-ink'], v['--cover-b']) >= 4.5, `cover-ink ${where}`);
    assert.ok(contrast('#ffffff', v['--toast']) >= 4.5, `toast ${where}`);
  }
});

test('dark and pale grounds switch the colour scheme', () => {
  assert.equal(customThemeVars({ h: 220, s: 40, l: 15 })['color-scheme'], 'dark');
  assert.equal(customThemeVars({ h: 220, s: 40, l: 90 })['color-scheme'], 'light');
});

test('a broken saved value falls back instead of breaking the screen', () => {
  assert.deepEqual(normalizeCustom(null), DEFAULT_CUSTOM);
  assert.deepEqual(normalizeCustom({ h: 'x', s: 500, l: -3 }), { h: DEFAULT_CUSTOM.h, s: 100, l: 5 });
});
