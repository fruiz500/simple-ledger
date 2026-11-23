/* Simple Ledger - merge.js: bring in entries a helper typed into their own copy of the books.
   Add-only: entries that are new go in; nothing already in this book is ever changed or deleted.
   Each imported entry keeps the id it had in the helper's file as the tag from:<id>, so sending
   the same file again (or a later version of it) never adds anything twice. */
(function (root) {
  'use strict';
  const SL = root.SL;
  const M = {};
  const dayNum = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
  const MONEY = ['Asset', 'Liability'];

  M.looksLikeJournal = (name, text) => /\.(journal|hledger|ledger)$/i.test(name || '') ||
    /^\s*;\s*sb:/m.test(text || '') || /^\d{4}[-/]\d\d[-/]\d\d[^\n]*\n[ \t]+[A-Za-z][^\n]*  /m.test(text || '');

  const sig = (t) => t.date + '|' + (t.payee || '') + '|' + t.postings.map(p => p.account + '=' + p.amount).sort().join(',');

  // other: Book parsed from the helper's file. map: {helperAccount: mainAccount | '+'} ('+' = create it)
  M.plan = function (main, other, map) {
    map = map || {};
    const byId = new Map(), byFrom = new Map();
    for (const t of main.txns) {
      if (t.raw) continue;
      byId.set(t.id, t);
      if (t.tags.from) byFrom.set(t.tags.from, t);
    }
    const deleted = new Set();
    for (const l of main.log || []) { const x = String(l).split(' '); if (x[1] === 'delete' && x[2]) deleted.add(x[2]); }
    const unknown = new Set();
    for (const t of other.txns) if (!t.raw) for (const p of t.postings) if (!main.accounts.has(p.account)) unknown.add(p.account);
    const acct = (n) => main.accounts.has(n) ? n : (map[n] === '+' ? n : map[n] || null);
    const typeOf = (n) => main.accounts.has(n) ? main.accountType(n) : (map[n] && map[n] !== '+' ? main.accountType(map[n]) : other.accountType(n));
    const invoices = new Set(), bills = new Set();
    for (const t of main.txns) if (!t.raw) {
      if (t.tags.invoice != null) invoices.add(String(t.tags.invoice));
      if (t.tags.bill != null && t.tags.bill !== '-') bills.add(t.payee + '|' + t.tags.bill);
    }
    const lock = main.settings.lockDate;
    const pool = main.txns.filter(t => !t.raw && !t.tags.from);
    const used = new Set();
    const items = [];
    const list = other.txns.filter(t => !t.raw).slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    for (const t of list) {
      const it = { txn: t, status: 'new', include: true, note: '' };
      items.push(it);
      const have = byFrom.get(t.id) || (byId.has(t.id) && byId.get(t.id).date.slice(0, 4) === t.date.slice(0, 4) ? byId.get(t.id) : null);
      if (have) {
        it.status = 'have'; it.include = false;
        it.note = (sig(have) === sig(t) || sigMapped(t, acct) === sig(have))
          ? 'Already in this book' : 'Already in this book, but it differs here. Changes are not brought in; edit it here if needed.';
        continue;
      }
      if (deleted.has(t.id)) { it.status = 'have'; it.include = false; it.note = 'Deleted from this book earlier; not brought back'; continue; }
      if (lock && t.date <= lock) { it.status = 'locked'; it.include = false; it.note = 'Books are locked through ' + lock; continue; }
      const missing = [...new Set(t.postings.map(p => p.account).filter(a => !acct(a)))];
      if (missing.length) { it.status = 'bad'; it.include = false; it.note = 'Choose where ' + missing.join(', ') + ' goes (above)'; continue; }
      if (t.tags.invoice != null && invoices.has(String(t.tags.invoice))) { it.status = 'bad'; it.include = false; it.note = 'Invoice ' + t.tags.invoice + ' already exists here. Renumber it in the helper\'s file.'; continue; }
      if (t.tags.bill != null && t.tags.bill !== '-' && bills.has(t.payee + '|' + t.tags.bill)) { it.status = 'maybe-dup'; it.include = false; it.note = 'Bill ' + t.tags.bill + ' from ' + t.payee + ' already exists here'; continue; }
      // looks like something already typed here: same money account, same amount, within 3 days
      const money = t.postings.filter(p => MONEY.includes(typeOf(p.account)));
      const look = money.length ? money : t.postings;
      let dup = null;
      for (const e of pool) {
        if (used.has(e) || Math.abs(dayNum(e.date) - dayNum(t.date)) > 3) continue;
        if (look.every(p => e.postings.some(q => q.account === acct(p.account) && q.amount === p.amount))) { dup = e; break; }
      }
      if (dup) { used.add(dup); it.status = 'maybe-dup'; it.include = false; it.note = 'Looks like ' + dup.date + ' ' + (dup.payee || '') + ', already here'; }
    }
    // payments must point at an invoice or bill that is here or coming in
    const coming = new Set(items.filter(x => x.status === 'new').map(x => x.txn.id));
    for (const it of items) {
      if (it.status !== 'new') continue;
      const refs = it.txn.postings.map(p => p.tags && p.tags.pays).filter(Boolean);
      const lost = refs.filter(r => !byId.has(r) && !byFrom.has(r) && !coming.has(r));
      if (lost.length) { it.status = 'bad'; it.include = false; it.note = 'Pays an invoice or bill that is not in this book or in this file'; }
    }
    return { items, unknown: [...unknown].sort() };
  };

  function sigMapped(t, acct) {
    return t.date + '|' + (t.payee || '') + '|' + t.postings.map(p => acct(p.account) + '=' + p.amount).sort().join(',');
  }

  M.apply = function (main, other, plan, map, fileName) {
    map = map || {};
    const B = SL.Biz;
    const chosen = plan.items.filter(x => x.include && (x.status === 'new' || x.status === 'maybe-dup'));
    if (!chosen.length) return { added: 0, errors: [], accounts: 0, contacts: 0, people: 0 };
    // accounts to create
    let accounts = 0;
    for (const [n, v] of Object.entries(map)) {
      if (v === '+' && !main.accounts.has(n) && chosen.some(x => x.txn.postings.some(p => p.account === n))) { main.addAccount(n, other.accountType(n)); accounts++; }
    }
    const acct = (n) => main.accounts.has(n) ? n : map[n];
    const fromOf = new Map(main.txns.filter(t => !t.raw && t.tags.from).map(t => [t.tags.from, t.id]));
    const list = chosen.map(x => {
      const s = x.txn, t = main.blank();
      t.date = s.date; t.status = s.status || ''; t.code = s.code || ''; t.payee = s.payee || ''; t.memo = s.memo || '';
      t.tags = Object.assign({}, s.tags); delete t.tags.id; t.tags.from = s.id;
      t.postings = s.postings.map(p => {
        const tags = Object.assign({}, p.tags || {}); delete tags.rec;
        return { account: acct(p.account), amount: p.amount, status: p.status || '', text: '', tags };
      });
      return t;
    });
    const errors = main.importTxns(list, 'helper file ' + (fileName || '') + ' ' + list.length + ' entries');
    // payments made in the helper's file point at the helper's ids: point them at the ids here
    for (const t of list) if (t.id && main.getTxn(t.id)) fromOf.set(t.tags.from, t.id);
    for (const t of list) for (const p of t.postings) if (p.tags && p.tags.pays && fromOf.has(p.tags.pays)) p.tags.pays = fromOf.get(p.tags.pays);
    // contacts and people named on the new entries
    let contacts = 0, people = 0;
    const added = list.filter(t => main.getTxn(t.id));
    if (B) {
      for (const name of new Set(added.map(t => t.payee).filter(Boolean))) {
        const c = B.contact(other, name), here = B.contact(main, name);
        if (c && c.roles.length && !(here && here.roles.length)) { try { B.saveContact(main, c); contacts++; } catch (e) { /* keep going */ } }
      }
      const known = new Set(B.people(main).concat(B.formerPeople(main)));
      const names = new Set();
      for (const t of added) { if (t.tags.for) names.add(B.dec(t.tags.for)); for (const p of t.postings) if (p.tags && p.tags.for) names.add(B.dec(p.tags.for)); }
      const fresh = [...names].filter(n => n && !known.has(n));
      if (fresh.length) { B.savePeople(main, B.people(main).concat(fresh), B.formerPeople(main)); people = fresh.length; }
    }
    main.changed('txns');
    return { added: added.length, errors, accounts, contacts, people };
  };

  SL.Merge = M;
  if (typeof module !== 'undefined') module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
