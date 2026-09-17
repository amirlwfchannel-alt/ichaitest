/**
 * cart.js — Customer Cart Logic
 * Uses Alpine.store for shared cart state across components.
 * Provides: cart CRUD, order submission, LIVE order tracking via Supabase Realtime.
 */

// OrderCookie — persisting customer orders in browser
const OrderCookie = {
  KEY: "ichai_my_orders",
  _memory: null,

  _write(orders) {
    this._memory = orders;
    try {
      localStorage.setItem(this.KEY, JSON.stringify(orders));
      this._memory = null;
    } catch { /* Keep confirmed orders for this page session. */ }
  },

  getOrders() {
    if (this._memory) return this._memory;
    try {
      const raw = localStorage.getItem(this.KEY);
      const orders = raw ? JSON.parse(raw) : [];
      return Array.isArray(orders) ? orders.filter(o => o && typeof o.order_number === "string" && o.order_number.length > 0).slice(0, 50) : [];
    } catch {
      return [];
    }
  },

  addOrder(orderNumber, orderData) {
    const orders = this.getOrders();
    if (orders.find((o) => o.order_number === orderNumber)) return;
    orders.unshift({
      order_number: orderNumber,
      order_id: orderData.order_id || null,
      status: orderData.status || "new",
      total_price: orderData.total_price,
      item_count: orderData.item_count,
      created_at: orderData.created_at,
      table_number: orderData.table_number,
      items: orderData.items || [],
    });
    if (orders.length > 50) orders.length = 50;
    this._write(orders);
  },

  updateStatus(orderNumber, newStatus) {
    const orders = this.getOrders();
    const idx = orders.findIndex((o) => o.order_number === orderNumber);
    if (idx > -1) {
      orders[idx].status = newStatus;
      this._write(orders);
    }
  },
};

// ══════════════════════════════════════════════════════════════
// Customer Realtime Tracker — listens for order status updates
// ══════════════════════════════════════════════════════════════
const CustomerTracker = {
  channel: null,
  _pollTimer: null,
  _onStatusChange: null,

  /**
   * Start listening for realtime order changes.
   * @param {Function} onStatusChange - callback(orderNumber, newStatus)
   */
  start(onStatusChange) {
    this._onStatusChange = onStatusChange || (() => {});

    // 1) Supabase Realtime subscription (primary — instant updates)
    this._subscribeRealtime();

    // 2) Polling fallback (every 15s) — covers cases where Realtime
    //    is unavailable, blocked, or the tab was backgrounded.
    this._startPolling();
  },

  stop() {
    this._unsubscribeRealtime();
    this._stopPolling();
  },

  // ── Realtime ──
  _subscribeRealtime() {
    if (!SupaDB.ready || this.channel) return;

    // Listen for ALL order updates — we'll filter by our own order numbers
    this.channel = SupaDB.client
      .channel("customer-orders-tracker")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const updated = payload.new;
          if (!updated || !updated.order_number) return;

          // Check if this order is in our tracked list
          const myOrders = OrderCookie.getOrders();
          const isMine = myOrders.some(
            (o) => o.order_number === updated.order_number
          );
          if (!isMine) return;

          const oldOrder = myOrders.find(
            (o) => o.order_number === updated.order_number
          );
          const oldStatus = oldOrder ? oldOrder.status : null;

          // Update local storage
          OrderCookie.updateStatus(updated.order_number, updated.status);

          // Notify the Alpine store
          if (updated.status !== oldStatus) {
            this._onStatusChange(updated.order_number, updated.status);
          }
        }
      )
      .subscribe();
  },

  _unsubscribeRealtime() {
    if (this.channel && SupaDB.ready) {
      SupaDB.client.removeChannel(this.channel);
      this.channel = null;
    }
  },

  // ── Polling fallback ──
  _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(async () => {
      await this._pollStatuses();
    }, 15000); // every 15 seconds
  },

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  async _pollStatuses() {
    if (!SupaDB.ready) return;
    const myOrders = OrderCookie.getOrders();
    if (myOrders.length === 0) return;

    try {
      const numbers = myOrders.map((o) => o.order_number);
      const fresh = await SupaDB.fetchOrdersByNumbers(numbers);
      for (const f of fresh) {
        const local = myOrders.find(
          (o) => o.order_number === f.order_number
        );
        if (local && local.status !== f.status) {
          OrderCookie.updateStatus(f.order_number, f.status);
          this._onStatusChange(f.order_number, f.status);
        }
      }
    } catch (e) {
      // Silent — polling is a fallback
    }
  },
};

// Normalize old numeric-string carts, discard corrupted entries and duplicates.
function normalizeCartItems(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value.flatMap(item => {
    if (!item || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)) return [];
    const price = typeof item.price === "string" && item.price.trim() ? Number(item.price) : item.price;
    const quantity = typeof item.quantity === "string" && item.quantity.trim() ? Number(item.quantity) : item.quantity;
    if (!Number.isSafeInteger(price) || price < 0 || price > 2147483647 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999 || price * quantity > 2147483647) return [];
    ids.add(item.id);
    return [{ ...item, price, quantity }];
  }).slice(0, 100);
}

