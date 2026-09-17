const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
for (const page of ['index.html', 'admin.html']) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert(!html.includes('lib/tailwindcss.js'), `${page}: runtime Tailwind still blocks parsing`);
  assert(html.includes('css/tw.min.css'), `${page}: static utility stylesheet missing`);
  assert.equal((html.match(/src="lib\/alpine.min.js[^\"]*"/g)||[]).length, 1);
}
const css = fs.readFileSync(path.join(root, 'css/tw.min.css'), 'utf8');
assert(css.includes('.grid') && css.includes('.hidden') && css.includes('.fixed'));
console.log('PASS: static Tailwind on both pages; Alpine preserved');
