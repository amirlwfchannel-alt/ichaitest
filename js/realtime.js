/**
 * realtime.js — Admin Realtime Notification System
 * Handles Supabase Realtime subscription, sound playback, browser notifications.
 * Initializes AFTER adminPanel's own init completes.
 */

// Sound Manager
const SoundManager = {
  audio: null,
  ready: false,

  init() {
    try {
      this.audio = new Audio("assets/sounds/order-bell.mp3");
      this.audio.volume = 0.7;
      this.audio.preload = "auto";
      this.audio.addEventListener("canplaythrough", () => {
        this.ready = true;
      });
      this.audio.load();
    } catch (e) {
      console.warn("Sound init failed:", e);
    }
  },

  play() {
    if (!this.ready || !this.audio) return;
    try {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
    } catch (e) {
      console.warn("Sound play failed:", e);
    }
  },
};

// Realtime Manager
const RealtimeManager = {
  channel: null,
  onNewOrder: null,
  onOrderUpdate: null,
  soundEnabled: true,

  init(callbacks) {
    this.onNewOrder = callbacks.onNewOrder || (() => {});
    this.onOrderUpdate = callbacks.onOrderUpdate || (() => {});
    this.soundEnabled = callbacks.soundEnabled !== false;
    SoundManager.init();
  },

  subscribe() {
    if (this.channel) return;
    this.channel = SupaDB.subscribeOrders((event, order) => {
      if (event === "INSERT") {
        if (this.soundEnabled) SoundManager.play();
        this._sendBrowserNotification(order);
        this.onNewOrder(order);
      } else if (event === "UPDATE") {
        this.onOrderUpdate(order);
      }
    });
  },

  unsubscribe() {
    if (this.channel) {
      SupaDB.unsubscribeOrders(this.channel);
      this.channel = null;
    }
  },

  _sendBrowserNotification(order) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
    if (Notification.permission === "granted") {
      try {
        const itemSummary = (order.items || [])
          .slice(0, 4)
          .map((i) => `${i.product_name_fa} ×${i.quantity}`)
          .join("، ");
        new Notification("🛒 سفارش جدید!", {
          body: `میز ${order.table_number || "?"} — ${itemSummary || order.item_count + " آیتم"} — ${Utils.formatPrice(order.total_price)}`,
          icon: "logo/no-background-logo-1.webp",
          tag: "order-" + order.id,
          requireInteraction: true,
        });
      } catch (e) {
        // silent
      }
    }
  },
};

/**
 * Called from adminPanel.init() after authentication.
 * Wires realtime events to the Alpine component's data.
 */
function initRealtimeSystem(vm) {
  if (!SupaDB.ready) return;

  vm.soundEnabled = Utils.getStorage("admin_sound_enabled", true);

  RealtimeManager.init({
    soundEnabled: vm.soundEnabled,
    onNewOrder: async (orderRow) => {
      // Realtime payload carries no items — fetch the full order with items
      let order = orderRow;
      try {
        const full = await SupaDB.fetchOrderWithItemsById(orderRow.id);
        if (full) order = full;
      } catch (e) {
        console.warn("Fetch realtime order items failed:", e);
      }

      vm.orders.unshift(order);
      vm.ordersLoaded = true;
      vm._newOrdersCount = (vm._newOrdersCount || 0) + 1;
      vm.toast("🛒 سفارش جدید از میز " + (order.table_number || "?"), "success");

      // Jump straight to the orders page so the manager sees it immediately
      if (vm.activePage !== "orders") {
        vm.activePage = "orders";
        vm.sidebarOpen = false;
      }
      document.title = `(${Utils.toPersianNum(vm._newOrdersCount)}) پنل مدیریت — کافه آی‌چای`;
    },
    onOrderUpdate: (order) => {
      const idx = vm.orders.findIndex((o) => o.id === order.id);
      if (idx > -1) {
        vm.orders[idx] = Object.assign({}, vm.orders[idx], order);
      }
    },
  });

  RealtimeManager.subscribe();
}

function stopRealtimeSystem() {
  RealtimeManager.unsubscribe();
}
