/**
 * admin.js — Admin panel logic (Alpine.js)
 * CRUD for products, categories, feedbacks, and content management.
 * Includes: auth, dashboard stats, searchable tables, modals, image upload, toast.
 */

document.addEventListener("alpine:init", () => {
  Alpine.data("adminPanel", () => ({
    // Layout state
    activePage: "dashboard",
    sidebarOpen: false,
    darkMode: false,

    // Auth state
    isAuthenticated: false,
    loginEmail: "",
    loginPassword: "",
    loginLoading: false,
    loginError: "",

    // Data
    categories: [],
    products: [],
    feedbacks: [],
    cafeInfo: {},

    // Orders state
    orders: [],
    _newOrdersCount: 0,
    ordersFilter: "all",
    orderSearchQuery: "",
    soundEnabled: true,
    ordersLoaded: false,

    // Accounting state
    accountingData: [],
    accountingLoaded: false,
    accountingPeriod: "30days",
    accountingCustomFrom: "",
    accountingCustomTo: "",
    _chartInstances: {},

    // Developer account & analytics state
    DEVELOPER_EMAIL: "amirlwf.dev@gmail.com",
    isDeveloper: false,
    visitStats: null,
    dbUsage: null,
    devLoading: false,

    // Custom Jalali date selector (defaults to today in Tehran)
    jalaliYear: 0,
    jalaliMonth: 1,
    jalaliDay: 1,
    jalaliDays: 31,
    jalaliYearOpts: [],
    _jalaliDaysCache: null,

    // UI state
    searchQuery: "",
    showProductModal: false,
    showCategoryModal: false,
    showDeleteModal: false,
    showCafeInfoModal: false,
    editingProduct: null,
    editingCategory: null,
    deleteTarget: null,
    deleteType: "",
    toastMessage: "",
    toastType: "success",
    showToast: false,
    toastTimer: null,

    // Image upload state
    imageMode: "url",
    uploading: false,
    saving: false,

    // Product form
    productForm: {
      name_fa: "",
      description_fa: "",
      price: "",
      category_id: "",
      image_url: "",
      is_featured: false,
    },

    // Category form
    categoryForm: {
      name_fa: "",
      icon: "",
    },

    // Cafe info form
    cafeInfoForm: {
      name: "",
      tagline: "",
      welcome_fa: "",
      about_fa: "",
      address_fa: "",
      phone: "",
      instagram: "",
      telegram: "",
      hours_fa: "",
    },

    // Init
    async init() {
      this.loadTheme();
      this.soundEnabled = Utils.getStorage("admin_sound_enabled", true);
      // Initialize Jalali date (after clock offset may be set)
      this._initJalaliDate();

      if (SupaDB.init()) {
        const session = await SupaDB.getSession();
        if (session) {
          this.isAuthenticated = true;
          await this._checkDeveloper();
          await this.loadData();
          // Start realtime after data loaded
          this.$nextTick(() => initRealtimeSystem(this));
          return;
        }
      }

      // If Supabase not configured, load from localStorage as demo
      if (!SupaDB.ready) {
        this.categories = Utils.getStorage("cafe_categories", DEFAULT_CATEGORIES);
        this.products = Utils.getStorage("cafe_products", DEFAULT_PRODUCTS);
        this.cafeInfo = Utils.getStorage("cafe_info", DEFAULT_CAFE_INFO);
        this.feedbacks = Utils.getStorage("cafe_feedbacks", []);
        this.orders = Utils.getStorage("cafe_orders", []);
        this.categories.sort((a, b) => a.order - b.order);
        this.products.sort((a, b) => a.order - b.order);
        this.isAuthenticated = true;
      }
    },

    // Auth methods
    async login() {
      this.loginError = "";
      this.loginLoading = true;
      try {
        const { error } = await SupaDB.signIn(
          this.loginEmail,
          this.loginPassword
        );
        if (error) throw error;
        this.isAuthenticated = true;
        this.isDeveloper =
          this.loginEmail.trim().toLowerCase() === this.DEVELOPER_EMAIL;
        await this.loadData();
        // BUGFIX: start realtime (sound + notification + auto-jump to orders)
        // after a FRESH login too — previously it only started in init() on
        // session-resume, so a newly logged-in admin never got new-order
        // notifications until they refreshed the page (F5).
        this.$nextTick(() => initRealtimeSystem(this));
        this.toast("با موفقیت وارد شدید");
      } catch {
        this.loginError = "ایمیل یا رمز عبور اشتباه است";
      }
      this.loginLoading = false;
    },

    // Restore developer flag on session resume too
    async _checkDeveloper() {
      try {
        const session = await SupaDB.getSession();
        if (!session || !session.user) return false;
        const email = (session.user.email || "").toLowerCase();
        if (email === this.DEVELOPER_EMAIL) {
          this.isDeveloper = true;
          return true;
        }
      } catch { /* ignore */ }
      return false;
    },

    async logout() {
      // BUGFIX: stop the realtime subscription on logout — previously the
      // channel stayed open after logout (leak; old session's handlers kept
      // running) and re-login created a second live channel.
      stopRealtimeSystem();
      this._newOrdersCount = 0;
      document.title = "پنل مدیریت — کافه آی‌چای";
      await SupaDB.signOut();
      this.isAuthenticated = false;
      this.orders = [];
      this.ordersLoaded = false;
      this.categories = [];
      this.products = [];
      this.feedbacks = [];
      this.cafeInfo = {};
    },

    // Data management
    async loadData() {
      this.categories = await SupaDB.fetchCategories();
      this.products = await SupaDB.fetchProducts();
      this.cafeInfo = await SupaDB.fetchCafeInfo();
      this.feedbacks = await SupaDB.fetchFeedbacks();
      this.categories.sort((a, b) => a.order - b.order);
      this.products.sort((a, b) => a.order - b.order);
      // Don't auto-load orders here — load on page switch for speed
    },

    // Theme
    loadTheme() {
      this.darkMode = Utils.getStorage("admin_dark_mode", false);
    },

    toggleTheme() {
      this.darkMode = !this.darkMode;
      Utils.setStorage("admin_dark_mode", this.darkMode);
    },

    // Toast
    toast(message, type = "success") {
      clearTimeout(this.toastTimer);
      this.toastMessage = message;
      this.toastType = type;
      this.showToast = true;
      this.toastTimer = setTimeout(() => {
        this.showToast = false;
      }, 3000);
    },

    // Dashboard stats
    get totalProducts() {
      return this.products.length;
    },
    get totalCategories() {
      return this.categories.filter((c) => c.id !== "cat-1").length;
    },
    get featuredCount() {
      return this.products.filter((p) => p.is_featured).length;
    },
    get feedbackCount() {
      return this.feedbacks.length;
    },

    // Search
    get filteredProducts() {
      if (!this.searchQuery.trim()) return this.products;
      const q = this._normFa(this.searchQuery);
      return this.products.filter(
        (p) =>
          this._normFa(p.name_fa).includes(q) ||
          this._normFa(p.description_fa).includes(q) ||
          this._normFa(this.getCategoryName(p.category_id)).includes(q)
      );
    },

    // Persian normalization: Arabic Yeh/Kaf → Farsi, Alef/Heh variants unified,
    // strip ZWNJ/diacritics
    _normFa(s) {
      return (s || "")
        .toString()
        .replace(/[يى]/g, "ی")
        .replace(/[ك]/g, "ک")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/[ۀة]/g, "ه")
        .replace(/[\u200c\u064b-\u0652\u0640]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    },

    get filteredFeedbacks() {
      if (!this.searchQuery.trim()) return this.feedbacks;
      const q = this.searchQuery.trim();
      return this.feedbacks.filter(
        (f) =>
          (f.name && f.name.includes(q)) ||
          (f.message && f.message.includes(q))
      );
    },

    getCategoryName(catId) {
      const cat = this.categories.find((c) => c.id === catId);
      return cat ? cat.name_fa : "—";
    },

    // Product CRUD
    openAddProduct() {
      this.editingProduct = null;
      this.imageMode = "url";
      this.productForm = {
        name_fa: "",
        description_fa: "",
        price: "",
        category_id: this.categories.length > 1 ? this.categories[1].id : "",
        image_url: "",
        is_featured: false,
      };
      this.showProductModal = true;
    },

    openEditProduct(product) {
      this.editingProduct = product;
      this.imageMode = "url";
      this.productForm = {
        name_fa: product.name_fa,
        description_fa: product.description_fa,
        price: product.price,
        category_id: product.category_id,
        image_url: product.image_url,
        is_featured: product.is_featured,
      };
      this.showProductModal = true;
    },

    async saveProduct() {
      if (this.saving) return;
      const name = (this.productForm.name_fa || "").trim();
      const price = Number(this.productForm.price);
      if (!name) {
        this.toast("لطفاً نام محصول را وارد کنید", "error");
        return;
      }
      if (!price || price < 0 || !Number.isFinite(price)) {
        this.toast("لطفاً قیمت معتبر وارد کنید", "error");
        return;
      }
      if (!this.productForm.category_id) {
        this.toast("لطفاً دسته‌بندی را انتخاب کنید", "error");
        return;
      }
      this.saving = true;

      try {
        if (this.editingProduct) {
          const oldImageUrl = this.editingProduct.image_url;
          const updated = {
            ...this.editingProduct,
            name_fa: this.productForm.name_fa,
            description_fa: this.productForm.description_fa,
            price: Number(this.productForm.price),
            category_id: this.productForm.category_id,
            image_url: this.productForm.image_url,
            is_featured: this.productForm.is_featured,
          };
          await SupaDB.updateProduct(updated, oldImageUrl);
          const idx = this.products.findIndex(
            (p) => p.id === this.editingProduct.id
          );
          if (idx > -1) this.products[idx] = updated;
          this.toast("محصول با موفقیت ویرایش شد");
        } else {
          const newProduct = {
            id: Utils.generateId(),
            name_fa: this.productForm.name_fa,
            description_fa: this.productForm.description_fa,
            price: Number(this.productForm.price),
            category_id: this.productForm.category_id,
            image_url: this.productForm.image_url,
            is_featured: this.productForm.is_featured,
            order: this.products.length + 1,
          };
          const saved = await SupaDB.saveProduct(newProduct);
          this.products.push(saved || newProduct);
          this.toast("محصول جدید اضافه شد");
        }
        this.showProductModal = false;
      } catch (e) {
        console.error("Save product failed:", e);
        const msg = e?.message || e?.error_description || "خطای ناشناخته";
        this.toast("ذخیره محصول ناموفق بود: " + msg, "error");
      }
      this.saving = false;
    },

    confirmDeleteProduct(product) {
      this.deleteTarget = product;
      this.deleteType = "product";
      this.showDeleteModal = true;
    },

    // Category CRUD
    openAddCategory() {
      this.editingCategory = null;
      this.categoryForm = { name_fa: "", icon: "" };
      this.showCategoryModal = true;
    },

    openEditCategory(category) {
      this.editingCategory = category;
      this.categoryForm = { name_fa: category.name_fa, icon: category.icon };
      this.showCategoryModal = true;
    },

    async saveCategory() {
      if (!this.categoryForm.name_fa.trim()) {
        this.toast("لطفاً نام دسته‌بندی را وارد کنید", "error");
        return;
      }

      try {
        if (this.editingCategory) {
          const updated = {
            ...this.editingCategory,
            name_fa: this.categoryForm.name_fa,
            icon: this.categoryForm.icon,
          };
          await SupaDB.saveCategory(updated);
          const idx = this.categories.findIndex(
            (c) => c.id === this.editingCategory.id
          );
          if (idx > -1) this.categories[idx] = updated;
          this.toast("دسته‌بندی ویرایش شد");
        } else {
          const newCat = {
            id: Utils.generateId(),
            name_fa: this.categoryForm.name_fa,
            icon: this.categoryForm.icon,
            order: this.categories.length,
          };
          const saved = await SupaDB.saveCategory(newCat);
          this.categories.push(saved || newCat);
          this.toast("دسته‌بندی جدید اضافه شد");
        }
        this.showCategoryModal = false;
      } catch (e) {
        console.error("Save category failed:", e);
        this.toast("ذخیره دسته‌بندی ناموفق بود", "error");
      }
    },

    confirmDeleteCategory(category) {
      if (category.id === "cat-1") {
        this.toast("دسته‌بندی «همه» قابل حذف نیست", "error");
        return;
      }
      this.deleteTarget = category;
      this.deleteType = "category";
      this.showDeleteModal = true;
    },

    // Feedback CRUD
    confirmDeleteFeedback(feedback) {
      this.deleteTarget = feedback;
      this.deleteType = "feedback";
      this.showDeleteModal = true;
    },

    // Execute delete
    async executeDelete() {
      try {
        if (this.deleteType === "product") {
          await SupaDB.deleteProduct(this.deleteTarget.id);
          this.products = this.products.filter(
            (p) => p.id !== this.deleteTarget.id
          );
          this.toast("محصول حذف شد");
        } else if (this.deleteType === "category") {
          for (const p of this.products) {
            if (p.category_id === this.deleteTarget.id) {
              p.category_id = "cat-1";
              await SupaDB.saveProduct(p);
            }
          }
          await SupaDB.deleteCategory(this.deleteTarget.id);
          this.categories = this.categories.filter(
            (c) => c.id !== this.deleteTarget.id
          );
          this.toast("دسته‌بندی حذف شد");
        } else if (this.deleteType === "feedback") {
          await SupaDB.deleteFeedback(this.deleteTarget.id);
          this.feedbacks = this.feedbacks.filter(
            (f) => f.id !== this.deleteTarget.id
          );
          this.toast("انتقاد حذف شد");
        } else if (this.deleteType === "order") {
          await SupaDB.deleteOrder(this.deleteTarget.id);
          this.orders = this.orders.filter(
            (o) => o.id !== this.deleteTarget.id
          );
          this.toast("سفارش حذف شد");
        }
      } catch (e) {
        console.error("Delete failed:", e);
        this.toast("حذف ناموفق بود. دوباره تلاش کنید", "error");
      }
      this.showDeleteModal = false;
      this.deleteTarget = null;
    },

    // Cafe info (content management)
    openEditCafeInfo() {
      this.cafeInfoForm = {
        name: this.cafeInfo.name || "",
        tagline: this.cafeInfo.tagline || "",
        welcome_fa: this.cafeInfo.welcome_fa || "",
        about_fa: this.cafeInfo.about_fa || "",
        address_fa: this.cafeInfo.address_fa || "",
        phone: this.cafeInfo.phone || "",
        instagram: this.cafeInfo.instagram || "",
        telegram: this.cafeInfo.telegram || "",
        hours_fa: this.cafeInfo.hours_fa || "",
      };
      this.showCafeInfoModal = true;
    },

    async saveCafeInfo() {
      if (!this.cafeInfoForm.name.trim()) {
        this.toast("لطفاً نام کافه را وارد کنید", "error");
        return;
      }
      try {
        const updated = {
          ...this.cafeInfo,
          ...this.cafeInfoForm,
        };
        await SupaDB.saveCafeInfo(updated);
        this.cafeInfo = updated;
        this.showCafeInfoModal = false;
        this.toast("محتوای سایت با موفقیت ذخیره شد");
      } catch (e) {
        console.error("Save cafe info failed:", e);
        this.toast("ذخیره محتوا ناموفق بود", "error");
      }
    },

    // Image upload
    async handleImageUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        this.toast("حجم فایل نباید بیشتر از ۵ مگابایت باشد", "error");
        return;
      }
      this.uploading = true;
      try {
        const url = await SupaDB.uploadImage(file);
        this.productForm.image_url = url;
        this.toast("تصویر آپلود شد");
      } catch {
        this.toast("آپلود تصویر ناموفق بود", "error");
      }
      this.uploading = false;
    },

    // Drag & drop reordering
    dragStartIndex: null,

    dragStart(index) {
      this.dragStartIndex = index;
    },

    dragOver(event) {
      event.preventDefault();
    },

    async drop(index) {
      if (this.dragStartIndex === null || this.dragStartIndex === index) return;
      const items =
        this.activePage === "products" ? this.products : this.categories;
      const [moved] = items.splice(this.dragStartIndex, 1);
      items.splice(index, 0, moved);
      items.forEach((item, i) => (item.order = i));
      try {
        for (const item of items) {
          if (this.activePage === "products") {
            await SupaDB.saveProduct(item);
          } else {
            await SupaDB.saveCategory(item);
          }
        }
        this.toast("ترتیب به‌روزرسانی شد");
      } catch {
        this.toast("به‌روزرسانی ترتیب ناموفق بود", "error");
      }
      this.dragStartIndex = null;
    },

    // Reset to defaults
    async resetToDefaults() {
      this.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
      this.products = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
      try {
        for (const cat of this.categories) {
          await SupaDB.saveCategory(cat);
        }
        for (const prod of this.products) {
          await SupaDB.saveProduct(prod);
        }
        this.toast("داده‌ها به حالت اولیه بازگشت");
      } catch {
        this.toast("بازنشانی ناموفق بود", "error");
      }
    },

    formatPrice(toman) {
      return Utils.formatPrice(toman);
    },

    toPersianNum(n) {
      return Utils.toPersianNum(n);
    },

    /** Format kilobytes into a readable Persian string (KB/MB). */
    _fmtSize(kb) {
      if (kb == null || kb < 0) return "—";
      if (kb >= 1024) {
        return Utils.toPersianNum((kb / 1024).toFixed(1)) + " مگابایت";
      }
      return Utils.toPersianNum(Math.round(kb)) + " کیلوبایت";
    },

    formatDate(dateStr) {
      if (!dateStr) return "—";
      return Utils.formatDate(dateStr);
    },
    getStatusLabel(status) {
      return Utils.getStatusLabel(status);
    },
    getStatusColor(status) {
      return Utils.getStatusColor(status);
    },

    // ══════════════════════════════════════════════════
    // ORDERS PAGE
    // ══════════════════════════════════════════════════

    async openOrdersPage() {
      this.activePage = "orders";
      this.sidebarOpen = false;
      this._resetTitle();
      if (!this.ordersLoaded) {
        await this.loadOrders();
        this.ordersLoaded = true;
      }
    },

    /**
     * Auto-mark stale orders as delivered: any active order older than
     * 20 minutes (Iran time, server-corrected clock) becomes 'delivered'.
     * Runs on load and then every minute; DB update only when needed.
     */
    async autoDeliverStale() {
      if (!SupaDB.ready) return;
      const nowMs = Utils.now().getTime();
      for (const o of this.orders) {
        if (!["new", "preparing", "ready"].includes(o.status)) continue;
        const ageMin = (nowMs - new Date(o.created_at).getTime()) / 60000;
        if (ageMin >= 20) {
          try {
            await SupaDB.updateOrderStatus(o.id, "delivered");
            o.status = "delivered";
          } catch (e) {
            console.warn("Auto-deliver failed for", o.order_number, e);
          }
        }
      }
    },

    startAutoDeliverTimer() {
      if (this._autoDeliverTimer) clearInterval(this._autoDeliverTimer);
      this._autoDeliverTimer = setInterval(() => {
        if (!SupaDB.ready || !this.ordersLoaded) return;
        this.autoDeliverStale();
      }, 60 * 1000);
    },

    async loadOrders() {
      try {
        this.orders = await SupaDB.fetchOrders();
        await this.autoDeliverStale();
        this.startAutoDeliverTimer();
      } catch (e) {
        console.error("Load orders failed:", e);
        this.toast("خطا در بارگذاری سفارشات", "error");
      }
    },

    get filteredOrders() {
      let list = this.orders;
      if (this.ordersFilter !== "all") {
        list = list.filter((o) => o.status === this.ordersFilter);
      }
      if (this.orderSearchQuery && this.orderSearchQuery.trim()) {
        const q = this.orderSearchQuery.trim();
        list = list.filter(
          (o) =>
            o.order_number.includes(q) ||
            (o.table_number && o.table_number.includes(q)) ||
            (o.customer_name && o.customer_name.includes(q)) ||
            (o.items || []).some((it) => it.product_name_fa && it.product_name_fa.includes(q))
        );
      }
      return list;
    },

    get orderStats() {
      const dayStart = Utils.startOfTehranDay();
      const todayOrders = this.orders.filter((o) => new Date(o.created_at) >= dayStart);
      const todayActive = todayOrders.filter((o) => o.status !== "cancelled");
      return {
        todayCount: todayActive.length,
        todayRevenue: todayActive.reduce((s, o) => s + o.total_price, 0),
        cancelledToday: todayOrders.filter((o) => o.status === "cancelled").length,
        newCount: this.orders.filter((o) => o.status === "new").length,
        preparingCount: this.orders.filter((o) => o.status === "preparing").length,
        readyCount: this.orders.filter((o) => o.status === "ready").length,
        deliveredCount: this.orders.filter((o) => o.status === "delivered").length,
      };
    },

    get newOrdersCount() {
      return this._newOrdersCount || 0;
    },

    _resetTitle() {
      this._newOrdersCount = 0;
      document.title = "پنل مدیریت — کافه آی‌چای";
    },

    async changeOrderStatus(orderId, newStatus) {
      try {
        await SupaDB.updateOrderStatus(orderId, newStatus);
        const order = this.orders.find((o) => o.id === orderId);
        if (order) order.status = newStatus;
        this.toast("وضعیت تغییر کرد: " + Utils.getStatusLabel(newStatus));
      } catch (e) {
        this.toast("خطا در تغییر وضعیت", "error");
      }
    },

    confirmDeleteOrder(order) {
      this.deleteTarget = order;
      this.deleteType = "order";
      this.showDeleteModal = true;
    },

    toggleSound() {
      this.soundEnabled = !this.soundEnabled;
      Utils.setStorage("admin_sound_enabled", this.soundEnabled);
      RealtimeManager.soundEnabled = this.soundEnabled;
      this.toast(this.soundEnabled ? "صدای اعلان فعال شد" : "صدای اعلان غیرفعال شد");
    },

    // ══════════════════════════════════════════════════
    // ACCOUNTING PAGE
    // ══════════════════════════════════════════════════

    async openAccountingPage() {
      this.activePage = "accounting";
      this.sidebarOpen = false;
      await this.loadAccountingData();
      this.$nextTick(() => this.renderCharts());
    },

    // ══════════════════════════════════════════════════
    // DEVELOPER PAGE — analytics + db usage (dev account only)
    // ══════════════════════════════════════════════════

    async openDeveloperPage() {
      if (!this.isDeveloper) return;
      this.activePage = "developer";
      this.sidebarOpen = false;
      await this.loadDeveloperData();
    },

    async loadDeveloperData() {
      this.devLoading = true;
      try {
        const [stats, usage] = await Promise.all([
          SupaDB.fetchVisitStats(),
          SupaDB.fetchDbUsage(),
        ]);
        this.visitStats = stats;
        this.dbUsage = usage;
        this.$nextTick(() => this.renderVisitsChart());
      } finally {
        this.devLoading = false;
      }
    },

    renderVisitsChart() {
      const canvas = document.getElementById("visitsChart");
      if (!canvas || !this.visitStats || !window.Chart) return;
      const key = "visits";
      if (this._chartInstances[key]) {
        this._chartInstances[key].destroy();
      }
      const labels = this.visitStats.daily.map((d) => d.label);
      const counts = this.visitStats.daily.map((d) => d.count);
      const isDark = document.body.classList.contains("dark-mode");
      this._chartInstances[key] = new Chart(canvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "بازدید",
              data: counts,
              backgroundColor: "rgba(232,197,71,.75)",
              borderColor: "#e8c547",
              borderWidth: 1,
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: {
                color: isDark ? "#cbd5e1" : "#475569",
                font: { size: 9, family: "Vazirmatn" },
              },
              grid: { display: false },
            },
            y: {
              beginAtZero: true,
              ticks: {
                precision: 0,
                color: isDark ? "#cbd5e1" : "#475569",
              },
              grid: { color: isDark ? "#334155" : "#e2e8f0" },
            },
          },
        },
      });
    },

    async loadAccountingData() {
      this.accountingLoaded = false;
      try {
        await AccountingEngine.loadData(this.accountingPeriod, this.accountingCustomFrom, this.accountingCustomTo);
        this.accountingData = AccountingEngine.items;
        this.accountingLoaded = true;
      } catch (e) {
        console.error("Load accounting failed:", e);
        this.accountingLoaded = false;
        this.toast("خطا در بارگذاری اطلاعات حسابداری", "error");
      }
    },

    async changeAccountingPeriod(period) {
      this.accountingPeriod = period;
      await this.loadAccountingData();
      this.$nextTick(() => this.renderCharts());
    },

    async applyCustomDate() {
      if (!this.accountingCustomFrom) {
        this.toast("تاریخ شروع را وارد کنید", "error");
        return;
      }
      this.accountingPeriod = "custom";
      await this.loadAccountingData();
      this.$nextTick(() => this.renderCharts());
    },

    /**
     * Convert selected Jalali day to its exact UTC window and reload data.
     */
    async applyCustomJalaliDate() {
      if (!this.jalaliYear || !this.jalaliMonth || !this.jalaliDay) {
        this.toast("تاریخ را کامل انتخاب کنید", "error");
        return;
      }
      const from = Utils.jalaliToUtc(this.jalaliYear, this.jalaliMonth, this.jalaliDay);
      if (!from) {
        // e.g. 30th/31st of a month that doesn't have it
        this.toast("این روز در این ماه وجود ندارد", "error");
        return;
      }
      const to = new Date(from.getTime() + 86400000 - 1);
      this.accountingPeriod = "custom";
      await AccountingEngine.loadData("custom", from.toISOString(), to.toISOString());
      this.accountingData = AccountingEngine.items;
      this.accountingLoaded = true;
      const label =
        Utils.toPersianNum(this.jalaliDay) + " " +
        (["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"][this.jalaliMonth - 1] || "") +
        " " + Utils.toPersianNum(this.jalaliYear);
      this.toast("نمایش فروش روز " + label);
      this.$nextTick(() => this.renderCharts());
    },

    /** Recalculate jalaliDays when year/month changes. */
    jalaliUpdateDays() {
      if (!this.jalaliYear || !this.jalaliMonth) { this.jalaliDays = 31; return; }
      const key = this.jalaliYear + "-" + this.jalaliMonth;
      if (this._jalaliDaysCache && this._jalaliDaysCache.key === key) {
        this.jalaliDays = this._jalaliDaysCache.max;
      } else {
        let max = 30;
        for (let d = 31; d >= 29; d--) {
          if (Utils.jalaliToUtc(this.jalaliYear, this.jalaliMonth, d)) { max = d; break; }
        }
        this._jalaliDaysCache = { key, max };
        this.jalaliDays = max;
      }
      if (this.jalaliDay > this.jalaliDays) this.jalaliDay = this.jalaliDays;
    },

    /** Set year and auto-update days. */
    setJalaliYear(val) {
      this.jalaliYear = Number(val);
      this.jalaliUpdateDays();
    },

    /** Set month and auto-update days. */
    setJalaliMonth(val) {
      this.jalaliMonth = Number(val);
      this.jalaliUpdateDays();
    },

    /** Initialize Jalali date from server-corrected clock. */
    _initJalaliDate() {
      const parts = new Intl.DateTimeFormat("en-u-ca-persian", {
        timeZone: Utils.TZ_IRAN,
        year: "numeric",
        month: "numeric",
        day: "numeric",
      }).formatToParts(Utils.now());
      const get = (t) => Number(parts.find((p) => p.type === t).value);
      this.jalaliYear = get("year");
      this.jalaliMonth = get("month");
      this.jalaliDay = get("day");
      this._jalaliDaysCache = null;
      // Pre-compute year options
      const years = [];
      for (let y = this.jalaliYear; y >= this.jalaliYear - 4; y--) years.push(y);
      this.jalaliYearOpts = years;
      // Set initial days
      this.jalaliUpdateDays();
    },

    get accountingKPIs() {
      return AccountingEngine.getKPIs();
    },

    get topProducts() {
      return AccountingEngine.getTopProducts(10);
    },

    get productTable() {
      return AccountingEngine.getProductTable();
    },

    renderCharts() {
      if (!this.accountingLoaded) return;
      // Destroy only accounting charts (preserve other page charts like visits)
      ['revenue','status','topProducts','hourly'].forEach(key => {
        if (this._chartInstances[key]) {
          this._chartInstances[key].destroy();
          delete this._chartInstances[key];
        }
      });

      // Revenue chart
      const revEl = document.getElementById("revenueChart");
      if (revEl) {
        const revData = AccountingEngine.getRevenueChart();
        this._chartInstances.revenue = new Chart(revEl, {
          type: "line",
          data: {
            labels: revData.labels,
            datasets: [
              {
                label: "فروش (تومان)",
                data: revData.values,
                borderColor: "#b8860b",
                backgroundColor: "rgba(184,134,11,0.1)",
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: "#b8860b",
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: (v) => Utils.toPersianNum(v),
                },
              },
              x: {
                ticks: { maxTicksLimit: 7 },
              },
            },
          },
        });
      }

      // Status chart
      const statusEl = document.getElementById("statusChart");
      if (statusEl) {
        const statusData = AccountingEngine.getStatusChart();
        this._chartInstances.status = new Chart(statusEl, {
          type: "doughnut",
          data: {
            labels: ["جدید", "در حال آماده‌سازی", "آماده", "تحویل شد", "لغو شد"],
            datasets: [
              {
                data: [
                  statusData.new,
                  statusData.preparing,
                  statusData.ready,
                  statusData.delivered,
                  statusData.cancelled,
                ],
                backgroundColor: ["#e8c547", "#4a90d9", "#28a745", "#6c757d", "#dc3545"],
                borderWidth: 0,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "65%",
            plugins: {
              legend: { position: "bottom", labels: { padding: 12 } },
            },
          },
        });
      }

      // Top products chart
      const topEl = document.getElementById("topProductsChart");
      if (topEl) {
        const topData = AccountingEngine.getTopProducts(10);
        this._chartInstances.topProducts = new Chart(topEl, {
          type: "bar",
          data: {
            labels: topData.map((p) => p.product_name_fa),
            datasets: [
              {
                label: "تعداد فروش",
                data: topData.map((p) => p.qty),
                backgroundColor: "#b8860b",
                borderRadius: 6,
              },
            ],
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, ticks: { callback: (v) => Utils.toPersianNum(v) } },
            },
          },
        });
      }

      // Hourly chart
      const hourEl = document.getElementById("hourlyChart");
      if (hourEl) {
        const hourData = AccountingEngine.getHourlyData();
        this._chartInstances.hourly = new Chart(hourEl, {
          type: "bar",
          data: {
            labels: Array.from({ length: 24 }, (_, i) => Utils.toPersianNum(i) + ":00"),
            datasets: [
              {
                label: "تعداد سفارش",
                data: hourData,
                backgroundColor: "rgba(184,134,11,0.3)",
                borderColor: "#b8860b",
                borderWidth: 1,
                borderRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, ticks: { stepSize: 1, callback: (v) => Utils.toPersianNum(v) } },
              x: { ticks: { maxTicksLimit: 12 } },
            },
          },
        });
      }
    },

    exportOrdersCSV() {
      AccountingEngine.exportOrdersCSV();
      this.toast("فایل CSV سفارشات دانلود شد");
    },

    exportProductsCSV() {
      AccountingEngine.exportProductsCSV();
      this.toast("\u0641\u0627\u06cc\u0644 CSV \u0645\u062d\u0635\u0648\u0644\u0627\u062a \u062f\u0627\u0646\u0644\u0648\u062f \u0634\u062f");
    },

    // === PDF Export (print-optimized) ===
    exportAccountingPDF() {
      const kpis = AccountingEngine.getKPIs();
      const table = AccountingEngine.getProductTable();
      const period = this.accountingPeriod;
      const labels = {today:'\u0627\u0645\u0631\u0648\u0632','7days':'\u06f7 \u0631\u0648\u0632 \u0627\u062e\u06cc\u0631','30days':'\u06f3\u06f0 \u0631\u0648\u0632 \u0627\u062e\u06cc\u0631',month:'\u0627\u06cc\u0646 \u0645\u0627\u0647',all:'\u0647\u0645\u0647',custom:'\u0633\u0641\u0627\u0631\u0634\u0648\u06cc'};
      const pLabel = labels[period] || period;
      const nowFa = new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(Utils.now());
      let rows = '';
      for (const p of table) {
        rows += '<tr><td>'+p.name+'</td><td>'+Utils.toPersianNum(p.qty)+'</td><td class="gold">'+Utils.formatPrice(p.revenue)+'</td><td>'+Utils.formatPrice(p.avgPrice)+'</td><td>'+Utils.toPersianNum(p.share)+'\u066a</td></tr>';
      }
      const html = '<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8">'+
        '<style>'+
        'body{font-family:Vazirmatn,Tahoma,sans-serif;padding:2rem;color:#1c1612}'+
        'h1{font-size:1.4rem;color:#b8860b;margin-bottom:.3rem}'+
        'h2{font-size:1.1rem;margin:1.5rem 0 .5rem;color:#3d2e1f;border-bottom:2px solid #b8860b;padding-bottom:.3rem}'+
        '.meta{color:#7a6b5a;font-size:.8rem;margin-bottom:1.5rem}'+
        '.kpis{display:flex;gap:1rem;margin-bottom:1.5rem}'+
        '.kpi{flex:1;text-align:center;padding:.75rem;border:1px solid #e8ddd0;border-radius:8px}'+
        '.kpi .val{font-size:1.3rem;font-weight:900;color:#b8860b}'+
        '.kpi .lbl{font-size:.7rem;color:#7a6b5a;margin-top:.2rem}'+
        'table{width:100%;border-collapse:collapse;font-size:.8rem}'+
        'th{background:#f0e9df;padding:.5rem;text-align:right;font-weight:700;border-bottom:2px solid #b8860b}'+
        'td{padding:.4rem .5rem;border-bottom:1px solid #e8ddd0}'+
        '.gold{color:#b8860b;font-weight:800}'+
        '@media print{body{padding:1rem}}'+
        '</style></head><body>'+
        '<h1>\u06af\u0632\u0627\u0631\u0634 \u062d\u0633\u0627\u0628\u062f\u0627\u0631\u06cc \u2014 \u06a9\u0627\u0641\u0647 \u0622\u06cc\u200c\u0686\u0627\u06cc</h1>'+
        '<div class="meta">\u0628\u0627\u0632\u0647: '+pLabel+' | \u062a\u0627\u0631\u06cc\u062e: '+nowFa+'</div>'+
        '<div class="kpis">'+
        '<div class="kpi"><div class="val">'+Utils.formatPrice(kpis.totalRevenue)+'</div><div class="lbl">\u0645\u062c\u0645\u0648\u0639 \u0641\u0631\u0648\u0634</div></div>'+
        '<div class="kpi"><div class="val">'+Utils.toPersianNum(kpis.totalOrders)+'</div><div class="lbl">\u062a\u0639\u062f\u0627\u062f \u0633\u0641\u0627\u0631\u0634</div></div>'+
        '<div class="kpi"><div class="val">'+Utils.formatPrice(kpis.avgOrder)+'</div><div class="lbl">\u0645\u06cc\u0627\u0646\u06af\u06cc\u0646 \u0633\u0641\u0627\u0631\u0634</div></div>'+
        '<div class="kpi"><div class="val">'+(kpis.topProduct?kpis.topProduct.product_name_fa:'\u2014')+'</div><div class="lbl">\u067e\u0631\u0641\u0631\u0648\u0634\u062a\u0631\u06cc\u0646</div></div>'+
        '</div>'+
        '<h2>\u0645\u0635\u0631\u0641 \u0645\u062d\u0635\u0648\u0644\u0627\u062a</h2>'+
        '<table><thead><tr><th>\u0646\u0627\u0645 \u0645\u062d\u0635\u0648\u0644</th><th>\u062a\u0639\u062f\u0627\u062f</th><th>\u062f\u0631\u0622\u0645\u062f</th><th>\u0645\u06cc\u0627\u0646\u06af\u06cc\u0646</th><th>\u0633\u0647\u0645</th></tr></thead><tbody>'+
        rows+'</tbody></table>'+
        '<p style="margin-top:2rem;text-align:center;font-size:.7rem;color:#7a6b5a">\u0637\u0631\u0627\u062d\u06cc \u0634\u062f\u0647 \u062a\u0648\u0636\u0639 amirlwf</p>'+
        '</body></html>';
      const w = window.open('', '_blank');
      w.document.write(html);
      w.document.close();
      setTimeout(function(){ w.print(); }, 400);
      this.toast('PDF \u0622\u0645\u0627\u062f\u0647 \u0686\u0627\u067e / \u0630\u062e\u06cc\u0631\u0647 \u0634\u062f');
    },

    // === Excel Export (SheetJS) ===
    exportAccountingExcel() {
      try {
        if (!window.XLSX) {
          this.toast('\u06a9\u062a\u0627\u0628\u062e\u0627\u0646\u0647 Excel \u0628\u0627\u0631\u06af\u0630\u0627\u0631\u06cc \u0646\u0634\u062f\u0647', 'error');
          return;
        }
        const kpis = AccountingEngine.getKPIs();
        const table = AccountingEngine.getProductTable();
        const orders = AccountingEngine.orders;
        const wb = XLSX.utils.book_new();
        // KPIs sheet
        const kpiRows = [
          ['\u06af\u0632\u0627\u0631\u0634 \u062d\u0633\u0627\u0628\u062f\u0627\u0631\u06cc'],
          ['\u0628\u0627\u0632\u0647', this.accountingPeriod],
          [],
          ['\u0645\u062c\u0645\u0648\u0639 \u0641\u0631\u0648\u0634', kpis.totalRevenue],
          ['\u062a\u0639\u062f\u0627\u062f', kpis.totalOrders],
          ['\u0645\u06cc\u0627\u0646\u06af\u06cc\u0646', kpis.avgOrder],
          ['\u067e\u0631\u0641\u0631\u0648\u0634\u062a\u0631\u06cc\u0646', kpis.topProduct ? kpis.topProduct.product_name_fa : ''],
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiRows), '\u062e\u0644\u0627\u0635\u0647');
        // Products sheet
        const pData = [['\u0646\u0627\u0645', '\u062a\u0639\u062f\u0627\u062f', '\u062f\u0631\u0622\u0645\u062f', '\u0645\u06cc\u0627\u0646\u06af\u06cc\u0646', '\u0633\u0647\u0645(%)']];
        for (const p of table) pData.push([p.name, p.qty, p.revenue, p.avgPrice, p.share]);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pData), '\u0645\u062d\u0635\u0648\u0644\u0627\u062a');
        // Orders sheet
        if (orders.length > 0) {
          const oData = [['\u0634\u0645\u0627\u0631\u0647', '\u0648\u0636\u0639\u06cc\u062a', '\u0645\u0628\u0644\u063a', '\u062a\u0639\u062f\u0627\u062f', '\u0645\u06cc\u0632', '\u062a\u0627\u0631\u06cc\u062e']];
          for (const o of orders) oData.push([o.order_number, Utils.getStatusLabel(o.status), o.total_price, o.item_count, o.table_number||'', Utils.formatDate(o.created_at)]);
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(oData), '\u0633\u0641\u0627\u0631\u0634\u0627\u062a');
        }
        XLSX.writeFile(wb, 'ichai-accounting-'+Date.now()+'.xlsx');
        this.toast('\u0641\u0627\u06cc\u0644 Excel \u062f\u0627\u0646\u0644\u0648\u062f \u0634\u062f');
      } catch(e) {
        console.error('Excel export failed:', e);
        this.toast('\u062e\u0637\u0627 \u062f\u0631 \u062e\u0631\u0648\u062c\u06cc Excel', 'error');
      }
    },
  }));
});
