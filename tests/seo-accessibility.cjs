const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
test('public shell remains readable without Alpine and has sharing metadata', () => {
  const html = read('index.html');
  assert.doesNotMatch(html.match(/<body[^>]*>/)[0], /x-cloak/);
  assert.match(html, /<main\b/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /name="twitter:card"/);
  assert.match(html, /id="static-menu"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(read('admin.html'), /name="robots" content="noindex, nofollow"/);
});
test('dialogs and form controls have explicit accessible names', () => {
  const html = read('index.html');
  assert.equal((html.match(/role="dialog"/g) || []).length, 3);
  assert.match(html, /aria-label="جستجو در منو"/);
  assert.match(html, /aria-label="باز کردن منوی اصلی"/);
  assert.match(html, /aria-label="پیام شما"/);
  assert.match(html, /aria-label="کاهش تعداد"/);
  assert.match(html, /js\/accessibility(?:\.min)?\.js/);
});
