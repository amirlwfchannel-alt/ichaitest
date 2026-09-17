const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/main.css'), 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function element() {
  const classes = new Set();
  return {
    classes, writes: 0,
    classList: {
      add(...names) { names.forEach(n => classes.add(n)); },
      remove(...names) { names.forEach(n => classes.delete(n)); },
      toggle(name, force) { classes[force ? 'add' : 'delete'](name); },
    },
    getBoundingClientRect() { throw new Error('Synchronous layout read'); },
    scrollIntoView(options) { this.scrollOptions = options; },
  };
}
function boot({ cache = {}, reducedMotion = false, observerSupported = true } = {}) {
  const requests = [], logs = [], timers = [], frames = [], listeners = {}, warnings = [];
  const storage = new Map(Object.entries(cache));
  const hero = element(), navbar = element(), card = element(), body = element();
  const observers = [];
  const pending = { categories: deferred(), products: deferred(), info: deferred() };
  const cart = { myOrders: [{ id: 'existing-order' }], tracked: 0, _ensureTracker() { this.tracked++; } };
  const SupaDB = {
    ready: false,
    init() { this.ready = true; },
    fetchCategories() { requests.push('categories'); return pending.categories.promise; },
    fetchProducts() { requests.push('products'); return pending.products.promise; },
    fetchCafeInfo() { requests.push('info'); return pending.info.promise; },
    logVisit(...args) { logs.push(args); },
  };
  let factory;
  const context = vm.createContext({
    console: { warn: (...args) => warnings.push(args) },
    SupaDB,
    Alpine: { data: (name, fn) => { factory = fn; }, store: name => name === 'cart' ? cart : null },
    document: {
      addEventListener: (name, fn) => { listeners[name] = fn; }, body,
      getElementById: id => id === 'heroContent' ? hero : null,
      querySelector: selector => selector === '.navbar' ? navbar : selector === '.hero-content' ? hero : null,
      querySelectorAll: () => card.classes.has('visible') ? [] : [card],
    },
    Utils: {
      getStorage: (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
      setStorage: (key, value) => storage.set(key, value), generateId: () => 'visitor',
    },
    DEFAULT_CATEGORIES: [{ id: 'cat-1', order: 0 }],
    DEFAULT_PRODUCTS: [{ id: 'default', order: 0 }], DEFAULT_CAFE_INFO: { name: 'default' },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); },
    requestAnimationFrame: fn => frames.push(fn),
  });
  context.window = context;
  context.scrollY = 0;
  context.matchMedia = () => ({ matches: reducedMotion });
  context.addEventListener = (name, fn, options) => { listeners[name] = { fn, options }; };
  if (observerSupported) context.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.observed = new Set(); observers.push(this); }
    observe(el) { this.observed.add(el); }
    unobserve(el) { this.observed.delete(el); }
    disconnect() { this.observed.clear(); }
  };
  vm.runInContext(source, context, { filename: 'js/app.js' });
  listeners['alpine:init']();
  const app = factory();
  app.$nextTick = fn => fn();
  return { app, context, SupaDB, requests, pending, storage, logs, timers, frames, listeners, hero, navbar, card, observers, cart, warnings };
}

test('cached menu is visible synchronously while revalidation is pending', async () => {
  const h = boot({ cache: {
    cafe_categories: [{ id: 'later', order: 2 }, { id: 'cat-1', order: 0 }],
    cafe_products: [{ id: 'later', order: 2 }, { id: 'cached', order: 1 }],
    cafe_info: { name: 'cached' }, cafe_favorites: ['cached'], cafe_dark_mode: true,
  } });
  h.app.init();
  assert.equal(h.app.isLoaded, true, 'network must not gate the menu');
  assert.equal(h.app.products[0].id, 'cached');
  assert.equal(h.app.categories[0].id, 'cat-1');
  assert.equal(h.app.cafeInfo.name, 'cached');
  assert.equal(h.app.favoriteProducts[0].id, 'cached');
  assert.equal(h.app.darkMode, true);
  assert.equal(h.storage.get('cafe_visit_count'), 1);
  assert.equal(h.logs.length, 1, 'analytics runs after synchronous SupaDB initialization');
  assert.equal(h.timers.some(t => t.delay === 600), false);
  h.timers.find(t => t.delay === 1500).fn();
  assert.equal(h.cart.tracked, 1, 'existing orders still start live tracking');
  h.pending.categories.resolve([{ id: 'cat-1', order: 0 }]);
  h.pending.products.resolve([{ id: 'fresh', order: 0 }]);
  h.pending.info.resolve({ name: 'fresh' });
  await settle();
  assert.equal(h.app.products[0].id, 'fresh');
  assert.equal(h.app.cafeInfo.name, 'fresh');
  assert.equal(h.logs.length, 1, 'revalidation must not double-count visits');
});

test('all menu requests start together and failed refresh keeps the complete cached snapshot', async () => {
  const h = boot();
  h.app.init();
  assert.deepEqual(h.requests, ['categories', 'products', 'info']);
  h.pending.categories.resolve([{ id: 'new-category', order: 0 }]);
  h.pending.products.reject(new Error('offline'));
  h.pending.info.resolve({ name: 'fresh' });
  await settle();
  assert.equal(h.app.categories[0].id, 'cat-1');
  assert.equal(h.app.products[0].id, 'default');
  assert.equal(h.app.cafeInfo.name, 'default');
  assert.equal(h.app.isLoaded, true);
  assert.equal(h.warnings.length, 1, 'background rejection is handled');
});

