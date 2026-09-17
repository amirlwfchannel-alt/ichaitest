/**
 * app.js — Public menu page logic (Alpine.js)
 * Manages: categories, products, search, filtering, favorites panel, feedback, UI state.
 * No cart, no ordering — purely a display menu.
 */

document.addEventListener("alpine:init", () => {
  Alpine.data("cafeMenu", () => ({
    // State
    categories: [],
    products: [],
    cafeInfo: {},
    activeCategory: "cat-1",
    searchQuery: "",
    favorites: [],
    isLoaded: false,
    showMobileMenu: false,
    darkMode: false,
    showFavPanel: false,
    _observer: null,

    // Feedback state
    feedbackForm: { name: "", message: "" },
    feedbackSending: false,
    feedbackSuccess: false,
    feedbackError: "",

    // Init
    init() {
      const hero = document.querySelector(".hero-content");
      if (hero && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        hero.classList.add("hero-in-start");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => hero.classList.add("hero-in-end"));
        });
      }
      // Paint cached/default menu data without waiting for network requests.
      const cachedCategories = Utils.getStorage("cafe_categories", DEFAULT_CATEGORIES);
      const cachedProducts = Utils.getStorage("cafe_products", DEFAULT_PRODUCTS);
      const cachedInfo = Utils.getStorage("cafe_info", DEFAULT_CAFE_INFO);
      this.categories = (Array.isArray(cachedCategories) ? cachedCategories : DEFAULT_CATEGORIES)
        .filter((item) => item && typeof item.id === 'string').slice().sort((a, b) => a.order - b.order);
      this.products = (Array.isArray(cachedProducts) ? cachedProducts : DEFAULT_PRODUCTS)
        .filter((item) => item && typeof item.id === 'string').slice().sort((a, b) => a.order - b.order);
      this.cafeInfo = cachedInfo && typeof cachedInfo === 'object' && !Array.isArray(cachedInfo)
        ? { ...DEFAULT_CAFE_INFO, ...cachedInfo } : { ...DEFAULT_CAFE_INFO };
      this.loadFavorites();
      this.loadDarkMode();
      this.isLoaded = true;
      this.$nextTick(() => this.observeFadeIns());
      this.setupNavbar();

      // Deferred scripts provide Supabase before Alpine starts. Keep its
      // synchronous initialization ahead of analytics and order tracking.
      SupaDB.init();
      this.trackVisit();
      this._initLiveTracking();
      this.loadData()
        .then(() => this.$nextTick(() => this.observeFadeIns()))
        .catch((error) => console.warn("Menu refresh failed; keeping cached data:", error));
    },

    // Load data from Supabase with localStorage fallback
    async loadData() {
      const [categories, products, cafeInfo] = await Promise.all([
        SupaDB.fetchCategories(),
        SupaDB.fetchProducts(),
        SupaDB.fetchCafeInfo(),
      ]);
      this.categories = categories;
      this.products = products;
      this.cafeInfo = cafeInfo;
      this.categories.sort((a, b) => a.order - b.order);
      this.products.sort((a, b) => a.order - b.order);
    },

    // Track site visits (smart, privacy-friendly, session-deduplicated)
    trackVisit() {
      const visits = Utils.getStorage("cafe_visit_count", 0) + 1;
      Utils.setStorage("cafe_visit_count", visits);
      // Server-side smart visit log (30-min session dedup via RPC)
      try {
        let vid = Utils.getStorage("ichai_visitor_id", null);
        if (!vid) {
          vid = Utils.generateId() + "-" + Date.now().toString(36);
          Utils.setStorage("ichai_visitor_id", vid);
        }
        if (SupaDB.ready && SupaDB.logVisit) {
          SupaDB.logVisit(vid, "/");
        }
      } catch (e) {
        /* visit logging must never break the page */
      }
    },

    // Start live order tracking on page load
    _initLiveTracking() {
      // Use a small delay so Supabase has time to initialize
      setTimeout(() => {
        const cart = Alpine.store('cart');
        if (cart && cart.myOrders.length > 0) {
          cart._ensureTracker();
        }
      }, 1500);
    },

    // Favorites
    loadFavorites() {
      const stored = Utils.getStorage("cafe_favorites", []);
      this.favorites = Array.isArray(stored) ? [...new Set(stored.filter((id) => typeof id === 'string'))] : [];
    },

    toggleFavorite(productId) {
      const idx = this.favorites.indexOf(productId);
      if (idx > -1) {
        this.favorites.splice(idx, 1);
      } else {
        this.favorites.push(productId);
      }
      Utils.setStorage("cafe_favorites", this.favorites);
    },

    isFavorite(productId) {
      return this.favorites.includes(productId);
    },

    get favoriteProducts() {
      return this.products.filter((p) => this.favorites.includes(p.id));
    },

    get favoriteCount() {
      return this.favorites.length;
    },

    // Favorites panel
    toggleFavPanel() {
      this.showFavPanel = !this.showFavPanel;
    },

    // Dark mode
    loadDarkMode() {
      this.darkMode = Utils.getStorage("cafe_dark_mode", false);
      if (this.darkMode) {
        document.body.classList.add("dark-mode");
      }
    },

    toggleTheme() {
      this.darkMode = !this.darkMode;
      document.body.classList.toggle("dark-mode", this.darkMode);
      Utils.setStorage("cafe_dark_mode", this.darkMode);
    },

    // Filtering
    setCategory(catId) {
      this.activeCategory = catId;
      this.$nextTick(() => this.observeFadeIns());
    },

    // ── Persian text normalization for search ──
    // Arabic Yeh/Kaf → Farsi, Alef variants unified, Heh variants unified,
    // ZWNJ/harakat/tatweel removed, digits unified, whitespace collapsed.
    _norm(s) {
      return (s || "")
        .toString()
        .replace(/[يى]/g, "ی")
        .replace(/[كک]/g, "ک")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/[ۀة]/g, "ه")
        .replace(/[\u200c\u064b-\u0652\u0640]/g, "") // ZWNJ, harakat, tatweel
        .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
        .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    },

    get filteredProducts() {
      let list = this.products;
      if (this.activeCategory !== "cat-1") {
        list = list.filter((p) => p.category_id === this.activeCategory);
      }
      const raw = this.searchQuery;
      if (!raw || !raw.trim()) return list;
      const q = this._norm(raw);
      if (!q) return list;
      const terms = q.split(" ").filter(Boolean);

      const scored = [];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const name = this._norm(p.name_fa);
        const desc = this._norm(p.description_fa);
        let score = 0;
        // every term must match somewhere in name or description
        if (!terms.every((t) => name.includes(t) || desc.includes(t))) continue;

        const first = terms[0];
        if (name === first || name.startsWith(first)) score = 3;
        else if (
          name.split(" ").some((w) => w.startsWith(first)) ||
          terms.every((t) => name.includes(t))
        ) {
          score = 2;
        } else {
          score = 1;
        }
        scored.push({ p, score, order: p.order });
      }
      scored.sort((a, b) => b.score - a.score || a.order - b.order);
      return scored.map((s) => s.p);
    },

    get featuredProducts() {
      // While searching, the featured section shows matching featured items
      // only (so it never displays irrelevant "popular" products above results).
      const base = this.products.filter((p) => p.is_featured);
      if (!this.searchQuery || !this.searchQuery.trim()) return base;
      return this.filteredProducts.filter((p) => p.is_featured);
    },

    // Feedback
    async submitFeedback() {
      this.feedbackError = "";
      if (!this.feedbackForm.message.trim()) {
        this.feedbackError = "لطفاً پیام خود را بنویسید.";
        return;
      }
      this.feedbackSending = true;
      try {
        await SupaDB.submitFeedback({
          name: this.feedbackForm.name.trim() || "ناشناس",
          message: this.feedbackForm.message.trim(),
        });
        this.feedbackSuccess = true;
        this.feedbackForm = { name: "", message: "" };
        setTimeout(() => (this.feedbackSuccess = false), 4000);
      } catch (e) {
        console.warn("Feedback submit failed:", e);
        this.feedbackError = "خطا در ارسال. لطفاً دوباره تلاش کنید.";
      } finally {
        this.feedbackSending = false;
      }
    },

    // Helpers
    _wordMatch(haystack, needle) {
      if (!haystack || !needle) return false;
      const words = haystack.split(/[\s،.!?،\-\/]+/);
      for (let i = 0; i < words.length; i++) {
        if (words[i] === needle) return true;
      }
      return false;
    },

    formatPrice(toman) {
      return Utils.formatPrice(toman);
    },

    toPersianNum(n) {
      return Utils.toPersianNum(n);
    },

    // Scroll-triggered fade-in via IntersectionObserver
    observeFadeIns() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
          typeof IntersectionObserver === "undefined") {
        document.querySelectorAll(".fade-in:not(.visible)").forEach((el) => {
          el.classList.remove("js-anim");
          el.classList.add("visible");
        });
        return;
      }
      if (!this._observer) {
        this._observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                this._observer.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
        );
      }
      document.querySelectorAll(".fade-in:not(.visible)").forEach((el) => {
        el.classList.add("js-anim");
        this._observer.observe(el);
      });
    },

    // Navbar scroll effect
    setupNavbar() {
      const navbar = document.querySelector(".navbar");
      if (!navbar) return;
      // rAF throttle: at most one class update per frame, passive listener
      // so the browser never blocks scrolling on this handler.
      let ticking = false;
      window.addEventListener(
        "scroll",
        () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            navbar.classList.toggle("scrolled", window.scrollY > 50);
            ticking = false;
          });
        },
        { passive: true }
      );
      navbar.classList.toggle("scrolled", window.scrollY > 50);
    },

    // Smooth scroll to section
    scrollTo(id) {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      this.showMobileMenu = false;
    },
  }));
});
