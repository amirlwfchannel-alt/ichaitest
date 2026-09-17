/* Shared pure behavior, usable in a browser or Node's test runner. */
(function (root) {
  'use strict';
  const normalize = value => String(value ?? '').normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[\s\u200c\u200d]+/g, '').toLowerCase();
  const format = value => new Intl.NumberFormat('fa-IR').format(value);
  function filter(products, query, category) {
    const needle = normalize(query);
    return products.filter(product => (category === 'all' || product.category === category) && normalize(product.name + ' ' + product.description).includes(needle));
  }
  function sanitize(value, products) {
    const cart = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return cart;
    for (const product of products) {
      const quantity = Object.hasOwn(value, product.id) ? value[product.id] : 0;
      if (Number.isInteger(quantity) && quantity > 0) cart[product.id] = Math.min(quantity, 99);
    }
    return cart;
  }
  function change(value, id, delta, products) {
    const cart = sanitize(value, products);
    if (!products.some(product => product.id === id) || ![-1, 1].includes(delta)) return cart;
    const quantity = Math.max(0, Math.min(99, (cart[id] || 0) + delta));
    if (quantity) cart[id] = quantity;
    else delete cart[id];
    return cart;
  }
  function summary(cart, products) {
    const clean = sanitize(cart, products);
    return products.reduce((sum, product) => ({count: sum.count + (clean[product.id] || 0), total: sum.total + product.price * (clean[product.id] || 0)}), {count:0,total:0});
  }
  function load(storage, key, products) {
    try { return sanitize(JSON.parse(storage.getItem(key)), products); }
    catch { return {}; }
  }
  function save(storage, key, cart) {
    try { storage.setItem(key, JSON.stringify(cart)); return true; }
    catch { return false; }
  }
  const api = {normalize, format, filter, sanitize, change, summary, load, save};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CafeDemo = api;
})(globalThis);
