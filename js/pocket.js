/* Simple Ledger - pocket.js
   Link with the Simple Ledger Pocket phone app.
   - Setup file (JSON) per person: the categories and money accounts that person may use.
   - Entries file (CSV) from the phone: one row per entry, each with a unique pocket_id.
     Imported transactions carry the tag pocket:<id>, so the same file can be imported twice safely.
   Which accounts each person may use is stored in the book as  ; sb:biz pocket:"<json>".
   Pure logic (no DOM), testable in Node. */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const Money = SL.Money || (typeof require !== 'undefined' ? require('./money.js') : null);
  const P = {};
  const B = () => SL.Biz;

  P.HEADER = ['pocket_id', 'date', 'person', 'kind', 'amount', 'category', 'account', 'payee', 'note', 'orig_amount', 'orig_currency', 'rate'];
  // Home currency code (needed so the phone can convert). Guessed from the symbol when not set.
  const SYMBOL_CODE = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW', 'C$': 'CAD', 'A$': 'AUD', 'R$': 'BRL', 'Fr': 'CHF', 'CHF': 'CHF' };
  P.homeCode = (book) => String((book.settings.biz || {}).ccy ? B().dec(book.settings.biz.ccy) : (SYMBOL_CODE[book.settings.currency] || '')).toUpperCase();
  P.setHomeCode = (book, code) => B().setCfg(book, { ccy: String(code || '').toUpperCase() });
  P.APP = 'simple-ledger-pocket';

  const byName = (a, b) => a.localeCompare(b);
  const validDate = (d) => { const t = Date.parse(d + 'T00:00:00Z'); return !isNaN(t) && new Date(t).toISOString().slice(0, 10) === d; };
  const leaves = (book, types) => [...book.accounts.values()]
    .filter(a => !a.hidden && types.includes(a.type) && book.isLeaf(a.name) && a.name !== 'Assets:Checks Not Yet Deposited')
    .map(a => a.name).sort(byName);

  // ---------- per-person choices stored in the book ----------
  P.config = function (book) {
    const raw = (book.settings.biz || {}).pocket;
    if (!raw) return {};
    try { return JSON.parse(B().dec(raw)) || {}; } catch (e) { return {}; }
  };
  P.saveConfig = function (book, person, c) {
    const all = P.config(book);
    if (c) all[person] = { spend: c.spend.slice().sort(byName), earn: c.earn.slice().sort(byName), money: c.money.slice().sort(byName) };
    else delete all[person];
    B().setCfg(book, { pocket: Object.keys(all).length ? JSON.stringify(all) : '' });
  };
  // Choices for one person, filled with sensible defaults; accounts that no longer exist are dropped
  P.choicesFor = function (book, person) {
    const saved = P.config(book)[person];
    const spendAll = leaves(book, ['Expense']), earnAll = leaves(book, ['Revenue']), moneyAll = leaves(book, ['Asset', 'Liability']);
    const keep = (list, all) => (list || []).filter(n => all.includes(n));
    if (saved) return { spend: keep(saved.spend, spendAll), earn: keep(saved.earn, earnAll), money: keep(saved.money, moneyAll), saved: true };
    const cash = moneyAll.filter(n => /cash/i.test(n));
    return { spend: spendAll, earn: earnAll, money: cash, saved: false };
  };
  P.allChoices = (book) => ({ spend: leaves(book, ['Expense']), earn: leaves(book, ['Revenue']), money: leaves(book, ['Asset', 'Liability']) });

  P.setupFile = function (book, person, today) {
    const c = P.choicesFor(book, person);
    if (!c.money.length) throw new Error('Choose at least one account ' + person + ' pays from (cash, a card...).');
    if (!c.spend.length && !c.earn.length) throw new Error('Choose at least one category for ' + person + '.');
    return {
      app: P.APP, version: 2, book: book.settings.name, person, currency: book.settings.currency || '$', homeCode: P.homeCode(book),
      spend: c.spend, earn: c.earn, money: c.money, made: today
    };
  };
  P.setupFileName = (book, person) => (book.settings.name + ' - ' + person).replace(/[\\/:*?"<>|]+/g, '-') + '.pocket.json';

  // ---------- entries file ----------
  P.isPocketCSV = (text) => /^﻿?pocket_id,/.test(text || '');

  P.parse = function (text) {
    const rows = SL.Import.parseCSV(String(text).replace(/^﻿/, ''));
    if (!rows.length) return [];
    const head = rows[0].map(x => x.trim().toLowerCase());
    const col = (k) => head.indexOf(k);
    if (col('pocket_id') < 0) throw new Error('This is not a Simple Ledger Pocket file.');
    const out = [];
    for (const r of rows.slice(1)) {
      if (!r.some(x => x && x.trim())) continue;
      const g = (k) => (col(k) >= 0 && r[col(k)] != null ? String(r[col(k)]).trim() : '');
      out.push({ id: g('pocket_id'), date: g('date'), person: g('person'), kind: g('kind').toLowerCase(), amountText: g('amount'),
        category: g('category'), account: g('account'), payee: g('payee'), note: g('note'),
        origText: g('orig_amount'), origCur: g('orig_currency').toUpperCase(), rate: g('rate') });
    }
    return out;
  };

  // Decide what to do with each row. map: { 'name in file': 'account in book' } for names the book lacks.
  // status: new | imported | maybe-dup | bad | locked
  P.plan = function (book, rows, map) {
    map = map || {};
    const have = new Set();
    for (const t of book.txns) if (!t.raw && t.tags && t.tags.pocket) have.add(t.tags.pocket);
    const fix = (n) => map[n] || n;
    const seen = new Set();
    const unknown = new Set();
    const out = rows.map(r => {
      const it = { row: r, status: 'new', include: true, note: '', amount: null };
      const amt = Money.parse(r.amountText);
      const cat = fix(r.category), acc = fix(r.account);
      const leafOk = (n) => book.accounts.has(n) && book.isLeaf(n);
      if (!r.id) { it.status = 'bad'; it.note = 'Missing pocket_id'; }
      else if (have.has(r.id) || seen.has(r.id)) { it.status = 'imported'; it.note = 'Already imported'; }
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !validDate(r.date)) { it.status = 'bad'; it.note = 'Bad date "' + r.date + '"'; }
      else if (amt == null || amt <= 0) { it.status = 'bad'; it.note = 'Bad amount "' + r.amountText + '"'; }
      else if (r.kind !== 'spent' && r.kind !== 'received') { it.status = 'bad'; it.note = 'Kind must be spent or received'; }
      else {
        if (!leafOk(cat)) unknown.add(r.category);
        if (!leafOk(acc)) unknown.add(r.account);
        if (!leafOk(cat) || !leafOk(acc)) { it.status = 'bad'; it.note = 'Choose an account for ' + [cat, acc].filter(n => !leafOk(n)).map(n => '"' + n + '"').join(' and '); }
        else if (book.settings.lockDate && r.date <= book.settings.lockDate) { it.status = 'locked'; it.note = 'Books are locked through ' + book.settings.lockDate; }
      }
      if (r.id) seen.add(r.id);
      if (it.status === 'new') {
        it.amount = amt;
        const signed = r.kind === 'spent' ? -amt : amt; // effect on the money account
        const tol = r.origCur ? Math.round(amt * 0.05) : 0; // foreign: the card company's rate and fees differ a little
        const dup = book.txns.find(t => !t.raw && !(t.tags && t.tags.pocket) && Math.abs(B().daysBetween(t.date, r.date)) <= 3 &&
          t.postings.some(p => p.account === acc && Math.abs(p.amount - signed) <= tol));
        if (dup) { it.status = 'maybe-dup'; it.include = false; it.note = 'Looks already entered: ' + dup.date + ' ' + (dup.payee || '') + '. Tick to add anyway.'; }
      }
      if (it.status !== 'new' && it.status !== 'maybe-dup') it.include = false;
      return it;
    });
    return { items: out, unknown: [...unknown].sort(byName) };
  };

  P.txnFor = function (book, it, map) {
    const r = it.row, fix = (n) => (map && map[n]) || n;
    const cat = fix(r.category), acc = fix(r.account), amt = it.amount;
    const t = book.blank();
    t.date = r.date;
    t.payee = r.payee || '';
    const foreign = r.origCur && r.origText ? r.origCur + ' ' + r.origText + (r.rate ? ' at ' + r.rate : '') : '';
    t.memo = [r.note || '', foreign ? '(' + foreign + ')' : ''].filter(Boolean).join(' ');
    t.tags = { pocket: r.id };
    if (r.person) t.tags.for = B().enc(r.person);
    if (r.origCur) t.tags.fx = r.origCur;
    const L = (account, amount) => ({ account, amount, status: '', text: '', tags: {} });
    t.postings = r.kind === 'spent' ? [L(cat, amt), L(acc, -amt)] : [L(acc, amt), L(cat, -amt)];
    return t;
  };

  P.apply = function (book, plan, map, fileName) {
    const list = plan.items.filter(it => it.include && (it.status === 'new' || it.status === 'maybe-dup')).map(it => P.txnFor(book, it, map));
    if (!list.length) return { added: 0, errors: [] };
    const people = [...new Set(list.map(t => t.tags.for ? B().dec(t.tags.for) : '').filter(Boolean))];
    const errors = book.importTxns(list, 'pocket ' + (fileName || '') + (people.length ? ' (' + people.join(', ') + ')' : '') + ' ' + list.length + ' entries');
    return { added: list.length - errors.length, errors };
  };

  SL.Pocket = P;
  if (typeof module !== 'undefined') module.exports = P;
})(typeof window !== 'undefined' ? window : globalThis);
