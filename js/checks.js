/* Simple Ledger - checks.js
   Check printing for pre-printed 8.5 x 11 stock with the check in the middle panel (stub above and below).
   Only the variable data is printed; your name, bank and routing numbers are already on the stock.
   Positions are in inches from the top-left of the page, plus global and per-field calibration offsets. */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const C = {};
  const Money = () => SL.Money;

  // ---- amount in words ----
  const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function below1000(n) {
    const out = [];
    if (n >= 100) { out.push(ONES[Math.floor(n / 100)] + ' hundred'); n %= 100; }
    if (n >= 20) { out.push(TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '')); }
    else if (n > 0) out.push(ONES[n]);
    return out.join(' ');
  }
  C.words = function (cents) {
    cents = Math.round(cents);
    let dollars = Math.floor(cents / 100); const c = cents % 100;
    let w = '';
    if (dollars === 0) w = 'zero';
    else {
      const parts = [];
      for (const [size, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) {
        if (dollars >= size) { parts.push(below1000(Math.floor(dollars / size)) + ' ' + name); dollars %= size; }
      }
      if (dollars > 0) parts.push(below1000(dollars));
      w = parts.join(' ');
    }
    return w.charAt(0).toUpperCase() + w.slice(1) + ' and ' + String(c).padStart(2, '0') + '/100';
  };

  // ---- layout ----
  C.FIELDS = [
    { id: 'date', label: 'Date', x: 6.55, y: 4.12, w: 1.6, size: 11 },
    { id: 'payee', label: 'Pay to', x: 1.0, y: 4.72, w: 4.9, size: 12 },
    { id: 'amount', label: 'Amount (numbers)', x: 6.55, y: 4.72, w: 1.6, size: 12, align: 'right' },
    { id: 'words', label: 'Amount (words)', x: 0.6, y: 5.12, w: 7.5, size: 11 },
    { id: 'memo', label: 'Memo', x: 0.9, y: 6.42, w: 3.6, size: 10 },
    { id: 'stub1', label: 'Top stub', x: 0.6, y: 0.55, w: 7.2, size: 10, stub: true },
    { id: 'stub2', label: 'Bottom stub', x: 0.6, y: 7.85, w: 7.2, size: 10, stub: true }
  ];
  C.defaults = () => ({ dx: 0, dy: 0, stubs: true, fields: {} });
  C.load = function () {
    try { const v = JSON.parse(root.localStorage.getItem('simpleLedger.checks') || '{}'); return Object.assign(C.defaults(), v, { fields: v.fields || {} }); }
    catch (e) { return C.defaults(); }
  };
  C.save = (cfg) => { try { root.localStorage.setItem('simpleLedger.checks', JSON.stringify(cfg)); } catch (e) { /* ignore */ } };
  C.position = function (cfg, f) {
    const o = cfg.fields[f.id] || {};
    return { x: f.x + (cfg.dx || 0) + (o.x || 0), y: f.y + (cfg.dy || 0) + (o.y || 0) };
  };

  // ---- data ----
  const isNum = (s) => /^\d+$/.test(String(s || '').trim());
  C.nextNumber = function (book, account) {
    let max = 0;
    for (const t of book.txns) {
      if (t.raw || !isNum(t.code)) continue;
      if (t.postings.some(p => p.account === account && p.amount < 0)) max = Math.max(max, parseInt(t.code, 10));
    }
    return String(max ? max + 1 : 1001);
  };

  // A check as printed data, from a recorded transaction
  C.fromTxn = function (book, t, account) {
    const bank = t.postings.find(p => p.account === account);
    if (!bank) return null;
    const lines = [];
    for (const p of t.postings) {
      if (p === bank) continue;
      let d = '';
      if (p.tags && p.tags.pays && SL.Biz) { const doc = SL.Biz.getDoc(book, p.tags.pays); d = doc ? 'Bill ' + (doc.number || doc.date) + (doc.date ? ' (' + doc.date + ')' : '') : 'Bill'; }
      else d = p.account.split(':').pop();
      lines.push(d + '  ' + Money().format(Math.abs(p.amount)));
    }
    return { id: t.id, number: t.code || '', date: t.date, payee: t.payee || '', amount: -bank.amount, memo: t.memo || '', lines, printed: t.tags && t.tags.printed || '', cleared: !!(bank.status === '*' || bank.status === 'R' || (bank.tags && bank.tags.rec)) };
  };

  C.recent = function (book, account, limit) {
    const out = [];
    for (const t of book.sortedTxns()) {
      if (t.raw) continue;
      const c = C.fromTxn(book, t, account);
      if (c && c.amount > 0 && isNum(t.code)) out.push(c);
    }
    return out.reverse().slice(0, limit || 60);
  };

  // Record a check written for something other than a bill
  C.writeOther = function (book, s) {
    if (!s.account) throw new Error('Choose the account this check is for.');
    if (!(s.amount > 0)) throw new Error('Enter the amount.');
    if (!s.payee || /[;|]/.test(s.payee)) throw new Error('Enter who the check is payable to (no ";" or "|").');
    const dup = book.txns.some(t => !t.raw && t.code === s.number && t.postings.some(p => p.account === s.bank));
    if (!s.number || dup) throw new Error(s.number ? 'Check number ' + s.number + ' is already used in this account.' : 'Enter a check number.');
    const t = book.blank();
    t.date = s.date; t.payee = s.payee; t.code = s.number; t.memo = s.memo || '';
    t.postings = [{ account: s.bank, amount: -s.amount, status: '', text: '', tags: {} }, { account: s.account, amount: s.amount, status: '', text: '', tags: {} }];
    return book.addTxn(t);
  };

  // layout: {id: {x, y, right}} in inches (x,y = top-left of where text starts, right = right end of the line, optional).
  // Returns per-field offsets relative to the built-in defaults.
  C.offsetsFrom = function (layout) {
    const out = {};
    for (const f of C.FIELDS) {
      const L = layout[f.id];
      if (!L || !isFinite(L.x) || !isFinite(L.y)) continue;
      let x = L.x;
      if (f.align === 'right' && isFinite(L.right)) x = L.right - f.w;
      out[f.id] = { x: Math.round((x - f.x) * 100) / 100, y: Math.round((L.y - f.y) * 100) / 100 };
    }
    return out;
  };

  C.sample = () => ({ id: 'sample', number: '1001', date: '2026-01-15', payee: 'Sample Supplier Co.', amount: 123456, memo: 'Sample memo', lines: ['Bill 1234 (2026-01-02)  $1,000.00', 'Bill 1250 (2026-01-05)  $234.56'], printed: '' });

  if (typeof module !== 'undefined') module.exports = C;
  SL.Checks = C;
})(typeof window !== 'undefined' ? window : globalThis);
