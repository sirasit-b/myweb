// Issue #4: the app page background (--bg) is green in both themes — a soft
// green tint in light mode, a deep green in dark mode — and text stays readable.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];

const lightBlock = css.match(/^:root\{([\s\S]*?)\}/m)[1];
const darkBlock = css.match(/@media \(prefers-color-scheme: dark\)\{([\s\S]*?)\n\}/)[1];
const tok = (block, name) => (block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];
// dark theme inherits any token it does not override
const themes = {
  light: name => tok(lightBlock, name),
  dark: name => tok(darkBlock, name) || tok(lightBlock, name),
};

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const lum = hex => {
  const [r, g, b] = rgb(hex).map(c => c / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('body background uses the --bg token', () => {
  assert.match(css, /\nbody\{[^}]*background:var\(--bg\)/);
});

for (const [name, t] of Object.entries(themes)) {
  test(`${name} theme: --bg is green (green channel clearly largest)`, () => {
    const bg = t('bg');
    assert.ok(bg, `${name} --bg defined`);
    const [r, g, b] = rgb(bg);
    assert.ok(g > r && g > b, `${bg}: green must be the largest channel`);
    assert.ok(g - Math.max(r, b) >= 8, `${bg}: green must lead by a clear margin`);
  });

  test(`${name} theme: --text and --muted meet WCAG AA (>= 4.5:1) on --bg`, () => {
    const bg = t('bg');
    for (const fg of ['text', 'muted']) {
      const c = contrast(t(fg), bg);
      assert.ok(c >= 4.5, `--${fg} ${t(fg)} on ${bg} is ${c.toFixed(2)}:1`);
    }
  });

  test(`${name} theme: .btn.primary text (--bg on --text) meets WCAG AA`, () => {
    const c = contrast(t('bg'), t('text'));
    assert.ok(c >= 4.5, `primary button contrast is ${c.toFixed(2)}:1`);
  });

  test(`${name} theme: borders (--line) stay visible against --bg`, () => {
    const c = contrast(t('line'), t('bg'));
    assert.ok(c >= 1.15, `--line ${t('line')} on ${t('bg')} is ${c.toFixed(2)}:1`);
  });
}
