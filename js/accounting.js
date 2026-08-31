/**
 * accounting.js — Professional Accounting Dashboard
 * KPIs, Charts, Product Consumption, Export.
 * Works with Supabase orders + order_items data.
 */

const AccountingEngine = {
  orders: [],
  items: [],
  period: "30days",
  customFrom: "",
  customTo: "",

  // ══════════ Data Loading ══════════

  async loadData(period, customFrom, customTo) {
    this.period = period || "30days";
    this.customFrom = customFrom || "";
    this.customTo = customTo || "";

    let since = null;
    let until = null;
    if (this.period === "custom" && this.customFrom) {
      since = this.customFrom;
      until = this.customTo || null;
    } else if (this.period === "today") {
      // BUGFIX: "today" previously had no upper bound, so orders placed
      // after Tehran midnight tomorrow-offset (and any clock skew) leaked in.
      // Pin the exact Tehran-day window: [00:00, 23:59:59.999].
      const start = Utils.startOfTehranDay(Utils.now());
      since = start.toISOString();
      until = new Date(start.getTime() + 86400000 - 1).toISOString();
    } else if (this.period !== "all") {
      since = Utils.getPeriodStart(this.period);
    }

    // Fetch orders
    const options = { since, until };
    this.orders = await SupaDB.fetchOrders(options);
    // Fetch items (same window) — must match the orders window exactly,
    // otherwise KPI totals and the product table disagree.
    this.items = await SupaDB.fetchAccountingData(since, until);

    return this;
  },

  // ══════════ KPI Computation ══════════

  getKPIs() {
    const activeOrders = this.orders.filter((o) => o.status !== "cancelled");
    const totalRevenue = activeOrders.reduce((s, o) => s + o.total_price, 0);
    const totalOrders = activeOrders.length;
    const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // Top product
    const productMap = {};
    for (const item of this.items) {
      if (item.order_status === "cancelled") continue;
      const key = item.product_name_fa;
      if (!productMap[key]) productMap[key] = { name: key, qty: 0, revenue: 0 };
      productMap[key].qty += item.quantity;
      productMap[key].revenue += item.subtotal;
    }
    const topProduct = Object.values(productMap).sort((a, b) => b.qty - a.qty)[0] || null;
    if (topProduct) {
      // BUGFIX: expose product_name_fa — the accounting page, PDF and Excel
      // exports all read topProduct.product_name_fa, which was undefined
      // before (the field here was `name`), so "پرفروش‌ترین" showed «—».
      topProduct.product_name_fa = topProduct.name;
    }

    return {
      totalRevenue,
      totalOrders,
      avgOrder,
      topProduct,
    };
  },

  // ══════════ Revenue Chart Data ══════════

  getRevenueChart() {
    const active = this.orders.filter((o) => o.status !== "cancelled");
    const daily = {};
    for (const o of active) {
      // Jalali day label in Iran time (e.g. «۱۴۰۵/۰۶/۰۱»)
      const day = Utils.formatDate(o.created_at).split("،")[0].trim();
      daily[day] = (daily[day] || 0) + o.total_price;
    }
    const sorted = Object.entries(daily).sort((a, b) => a[0].localeCompare(b[0]));
    return {
      labels: sorted.map((d) => d[0]),
      values: sorted.map((d) => d[1]),
    };
  },

  // ══════════ Status Distribution ══════════

  getStatusChart() {
    const counts = { new: 0, preparing: 0, ready: 0, delivered: 0, cancelled: 0 };
    for (const o of this.orders) {
      counts[o.status] = (counts[o.status] || 0) + 1;
    }
    return counts;
  },

  // ══════════ Top Products ══════════

  getTopProducts(limit) {
    limit = limit || 10;
    const productMap = {};
    for (const item of this.items) {
      if (item.order_status === "cancelled") continue;
      const key = item.product_id || item.product_name_fa;
      if (!productMap[key]) {
        productMap[key] = {
          product_name_fa: item.product_name_fa,
          qty: 0,
          revenue: 0,
        };
      }
      productMap[key].qty += item.quantity;
      productMap[key].revenue += item.subtotal;
    }
    return Object.values(productMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);
  },

  // ══════════ Hourly Heatmap ══════════

  getHourlyData() {
    const hours = new Array(24).fill(0);
    for (const o of this.orders) {
      if (o.status === "cancelled") continue;
      // Hour in Iran time regardless of device clock/timezone
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: Utils.TZ_IRAN,
        hour12: false,
        hour: "2-digit",
      }).formatToParts(new Date(o.created_at));
      const h = Number(parts.find((p) => p.type === "hour").value);
      if (!isNaN(h)) hours[h]++;
    }
    return hours;
  },

  // ══════════ Product Consumption Table ══════════

  getProductTable() {
    const productMap = {};
    for (const item of this.items) {
      if (item.order_status === "cancelled") continue;
      const key = item.product_id || item.product_name_fa;
      if (!productMap[key]) {
        productMap[key] = {
          name: item.product_name_fa,
          qty: 0,
          revenue: 0,
        };
      }
      productMap[key].qty += item.quantity;
      productMap[key].revenue += item.subtotal;
    }
    const totalRev = Object.values(productMap).reduce((s, p) => s + p.revenue, 0);
    return Object.values(productMap)
      .map((p) => ({
        ...p,
        avgPrice: p.qty > 0 ? Math.round(p.revenue / p.qty) : 0,
        share: totalRev > 0 ? Math.round((p.revenue / totalRev) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  },

  // ══════════ Export ══════════

  exportOrdersCSV() {
    const data = this.orders.map((o) => ({
      order_number: o.order_number,
      status: Utils.getStatusLabel(o.status),
      total_price: o.total_price,
      item_count: o.item_count,
      table_number: o.table_number,
      customer_name: o.customer_name,
      created_at: Utils.formatDate(o.created_at),
    }));
    Utils.exportCSV(
      data,
      [
        { key: "order_number", label: "شماره سفارش" },
        { key: "status", label: "وضعیت" },
        { key: "total_price", label: "مبلغ (تومان)" },
        { key: "item_count", label: "تعداد آیتم" },
        { key: "table_number", label: "شماره میز" },
        { key: "customer_name", label: "نام مشتری" },
        { key: "created_at", label: "تاریخ" },
      ],
      "ichai-orders-" + Utils.formatDate(Utils.now()).replace(/[^\w\u0600-\u06FF]+/g, "-") + ".csv"
    );
  },

  exportProductsCSV() {
    const data = this.getProductTable();
    Utils.exportCSV(
      data,
      [
        { key: "name", label: "نام محصول" },
        { key: "qty", label: "تعداد فروخته‌شده" },
        { key: "revenue", label: "درآمد (تومان)" },
        { key: "avgPrice", label: "میانگین قیمت" },
        { key: "share", label: "سهم از فروش (%)" },
      ],
      "ichai-products-" + Utils.formatDate(Utils.now()).replace(/[^\w\u0600-\u06FF]+/g, "-") + ".csv"
    );
  },
};