// Alpine store registration
document.addEventListener("alpine:init", () => {
  Alpine.store("cart", {
    items: normalizeCartItems(Utils.getStorage("ichai_cart", [])),
    showPanel: false,
    activeTab: "cart", // 'cart' | 'track'
    isSubmitting: false,
    orderSuccess: null,
    orderError: "",
    tableNumber: "",
    notes: "",
    myOrders: OrderCookie.getOrders(),
    _trackerStarted: false,
    _statusToastShown: {},

    // ── Computed ──
    get count() {
      return this.items.reduce((s, i) => s + i.quantity, 0);
    },
    get total() {
      return this.items.reduce((s, i) => s + i.price * i.quantity, 0);
    },
    inCart(productId) {
      return this.items.some((i) => i.id === productId);
    },
    qty(productId) {
      const item = this.items.find((i) => i.id === productId);
      return item ? item.quantity : 0;
    },

    // ── CRUD ──
    _save() {
      Utils.setStorage("ichai_cart", this.items);
    },
    add(product) {
      if (this.isSubmitting) return;
      const valid = normalizeCartItems([{ ...product, quantity: 1 }])[0];
      if (!valid) return;
      product = valid;
      const existing = this.items.find((i) => i.id === product.id);
      if (existing) {
        if (existing.quantity >= 999) return;
        existing.quantity++;
      } else {
        this.items.push({
          id: product.id,
          name_fa: product.name_fa,
          price: product.price,
          image_url: product.image_url,
          quantity: 1,
        });
      }
      this._save();
      this.showPanel = true;
    },
    remove(productId) {
      if (this.isSubmitting) return;
      this.items = this.items.filter((i) => i.id !== productId);
      this._save();
    },
    updateQty(productId, delta) {
      if (this.isSubmitting) return;
      if (!Number.isSafeInteger(delta)) return;
      const item = this.items.find((i) => i.id === productId);
      if (!item) return;
      item.quantity = Math.min(999, Math.max(0, item.quantity + delta));
      if (item.quantity === 0) this.remove(productId);
      else this._save();
    },
    clear() {
      if (this.isSubmitting) return;
      this.items = [];
      this._save();
    },

    // ── Order ──
    async submit() {
      if (this.items.length === 0 || this.isSubmitting) return;
      this.orderError = "";
      this.isSubmitting = true;
      try {
        const orderData = {
          customer_name: "",
          table_number: this.tableNumber,
          phone: "",
          notes: this.notes,
          total_price: this.total,
          item_count: this.count,
          items: this.items.map((i) => ({
            product_id: i.id,
            product_name_fa: i.name_fa,
            product_image_url: i.image_url,
            product_price: i.price,
            quantity: i.quantity,
            subtotal: i.price * i.quantity,
          })),
        };
        const result = await SupaDB.createOrder(orderData);
        if (!result || !result.id || !result.order_number) throw new Error("Missing order acknowledgement");
        OrderCookie.addOrder(result.order_number, {
          order_id: result.id,
          status: result.status || "new",
          total_price: result.total_price,
          item_count: result.item_count,
          created_at: result.created_at,
          table_number: orderData.table_number,
          items: result.items || orderData.items,
        });
        this.orderSuccess = result;
        this.items = [];
        this._save();
        if (this.tableNumber === orderData.table_number) this.tableNumber = "";
        if (this.notes === orderData.notes) this.notes = "";
        this.myOrders = OrderCookie.getOrders();
        // Ensure realtime tracker is running
        try { this._ensureTracker(); } catch { /* Tracking is not order submission. */ }
      } catch (e) {
        console.error("Order submit failed:", e);
        this.orderError = "خطا در ثبت سفارش. دوباره تلاش کنید.";
      }
      this.isSubmitting = false;
    },

    // ── Live Tracking ──
    _ensureTracker() {
      if (this._trackerStarted) return;
      if (!SupaDB.ready) return;
      this._trackerStarted = true;

      CustomerTracker.start((orderNumber, newStatus) => {
        // Refresh the orders list from localStorage
        this.myOrders = OrderCookie.getOrders();

        // Show a subtle status change notification
        const key = orderNumber + ":" + newStatus;
        if (!this._statusToastShown[key]) {
          this._statusToastShown[key] = true;
          // Vibrate on mobile if supported
          if (navigator.vibrate) {
            try { navigator.vibrate(200); } catch(e) {}
          }
        }
      });
    },

    /**
     * Pull latest statuses from Supabase for the orders this browser placed.
     * Falls back silently to cached statuses when offline / unconfigured.
     * NOTE: Removed 20-minute auto-deliver override — status changes are
     * now driven by the admin panel only.
     */
    async syncOrderStatuses() {
      if (!SupaDB.ready || this.myOrders.length === 0) return;
      try {
        const numbers = this.myOrders.map((o) => o.order_number);
        const fresh = await SupaDB.fetchOrdersByNumbers(numbers);
        let changed = false;
        for (const o of this.myOrders) {
          const f = fresh.find((x) => x.order_number === o.order_number);
          if (!f) continue;
          if (f.status !== o.status) {
            o.status = f.status;
            OrderCookie.updateStatus(o.order_number, f.status);
            changed = true;
          }
        }
        if (changed) {
          this.myOrders = [...this.myOrders];
        }
      } catch (e) {
        console.warn("Tracking sync failed:", e);
      }
    },

    async refreshTracking() {
      this.myOrders = OrderCookie.getOrders();
      this._ensureTracker();
      await this.syncOrderStatuses();
    },

    closeSuccess() {
      this.orderSuccess = null;
      this.activeTab = "track";
      this.myOrders = OrderCookie.getOrders();
      this._ensureTracker();
      this.syncOrderStatuses();
    },
    getStatusLabel(s) {
      return Utils.getStatusLabel(s);
    },
    getStatusColor(s) {
      return Utils.getStatusColor(s);
    },
    // Defensive shims: some HTML views historically called these on the
    // store directly. Keep them here so old/cached markup can never crash
    // the order-success flow again.
    formatPrice(t) {
      return Utils.formatPrice(t);
    },
    toPersianNum(n) {
      return Utils.toPersianNum(n);
    },
  });
});
