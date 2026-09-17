/* Progressive enhancement. No backend, no global app state, no HTML injection. */
(function () {
  'use strict';
  const model = window.CafeDemo;
  const page = document.body.dataset.demo;
  if (!model || !page) return;
  const $ = selector => document.querySelector(selector);
  const cards = [...document.querySelectorAll('[data-product-id]')];
  const products = cards.map(card => ({id:card.dataset.productId, name:card.dataset.name, price:Number(card.dataset.price), category:card.dataset.category, description:card.querySelector('.product-description').textContent}));
  const key = `cafe-template:${page}:cart:v1`;
  let storage;
  try { storage = window.localStorage; } catch { storage = null; }
  let cart = model.load(storage, key, products);
  let category = 'all';
  const dialog = $('#demo-cart');
  const opener = $('[data-open-cart]');
  const search = $('#menu-search');
  const filters = [...document.querySelectorAll('[data-category-filter]')];
  let noticeTimer;
  let returnFocus;
  function announce(message) {
    clearTimeout(noticeTimer);
    $('#cart-notice').textContent = message;
    noticeTimer = setTimeout(() => { $('#cart-notice').textContent = ''; }, 4000);
  }
  function applyFilters() {
    const visible = new Set(model.filter(products, search.value, category).map(product => product.id));
    cards.forEach(card => { card.hidden = !visible.has(card.dataset.productId); });
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === category)));
    $('#result-count').textContent = `${model.format(visible.size)} انتخاب در منو`;
    $('#empty-results').hidden = visible.size !== 0;
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function renderCart() {
    const active = document.activeElement;
    const focusId = active?.dataset.quantityId;
    const focusDelta = active?.dataset.delta;
    const items = $('#cart-items');
    items.replaceChildren();
    for (const product of products) {
      const quantity = cart[product.id];
      if (!quantity) continue;
      const row = element('div', undefined, 'cart-line');
      const details = element('div');
      details.append(element('h3', product.name), element('p', `${model.format(product.price * quantity)} تومان`));
      const controls = element('div', undefined, 'quantity-control');
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', `تعداد ${product.name}`);
      for (const delta of [-1, 1]) {
        const button = element('button', delta === 1 ? '+' : '−');
        button.type = 'button';
        button.dataset.quantityId = product.id;
        button.dataset.delta = String(delta);
        button.setAttribute('aria-label', `${delta === 1 ? 'افزایش' : 'کاهش'} تعداد ${product.name}`);
        button.disabled = delta === 1 && quantity >= 99;
        controls.append(button);
        if (delta === -1) controls.append(element('span', model.format(quantity)));
      }
      row.append(details, controls);
      items.append(row);
    }
    const sum = model.summary(cart, products);
    $('[data-cart-count]').textContent = model.format(sum.count);
    opener.setAttribute('aria-label', `سبد نمونه، ${model.format(sum.count)} مورد`);
    $('#cart-total').textContent = `${model.format(sum.total)} تومان`;
    $('#cart-empty').hidden = sum.count !== 0;
    $('[data-clear-cart]').disabled = sum.count === 0;
    if (focusId && dialog.open) {
      const target = [...items.querySelectorAll('button')].find(button => button.dataset.quantityId === focusId && button.dataset.delta === focusDelta && !button.disabled);
      (target || items.querySelector('button:not(:disabled)') || $('[data-close-cart]')).focus();
    }
  }
  function persist() {
    $('#storage-note').hidden = model.save(storage, key, cart);
    renderCart();
  }
  function closeCart() { dialog.close(); }
  search.addEventListener('input', applyFilters);
  filters.forEach(button => button.addEventListener('click', () => { category = button.dataset.categoryFilter; applyFilters(); }));
  $('[data-reset-filters]').addEventListener('click', () => { category = 'all'; search.value = ''; applyFilters(); search.focus(); });
  document.querySelectorAll('[data-add]').forEach(button => {
    button.disabled = false;
    button.addEventListener('click', () => {
      const product = products.find(item => item.id === button.dataset.add);
      if ((cart[product.id] || 0) >= 99) { announce('حداکثر تعداد هر انتخاب ۹۹ است.'); return; }
      cart = model.change(cart, product.id, 1, products);
      persist();
      announce(`${product.name} به سبد نمونه اضافه شد.`);
    });
  });
  $('#cart-items').addEventListener('click', event => {
    const button = event.target.closest('button[data-quantity-id]');
    if (!button) return;
    cart = model.change(cart, button.dataset.quantityId, Number(button.dataset.delta), products);
    persist();
    $('#cart-feedback').textContent = `سبد به‌روز شد؛ ${model.format(model.summary(cart, products).count)} مورد.`;
  });
  $('[data-clear-cart]').addEventListener('click', () => {
    cart = {};
    persist();
    $('#cart-feedback').textContent = 'سبد نمونه خالی شد.';
    $('[data-close-cart]').focus();
  });
  opener.disabled = false;
  opener.addEventListener('click', () => {
    returnFocus = document.activeElement;
    $('#cart-feedback').textContent = '';
    renderCart();
    dialog.showModal();
  });
  document.querySelectorAll('[data-close-cart]').forEach(button => button.addEventListener('click', closeCart));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeCart();
  });
  dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
  // Keep Tab in the panel even when a browser would move focus to its chrome.
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled)')].filter(node => node.getClientRects().length);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  // Native dialog handles inert background and Escape.
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    cart = model.load(storage, key, products);
    renderCart();
  });
  $('[data-enhancement]').hidden = false;
  applyFilters();
  persist();
})();
