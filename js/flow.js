/* Simple Ledger - flow.js
   Plain-language money flows: pay someone, get paid, move money, deposit received checks, and the per-person report.
   Everything here produces ordinary double-entry transactions. */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const F = {};
  const Money = () => SL.Money;

  F.UNDEPOSITED = 'Assets:Checks Not Yet Deposited';
  F.PAY_METHODS = [['check', 'Check'], ['online', 'Online or ACH'], ['zelle', 'Zelle, Venmo or similar'], ['debit', 'Debit card'], ['other', 'Other']];
  F.GET_METHODS = [['check', 'Check'], ['cash', 'Cash'], ['transfer', 'Bank transfer, Zelle or similar'], ['card', 'Card payment'], ['other', 'Other']];
  const CODE = { online: 'ACH', zelle: 'Zelle', debit: 'Debit', cash: 'Cash', transfer: 'Transfer', card: 'Card', other: '' };

  const P = (account, amount, tags) => ({ account, amount, status: '', text: '', tags: tags || {} });

  F.ensureUndeposited = function (book) {
    if (!book.accounts.has(F.UNDEPOSITED)) book.addAccount(F.UNDEPOSITED, 'Asset');
    return F.UNDEPOSITED;
  };

  const tag = (t, who) => { if (who) t.tags.for = SL.Biz.enc(who); };

  function check(book, s) {
    if (!s.date) throw new Error('Enter the date.');
    if (!(s.amount > 0)) throw new Error('Enter the amount.');
    if (s.payee && /[;|]/.test(s.payee)) throw new Error('A name cannot contain ";" or "|".');
    if (s.code && !/^[^;|()]*$/.test(s.code)) throw new Error('The number or reference cannot contain ; | ( or ).');
  }

  // I paid someone
  F.payOut = function (book, s) {
    check(book, s);
    if (!s.from) throw new Error('Choose the account you paid from.');
    if (!s.category) throw new Error('Choose what it was for.');
    if (!book.accounts.has(s.category)) throw new Error('Unknown account "' + s.category + '".');
    if (s.category === s.from) throw new Error('"Paid from" and "what for" must be different accounts.');
    let code = (s.code || '').trim();
    if (s.method === 'check') {
      if (!/^\d+$/.test(code)) throw new Error('Enter the check number (digits only).');
      if (book.txns.some(t => !t.raw && t.code === code && t.postings.some(p => p.account === s.from && p.amount < 0))) throw new Error('Check number ' + code + ' is already used in this account.');
    } else if (!code) code = CODE[s.method] || '';
    const t = book.blank();
    Object.assign(t, { date: s.date, payee: (s.payee || '').trim(), code, memo: (s.memo || '').trim(), postings: [P(s.from, -s.amount), P(s.category, s.amount)] });
    tag(t, s.who);
    return book.addTxn(t);
  };

  // I got paid
  F.receive = function (book, s) {
    check(book, s);
    if (!s.category) throw new Error('Choose what the money was for.');
    if (!book.accounts.has(s.category)) throw new Error('Unknown account "' + s.category + '".');
    let to = s.to;
    if (s.method === 'check' && s.hold) to = F.ensureUndeposited(book);
    if (!to) throw new Error('Choose where the money went.');
    const code = s.method === 'check' ? (s.code || '').trim() : ((s.code || '').trim() || CODE[s.method] || '');
    const t = book.blank();
    Object.assign(t, { date: s.date, payee: (s.payee || '').trim(), code, memo: (s.memo || '').trim(), postings: [P(to, s.amount), P(s.category, -s.amount)] });
    tag(t, s.who);
    return book.addTxn(t);
  };

  // I moved money between my accounts
  F.move = function (book, s) {
    check(book, s);
    if (!s.from || !s.to) throw new Error('Choose both accounts.');
    if (s.from === s.to) throw new Error('Choose two different accounts.');
    const t = book.blank();
    Object.assign(t, { date: s.date, payee: (s.payee || 'Transfer').trim(), code: (s.code || '').trim(), memo: (s.memo || '').trim(), postings: [P(s.from, -s.amount), P(s.to, s.amount)] });
    return book.addTxn(t);
  };

  // received checks waiting for deposit
  F.pending = function (book) {
    if (!book.accounts.has(F.UNDEPOSITED)) return [];
    const done = new Set();
    for (const t of book.txns) {
      if (t.raw) continue;
      for (const p of t.postings) if (p.account === F.UNDEPOSITED && p.tags && p.tags.dep) done.add(p.tags.dep);
    }
    const out = [];
    for (const t of book.sortedTxns()) {
      if (t.raw) continue;
      for (const p of t.postings) if (p.account === F.UNDEPOSITED && p.amount > 0 && !done.has(t.id))
        out.push({ id: t.id, date: t.date, payee: t.payee, number: t.code, memo: t.memo, amount: p.amount });
    }
    return out;
  };

  F.deposit = function (book, s) {
    const all = F.pending(book);
    const items = (s.ids || []).map(id => all.find(x => x.id === id)).filter(Boolean);
    if (!items.length) throw new Error('Tick at least one check to deposit.');
    if (!s.bank) throw new Error('Choose the bank account.');
    if (!s.date) throw new Error('Enter the deposit date.');
    const total = items.reduce((a, x) => a + x.amount, 0);
    const t = book.blank();
    Object.assign(t, { date: s.date, payee: 'Deposit', memo: 'Deposit of ' + items.length + ' check' + (items.length === 1 ? '' : 's') + (items.some(x => x.number) ? ': ' + items.map(x => x.number || 'no number').join(', ') : ''),
      postings: [P(s.bank, total)].concat(items.map(x => P(F.UNDEPOSITED, -x.amount, { dep: x.id }))) });
    return book.addTxn(t);
  };

  // Income and expenses, one column per person
  F.byPerson = function (book, from, to, opts) {
    const R = SL.Reports, B = SL.Biz;
    const view = R.view(book, opts && opts.basis);
    const names = B.people(book).slice();
    const get = new Map(); // account -> Map(person -> cents)
    const extra = new Set();
    for (const t of view.txns) {
      if (t.raw || t.date < from || t.date > to) continue;
      for (const p of t.postings) {
        const ty = view.accountType(p.account);
        if (ty !== 'Revenue' && ty !== 'Expense') continue;
        let who = B.personOf(t, p);
        if (who && !names.includes(who)) { names.push(who); if (!B.formerPeople(book).includes(who)) extra.add(who); }
        const m = get.get(p.account) || new Map(); get.set(p.account, m);
        const amt = ty === 'Revenue' ? -p.amount : p.amount;
        m.set(who, (m.get(who) || 0) + amt);
      }
    }
    const named = names.slice(0, B.people(book).length), later = names.slice(B.people(book).length).sort((a, b) => a.localeCompare(b));
    const cols = named.concat(later, ['']);
    const T = (t, i) => ({ t, indent: i || 0 }), C = (c) => ({ c, drill: null });
    const cell = (v) => v ? C(v) : T('');
    const rows = [];
    const sect = (label, type, sign) => {
      rows.push({ cls: 'sec', cells: [T(label)].concat(cols.map(() => T('')), [T('')]) });
      const tot = new Map();
      for (const a of [...get.keys()].filter(a => view.accountType(a) === type).sort()) {
        const m = get.get(a); let row = 0;
        const cells = cols.map(c => { const v = m.get(c) || 0; row += v; tot.set(c, (tot.get(c) || 0) + v); return cell(v); });
        rows.push({ cls: 'acct', cells: [T(a.split(':').pop(), 1)].concat(cells, [cell(row)]) });
      }
      rows.push({ cls: 'total', cells: [T('Total ' + label.toLowerCase())].concat(cols.map(c => C(tot.get(c) || 0)), [C([...tot.values()].reduce((x, y) => x + y, 0))]) });
      rows.push({ cls: 'blank', cells: [T('')].concat(cols.map(() => T('')), [T('')]) });
      return tot;
    };
    const inc = sect('Income', 'Revenue'), exp = sect('Expenses', 'Expense');
    const net = cols.map(c => (inc.get(c) || 0) - (exp.get(c) || 0));
    rows.push({ cls: 'grand', cells: [T('Net')].concat(net.map(C), [C(net.reduce((x, y) => x + y, 0))]) });
    return { title: 'Income and expenses by person', subtitle: 'From ' + from + ' to ' + to + (opts && opts.basis === 'cash' ? ' · Cash basis' : ''),
      columns: [{ label: '' }].concat(cols.map(c => ({ label: c || 'Shared', num: true })), [{ label: 'Total', num: true }]), rows,
      notes: extra.size ? ['Some transactions are marked for ' + [...extra].join(', ') + ', who are not in your People list (Settings).'] : ['Transactions with no person chosen are counted under Shared.'] };
  };

  if (typeof module !== 'undefined') module.exports = F;
  SL.Flow = F;
})(typeof window !== 'undefined' ? window : globalThis);
