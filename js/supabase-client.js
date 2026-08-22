const SupaDB = {
  client: null,
  ready: false,

  init() {
    if (
      !window.supabase ||
      !SUPABASE_URL ||
      SUPABASE_URL.includes("YOUR_PROJECT")
    ) {
      console.warn(
        "Supabase not configured — running in offline/localStorage mode"
      );
      return false;
    }
    this.client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    this.ready = true;
    return true;
  },

  async getSession() {
    if (!this.ready) return null;
    const {
      data: { session },
    } = await this.client.auth.getSession();
    return session;
  },

  async signIn(email, password) {
    if (!this.ready) throw new Error("Supabase not configured");
    return await this.client.auth.signInWithPassword({ email, password });
  },

  async signOut() {
    if (!this.ready) return;
    await this.client.auth.signOut();
  },

  async fetchCategories() {
    if (!this.ready)
      return Utils.getStorage("cafe_categories", DEFAULT_CATEGORIES);
    try {
      const { data, error } = await this.client
        .from("categories")
        .select("id, name_fa, icon, order, created_at")
        .order("order");
      if (error) throw error;
      Utils.setStorage("cafe_categories", data);
      return data;
    } catch (e) {
      console.warn("Supabase fetch categories failed, using cache:", e);
      return Utils.getStorage("cafe_categories", DEFAULT_CATEGORIES);
    }
  },

  async saveCategory(cat) {
    if (!this.ready) return this._localSave("cafe_categories", cat);
    const sanitized = this._sanitizeCategory(cat);
    const { data, error } = await this.client
      .from("categories")
      .upsert(sanitized, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    this._invalidateCache("cafe_categories");
    return data;
  },

  async deleteCategory(id) {
    if (!this.ready) return this._localDelete("cafe_categories", id);
    const { error } = await this.client
      .from("categories")
      .delete()
      .eq("id", id);
    if (error) throw error;
    this._invalidateCache("cafe_categories");
  },

  async fetchProducts() {
    if (!this.ready)
      return Utils.getStorage("cafe_products", DEFAULT_PRODUCTS);
    try {
      const { data, error } = await this.client
        .from("products")
        .select("id, category_id, name_fa, description_fa, price, image_url, is_featured, order, created_at")
        .order("order");
      if (error) throw error;
      Utils.setStorage("cafe_products", data);
      return data;
    } catch (e) {
      console.warn("Supabase fetch products failed, using cache:", e);
      return Utils.getStorage("cafe_products", DEFAULT_PRODUCTS);
    }
  },

  async saveProduct(product) {
    if (!this.ready) return this._localSave("cafe_products", product);
    const sanitized = this._sanitizeProduct(product);
    const { data, error } = await this.client
      .from("products")
      .upsert(sanitized, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    this._invalidateCache("cafe_products");
    return data;
  },

  async updateProduct(product, oldImageUrl) {
    if (!this.ready) return this._localSave("cafe_products", product);
    const sanitized = this._sanitizeProduct(product);
    const { data, error } = await this.client
      .from("products")
      .upsert(sanitized, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    if (oldImageUrl && oldImageUrl !== product.image_url) {
      await this._deleteStorageFile(oldImageUrl);
    }
    this._invalidateCache("cafe_products");
    return data;
  },

  async deleteProduct(id) {
    if (!this.ready) return this._localDelete("cafe_products", id);
    if (!id) throw new Error("Product ID is required");

    const { data: product, error: fetchError } = await this.client
      .from("products")
      .select("id, image_url")
      .eq("id", id)
      .single();
    if (fetchError) throw fetchError;

    const imageUrl = product?.image_url;

    if (imageUrl) {
      await this._clearImageField(id);
      await this._deleteStorageFile(imageUrl);
    }

    const { error } = await this.client
      .from("products")
      .delete()
      .eq("id", id);
    if (error) throw error;
    this._invalidateCache("cafe_products");
  },

  async _clearImageField(id) {
    try {
      await this.client
        .from("products")
        .update({ image_url: null })
        .eq("id", id);
    } catch (e) {
      console.warn("Clear image field failed:", e);
    }
  },

  async _deleteStorageFile(imageUrl) {
    if (!this.ready || !imageUrl) return;
    const path = this._extractStoragePath(imageUrl);
    if (!path) return;
    try {
      await this.client.storage.from("cafe-images").remove([path]);
    } catch (e) {
      console.warn("Storage file cleanup failed:", e);
    }
  },

  _extractStoragePath(url) {
    if (!url || typeof url !== "string") return null;
    const marker = "/storage/v1/object/public/cafe-images/";
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.substring(idx + marker.length);
  },

  async fetchCafeInfo() {
    if (!this.ready) return Utils.getStorage("cafe_info", DEFAULT_CAFE_INFO);
    try {
      const { data, error } = await this.client
        .from("cafe_info")
        .select("id, name, tagline, phone, address_fa, instagram, telegram, hours_fa, about_fa, welcome_fa, logo_url, updated_at")
        .limit(1)
        .single();
      if (error) throw error;
      Utils.setStorage("cafe_info", data);
      return data;
    } catch (e) {
      console.warn("Supabase fetch cafe_info failed, using cache:", e);
      return Utils.getStorage("cafe_info", DEFAULT_CAFE_INFO);
    }
  },

  async saveCafeInfo(info) {
    if (!this.ready) return this._localSave("cafe_info", info);
    const sanitized = {
      id: info.id || "singleton",
      name: String(info.name || "").slice(0, 200),
      tagline: String(info.tagline || "").slice(0, 500),
      phone: String(info.phone || "").slice(0, 50),
      address_fa: String(info.address_fa || "").slice(0, 500),
      instagram: String(info.instagram || "").slice(0, 100),
      telegram: String(info.telegram || "").slice(0, 100),
      hours_fa: String(info.hours_fa || "").slice(0, 200),
      about_fa: String(info.about_fa || "").slice(0, 2000),
      welcome_fa: String(info.welcome_fa || "").slice(0, 500),
      logo_url: info.logo_url || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await this.client
      .from("cafe_info")
      .upsert(sanitized, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    this._invalidateCache("cafe_info");
    return data;
  },

  async uploadImage(file) {
    if (!this.ready) return null;
    if (!file || !file.type || !file.type.startsWith("image/")) {
      throw new Error("فایل انتخاب شده تصویر نیست");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("حجم فایل نباید بیشتر از ۵ مگابایت باشد");
    }
    const allowedExts = ["jpg", "jpeg", "png", "webp", "gif"];
    const ext = file.name.split(".").pop().toLowerCase();
    if (!allowedExts.includes(ext)) {
      throw new Error("فرمت فایل مجاز نیست");
    }
    const fileName =
      Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    const filePath = "menu/" + fileName;

    const { error } = await this.client.storage
      .from("cafe-images")
      .upload(filePath, file, { contentType: file.type });

    if (error) throw error;

    const { data: urlData } = this.client.storage
      .from("cafe-images")
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  },

  async submitFeedback(feedback) {
    const name = String(feedback.name || "ناشناس").slice(0, 100);
    const message = String(feedback.message || "").slice(0, 2000);
    if (!message.trim()) throw new Error("پیام نمی‌تواند خالی باشد");

    const record = {
      name,
      message,
    };
    if (!this.ready) {
      const localRecord = {
        ...record,
        id: Utils.generateId(),
        created_at: new Date().toISOString(),
      };
      this._localSave("cafe_feedbacks", localRecord);
      return localRecord;
    }
    try {
      const { data, error } = await this.client
        .from("feedbacks")
        .insert(record)
        .select()
        .single();
      if (error) throw error;
      this.cleanOldFeedbacks();
      return data;
    } catch (e) {
      console.warn("Supabase submit feedback failed, saving locally:", e);
      const localRecord = {
        ...record,
        id: Utils.generateId(),
        created_at: new Date().toISOString(),
      };
      this._localSave("cafe_feedbacks", localRecord);
      return localRecord;
    }
  },

  async cleanOldFeedbacks() {
    const cutoff = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    if (this.ready) {
      try {
        await this.client
          .from("feedbacks")
          .delete()
          .lt("created_at", cutoff);
      } catch (e) {
        console.warn("Supabase cleanup old feedbacks failed:", e);
      }
    }
    const local = Utils.getStorage("cafe_feedbacks", []);
    const filtered = local.filter((f) => f.created_at >= cutoff);
    if (filtered.length !== local.length) {
      Utils.setStorage("cafe_feedbacks", filtered);
    }
  },

  async fetchFeedbacks() {
    await this.cleanOldFeedbacks();
    if (!this.ready) return Utils.getStorage("cafe_feedbacks", []);
    try {
      const cutoff = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data, error } = await this.client
        .from("feedbacks")
        .select("id, name, message, created_at")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn("Supabase fetch feedbacks failed:", e);
      return Utils.getStorage("cafe_feedbacks", []);
    }
  },

  async deleteFeedback(id) {
    if (!this.ready) return this._localDelete("cafe_feedbacks", id);
    if (!id) throw new Error("Feedback ID is required");
    const { error } = await this.client
      .from("feedbacks")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  // ══════════════════════════════════════════════════════
  // ORDERS — Live Order System
  // ══════════════════════════════════════════════════════

  /**
   * Generate a unique order number: ORD-YYYYMMDD-XXXX
   */
  _generateOrderNumber() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const seq = String(Math.floor(Math.random() * 9000) + 1000);
    return `ORD-${y}${m}${d}-${seq}`;
  },

  /**
   * Create a new order with items in one transaction.
   * Returns the created order with its items.
   */
  async createOrder(orderData) {
    if (!this.ready) {
      // Offline fallback: save to localStorage
      const order = {
        id: "ord-" + Date.now(),
        order_number: this._generateOrderNumber(),
        status: "new",
        customer_name: orderData.customer_name || "",
        table_number: orderData.table_number || "",
        phone: orderData.phone || "",
        notes: orderData.notes || "",
        total_price: orderData.total_price,
        item_count: orderData.items.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: orderData.items.map((it) => ({
          id: Utils.generateId(),
          order_id: "ord-" + Date.now(),
          product_id: it.product_id,
          product_name_fa: it.product_name_fa,
          product_image_url: it.product_image_url || null,
          product_price: it.product_price,
          quantity: it.quantity,
          subtotal: it.subtotal,
          created_at: new Date().toISOString(),
        })),
      };
      this._localSave("cafe_orders", order);
      return order;
    }

    // Sanitize order
    const orderNumber = this._generateOrderNumber();
    const sanitized = {
      order_number: orderNumber,
      status: "new",
      customer_name: String(orderData.customer_name || "").slice(0, 100),
      table_number: String(orderData.table_number || "").slice(0, 20),
      phone: String(orderData.phone || "").slice(0, 20),
      notes: String(orderData.notes || "").slice(0, 500),
      total_price: Math.max(0, Math.floor(Number(orderData.total_price) || 0)),
      item_count: orderData.items.length,
    };

    // Insert order
    const { data: order, error: orderError } = await this.client
      .from("orders")
      .insert(sanitized)
      .select()
      .single();
    if (orderError) throw orderError;

    // Insert items
    const items = orderData.items.map((it) => ({
      order_id: order.id,
      product_id: it.product_id || null,
      product_name_fa: String(it.product_name_fa || "").slice(0, 200),
      product_image_url: it.product_image_url || null,
      product_price: Math.max(0, Math.floor(Number(it.product_price) || 0)),
      quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
      subtotal: Math.max(0, Math.floor(Number(it.subtotal) || 0)),
    }));

    const { error: itemsError } = await this.client
      .from("order_items")
      .insert(items);
    if (itemsError) throw itemsError;

    return { ...order, items };
  },

  /**
   * Fetch orders with optional status filter.
   * For admin: authenticated (needs service role or admin session).
   * For public: uses anon key + RLS allows SELECT.
   */
  async fetchOrders(options = {}) {
    if (!this.ready) return Utils.getStorage("cafe_orders", []);
    try {
      let query = this.client
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (options.status) {
        query = query.eq("status", options.status);
      }
      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.since) {
        query = query.gte("created_at", options.since);
      }
      if (options.order_number) {
        query = query.eq("order_number", options.order_number);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("Supabase fetch orders failed:", e);
      return Utils.getStorage("cafe_orders", []);
    }
  },

  /**
   * Fetch order items for a given order ID.
   */
  async fetchOrderItems(orderId) {
    if (!this.ready) return [];
    try {
      const { data, error } = await this.client
        .from("order_items")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at");
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("Supabase fetch order items failed:", e);
      return [];
    }
  },

  /**
   * Fetch order with its items.
   */
  async fetchOrderWithItems(orderId) {
    const order = await this.fetchOrders({ order_number: orderId });
    if (!order || order.length === 0) return null;
    const items = await this.fetchOrderItems(order[0].id);
    return { ...order[0], items };
  },

  /**
   * Update order status.
   */
  async updateOrderStatus(orderId, newStatus) {
    if (!this.ready) {
      const orders = Utils.getStorage("cafe_orders", []);
      const idx = orders.findIndex((o) => o.id === orderId);
      if (idx > -1) {
        orders[idx].status = newStatus;
        orders[idx].updated_at = new Date().toISOString();
        Utils.setStorage("cafe_orders", orders);
      }
      return;
    }
    const validStatuses = ["new", "preparing", "ready", "delivered", "cancelled"];
    if (!validStatuses.includes(newStatus)) {
      throw new Error("Invalid status: " + newStatus);
    }
    const { error } = await this.client
      .from("orders")
      .update({ status: newStatus })
      .eq("id", orderId);
    if (error) throw error;
  },

  /**
   * Delete an order and its items (hard delete).
   */
  async deleteOrder(orderId) {
    if (!this.ready) {
      return this._localDelete("cafe_orders", orderId);
    }
    if (!orderId) throw new Error("Order ID is required");
    // Delete items first (CASCADE should handle this, but be explicit)
    const { error: itemsError } = await this.client
      .from("order_items")
      .delete()
      .eq("order_id", orderId);
    if (itemsError) throw itemsError;
    // Delete the order
    const { error } = await this.client
      .from("orders")
      .delete()
      .eq("id", orderId);
    if (error) throw error;
  },

  /**
   * Subscribe to order changes (Realtime).
   * Returns the channel object for unsubscription.
   */
  subscribeOrders(callback) {
    if (!this.ready) return null;
    const channel = this.client
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => callback("INSERT", payload.new)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => callback("UPDATE", payload.new)
      )
      .subscribe();
    return channel;
  },

  /**
   * Unsubscribe from order changes.
   */
  unsubscribeOrders(channel) {
    if (channel && this.ready) {
      this.client.removeChannel(channel);
    }
  },

  // ══════════════════════════════════════════════════════
  // ACCOUNTING — Dashboard Aggregations
  // ══════════════════════════════════════════════════════

  /**
   * Fetch all order items for accounting (with order join).
   * Uses a single query for efficiency.
   */
  async fetchAccountingData(since) {
    if (!this.ready) {
      const orders = Utils.getStorage("cafe_orders", []);
      const items = [];
      for (const o of orders) {
        if (o.items) {
          for (const it of o.items) {
            items.push({ ...it, order_status: o.status, order_created_at: o.created_at });
          }
        }
      }
      return items;
    }
    try {
      let query = this.client
        .from("orders")
        .select("id, order_number, status, total_price, item_count, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (since) {
        query = query.gte("created_at", since);
      }

      const { data: orders, error: ordersError } = await query;
      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0) return [];

      // Fetch all order items in batches
      const orderIds = orders.map((o) => o.id);
      const orderMap = {};
      for (const o of orders) {
        orderMap[o.id] = o;
      }

      // Fetch items in parallel batches of 100
      const allItems = [];
      for (let i = 0; i < orderIds.length; i += 100) {
        const batch = orderIds.slice(i, i + 100);
        const { data: batchItems, error: itemsError } = await this.client
          .from("order_items")
          .select("*")
          .in("order_id", batch);
        if (itemsError) throw itemsError;
        if (batchItems) {
          for (const item of batchItems) {
            const order = orderMap[item.order_id];
            allItems.push({
              ...item,
              order_status: order ? order.status : "unknown",
              order_created_at: order ? order.created_at : null,
              order_number: order ? order.order_number : "",
            });
          }
        }
      }

      return allItems;
    } catch (e) {
      console.warn("Supabase fetch accounting data failed:", e);
      return [];
    }
  },

  _sanitizeProduct(product) {
    return {
      id: String(product.id || "").slice(0, 50),
      category_id: String(product.category_id || "").slice(0, 50),
      name_fa: String(product.name_fa || "").slice(0, 200),
      description_fa: String(product.description_fa || "").slice(0, 1000),
      price: Math.max(0, Math.floor(Number(product.price) || 0)),
      image_url: product.image_url ? String(product.image_url).slice(0, 2000) : null,
      is_featured: Boolean(product.is_featured),
      order: Math.max(0, Math.floor(Number(product.order) || 0)),
    };
  },

  _sanitizeCategory(cat) {
    return {
      id: String(cat.id || "").slice(0, 50),
      name_fa: String(cat.name_fa || "").slice(0, 100),
      icon: String(cat.icon || "✦").slice(0, 10),
      order: Math.max(0, Math.floor(Number(cat.order) || 0)),
    };
  },

  _invalidateCache(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // silent
    }
  },

  _localSave(key, item) {
    const list = Utils.getStorage(key, []);
    const idx = list.findIndex((x) => x.id === item.id);
    if (idx > -1) {
      list[idx] = item;
    } else {
      list.push(item);
    }
    Utils.setStorage(key, list);
    return item;
  },

  _localDelete(key, id) {
    const list = Utils.getStorage(key, []).filter((x) => x.id !== id);
    Utils.setStorage(key, list);
  },
};
