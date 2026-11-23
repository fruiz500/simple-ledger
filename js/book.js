/* Simple Ledger - book.js
   In-memory model of one book (one journal file) and its rules. */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const Money = SL.Money || (typeof require !== 'undefined' ? require('./money.js') : null);
  const J = SL.Journal || (typeof require !== 'undefined' ? require('./journal.js') : null);

  const TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  const TOP_TYPES = {
    assets: 'Asset', asset: 'Asset',
    liabilities: 'Liability', liability: 'Liability',
    equity: 'Equity', 'net assets': 'Equity',
    income: 'Revenue', revenue: 'Revenue', revenues: 'Revenue',
    expenses: 'Expense', expense: 'Expense'
  };
  const TYPE_ALIASES = { A: 'Asset', L: 'Liability', E: 'Equity', R: 'Revenue', X: 'Expense',
    Cash: 'Asset', Income: 'Revenue', Revenue: 'Revenue' };

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function nowStamp() {
    const d = new Date();
    return today() + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function parentOf(name) { const i = name.lastIndexOf(':'); return i < 0 ? '' : name.slice(0, i); }
  function leafOf(name) { const i = name.lastIndexOf(':'); return i < 0 ? name : name.slice(i + 1); }

  class Book {
    constructor() {
      this.settings = { name: 'Untitled book', template: '', fyStart: 1, currency: '$', lockDate: '', advanced: false, checks: {}, biz: {} };
      this.rules = [];
      this.csvMaps = [];
      this.recons = [];
      this.sbOther = [];
      this.headerComments = [];
      this.commodities = [];
      this.accounts = new Map();   // name -> {name, type, hidden, text, tags, pre, extra}
      this.payees = new Map();     // name -> {name, text, tags, pre}
      this.raw = [];
      this.txns = [];
      this.trailing = [];
      this.log = [];
      this.warnings = [];
      this.dirty = false;
      this._listeners = [];
      this._bal = null;
      this._order = 0;
    }

    static fromText(text) {
      const b = new Book();
      // currency first, so amounts parse with the right symbol
      const cm = text.match(/^;\s*sb:book\s+(.*)$/m);
      if (cm) { const kv = J.parseKV(cm[1]); if (kv.currency) b.settings.currency = kv.currency; }
      Money.currency = b.settings.currency;
      const d = J.parse(text, b.settings.currency);
      for (const s of d.sb) {
        if (s.kind === 'book') {
          const kv = J.parseKV(s.rest);
          if (kv.name) b.settings.name = kv.name;
          if (kv.template) b.settings.template = kv.template;
          if (kv['fy-start']) b.settings.fyStart = Math.min(12, Math.max(1, parseInt(kv['fy-start'], 10) || 1));
          if (kv.currency) b.settings.currency = kv.currency;
        } else if (s.kind === 'lock') b.settings.lockDate = s.rest.trim();
        else if (s.kind === 'view') b.settings.advanced = J.parseKV(s.rest).advanced === 'yes';
        else if (s.kind === 'checks') b.settings.checks = J.parseKV(s.rest);
        else if (s.kind === 'biz') b.settings.biz = J.parseKV(s.rest);
        else if (s.kind === 'rule') b.rules.push(J.parseKV(s.rest));
        else if (s.kind === 'csvmap') b.csvMaps.push(J.parseKV(s.rest));
        else if (s.kind === 'recon') {
          const kv = J.parseKV(s.rest); const bal = Money.parse(kv.balance);
          if (kv.account && kv.date && bal != null) b.recons.push({ account: kv.account, date: kv.date, balance: bal });
        }
        else if (s.kind === 'log') b.log.push(s.rest);
        else b.sbOther.push(s);
      }
      b.headerComments = d.headerComments;
      b.commodities = d.commodities;
      b.raw = d.raw;
      b.trailing = d.trailing;
      b.warnings = d.warnings;
      for (const a of d.accounts) {
        const tags = Object.assign({}, a.tags);
        let type = tags.type ? (TYPES.includes(tags.type) ? tags.type : TYPE_ALIASES[tags.type]) : null;
        delete tags.type;
        const hidden = tags.hidden === 'yes';
        delete tags.hidden;
        b.accounts.set(a.name, { name: a.name, type: type || null, hidden, text: a.text, tags, pre: a.pre, extra: a.extra });
      }
      for (const p of d.payees) b.payees.set(p.name, p);
      const ids = new Set();
      for (const t of d.txns) {
        if (!t.raw) {
          if (!t.tags.id || ids.has(t.tags.id)) t.tags.id = b.newId(ids);
          ids.add(t.tags.id);
          for (const p of t.postings) b.ensureAccount(p.account);
        } else t.tags = { id: b.newId(ids) };
        t.id = t.tags.id;
        ids.add(t.id);
        b.txns.push(t);
      }
      for (const n of [...b.accounts.keys()]) { const pp = parentOf(n); if (pp) b.ensureAccount(pp, null, true); }
      b._order = d.txns.length + d.raw.length + 1;
      for (const a of b.accounts.values()) if (!a.type) a.type = b.inferType(a.name);
      b.dirty = false;
      return b;
    }

    toText() { return J.serialize(this); }

    // ---- change tracking ----
    onChange(fn) { this._listeners.push(fn); }
    changed(what) {
      this._bal = null;
      this.dirty = true;
      for (const fn of this._listeners) { try { fn(what); } catch (e) { console.error(e); } }
    }
    addLog(action, id, detail) {
      this.log.push(nowStamp() + ' ' + action + ' ' + (id || '-') + (detail ? ' ' + detail.replace(/\n/g, ' ') : ''));
    }

    newId(taken) {
      const used = taken || new Set(this.txns.map(t => t.id));
      let id;
      do { id = 't' + Math.random().toString(36).slice(2, 7); } while (used.has(id));
      return id;
    }

    // ---- accounts ----
    inferType(name) {
      const top = name.split(':')[0];
      const declared = this.accounts.get(top);
      if (declared && declared.type && declared.name !== name) return declared.type;
      const p = parentOf(name);
      if (p && this.accounts.get(p) && this.accounts.get(p).type) return this.accounts.get(p).type;
      return TOP_TYPES[top.toLowerCase()] || 'Asset';
    }
    validAccountName(name) {
      if (!name || name !== name.trim()) return 'Account names cannot start or end with spaces.';
      if (/[;\t]/.test(name) || /\s{2,}/.test(name)) return 'Account names cannot contain ";", tabs, or double spaces.';
      if (name.split(':').some(s => !s.trim())) return 'Each part between colons needs a name.';
      if (/^[(\[]/.test(name)) return 'Account names cannot start with "(" or "[".';
      return '';
    }
    ensureAccount(name, type, implied) {
      if (this.accounts.has(name)) return this.accounts.get(name);
      const p = parentOf(name);
      if (p) this.ensureAccount(p, type, true);
      const a = { name, type: type || this.inferType(name), hidden: false, text: '', tags: {}, pre: [], extra: [], implied: !!implied };
      this.accounts.set(name, a);
      return a;
    }
    addAccount(name, type) {
      const err = this.validAccountName(name);
      if (err) throw new Error(err);
      if (this.accounts.has(name)) throw new Error('That account already exists.');
      const a = this.ensureAccount(name, type);
      a.implied = false;
      if (type) a.type = type;
      this.addLog('add-account', '-', name);
      this.changed('accounts');
      return a;
    }
    renameAccount(oldName, newName) {
      const err = this.validAccountName(newName);
      if (err) throw new Error(err);
      if (oldName === newName) return;
      if (this.accounts.has(newName)) throw new Error('An account with that name already exists.');
      if (newName.startsWith(oldName + ':')) throw new Error('An account cannot be moved inside itself.');
      const map = n => n === oldName ? newName : (n.startsWith(oldName + ':') ? newName + n.slice(oldName.length) : n);
      const next = new Map();
      for (const [n, a] of this.accounts) { const nn = map(n); a.name = nn; next.set(nn, a); }
      this.accounts = next;
      for (const t of this.txns) if (!t.raw) for (const p of t.postings) p.account = map(p.account);
      for (const p of this.payees.values()) if (p.tags.account) p.tags.account = map(p.tags.account);
      for (const r of this.rules) if (r.account) r.account = map(r.account);
      for (const r of this.recons) r.account = map(r.account);
      for (const r of this.csvMaps) if (r.account) r.account = map(r.account);
      for (const a of [...this.accounts.keys()]) { const pp = parentOf(a); if (pp) this.ensureAccount(pp, null, true); }
      this.addLog('rename-account', '-', oldName + ' -> ' + newName);
      this.changed('accounts');
    }
    setHidden(name, hidden) {
      const a = this.accounts.get(name);
      if (!a) return;
      a.hidden = hidden;
      a.implied = false;
      this.changed('accounts');
    }
    setAccountType(name, type) {
      const a = this.accounts.get(name);
      if (!a || !TYPES.includes(type)) return;
      a.type = type;
      a.implied = false;
      this.changed('accounts');
    }
    accountUsed(name) {
      return this.txns.some(t => !t.raw && t.postings.some(p => p.account === name || p.account.startsWith(name + ':')));
    }
    deleteAccount(name) {
      if (this.accountUsed(name)) throw new Error('This account has transactions; hide it instead.');
      for (const n of [...this.accounts.keys()]) if (n === name || n.startsWith(name + ':')) this.accounts.delete(n);
      this.addLog('delete-account', '-', name);
      this.changed('accounts');
    }
    children(name) {
      const pre = name ? name + ':' : '';
      return [...this.accounts.keys()].filter(n => n.startsWith(pre) && n !== name && !n.slice(pre.length).includes(':')).sort((a, b) => a.localeCompare(b));
    }
    isLeaf(name) { return this.children(name).length === 0; }
    accountType(name) { const a = this.accounts.get(name); return a ? a.type : this.inferType(name); }
    // +1 for debit-normal accounts (Asset, Expense), -1 for credit-normal
    normalSign(name) { const t = this.accountType(name); return (t === 'Asset' || t === 'Expense') ? 1 : -1; }

    // ---- balances ----
    balances() {
      if (this._bal) return this._bal;
      const bal = new Map();
      for (const t of this.txns) {
        if (t.raw) continue;
        for (const p of t.postings) {
          let n = p.account;
          while (n) { bal.set(n, (bal.get(n) || 0) + p.amount); n = parentOf(n); }
        }
      }
      this._bal = bal;
      return bal;
    }
    balance(name) { return this.balances().get(name) || 0; }
    // balance with the sign people expect (credit card owed = positive)
    displayBalance(name) { return this.balance(name) * this.normalSign(name); }
    totalByType(type, from, to) {
      let s = 0;
      for (const t of this.txns) {
        if (t.raw || (from && t.date < from) || (to && t.date > to)) continue;
        for (const p of t.postings) if (this.accountType(p.account) === type) s += p.amount;
      }
      return s;
    }

    // ---- transactions ----
    sortedTxns() {
      return this.txns.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.order - b.order));
    }
    getTxn(id) { return this.txns.find(t => t.id === id); }
    isLocked(t) { return !!(this.settings.lockDate && t.date <= this.settings.lockDate); }

    validateTxn(t) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || isNaN(Date.parse(t.date))) return 'Enter a valid date.';
      if (this.settings.lockDate && t.date <= this.settings.lockDate)
        return 'The books are locked through ' + this.settings.lockDate + '. Use a date after the lock.';
      if (!t.postings || t.postings.length < 2) return 'A transaction needs at least two accounts.';
      for (const p of t.postings) {
        if (!p.account) return 'Every line needs an account.';
        if (!this.accounts.has(p.account)) return 'Unknown account: ' + p.account;
        if (!Number.isSafeInteger(p.amount)) return 'Every line needs an amount.';
      }
      if (t.postings.every(p => p.amount === 0)) return 'Enter an amount.';
      const sum = Money.sum(t.postings.map(p => p.amount));
      if (sum !== 0) return 'The transaction is out of balance by ' + Money.format(sum) + '.';
      if (/[;|]/.test(t.payee || '')) return 'Payee cannot contain ";" or "|".';
      if (/;/.test(t.memo || '')) return 'Memo cannot contain ";".';
      if (/[;)]/.test(t.code || '')) return 'Number cannot contain ";" or ")".';
      return '';
    }

    blank() {
      return { id: '', date: today(), status: '', code: '', payee: '', memo: '', text: '', tags: {},
        extraComments: [], postings: [], raw: null, pre: [] };
    }

    addTxn(t) {
      const err = this.validateTxn(t);
      if (err) throw new Error(err);
      t.id = this.newId();
      t.tags = Object.assign({}, t.tags, { id: t.id });
      t.order = this._order++;
      t.pre = t.pre || [];
      t.extraComments = t.extraComments || [];
      this.txns.push(t);
      if (t.payee) this.rememberPayee(t.payee);
      this.addLog('add', t.id, t.date + ' ' + (t.payee || '') + ' ' + Money.format(this.txnSize(t)));
      this.changed('txns');
      return t;
    }

    updateTxn(id, t) {
      const old = this.getTxn(id);
      if (!old) throw new Error('Transaction not found.');
      if (old.raw) throw new Error('This entry uses journal features Simple Ledger does not edit. Change it in a text editor.');
      if (this.isLocked(old)) throw new Error('This transaction is in a locked period (through ' + this.settings.lockDate + ').');
      const err = this.validateTxn(t);
      if (err) throw new Error(err);
      // reconciled postings must keep account and amount
      for (const op of old.postings.filter(p => p.tags && p.tags.rec)) {
        const match = t.postings.find(p => p.account === op.account && p.amount === op.amount);
        if (!match) throw new Error('A reconciled line (' + op.account + ') cannot change. Undo its reconciliation first.');
        match.tags = Object.assign({}, match.tags, { rec: op.tags.rec });
        match.status = '*';
      }
      const before = this.describe(old);
      t.id = id;
      t.tags = Object.assign({}, t.tags, { id });
      t.order = old.order;
      t.pre = old.pre;
      t.extraComments = t.extraComments || old.extraComments || [];
      this.txns[this.txns.indexOf(old)] = t;
      if (t.payee) this.rememberPayee(t.payee);
      const after = this.describe(t);
      if (before !== after) this.addLog('edit', id, before + ' -> ' + after);
      this.changed('txns');
      return t;
    }

    // Move every line on account `from` to account `to` in the given transactions.
    // Skips locked periods, invoices and bills, reconciled lines, and lines that tie a payment or deposit to another entry.
    // Returns { moved, txns, skipped } and records one log line.
    reclassify(ids, from, to) {
      if (from === to) throw new Error('Choose a different account to move to.');
      const dest = this.accounts.get(to);
      if (!dest) throw new Error('Choose an existing account to move to.');
      if (!this.isLeaf(to)) throw new Error('"' + to + '" has sub-accounts. Choose one of them.');
      let moved = 0, txns = 0, skipped = 0;
      for (const id of ids) {
        const t = this.getTxn(id);
        if (!t || t.raw) { skipped++; continue; }
        const mine = t.postings.filter(p => p.account === from);
        if (!mine.length) continue;
        const bad = this.isLocked(t) || (t.tags && (t.tags.invoice != null || t.tags.bill != null))
          || mine.some(p => p.tags && (p.tags.rec || p.tags.pays != null || p.tags.dep != null));
        if (bad) { skipped++; continue; }
        for (const p of mine) { p.account = to; moved++; }
        txns++;
      }
      if (moved) { this.addLog('reclassify', '-', moved + ' line' + (moved === 1 ? '' : 's') + ' in ' + txns + ' transaction' + (txns === 1 ? '' : 's') + ': ' + from + ' -> ' + to); this.changed('txns'); }
      return { moved, txns, skipped };
    }

    // Bulk add for imports: one log line, one change event. Returns a list of rejected rows.
    importTxns(list, label) {
      const errs = [];
      const used = new Set(this.txns.map(t => t.id));
      for (const t of list) {
        const e = this.validateTxn(t);
        if (e) { errs.push(t.date + ' ' + (t.payee || '') + ': ' + e); continue; }
        t.id = this.newId(used); used.add(t.id);
        t.tags = Object.assign({}, t.tags, { id: t.id });
        t.order = this._order++; t.pre = []; t.extraComments = t.extraComments || [];
        this.txns.push(t);
        if (t.payee) this.rememberPayee(t.payee);
      }
      this.addLog('import', '-', label);
      this.changed('txns');
      return errs;
    }

    // Change tags only (used for acknowledgments); allowed even in a locked period because amounts never change.
    setTags(ids, patch, label) {
      let n = 0;
      for (const id of ids) {
        const t = this.getTxn(id);
        if (!t || t.raw) continue;
        for (const k of Object.keys(patch)) { if (patch[k] == null || patch[k] === '') delete t.tags[k]; else t.tags[k] = patch[k]; }
        n++;
      }
      if (n) { this.addLog(label || 'tag', '-', n + ' transaction' + (n === 1 ? '' : 's') + ' ' + JSON.stringify(patch)); this.changed('txns'); }
      return n;
    }

    deleteTxn(id) {
      const t = this.getTxn(id);
      if (!t) return;
      if (this.isLocked(t)) throw new Error('This transaction is in a locked period (through ' + this.settings.lockDate + ').');
      if (!t.raw && t.postings.some(p => p.tags && p.tags.rec)) throw new Error('This transaction is reconciled. Undo the reconciliation first.');
      this.txns.splice(this.txns.indexOf(t), 1);
      this.addLog('delete', id, this.describe(t));
      this.changed('txns');
    }

    setPostingStatus(id, account, status) {
      const t = this.getTxn(id);
      if (!t || t.raw) return;
      if (this.isLocked(t)) throw new Error('This transaction is in a locked period.');
      for (const p of t.postings) {
        if (p.account !== account) continue;
        if (p.tags && p.tags.rec) throw new Error('Reconciled; undo the reconciliation to change it.');
        p.status = status;
      }
      this.changed('txns');
    }

    txnSize(t) { return Money.sum(t.postings.filter(p => p.amount > 0).map(p => p.amount)); }
    describe(t) {
      if (t.raw) return t.date + ' (raw)';
      return t.date + ' ' + (t.payee || '') + ' ' + t.postings.map(p => p.account + ' ' + Money.format(p.amount)).join(' / ');
    }

    // ---- payees ----
    rememberPayee(name) {
      if (!name || this.payees.has(name)) return;
      this.payees.set(name, { name, text: '', tags: {}, pre: [] });
    }
    payeeNames() {
      const s = new Set(this.payees.keys());
      for (const t of this.txns) if (t.payee) s.add(t.payee);
      return [...s].sort((a, b) => a.localeCompare(b));
    }
    lastFor(payee, account) {
      const list = this.sortedTxns();
      for (let i = list.length - 1; i >= 0; i--) {
        const t = list[i];
        if (t.raw || t.payee !== payee) continue;
        if (account && !t.postings.some(p => p.account === account)) continue;
        return t;
      }
      return null;
    }

    // ---- register for one account (includes subaccounts) ----
    register(name) {
      const rows = [];
      let run = 0;
      const sign = this.normalSign(name);
      const inAcct = a => a === name || a.startsWith(name + ':');
      for (const t of this.sortedTxns()) {
        if (t.raw) continue;
        const mine = t.postings.filter(p => inAcct(p.account));
        if (!mine.length) continue;
        const others = t.postings.filter(p => !inAcct(p.account));
        const amt = Money.sum(mine.map(p => p.amount));
        run += amt;
        const statuses = mine.map(p => (p.tags && p.tags.rec) ? 'R' : (p.status || ''));
        rows.push({
          txn: t, amount: amt, display: amt * sign, balance: run * sign,
          transfer: others.length === 1 ? others[0].account : (others.length === 0 ? '(within account)' : 'Split (' + t.postings.length + ' lines)'),
          simple: mine.length === 1 && others.length === 1,
          status: statuses.every(s => s === statuses[0]) ? statuses[0] : '!',
          locked: this.isLocked(t)
        });
      }
      return rows;
    }
  }

  Book.TYPES = TYPES;
  Book.today = today;
  Book.parentOf = parentOf;
  Book.leafOf = leafOf;
  SL.Book = Book;
  if (typeof module !== 'undefined') module.exports = Book;
})(typeof window !== 'undefined' ? window : globalThis);
