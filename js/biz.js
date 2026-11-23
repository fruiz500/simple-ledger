/* Simple Ledger - biz.js
   Contacts, invoices and bills, payments, aging, cash-basis view, donations and acknowledgment letters.
   Pure logic on top of a Book (no DOM), so it can be tested in Node.

   How it is stored (all plain journal):
   - contact      : payee directive with tags role:customer+supplier+donor, email:, phone:, address:, terms:
   - invoice      : transaction tagged invoice:<number>, due:<date>; Accounts Receivable debit, income lines credit
   - bill         : transaction tagged bill:<ref>, due:<date>; Accounts Payable credit, expense lines debit
   - payment      : ordinary transaction; each Receivable/Payable line carries the posting tag pays:<id of the invoice or bill>
   - donation     : income transaction tagged gift:cash|noncash (+ goods:, goodsdesc:, noncash:, ack:<year>)
   Text values inside tags are escaped (%2C for commas, %3B for semicolons, %0A for line breaks). */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const Money = SL.Money || (typeof require !== 'undefined' ? require('./money.js') : null);
  const B = {};

  const enc = (s) => String(s == null ? '' : s).replace(/%/g, '%25').replace(/,/g, '%2C').replace(/;/g, '%3B').replace(/\r?\n/g, '%0A');
  const dec = (s) => String(s == null ? '' : s).replace(/%0A/g, '\n').replace(/%3B/g, ';').replace(/%2C/g, ',').replace(/%25/g, '%');
  B.enc = enc; B.dec = dec;

  const roundHalf = (x) => Math.sign(x) * Math.round(Math.abs(x));
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  B.addDays = addDays; B.daysBetween = daysBetween;

  // ---------- settings ----------
  const TEXT_KEYS = ['org', 'address', 'ein', 'phone', 'email', 'signer', 'title', 'footer', 'intro', 'closing', 'terms', 'ar', 'ap', 'people', 'formerpeople'];
  B.DEFAULT_INTRO = 'Thank you for your generous support of {org} in {year}. Below is a record of the contributions we received from you.';
  B.DEFAULT_CLOSING = '{org} is a tax-exempt organization (EIN {ein}). Please keep this letter for your tax records. If you have any questions about your gifts, please contact us.';

  B.cfg = function (book) {
    const raw = book.settings.biz || {};
    const c = {};
    for (const k of TEXT_KEYS) c[k] = dec(raw[k] || '');
    c.org = c.org || book.settings.name;
    c.terms = /^\d+$/.test(c.terms) ? c.terms : '30';
    c.ar = c.ar || 'Assets:Accounts Receivable';
    c.ap = c.ap || 'Liabilities:Accounts Payable';
    const tpl = book.settings.template;
    c.invoices = raw.invoices ? raw.invoices === 'yes' : (tpl === 'business' || tpl === 'nonprofit');
    c.donations = raw.donations ? raw.donations === 'yes' : tpl === 'nonprofit';
    // having documents always turns the feature on so nothing is hidden
    if (!c.invoices && book.txns.some(t => !t.raw && (t.tags.invoice != null || t.tags.bill != null))) c.invoices = true;
    if (!c.donations && book.txns.some(t => !t.raw && t.tags.gift)) c.donations = true;
    c.intro = c.intro || B.DEFAULT_INTRO;
    c.closing = c.closing || B.DEFAULT_CLOSING;
    return c;
  };

  // optional people (or classes) for tracking income and expenses per person
  const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  B.people = (book) => B.cfg(book).people.split(',').map(x => x.trim()).filter(Boolean).sort(byName);
  B.peopleOn = (book) => B.people(book).length > 0 || B.formerPeople(book).length > 0 || B.personUsage(book).size > 0;
  B.formerPeople = (book) => B.cfg(book).formerpeople.split(',').map(x => x.trim()).filter(Boolean).sort(byName);
  // every person named on any transaction or line, with how many transactions mention them
  B.personUsage = function (book) {
    const m = new Map();
    for (const t of book.txns) {
      if (t.raw) continue;
      const names = new Set();
      if (t.tags && t.tags.for) names.add(dec(t.tags.for));
      for (const p of t.postings) if (p.tags && p.tags.for) names.add(dec(p.tags.for));
      for (const n of names) m.set(n, (m.get(n) || 0) + 1);
    }
    return m;
  };
  B.savePeople = (book, active, former) => B.setCfg(book, { people: active.slice().sort(byName).join(','), formerpeople: former.slice().sort(byName).join(',') });
  // Rename a person everywhere (amounts never change, so this is allowed in locked periods; it is logged)
  B.renamePerson = function (book, from, to) {
    let n = 0;
    for (const t of book.txns) {
      if (t.raw) continue;
      let hit = false;
      if (t.tags && t.tags.for && dec(t.tags.for) === from) { t.tags.for = enc(to); hit = true; }
      for (const p of t.postings) if (p.tags && p.tags.for && dec(p.tags.for) === from) { p.tags.for = enc(to); hit = true; }
      if (hit) n++;
    }
    if (n) { book.addLog('rename-person', '-', from + ' -> ' + to + ' (' + n + ' transactions)'); book.changed('txns'); }
    return n;
  };
  B.personOf = (t, p) => dec((p && p.tags && p.tags.for) || (t.tags && t.tags.for) || '');

  B.setCfg = function (book, patch) {
    const raw = Object.assign({}, book.settings.biz || {});
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      if (typeof v === 'boolean') raw[k] = v ? 'yes' : 'no';
      else if (v === '' || v == null) delete raw[k];
      else raw[k] = enc(v);
    }
    // text left at the default is not stored
    if (raw.intro && dec(raw.intro) === B.DEFAULT_INTRO) delete raw.intro;
    if (raw.closing && dec(raw.closing) === B.DEFAULT_CLOSING) delete raw.closing;
    book.settings.biz = raw;
    book.changed('settings');
  };

  // ---------- contacts ----------
  B.ROLES = [['customer', 'Customer'], ['supplier', 'Supplier'], ['donor', 'Donor']];

  B.contact = function (book, name) {
    const p = book.payees.get(name);
    if (!p) return null;
    const tg = p.tags || {};
    return {
      name, roles: (tg.role || '').split('+').filter(Boolean), email: dec(tg.email), phone: dec(tg.phone),
      address: dec(tg.address), terms: /^\d+$/.test(tg.terms || '') ? tg.terms : ''
    };
  };
  B.contacts = function (book, role) {
    const out = [];
    for (const name of book.payees.keys()) {
      const c = B.contact(book, name);
      if (c.roles.length && (!role || c.roles.includes(role))) out.push(c);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  };
  B.payeeUsed = (book, name) => book.txns.some(t => !t.raw && t.payee === name);

  B.saveContact = function (book, c, oldName) {
    const name = (c.name || '').trim();
    if (!name) throw new Error('Enter a name.');
    if (/[;|]/.test(name)) throw new Error('A name cannot contain ";" or "|".');
    if (!c.roles || !c.roles.length) throw new Error('Choose at least one type (customer, supplier, or donor).');
    if (oldName && oldName !== name) {
      if (B.payeeUsed(book, oldName)) throw new Error('This name is used on transactions, so it cannot be changed here.');
      if (book.payees.has(name)) throw new Error('A contact with that name already exists.');
      book.payees.delete(oldName);
    }
    const p = book.payees.get(name) || { name, text: '', tags: {}, pre: [] };
    const tags = Object.assign({}, p.tags);
    tags.role = c.roles.join('+');
    for (const [k, v] of [['email', c.email], ['phone', c.phone], ['address', c.address]]) {
      if (v && String(v).trim()) tags[k] = enc(String(v).trim()); else delete tags[k];
    }
    if (c.terms && /^\d+$/.test(c.terms)) tags.terms = c.terms; else delete tags.terms;
    p.tags = tags;
    book.payees.set(name, p);
    book.addLog(oldName ? 'edit-contact' : 'add-contact', '-', name);
    book.changed('contacts');
    return p;
  };

  B.deleteContact = function (book, name) {
    if (B.payeeUsed(book, name)) throw new Error('This contact has transactions, so it cannot be deleted.');
    book.payees.delete(name);
    book.addLog('delete-contact', '-', name);
    book.changed('contacts');
  };

  // Make sure a name exists as a contact with (at least) this role. Does not change other tags.
  B.ensureContact = function (book, name, role) {
    const c = B.contact(book, name);
    if (c && c.roles.includes(role)) return;
    if (c && c.roles.length) { B.saveContact(book, Object.assign({}, c, { roles: c.roles.concat(role) }), name); return; }
    const p = book.payees.get(name) || { name, text: '', tags: {}, pre: [] };
    p.tags = Object.assign({}, p.tags, { role });
    book.payees.set(name, p);
    book.changed('contacts');
  };

  // ---------- control accounts ----------
  B.ctlName = (book, kind) => kind === 'invoice' ? B.cfg(book).ar : B.cfg(book).ap;
  B.ensureCtl = function (book, kind) {
    const name = B.ctlName(book, kind);
    if (!book.accounts.has(name)) book.addAccount(name, kind === 'invoice' ? 'Asset' : 'Liability');
    return name;
  };

  // ---------- invoices and bills ----------
  const docKind = (t) => (t.raw || !t.tags) ? null : (t.tags.invoice != null ? 'invoice' : (t.tags.bill != null ? 'bill' : null));
  B.docKind = docKind;

  function lineOf(p, kind) {
    const amount = kind === 'invoice' ? -p.amount : p.amount;
    const price = p.tags && p.tags.price != null ? Money.parse(p.tags.price) : null;
    const qty = p.tags && p.tags.qty != null && !isNaN(parseFloat(p.tags.qty)) ? parseFloat(p.tags.qty) : null;
    return { desc: dec((p.tags && p.tags.desc) || p.text || ''), account: p.account, amount,
      qty: qty != null && price != null ? qty : 1, price: qty != null && price != null ? price : amount };
  }

  // asOf (optional): only count payments up to that date, and only documents dated up to it
  B.docs = function (book, kind, asOf, todayStr) {
    const ctl = B.ctlName(book, kind);
    const paid = new Map();
    const pays = new Map();
    for (const t of book.txns) {
      if (t.raw) continue;
      for (const p of t.postings) {
        const id = p.tags && p.tags.pays;
        if (!id) continue;
        const v = kind === 'invoice' ? -p.amount : p.amount;
        if (!pays.has(id)) pays.set(id, []);
        pays.get(id).push({ t, amount: v });
        if (!asOf || t.date <= asOf) paid.set(id, (paid.get(id) || 0) + v);
      }
    }
    const tod = todayStr || today();
    const out = [];
    for (const t of book.txns) {
      if (docKind(t) !== kind) continue;
      if (asOf && t.date > asOf) continue;
      const ctlPs = t.postings.filter(p => p.account === ctl);
      const total = Money.sum(ctlPs.map(p => kind === 'invoice' ? p.amount : -p.amount));
      const pd = paid.get(t.id) || 0;
      const due = t.tags.due || t.date;
      const bal = total - pd;
      const status = bal <= 0 ? 'paid' : (due < tod ? 'overdue' : (pd > 0 ? 'partial' : 'open'));
      out.push({ id: t.id, txn: t, kind, number: kind === 'invoice' ? t.tags.invoice : (t.tags.bill === '-' ? '' : t.tags.bill),
        date: t.date, due, contact: t.payee, memo: dec(t.tags.notes), total, paid: pd, balance: bal, status,
        lines: t.postings.filter(p => p.account !== ctl).map(p => lineOf(p, kind)), payments: pays.get(t.id) || [] });
    }
    return out.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (a.number < b.number ? 1 : -1));
  };

  B.getDoc = function (book, id) {
    const t = book.getTxn(id);
    const k = t && docKind(t);
    return k ? B.docs(book, k).find(d => d.id === id) : null;
  };

  B.nextNumber = function (book) {
    let max = 1000;
    for (const t of book.txns) {
      if (docKind(t) !== 'invoice') continue;
      const m = String(t.tags.invoice).match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return String(max + 1);
  };

  B.lineAmount = (qty, price) => roundHalf(qty * price);

  /* spec: {kind, contact, date, due, number, memo, lines:[{desc, qty, price, amount, account}]}
     Lines may give amount directly (bills) or qty and price (invoices). */
  B.buildDoc = function (book, spec, existingId) {
    const kind = spec.kind;
    const name = (spec.contact || '').trim();
    if (!name) throw new Error('Choose a ' + (kind === 'invoice' ? 'customer' : 'supplier') + '.');
    if (/[;|]/.test(name)) throw new Error('A name cannot contain ";" or "|".');
    if (!spec.date) throw new Error('Enter a date.');
    const lines = [];
    for (const l of spec.lines) {
      const amount = l.amount != null ? l.amount : B.lineAmount(l.qty == null ? 1 : l.qty, l.price || 0);
      if (!l.desc && !amount && !l.account) continue;
      if (!amount) throw new Error('Every line needs an amount.');
      if (!l.account) throw new Error('Every line needs an account.');
      lines.push(Object.assign({}, l, { amount }));
    }
    if (!lines.length) throw new Error('Add at least one line.');
    const total = Money.sum(lines.map(l => l.amount));
    if (total <= 0) throw new Error('The total must be more than zero.');
    const due = spec.due || spec.date;
    if (due < spec.date) throw new Error('The due date is before the ' + (kind === 'invoice' ? 'invoice' : 'bill') + ' date.');
    const number = String(spec.number == null ? '' : spec.number).trim();
    if (kind === 'invoice' && !number) throw new Error('Enter an invoice number.');
    if (/[;,)]/.test(number)) throw new Error('The number cannot contain ";", "," or ")".');
    if (number) {
      const dup = book.txns.find(t => docKind(t) === kind && t.id !== existingId && (kind === 'invoice' ? t.tags.invoice : t.tags.bill) === number && (kind === 'invoice' || t.payee === name));
      if (dup) throw new Error((kind === 'invoice' ? 'Invoice ' : 'Bill ') + number + ' already exists' + (kind === 'bill' ? ' for this supplier.' : '.'));
    }
    const ctl = B.ctlName(book, kind);
    const sign = kind === 'invoice' ? 1 : -1;
    const t = book.blank();
    t.date = spec.date; t.payee = name; t.code = number;
    t.tags = { [kind]: kind === 'invoice' ? number : (number || '-'), due };
    if ((spec.memo || '').trim()) t.tags.notes = enc(spec.memo.trim());
    t.postings = [{ account: ctl, amount: sign * total, status: '', text: '', tags: {} }];
    for (const l of lines) {
      const tags = {};
      if (l.desc) tags.desc = enc(l.desc);
      if (kind === 'invoice' && l.qty != null && l.price != null && B.lineAmount(l.qty, l.price) === l.amount) {
        tags.qty = String(l.qty); tags.price = Money.toInput(l.price);
      }
      t.postings.push({ account: l.account, amount: -sign * l.amount, status: '', text: '', tags });
    }
    return { txn: t, total };
  };

  B.saveDoc = function (book, spec, existingId) {
    const old = existingId ? B.getDoc(book, existingId) : null;
    if (existingId && !old) throw new Error('Document not found.');
    B.ensureCtl(book, spec.kind);
    const { txn, total } = B.buildDoc(book, spec, existingId);
    if (old && total < old.paid) throw new Error('The new total (' + Money.format(total) + ') is less than the ' + Money.format(old.paid) + ' already paid. Change the payments first.');
    if (old && old.contact !== txn.payee && old.paid) throw new Error('This ' + spec.kind + ' has payments, so its ' + (spec.kind === 'invoice' ? 'customer' : 'supplier') + ' cannot change.');
    // validate before touching contacts
    const err = book.validateTxn(txn);
    if (err) throw new Error(err);
    B.ensureContact(book, txn.payee, spec.kind === 'invoice' ? 'customer' : 'supplier');
    return existingId ? book.updateTxn(existingId, txn) : book.addTxn(txn);
  };

  B.deleteDoc = function (book, id) {
    const d = B.getDoc(book, id);
    if (!d) return;
    if (d.payments.length) throw new Error('This ' + d.kind + ' has payments. Delete or change those first.');
    book.deleteTxn(id);
  };

  /* Payment: spec {kind, contact, date, account, ref, allocations:[{id, amount}]}
     Money account is debited for a customer payment and credited for a supplier payment. */
  B.pay = function (book, spec) {
    const kind = spec.kind;
    const ctl = B.ensureCtl(book, kind);
    if (!spec.account) throw new Error(kind === 'invoice' ? 'Choose the account the money goes into.' : 'Choose the account the money comes from.');
    if (spec.account === ctl) throw new Error('Choose a bank, cash, or card account.');
    const docs = B.docs(book, kind);
    const al = (spec.allocations || []).filter(a => a.amount);
    if (!al.length) throw new Error('Enter an amount for at least one ' + kind + '.');
    let total = 0;
    const nums = [];
    for (const a of al) {
      const d = docs.find(x => x.id === a.id);
      if (!d) throw new Error('A ' + kind + ' in this payment no longer exists.');
      if (!(a.amount > 0)) throw new Error('Payment amounts must be more than zero.');
      if (a.amount > d.balance) throw new Error((kind === 'invoice' ? 'Invoice ' : 'Bill ') + (d.number || d.date) + ' has only ' + Money.format(d.balance) + ' outstanding.');
      total += a.amount;
      nums.push(d.number || d.date);
    }
    const t = book.blank();
    t.date = spec.date; t.payee = spec.contact; t.code = (spec.ref || '').trim();
    t.memo = (kind === 'invoice' ? 'Payment of invoice ' : 'Payment of bill ') + nums.join(', ');
    const s = kind === 'invoice' ? 1 : -1;
    t.postings = [{ account: spec.account, amount: s * total, status: '', text: '', tags: {} }];
    for (const a of al) t.postings.push({ account: ctl, amount: -s * a.amount, status: '', text: '', tags: { pays: a.id } });
    return book.addTxn(t);
  };

  // ---------- aging ----------
  B.BUCKETS = ['Current', '1–30', '31–60', '61–90', 'Over 90'];
  const bucketOf = (days) => days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;

  B.aging = function (book, kind, asOf) {
    const docs = B.docs(book, kind, asOf, asOf).filter(d => d.balance !== 0);
    const T = (t, indent) => ({ t, indent: indent || 0 });
    const C = (c) => ({ c, drill: null });
    const who = kind === 'invoice' ? 'Customer' : 'Supplier';
    const byContact = new Map();
    for (const d of docs) { if (!byContact.has(d.contact)) byContact.set(d.contact, []); byContact.get(d.contact).push(d); }
    const rows = [];
    const grand = [0, 0, 0, 0, 0];
    for (const name of [...byContact.keys()].sort((a, b) => a.localeCompare(b))) {
      const list = byContact.get(name).sort((a, b) => a.due < b.due ? -1 : 1);
      const sub = [0, 0, 0, 0, 0];
      rows.push({ cls: 'head', cells: [T(name), T(''), T(''), T(''), T(''), T(''), T('')] });
      for (const d of list) {
        const k = bucketOf(daysBetween(d.due, asOf));
        sub[k] += d.balance; grand[k] += d.balance;
        rows.push({ cls: 'acct', cells: [T((kind === 'invoice' ? 'Invoice ' : 'Bill ') + (d.number || d.date) + ' · due ' + d.due, 1),
          ...sub.map((_, i) => i === k ? C(d.balance) : T('')), C(d.balance)] });
      }
      const Z = (v) => v ? C(v) : T('');
      rows.push({ cls: 'sub', cells: [T('Total ' + name, 0), ...sub.map(Z), C(Money.sum(sub))] });
    }
    rows.push({ cls: 'grand', cells: [T('Total'), ...grand.map(v => v ? C(v) : T('')), C(Money.sum(grand))] });
    return {
      title: kind === 'invoice' ? 'Customer Aging (Accounts Receivable)' : 'Supplier Aging (Accounts Payable)',
      subtitle: 'As of ' + asOf + ' · by days past the due date',
      columns: [{ label: who + ' / ' + (kind === 'invoice' ? 'invoice' : 'bill') }, ...B.BUCKETS.map(l => ({ label: l, num: true })), { label: 'Total', num: true }],
      rows, notes: docs.length ? [] : ['Nothing is outstanding.'], total: Money.sum(grand)
    };
  };

  // Money owed by (customers) or to (suppliers) right now
  B.outstanding = function (book, kind, todayStr) {
    const docs = B.docs(book, kind, null, todayStr);
    let total = 0, overdue = 0;
    for (const d of docs) { if (d.balance > 0) { total += d.balance; if (d.status === 'overdue') overdue += d.balance; } }
    return { total, overdue };
  };

  // ---------- cash basis ----------
  /* A view of the book for cash-basis reports. Invoices and bills are left out; when a payment is made, the
     Receivable/Payable line is replaced by the document's own lines in the paid proportion, so income and
     expenses appear when money moves. Everything else is unchanged. */
  B.cashView = function (book) {
    const ar = B.ctlName(book, 'invoice'), ap = B.ctlName(book, 'bill');
    const docs = new Map();
    for (const t of book.txns) {
      const k = docKind(t);
      if (!k) continue;
      const ctl = t.postings.filter(p => p.account === ar || p.account === ap);
      if (!ctl.length) continue;
      docs.set(t.id, { t, total: Money.sum(ctl.map(p => p.amount)), others: t.postings.filter(p => p.account !== ar && p.account !== ap), cum: 0, rec: null });
    }
    for (const d of docs.values()) d.rec = d.others.map(() => 0);
    const sorted = book.txns.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.order - b.order));
    const out = [];
    for (const t of sorted) {
      if (t.raw) { out.push(t); continue; }
      if (docs.has(t.id)) continue; // the invoice or bill itself waits for its payments
      if (!t.postings.some(p => p.tags && p.tags.pays && docs.has(p.tags.pays))) { out.push(t); continue; }
      const postings = [];
      for (const p of t.postings) {
        const d = p.tags && p.tags.pays ? docs.get(p.tags.pays) : null;
        if (!d) { postings.push(p); continue; }
        const newCum = d.cum - p.amount;           // paid so far, same sign as the document total
        const last = d.others.length - 1;
        const target = d.others.map((o, i) => i < last ? roundHalf(o.amount * newCum / d.total) : 0);
        target[last] = -newCum - Money.sum(target.slice(0, last));
        d.others.forEach((o, i) => {
          const share = target[i] - d.rec[i];
          if (share !== 0) postings.push({ account: o.account, amount: share, status: p.status, text: '', tags: {} });
        });
        d.rec = target; d.cum = newCum;
      }
      out.push(Object.assign({}, t, { postings }));
    }
    const v = Object.create(book);
    v.txns = out;
    v._bal = null;
    v.cashBasis = true;
    return v;
  };

  // ---------- donations ----------
  const giftTxns = (book, year) => book.txns.filter(t => !t.raw && t.tags.gift && (!year || t.date.slice(0, 4) === String(year)));

  B.gifts = function (book, year) {
    return giftTxns(book, year).map(t => {
      const amount = Money.sum(t.postings.filter(p => p.amount > 0).map(p => p.amount));
      const goods = t.tags.goods ? (Money.parse(t.tags.goods) || 0) : 0;
      return { id: t.id, txn: t, date: t.date, donor: t.payee, kind: t.tags.gift === 'noncash' ? 'noncash' : 'cash',
        amount, goods, goodsDesc: dec(t.tags.goodsdesc), noncash: dec(t.tags.noncash), ref: t.code, memo: t.memo,
        ack: t.tags.ack || '', deductible: amount - goods };
    }).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  };

  /* spec: {donor, date, amount, deposit, income, kind, ref, goods, goodsDesc, goodsIncome, noncash, memo} */
  B.buildGift = function (book, spec) {
    const donor = (spec.donor || '').trim();
    if (!donor) throw new Error('Enter the donor.');
    if (/[;|]/.test(donor)) throw new Error('A name cannot contain ";" or "|".');
    if (!spec.date) throw new Error('Enter a date.');
    if (!(spec.amount > 0)) throw new Error('Enter the amount of the gift.');
    const goods = spec.goods || 0;
    if (goods < 0 || goods >= spec.amount) throw new Error('The value of goods or services must be less than the gift.');
    if (!spec.deposit) throw new Error('Choose the account the gift went into.');
    if (!spec.income) throw new Error('Choose the income account.');
    if (goods && !spec.goodsIncome) throw new Error('Choose the income account for the goods or services part.');
    if (spec.kind === 'noncash' && !(spec.noncash || '').trim()) throw new Error('Describe the donated property.');
    const t = book.blank();
    t.date = spec.date; t.payee = donor; t.code = (spec.ref || '').trim(); t.memo = (spec.memo || '').trim();
    t.tags = { gift: spec.kind === 'noncash' ? 'noncash' : 'cash' };
    if (goods) { t.tags.goods = Money.toInput(goods); if ((spec.goodsDesc || '').trim()) t.tags.goodsdesc = enc(spec.goodsDesc.trim()); }
    if (spec.kind === 'noncash') t.tags.noncash = enc(spec.noncash.trim());
    t.postings = [
      { account: spec.deposit, amount: spec.amount, status: '', text: '', tags: {} },
      { account: spec.income, amount: -(spec.amount - goods), status: '', text: '', tags: {} }
    ];
    if (goods) t.postings.push({ account: spec.goodsIncome, amount: -goods, status: '', text: '', tags: {} });
    return t;
  };

  B.saveGift = function (book, spec, existingId) {
    const t = B.buildGift(book, spec);
    const err = book.validateTxn(t);
    if (err) throw new Error(err);
    B.ensureContact(book, t.payee, 'donor');
    return existingId ? book.updateTxn(existingId, t) : book.addTxn(t);
  };

  B.giftSpec = function (book, g) {
    const t = g.txn;
    const dep = t.postings.find(p => p.amount > 0);
    const credits = t.postings.filter(p => p.amount < 0);
    return { donor: g.donor, date: g.date, amount: g.amount, deposit: dep ? dep.account : '', income: credits[0] ? credits[0].account : '',
      kind: g.kind, ref: g.ref, goods: g.goods, goodsDesc: g.goodsDesc, goodsIncome: credits[1] ? credits[1].account : '',
      noncash: g.noncash, memo: g.memo };
  };

  // One letter per donor for a calendar year
  B.letters = function (book, year) {
    const by = new Map();
    for (const g of B.gifts(book, year)) { if (!by.has(g.donor)) by.set(g.donor, []); by.get(g.donor).push(g); }
    return [...by.keys()].sort((a, b) => a.localeCompare(b)).map(donor => {
      const gifts = by.get(donor);
      return { donor, contact: B.contact(book, donor) || { name: donor, roles: [], email: '', phone: '', address: '' }, gifts, year: String(year),
        total: Money.sum(gifts.map(g => g.amount)), deductible: Money.sum(gifts.map(g => g.deductible)),
        acked: gifts.every(g => g.ack === String(year)) };
    });
  };

  B.fill = function (text, vars) {
    let s = String(text).replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m);
    return s.replace(/\s*\(EIN\s*\)/g, '').replace(/ {2,}/g, ' ');
  };

  // Structured letter content for the screen and for printing
  B.letterContent = function (book, letter, dateStr) {
    const c = B.cfg(book);
    const cash = letter.gifts.filter(g => g.kind !== 'noncash');
    const totalCash = Money.sum(cash.map(g => g.amount));
    const vars = { org: c.org, year: letter.year, ein: c.ein, donor: letter.donor, total: Money.format(totalCash) };
    const statement = (g) => {
      const parts = [];
      if (g.kind === 'noncash') parts.push('Non-cash gift: ' + (g.noncash || 'donated property') + '. The value of donated property is determined by the donor.');
      if (g.goods > 0) parts.push('We provided goods or services in exchange for this gift' + (g.goodsDesc ? ': ' + g.goodsDesc : '') + '. Their estimated value is ' + Money.format(g.goods) + ', so the part of your gift that is a contribution is ' + Money.format(g.deductible) + '.');
      else parts.push('No goods or services were provided in exchange for this gift.');
      return parts.join(' ');
    };
    return {
      org: c.org, orgAddress: c.address, orgPhone: c.phone, orgEmail: c.email, ein: c.ein,
      date: dateStr || today(), donor: letter.donor, donorAddress: letter.contact.address,
      intro: B.fill(c.intro, vars), closing: B.fill(c.closing, vars),
      gifts: letter.gifts.map(g => ({ date: g.date, desc: (g.kind === 'noncash' ? 'Non-cash gift' : 'Cash gift') + (g.ref ? ' (' + g.ref + ')' : ''),
        amount: g.kind === 'noncash' ? null : g.amount, statement: statement(g) })),
      total: totalCash, hasCash: cash.length > 0, hasNoncash: cash.length < letter.gifts.length, signer: c.signer, title: c.title, year: letter.year
    };
  };

  B.giftsCSV = function (book, year) {
    const q = (s) => /[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);
    const lines = [['Donor', 'Address', 'Email', 'Gifts', 'Total', 'Goods or services', 'Contribution', 'Acknowledged'].map(q).join(',')];
    for (const l of B.letters(book, year)) {
      lines.push([l.donor, l.contact.address.replace(/\n/g, ', '), l.contact.email, l.gifts.length, Money.toInput(l.total),
        Money.toInput(Money.sum(l.gifts.map(g => g.goods))), Money.toInput(l.deductible), l.acked ? 'yes' : 'no'].map(q).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  };

  B.markAcked = function (book, ids, year) {
    return book.setTags(ids, { ack: String(year) }, 'acknowledge');
  };

  SL.Biz = B;
  if (typeof module !== 'undefined') module.exports = B;
})(typeof window !== 'undefined' ? window : globalThis);
