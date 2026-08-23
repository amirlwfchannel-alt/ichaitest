/**
 * cart.js — Customer Cart Logic
 * Uses Alpine.store for shared cart state across components.
 * Provides: cart CRUD, order submission, order tracking via localStorage.
 */

// OrderCookie — persisting customer orders in browser
const OrderCookie = {
  KEY: "ichai_my_orders",

  getOrders() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  addOrder(orderNumber, orderData) {
    const orders = this.getOrders();
    if (orders.find((o) => o.order_number === orderNumber)) return;
    orders.unshift({
      order_number: orderNumber,
      status: orderData.status || "new",
      total_price: orderData.total_price,
      item_count: orderData.item_count,
      created_at: orderData.created_at,
      table_number: orderData.table_number,
      items: orderData.items || [],
    });
    if (orders.length > 50) orders.length = 50;
    localStorage.setItem(this.KEY, JSON.stringify(orders));
  },

  updateStatus(orderNumber, newStatus) {
    const orders = this.getOrders();
    const idx = orders.findIndex((o) => o.order_number === orderNumber);
    if (idx > -1) {
      orders[idx].status = newStatus;
      localStorage.setItem(this.KEY, JSON.stringify(orders));
    }
  },
};

// Alpine store registration
document.addEventListener("alpine:init", () => {
  Alpine.store("cart", {
    items: Utils.getStorage("ichai_cart", []),
    showPanel: false,
    activeTab: "cart", // 'cart' | 'track'
    isSubmitting: false,
    orderSuccess: null,
    orderError: "",
    tableNumber: "",
    notes: "",
    myOrders: OrderCookie.getOrders(),

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
      const existing = this.items.find((i) => i.id === product.id);
      if (existing) {
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
      this.items = this.items.filter((i) => i.id !== productId);
      this._save();
    },
    updateQty(productId, delta) {
      const item = this.items.find((i) => i.id === productId);
      if (!item) return;
      item.quantity = Math.max(0, item.quantity + delta);
      if (item.quantity === 0) this.remove(productId);
      else this._save();
    },
    clear() {
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
        OrderCookie.addOrder(result.order_number, {
          status: result.status || "new",
          total_price: result.total_price,
          item_count: result.item_count,
          created_at: result.created_at,
          table_number: this.tableNumber,
          items: result.items || orderData.items,
        });
        this.orderSuccess = result;
        this.clear();
        this.tableNumber = "";
        this.notes = "";
        this.myOrders = OrderCookie.getOrders();
      } catch (e) {
        console.error("Order submit failed:", e);
        this.orderError = "خطا در ثبت سفارش. دوباره تلاش کنید.";
      }
      this.isSubmitting = false;
    },

    // ── Tracking ──
    async refreshTracking() {
      this.myOrders = OrderCookie.getOrders();
      await this.syncOrderStatuses();
    },

    /**
     * Pull latest statuses from Supabase for the orders this browser placed.
     * Falls back silently to cached statuses when offline / unconfigured.
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
          // Display-only fallback: a "new" order untouched by the admin for
          // 20+ minutes shows as delivered. Real admin-set statuses always win.
          const ageMin = (Utils.now() - new Date(o.created_at)) / 60000;
          let effective = f.status;
          if (effective === "new" && ageMin >= 20) {
            effective = "delivered";
          }
          if (effective !== o.status) {
            o.status = effective;
            OrderCookie.updateStatus(o.order_number, effective);
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
    closeSuccess() {
      this.orderSuccess = null;
      this.activeTab = "track";
      this.myOrders = OrderCookie.getOrders();
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
