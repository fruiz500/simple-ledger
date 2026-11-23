/* Simple Ledger - money.js
   All amounts are integer cents. Never use floating point for money. */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const Money = {};

  Money.currency = '$';

  // Parse user or file text into cents. Returns null if not a valid amount.
  // Accepts: 1234.56  $1,234.56  -$12  $-12  (12.00)  12.345 (rounds)  .5
  Money.parse = function (s) {
    if (s == null) return null;
    if (typeof s === 'number') return isFinite(s) ? Math.round(s * 100) : null;
    s = String(s).trim();
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
    s = s.replace(/\s+/g, '');
    const sym = Money.currency;
    const takeSign = () => {
      if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
      else if (s.startsWith('+')) s = s.slice(1);
    };
    takeSign();
    if (sym && s.startsWith(sym)) s = s.slice(sym.length);
    else if (s.startsWith('$')) s = s.slice(1);
    takeSign();
    if (sym && s.endsWith(sym)) s = s.slice(0, -sym.length);
    if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
    s = s.replace(/,/g, '');
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
    const parts = s.split('.');
    const ip = parts[0] || '0';
    const fp = parts[1] || '';
    let c = Number(ip) * 100 + Number((fp + '00').slice(0, 2));
    if (fp.length > 2 && fp[2] >= '5') c += 1; // round half away from zero
    if (!Number.isSafeInteger(c)) return null;
    if (c === 0) return 0;
    return neg ? -c : c;
  };

  function digits(c) {
    const d = Math.floor(c / 100), r = c % 100;
    return d.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + String(r).padStart(2, '0');
  }

  // Display format: -$1,234.56
  Money.format = function (c, opts) {
    opts = opts || {};
    if (c == null || isNaN(c)) return '';
    if (c === 0 && opts.blankZero) return '';
    const sym = opts.symbol === false ? '' : Money.currency;
    return (c < 0 ? '-' : '') + sym + digits(Math.abs(c));
  };

  // Journal format (hledger): $-120.00
  Money.toJournal = function (c) {
    return Money.currency + (c < 0 ? '-' : '') + digits(Math.abs(c));
  };

  // Plain number for inputs: 1234.56 (no symbol, no commas)
  Money.toInput = function (c) {
    if (c == null) return '';
    const a = Math.abs(c);
    return (c < 0 ? '-' : '') + Math.floor(a / 100) + '.' + String(a % 100).padStart(2, '0');
  };

  Money.sum = function (arr) { return arr.reduce((s, x) => s + (x || 0), 0); };

  const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function w999(n) {
    let s = '';
    if (n >= 100) { s += ONES[Math.floor(n / 100)] + ' hundred'; n %= 100; if (n) s += ' '; }
    if (n >= 20) { s += TENS[Math.floor(n / 10)]; if (n % 10) s += '-' + ONES[n % 10]; }
    else if (n) s += ONES[n];
    return s;
  }
  // Check wording: "One thousand eight hundred and 00/100"
  Money.words = function (c) {
    c = Math.abs(c);
    let d = Math.floor(c / 100);
    const r = c % 100;
    const groups = [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
    const out = [];
    if (d === 0) out.push('zero');
    for (const [v, name] of groups) {
      if (d >= v) { out.push(w999(Math.floor(d / v)) + ' ' + name); d %= v; }
    }
    if (d) out.push(w999(d));
    const s = out.join(' ');
    return s.charAt(0).toUpperCase() + s.slice(1) + ' and ' + String(r).padStart(2, '0') + '/100';
  };

  SL.Money = Money;
  if (typeof module !== 'undefined') module.exports = Money;
})(typeof window !== 'undefined' ? window : globalThis);
