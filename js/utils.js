/**
 * utils.js — Shared utility functions
 * Persian number formatting, price display, localStorage wrappers, helpers.
 */

const Utils = {
  PERSIAN_DIGITS: ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"],

  /**
   * Convert Western digits to Persian digits.
   */
  toPersianNum(num) {
    if (num == null) return "";
    return String(num).replace(/\d/g, (d) => this.PERSIAN_DIGITS[+d]);
  },

  /**
   * Format a price in Toman with Persian digits and comma separators.
   * e.g. 125000 → "۱۲۵,۰۰۰ تومان"
   */
  formatPrice(toman) {
    if (toman == null) return "";
    const withCommas = Number(toman).toLocaleString("en-US");
    return this.toPersianNum(withCommas) + " تومان";
  },

  /**
   * Simple debounce function.
   */
  debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  },

  /**
   * Generate a simple unique ID.
   */
  generateId() {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  },

  /**
   * localStorage get with JSON parse and fallback.
   */
  getStorage(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },

  /**
   * localStorage set with JSON stringify.
   */
  setStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("localStorage write failed:", e);
    }
  },

  /**
   * Remove item from localStorage.
   */
  removeStorage(key) {
    localStorage.removeItem(key);
  },

  /**
   * Clamp a number between min and max.
   */
  clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  },

  /**
   * Create a simple Jalali date string (basic approximation).
   */
  toPersianDate(date) {
    try {
      return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(date || new Date());
    } catch {
      return "";
    }
  },

  /**
   * Persian relative time (basic).
   */
  timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return "لحظاتی پیش";
    if (seconds < 3600) return this.toPersianNum(Math.floor(seconds / 60)) + " دقیقه پیش";
    if (seconds < 86400) return this.toPersianNum(Math.floor(seconds / 3600)) + " ساعت پیش";
    return this.toPersianNum(Math.floor(seconds / 86400)) + " روز پیش";
  },

  /**
   * Format date to Jalali/Persian readable string.
   */
  formatDate(dateStr) {
    if (!dateStr) return "—";
    try {
      const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
      return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return dateStr;
    }
  },

  /**
   * Format short date (no time).
   */
  formatDateShort(dateStr) {
    if (!dateStr) return "—";
    try {
      const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
      return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(d);
    } catch {
      return dateStr;
    }
  },

  /**
   * Format time only (HH:MM).
   */
  formatTime(dateStr) {
    if (!dateStr) return "—";
    try {
      const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
      return new Intl.DateTimeFormat("fa-IR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return dateStr;
    }
  },

  /**
   * Get start of day/week/month for period filtering.
   */
  getPeriodStart(period, referenceDate) {
    const now = referenceDate ? new Date(referenceDate) : new Date();
    const start = new Date(now);
    switch (period) {
      case "today":
        start.setHours(0, 0, 0, 0);
        return start.toISOString();
      case "yesterday": {
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        return { from: start.toISOString(), to: end.toISOString() };
      }
      case "7days":
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        return start.toISOString();
      case "30days":
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        return start.toISOString();
      case "month": {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        return start.toISOString();
      }
      case "all":
        return null;
      default:
        return null;
    }
  },

  /**
   * Calculate percentage delta between two values.
   * Returns { delta: number, percent: string, direction: 'up'|'down'|'same' }
   */
  calcDelta(current, previous) {
    if (previous === 0) {
      if (current === 0) return { delta: 0, percent: "۰٪", direction: "same" };
      return { delta: current, percent: "∞", direction: "up" };
    }
    const delta = current - previous;
    const pct = Math.abs(Math.round((delta / previous) * 100));
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "same";
    return {
      delta,
      percent: this.toPersianNum(pct) + "٪",
      direction,
    };
  },

  /**
   * Export array of objects to CSV (UTF-8 BOM for Excel Persian support).
   * columns: [{key, label}] — label is the column header.
   */
  exportCSV(data, columns, filename) {
    if (!data || data.length === 0) return;
    const BOM = "\uFEFF";
    const header = columns.map((c) => '"' + c.label.replace(/"/g, '""') + '"').join(",");
    const rows = data.map((row) =>
      columns
        .map((c) => {
          let val = row[c.key];
          if (val == null) val = "";
          val = String(val).replace(/"/g, '""');
          return '"' + val + '"';
        })
        .join(",")
    );
    const csv = BOM + header + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "export.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Status label mapping (English key → Persian label).
   */
  orderStatusMap: {
    new: "جدید",
    preparing: "در حال آماده‌سازی",
    ready: "آماده",
    delivered: "تحویل شد",
    cancelled: "لغو شد",
  },

  /**
   * Get Persian label for order status.
   */
  getStatusLabel(status) {
    return this.orderStatusMap[status] || status;
  },

  /**
   * Get status badge color class.
   */
  getStatusColor(status) {
    const colors = {
      new: "#e8c547",
      preparing: "#4a90d9",
      ready: "#28a745",
      delivered: "#6c757d",
      cancelled: "#dc3545",
    };
    return colors[status] || "#6c757d";
  },
};
