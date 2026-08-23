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
   * ── Time helpers: exact Iran (Tehran) time, immune to wrong local clocks ──
   * Calendar: Jalali (Persian) · Zone: Asia/Tehran (fixed UTC+03:30, no DST)
   */
  TZ_IRAN: "Asia/Tehran",
  _clockOffsetMs: 0,

  /**
   * Set milliseconds added to local clock so times match the Supabase
   * server clock. Called automatically by SupaDB.init().
   */
  setClockOffset(ms) {
    this._clockOffsetMs = Number(ms) || 0;
  },

  /**
   * Corrected "now" — safe against wrong device clocks.
   */
  now() {
    return new Date(Date.now() + this._clockOffsetMs);
  },

  /**
   * Core formatter: Jalali calendar, Iran timezone, Persian digits.
   */
  _fmtIran(date, opts) {
    try {
      const d = typeof date === "string" ? new Date(date) : date;
      if (!d || isNaN(d)) return "—";
      return new Intl.DateTimeFormat(
        "fa-IR-u-ca-persian",
        Object.assign({ timeZone: this.TZ_IRAN }, opts)
      ).format(d);
    } catch {
      return date ? String(date) : "—";
    }
  },

  /**
   * Instant of midnight (00:00) in Tehran for a given instant.
   */
  startOfTehranDay(date) {
    let d = date instanceof Date ? date : date ? new Date(date) : this.now();
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: this.TZ_IRAN,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    return new Date(ymd + "T00:00:00+03:30");
  },

  /**
   * First instant (Tehran midnight) of a Jalali year/month/day.
   * Walks the calendar with Intl so leap years are handled correctly.
   */
  jalaliToUtc(jy, jm, jd) {
    // Estimate: Nowruz (~Farvardin 1) falls around March 20-21 Gregorian.
    const estimate = Date.UTC(jy + 621, 2, 20);
    for (let i = -10; i < 400; i++) {
      const probe = new Date(estimate + i * 86400000 + 43200000); // midday UTC
      const parts = new Intl.DateTimeFormat("en-u-ca-persian", {
        timeZone: "Asia/Tehran",
        year: "numeric",
        month: "numeric",
        day: "numeric",
      }).formatToParts(probe);
      const get = (t) => Number(parts.find((p) => p.type === t).value);
      if (get("year") === jy && get("month") === jm && get("day") === jd) {
        return this.startOfTehranDay(probe);
      }
    }
    return null;
  },

  /**
   * Long-form Jalali date (e.g. «۱ شهریور ۱۴۰۴») in Iran time.
   */
  toPersianDate(date) {
    return this._fmtIran(date || this.now(), {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  },

  /**
   * Persian relative time, based on the corrected server clock.
   */
  timeAgo(date) {
    const d = typeof date === "string" ? new Date(date) : date;
    if (!d || isNaN(d)) return "—";
    const seconds = Math.floor((this.now() - d) / 1000);
    if (seconds < 60) return "لحظاتی پیش";
    if (seconds < 3600) return this.toPersianNum(Math.floor(seconds / 60)) + " دقیقه پیش";
    if (seconds < 86400) return this.toPersianNum(Math.floor(seconds / 3600)) + " ساعت پیش";
    return this.toPersianNum(Math.floor(seconds / 86400)) + " روز پیش";
  },

  /**
   * Full Jalali datetime in exact Iran time: «۱۴۰۴/۰۶/۰۱، ۱۸:۳۰».
   */
  formatDate(dateStr) {
    if (!dateStr) return "—";
    return this._fmtIran(dateStr, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  },

  /**
   * Short Jalali date (no time) in Iran time.
   */
  formatDateShort(dateStr) {
    if (!dateStr) return "—";
    return this._fmtIran(dateStr, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  },

  /**
   * Time only (HH:MM) in Iran time.
   */
  formatTime(dateStr) {
    if (!dateStr) return "—";
    return this._fmtIran(dateStr, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  },

  /**
   * Get start of day/week/month for period filtering.
   */
  getPeriodStart(period, referenceDate) {
    const now = referenceDate ? new Date(referenceDate) : this.now();
    switch (period) {
      case "today":
        return this.startOfTehranDay(now).toISOString();
      case "yesterday": {
        const start = this.startOfTehranDay(now);
        start.setUTCSeconds(start.getUTCSeconds() - 86400);
        const end = new Date(start.getTime() + 86400000 - 1);
        return { from: start.toISOString(), to: end.toISOString() };
      }
      case "7days":
      case "30days": {
        const days = period === "7days" ? 7 : 30;
        const start = this.startOfTehranDay(now);
        start.setUTCSeconds(start.getUTCSeconds() - days * 86400);
        return start.toISOString();
      }
      case "month": {
        const ym = new Intl.DateTimeFormat("en-CA", {
          timeZone: this.TZ_IRAN,
          year: "numeric",
          month: "2-digit",
        }).format(now);
        return new Date(ym + "-01T00:00:00+03:30").toISOString();
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