test('navbar coalesces scroll events into one passive animation-frame update', () => {
  const h = boot();
  h.context.scrollY = 100;
  h.app.setupNavbar();
  assert.equal(h.navbar.classes.has('scrolled'), true, 'restored scroll position is applied');
  assert.equal(h.listeners.scroll.options.passive, true);
  h.context.scrollY = 0;
  h.listeners.scroll.fn();
  h.listeners.scroll.fn();
  h.listeners.scroll.fn();
  assert.equal(h.frames.length, 1);
  assert.equal(h.navbar.classes.has('scrolled'), true);
  h.frames.shift()();
  assert.equal(h.navbar.classes.has('scrolled'), false);
  h.listeners.scroll.fn();
  assert.equal(h.frames.length, 1, 'next frame can be scheduled');
});

test('hero enters over two frames without waiting for menu requests', () => {
  const h = boot();
  h.app.init();
  assert.equal(h.hero.classes.has('hero-in-start'), true);
  assert.equal(h.hero.classes.has('hero-in-end'), false);
  h.frames.shift()();
  assert.equal(h.hero.classes.has('hero-in-end'), false);
  h.frames.shift()();
  assert.equal(h.hero.classes.has('hero-in-end'), true);
  const reduced = boot({ reducedMotion: true });
  reduced.app.init();
  assert.equal(reduced.hero.classes.has('hero-in-start'), false);
  assert.match(css, /\.hero-content\.hero-in-start\s*\{[^}]*opacity:\s*0/);
  assert.match(css, /\.hero-content\.hero-in-end\s*\{[^}]*opacity:\s*1/);
});

test('fade-ins opt into one reusable observer without synchronous layout reads', () => {
  const h = boot();
  h.app.observeFadeIns();
  assert.equal(h.card.classes.has('js-anim'), true);
  assert.equal(h.observers.length, 1);
  h.app.observeFadeIns();
  assert.equal(h.observers.length, 1);
  h.observers[0].callback([{ target: h.card, isIntersecting: false }]);
  assert.equal(h.card.classes.has('visible'), false);
  h.observers[0].callback([{ target: h.card, isIntersecting: true }]);
  assert.equal(h.card.classes.has('visible'), true);
  assert.equal(h.observers[0].observed.size, 0);
  assert.match(css, /\.fade-in\s*\{\s*opacity:\s*1/);
  assert.match(css, /\.fade-in\.js-anim\s*\{\s*opacity:\s*0/);
});

test('reduced motion and missing IntersectionObserver leave cards visible', () => {
  for (const options of [{ reducedMotion: true }, { observerSupported: false }]) {
    const h = boot(options);
    h.app.init();
    assert.equal(h.card.classes.has('js-anim'), false);
    assert.equal(h.card.classes.has('visible'), true);
    assert.equal(h.observers.length, 0);
    assert.equal(h.logs.length, 1, 'animation support must not block analytics');
  }
});

test('menu cards use content-visibility and scrolled navbar drops backdrop blur', () => {
  const cardBlock = css.match(/\.menu-card\s*\{[^}]*\}/)[0];
  assert.match(cardBlock, /content-visibility:\s*auto/);
  assert.match(cardBlock, /contain-intrinsic-size:\s*auto\s+420px/);
  const navbarBlock = css.match(/\.navbar\s*\{[^}]*\}/)[0];
  assert.match(navbarBlock, /backdrop-filter:\s*blur\(10px\)/);
  const scrolledBlock = css.match(/(^|\n)\.navbar\.scrolled\s*\{[^}]*\}/)[0];
  assert.match(scrolledBlock, /backdrop-filter:\s*none/);
  assert.match(scrolledBlock, /background:\s*var\(--cafe-bg\)/);
});

test('wrong-shape cached data cannot prevent menu startup', () => {
  const h = boot({ cache: { cafe_categories: {}, cafe_products: 7, cafe_info: [], cafe_favorites: 'broken' } });
  assert.doesNotThrow(() => h.app.init());
  assert.equal(h.app.categories[0].id, 'cat-1');
  assert.equal(h.app.products[0].id, 'default');
  assert.equal(h.app.cafeInfo.name, 'default');
  assert.equal(h.app.favoriteCount, 0);
});

test('search terms may span product name and description', () => {
  const { app } = boot();
  app.products = [{ id: 'latte', name_fa: 'لاته', description_fa: 'شیر بادام', order: 0 }];
  app.searchQuery = 'لاته بادام';
  assert.deepEqual(Array.from(app.filteredProducts, p => p.id), ['latte']);
});

test('Persian normalization, multi-term search and featured filtering are preserved', () => {
  const { app } = boot();
  assert.equal(app._norm('  كيك يَخ ۱۲٣ آبی\u200c  '), 'کیک یخ 123 ابی');
  app.products = [
    { id: 'cake', name_fa: 'کیک آلبالو', description_fa: '', order: 1, is_featured: true, category_id: 'cake' },
    { id: 'coffee', name_fa: 'قهوه', description_fa: '', order: 0, is_featured: true, category_id: 'drink' },
  ];
  app.searchQuery = 'كيك البالو';
  assert.deepEqual(Array.from(app.filteredProducts, p => p.id), ['cake']);
  assert.deepEqual(Array.from(app.featuredProducts, p => p.id), ['cake']);
  app.activeCategory = 'drink';
  assert.equal(app.filteredProducts.length, 0);
  app.toggleFavorite('coffee');
  assert.equal(app.isFavorite('coffee'), true);
});
