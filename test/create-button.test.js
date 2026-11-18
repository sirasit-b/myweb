// Issue #2: the primary "create task" button (+ จดงาน) uses yellow #FFC000
// with dark text and an accessible hover state; other buttons are unchanged.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];

// Light-theme :root block (the first one, outside the media query)
const rootBlock = css.match(/^:root\{([\s\S]*?)\}/m)[1];
const darkBlock = css.match(/@media \(prefers-color-scheme: dark\)\{([\s\S]*?)\n\}/)[1];
const token = name => (rootBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];
const rule = sel => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
  return (css.match(new RegExp(`(?:^|\\n)${esc}\\{([^}]*)\\}`)) || [])[1];
};

const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('create tokens: #FFC000 background with dark text and a hover shade', () => {
  assert.strictEqual(token('create')?.toUpperCase(), '#FFC000');
  assert.ok(token('create-text'), '--create-text is defined');
  assert.ok(token('create-hover'), '--create-hover is defined');
  assert.ok(lum(token('create-text')) < 0.05, 'text on yellow must be dark, not white');
});

test('create button text meets WCAG AA (>= 4.5:1) normally and on hover', () => {
  assert.ok(contrast(token('create'), token('create-text')) >= 4.5);
  assert.ok(contrast(token('create-hover'), token('create-text')) >= 4.5);
  assert.notStrictEqual(token('create-hover').toLowerCase(), token('create').toLowerCase());
});

test('dark theme does not override the create tokens (same yellow in both themes)', () => {
  assert.doesNotMatch(darkBlock, /--create/);
});

test('.btn.create rule uses the tokens and a solid hover state', () => {
  const base = rule('.btn.create');
  const hover = rule('.btn.create:hover');
  assert.ok(base, '.btn.create rule exists');
  assert.match(base, /background:var\(--create\)/);
  assert.match(base, /color:var\(--create-text\)/);
  assert.match(base, /border-color:var\(--create\)/);
  assert.doesNotMatch(base, /padding|border-radius|font-size|width|height|margin/, 'size/shape unchanged');
  assert.ok(hover, '.btn.create:hover rule exists');
  assert.match(hover, /background:var\(--create-hover\)/);
  assert.match(hover, /opacity:1/, 'cancels the .btn.primary opacity fade so contrast holds');
  // must come after .btn.primary so it wins at equal specificity
  assert.ok(css.indexOf('.btn.create{') > css.indexOf('.btn.primary:hover{'));
});

test('only the "+ จดงาน" buttons get the create class', () => {
  const buttons = [...html.matchAll(/<button class="([^"]*)"[^>]*>([^<]*)/g)];
  const create = buttons.filter(([, cls]) => cls.split(' ').includes('create'));
  assert.strictEqual(create.length, 2);
  for (const [, cls, text] of create) {
    assert.strictEqual(cls, 'btn primary create');
    assert.match(text, /\+ จดงาน/);
  }
  for (const label of ['+ เพิ่มสมาชิก', '+ โปรเจกต์ใหม่', 'บันทึก', '+ จดงานด่วน']) {
    const b = buttons.find(([, , text]) => text.trim().startsWith(label) && !(label === 'บันทึก' && text.includes('+')));
    assert.ok(b, `found button ${label}`);
    assert.ok(!b[1].split(' ').includes('create'), `${label} keeps its original style`);
  }
});

test('other button rules are unchanged', () => {
  assert.strictEqual(rule('.btn'), 'border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:7px 14px;cursor:pointer');
  assert.strictEqual(rule('.btn:hover'), 'background:var(--hover)');
  assert.strictEqual(rule('.btn.primary'), 'background:var(--text);color:var(--bg);border-color:var(--text)');
  assert.strictEqual(rule('.btn.primary:hover'), 'opacity:.88');
  assert.strictEqual(rule('.capture-btn:hover'), 'border-color:var(--muted)');
});
