const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const themes = ['classic', 'garden', 'midnight'];
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(root, 'templates', name), 'utf8');

test('three complete RTL static menus and a linked gallery are available without JavaScript', () => {
  assert(fs.existsSync(path.join(root, 'templates/index.html')), 'template gallery is missing');
  const gallery = read('index.html');
  for (const theme of themes) {
    assert(gallery.includes(`href="${theme}/index.html"`), `${theme}: gallery link`);
    const html = read(`${theme}/index.html`);
    assert.match(html, /<html lang="fa" dir="rtl">/);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
    assert.equal((html.match(/data-product-id=/g) || []).length, 8);
    for (const semantic of ['<main', '<nav', '<footer', '<article', '<dialog', '<noscript']) assert(html.includes(semantic), `${theme}: ${semantic}`);
    assert.match(html, /هویت و قیمت‌ها نمونه‌اند/);
    assert.match(html, /سفارش واقعی ثبت نمی‌شود/);
    assert.match(html, /aria-labelledby="cart-title"/);
    assert.match(html, /<label for="menu-search"/);
    assert.match(html, /aria-pressed="true"/);
    assert.match(html, /href="#main"/);
    assert(!/https?:\/\//.test(html), `${theme}: remote dependency`);
    for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const asset = match[1];
      assert(fs.existsSync(path.resolve(root, 'templates', theme, asset)), `${theme}: missing ${asset}`);
    }
  }
});

test('Persian search normalizes Arabic letters, spacing and marks while combining category', () => {
  assert(fs.existsSync(path.join(root, 'templates/model.js')), 'demo model is missing');
  const model = require('../templates/model.js');
  const products = [{id:'tea', name:'چای بهارنارنج', description:'دمنوش گرم', category:'tea', price:65000}, {id:'cake', name:'کیک شکلاتی', description:'گردو', category:'sweet', price:125000}];
  assert.equal(model.filter(products, 'چاي', 'all')[0].id, 'tea');
  assert.equal(model.filter(products, 'كِيك', 'sweet')[0].id, 'cake');
  assert.equal(model.filter(products, 'گردو', 'sweet').length, 1);
  assert.equal(model.filter(products, 'چای', 'sweet').length, 0);
  assert.equal(model.filter(products, '  ', 'all').length, 2);
  assert.equal(model.normalize('آیس‌لاته'), model.normalize('آیس لاته'));
});

test('cart validates saved values, isolates known products and computes actual quantity totals', () => {
  const model = require('../templates/model.js');
  const products = [{id:'tea', price:65000}, {id:'cake', price:125000}];
  let cart = model.sanitize({tea:2, cake:1, unknown:99}, products);
  assert.deepEqual(cart, {tea:2, cake:1});
  assert.deepEqual(model.summary(cart, products), {count:3,total:255000});
  cart = model.change(cart, 'tea', -1, products);
  assert.equal(cart.tea, 1);
  cart = model.change(cart, 'tea', -1, products);
  assert.equal(cart.tea, undefined);
  assert.deepEqual(model.sanitize({tea:-2,cake:'3'}, products), {});
  assert.deepEqual(model.sanitize({tea:1.2,cake:Infinity}, products), {});
  assert.deepEqual(model.sanitize(null, products), {});
  assert.deepEqual(model.sanitize([], products), {});
  assert.deepEqual(model.change({}, 'unknown', 1, products), {});
  assert.equal(model.change({tea:99}, 'tea', 1, products).tea, 99);
  assert.equal(model.format(125000), '۱۲۵٬۰۰۰');
  let stored;
  const storage = {getItem:()=>stored, setItem:(key,value)=>{stored=value;}};
  assert.equal(model.save(storage, 'demo', {tea:2}), true);
  assert.deepEqual(model.load(storage, 'demo', products), {tea:2});
  stored = '{bad';
  assert.deepEqual(model.load(storage, 'demo', products), {});
  assert.deepEqual(model.load({getItem(){throw Error('blocked')}}, 'demo', products), {});
  assert.equal(model.save({setItem(){throw Error('quota')}}, 'demo', {}), false);
});
