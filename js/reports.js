/* Simple Ledger - reports.js
   Pure report calculations. Every report is {title, subtitle, columns, rows, notes}.
   A row is {cls, cells}; a cell is {t: text, indent} or {c: cents, drill: {account, from, to}}. */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const Money = SL.Money || (typeof require !== 'undefined' ? require('./money.js') : null);
  const R = {};

  const pad = (n) => String(n).padStart(2, '0');
  const mk = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const addM = (y, m, n) => { const t = y * 12 + (m - 1) + n; return [Math.floor(t / 12), (t % 12 + 12) % 12 + 1]; };
  const parentOf = (n) => { const i = n.lastIndexOf(':'); return i < 0 ? '' : n.slice(0, i); };
  const leafOf = (n) => { const i = n.lastIndexOf(':'); return i < 0 ? n : n.slice(i + 1); };
  const T = (text, indent) => ({ t: text, indent: indent || 0 });
  const C = (cents, drill) => ({ c: cents, drill: drill || null });
  const signOf = (type) => (type === 'Asset' || type === 'Expense') ? 1 : -1;

  R.PRESETS = [
    ['month', 'This month'], ['lastmonth', 'Last month'], ['quarter', 'This quarter (fiscal)'],
    ['fy', 'This fiscal year'], ['lastfy', 'Last fiscal year'], ['year', 'This calendar year'],
    ['lastyear', 'Last calendar year'], ['all', 'All dates'], ['custom', 'Custom dates']
  ];

  R.period = function (book, preset, today) {
    const fm = book.settings.fyStart;
    const y = +today.slice(0, 4), m = +today.slice(5, 7);
    const range = (yy, mm, n) => { const [ey, em] = addM(yy, mm, n - 1); return { from: mk(yy, mm, 1), to: mk(ey, em, lastDay(ey, em)) }; };
    const fy = m >= fm ? [y, fm] : [y - 1, fm];
    switch (preset) {
      case 'month': return range(y, m, 1);
      case 'lastmonth': { const [py, pm] = addM(y, m, -1); return range(py, pm, 1); }
      case 'quarter': { const since = ((m - fm) % 12 + 12) % 12; const [qy, qm] = addM(y, m, -(since % 3)); return range(qy, qm, 3); }
      case 'fy': return range(fy[0], fy[1], 12);
      case 'lastfy': { const [py, pm] = addM(fy[0], fy[1], -12); return range(py, pm, 12); }
      case 'year': return range(y, 1, 12);
      case 'lastyear': return range(y - 1, 1, 12);
      case 'all': {
        const ds = book.txns.filter(t => !t.raw).map(t => t.date).sort();
        return { from: ds.length ? ds[0] : today, to: ds.length && ds[ds.length - 1] > today ? ds[ds.length - 1] : today };
      }
      default: return null;
    }
  };

  R.fyStart = function (book, date) {
    const fm = book.settings.fyStart;
    const y = +date.slice(0, 4), m = +date.slice(5, 7);
    return (m >= fm ? y : y - 1) + '-' + pad(fm) + '-01';
  };

  // direct: per-account sum of its own postings; total: rolled up to parents
  R.compute = function (book, from, to) {
    const direct = new Map(), total = new Map();
    for (const t of book.txns) {
      if (t.raw) continue;
      if (from && t.date < from) continue;
      if (to && t.date > to) continue;
      for (const p of t.postings) {
        direct.set(p.account, (direct.get(p.account) || 0) + p.amount);
        for (let n = p.account; n; n = parentOf(n)) total.set(n, (total.get(n) || 0) + p.amount);
      }
    }
    return { direct, total };
  };

  R.typeTotal = function (book, S, type) {
    let s = 0;
    for (const [n, v] of S.direct) if (book.accountType(n) === type) s += v;
    return s;
  };

  R.names = function (book) {
    const np = book.settings.template === 'nonprofit';
    return {
      bs: np ? 'Statement of Financial Position' : 'Balance Sheet',
      is: np ? 'Statement of Activities' : 'Income Statement',
      tb: 'Trial Balance', gl: 'General Ledger', cat: 'Category Totals',
      net: np ? 'Change in net assets' : 'Net income',
      equity: np ? 'Net assets' : 'Equity',
      revenue: np ? 'Support and revenue' : 'Income'
    };
  };

  // Account rows for one type, with subtotals for parents. Amounts in display sign.
  function tree(book, type, S, opts, range) {
    const sign = signOf(type);
    const walk = (parent, depth) => {
      const out = [];
      for (const name of book.children(parent)) {
        const a = book.accounts.get(name);
        const mine = a.type === type;
        const hasKids = book.children(name).some(k => book.accounts.get(k).type === type);
        // top-level roots (Assets, Income, ...) are already the section header: show only their contents
        const flat = !mine || (parent === '' && hasKids);
        const sub = walk(name, flat ? depth : depth + 1);
        const drill0 = { account: name, from: range.from, to: range.to };
        if (!mine) { out.push(...sub); continue; }
        if (flat) {
          out.push(...sub);
          const own0 = S.direct.get(name) || 0;
          if (own0 !== 0) out.push({ cls: 'acct', cells: [T('Other ' + leafOf(name).toLowerCase(), depth), C(own0 * sign, drill0)] });
          continue;
        }
        const tot = S.total.get(name) || 0;
        const hasSub = sub.length > 0;
        if (!hasSub && tot === 0 && (!opts.zero || a.hidden)) continue;
        const drill = { account: name, from: range.from, to: range.to };
        if (!book.children(name).some(k => book.accounts.get(k).type === type)) {
          out.push({ cls: 'acct', cells: [T(leafOf(name), depth), C(tot * sign, drill)] });
          continue;
        }
        out.push({ cls: 'head', cells: [T(leafOf(name), depth), T('')] });
        out.push(...sub);
        const own = S.direct.get(name) || 0;
        if (own !== 0) out.push({ cls: 'acct', cells: [T('Other ' + leafOf(name).toLowerCase(), depth + 1), C(own * sign, drill)] });
        out.push({ cls: 'sub', cells: [T('Total ' + leafOf(name), depth), C(tot * sign)] });
      }
      return out;
    };
    return walk('', 0);
  }

  const sec = (label) => ({ cls: 'sec', cells: [T(label), T('')] });
  const total = (label, cents) => ({ cls: 'total', cells: [T(label), C(cents)] });
  const grand = (label, cents) => ({ cls: 'grand', cells: [T(label), C(cents)] });
  const blank = (n) => ({ cls: 'blank', cells: Array.from({ length: n || 2 }, () => T('')) });

  R.balanceSheet = function (book, asOf, opts) {
    opts = opts || {};
    const N = R.names(book);
    const S = R.compute(book, '', asOf);
    const fy = R.fyStart(book, asOf);
    const rows = [];
    const range = { from: '', to: asOf };
    rows.push(sec('Assets'));
    rows.push(...tree(book, 'Asset', S, opts, range));
    const assets = R.typeTotal(book, S, 'Asset');
    rows.push(total('Total assets', assets), blank());
    rows.push(sec('Liabilities'));
    rows.push(...tree(book, 'Liability', S, opts, range));
    const liab = -R.typeTotal(book, S, 'Liability');
    rows.push(total('Total liabilities', liab), blank());
    rows.push(sec(N.equity));
    rows.push(...tree(book, 'Equity', S, opts, range));
    const eq = -R.typeTotal(book, S, 'Equity');
    const earn = (a, b) => { const E = R.compute(book, a, b); return -(R.typeTotal(book, E, 'Revenue') + R.typeTotal(book, E, 'Expense')); };
    const day = (d, n) => { const dt = new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5); return dt.toISOString().slice(0, 10); };
    const prior = earn('', day(fy, -1));
    const current = earn(fy, asOf);
    const np = book.settings.template === 'nonprofit';
    if (prior !== 0 || opts.zero) rows.push({ cls: 'acct', cells: [T(np ? 'Change in net assets, prior years' : 'Earnings from prior years', 0), C(prior)] });
    rows.push({ cls: 'acct', cells: [T(np ? 'Change in net assets, this year' : 'Earnings this year', 0), C(current)] });
    const equity = eq + prior + current;
    rows.push(total('Total ' + N.equity.toLowerCase(), equity), blank());
    rows.push(grand('Total liabilities and ' + N.equity.toLowerCase(), liab + equity));
    const notes = [];
    if (assets !== liab + equity) notes.push('Out of balance by ' + Money.format(assets - liab - equity) + '. This should not happen; please check the journal.');
    return { title: N.bs, subtitle: 'As of ' + asOf, columns: [{ label: '' }, { label: 'Amount', num: true }], rows, notes, balanced: assets === liab + equity };
  };

  R.incomeStatement = function (book, from, to, opts) {
    opts = opts || {};
    const N = R.names(book);
    const S = R.compute(book, from, to);
    const range = { from, to };
    const rows = [];
    rows.push(sec(N.revenue));
    rows.push(...tree(book, 'Revenue', S, opts, range));
    const rev = -R.typeTotal(book, S, 'Revenue');
    rows.push(total('Total ' + N.revenue.toLowerCase(), rev), blank());
    rows.push(sec('Expenses'));
    rows.push(...tree(book, 'Expense', S, opts, range));
    const exp = R.typeTotal(book, S, 'Expense');
    rows.push(total('Total expenses', exp), blank());
    rows.push(grand(N.net, rev - exp));
    return { title: N.is, subtitle: 'From ' + from + ' to ' + to, columns: [{ label: '' }, { label: 'Amount', num: true }], rows, notes: [], net: rev - exp };
  };

  R.trialBalance = function (book, asOf) {
    const N = R.names(book);
    const S = R.compute(book, '', asOf);
    const rows = [];
    let dr = 0, cr = 0;
    const names = [...S.direct.keys()].filter(n => S.direct.get(n) !== 0).sort((a, b) => a.localeCompare(b));
    for (const n of names) {
      const v = S.direct.get(n);
      const drill = { account: n, from: '', to: asOf, direct: true };
      rows.push({ cls: 'acct', cells: [T(n), v > 0 ? C(v, drill) : T(''), v < 0 ? C(-v, drill) : T('')] });
      if (v > 0) dr += v; else cr -= v;
    }
    rows.push({ cls: 'grand', cells: [T('Total'), C(dr), C(cr)] });
    const notes = dr !== cr ? ['Debits and credits differ by ' + Money.format(dr - cr) + '. This should not happen; please check the journal.'] : [];
    return { title: N.tb, subtitle: 'As of ' + asOf, columns: [{ label: 'Account' }, { label: 'Debit', num: true }, { label: 'Credit', num: true }], rows, notes, balanced: dr === cr };
  };

  R.generalLedger = function (book, from, to) {
    const N = R.names(book);
    const rows = [];
    const cols = [{ label: 'Date' }, { label: 'Num' }, { label: 'Payee' }, { label: 'Other account / memo' },
      { label: 'Debit', num: true }, { label: 'Credit', num: true }, { label: 'Balance', num: true }];
    const accts = new Map(); // name -> {open, items[]}
    const get = (n) => { if (!accts.has(n)) accts.set(n, { open: 0, items: [] }); return accts.get(n); };
    for (const t of book.sortedTxns()) {
      if (t.raw || (to && t.date > to)) continue;
      for (const p of t.postings) {
        const a = get(p.account);
        if (from && t.date < from) a.open += p.amount;
        else a.items.push({ t, p });
      }
    }
    for (const name of [...accts.keys()].sort((a, b) => a.localeCompare(b))) {
      const a = accts.get(name);
      if (!a.items.length && a.open === 0) continue;
      const sign = signOf(book.accountType(name));
      rows.push({ cls: 'sec', cells: [T(name), T(''), T(''), T(''), T(''), T(''), T('')] });
      let run = a.open;
      rows.push({ cls: 'acct', cells: [T(from || ''), T(''), T('Opening balance'), T(''), T(''), T(''), C(run * sign)] });
      for (const { t, p } of a.items) {
        run += p.amount;
        const others = t.postings.filter(x => x !== p);
        const other = others.length === 1 ? others[0].account : 'Split';
        rows.push({ cls: 'acct', cells: [T(t.date), T(t.code || ''), T(t.payee || ''), T(other + (t.memo ? ' — ' + t.memo : '')),
          p.amount > 0 ? C(p.amount) : T(''), p.amount < 0 ? C(-p.amount) : T(''), C(run * sign)] });
      }
      rows.push({ cls: 'total', cells: [T(''), T(''), T('Closing balance'), T(''), T(''), T(''), C(run * sign)] });
      rows.push(blank(7));
    }
    return { title: N.gl, subtitle: 'From ' + (from || 'the beginning') + ' to ' + to, columns: cols, rows, notes: [] };
  };

  R.categoryTotals = function (book, from, to, opts) {
    opts = opts || {};
    const N = R.names(book);
    const S = R.compute(book, from, to);
    const rows = [];
    const list = (type) => {
      const sign = signOf(type);
      return [...S.direct.entries()].filter(([n, v]) => book.accountType(n) === type && v !== 0)
        .map(([n, v]) => ({ n, v: v * sign })).sort((a, b) => b.v - a.v || a.n.localeCompare(b.n));
    };
    const section = (label, type) => {
      rows.push(sec(label));
      const items = list(type);
      let sum = 0;
      for (const { n, v } of items) { rows.push({ cls: 'acct', cells: [T(n, 1), C(v, { account: n, from, to, direct: true })] }); sum += v; }
      rows.push(total('Total ' + label.toLowerCase(), sum), blank());
      return sum;
    };
    const rev = section(N.revenue, 'Revenue');
    const exp = section('Expenses', 'Expense');
    rows.push(grand(N.net, rev - exp));
    return { title: N.cat, subtitle: 'From ' + from + ' to ' + to + ' (largest first)', columns: [{ label: 'Account' }, { label: 'Amount', num: true }], rows, notes: [] };
  };

  // The book as the report should see it: cash basis hides invoices and bills until they are paid.
  R.view = function (book, basis) {
    return basis === 'cash' && SL.Biz ? SL.Biz.cashView(book) : book;
  };

  R.build = function (book, kind, from, to, opts) {
    opts = opts || {};
    if (kind === 'people') return SL.Flow.byPerson(book, from, to, opts);
    if (kind === 'ar' || kind === 'ap') return SL.Biz.aging(book, kind === 'ar' ? 'invoice' : 'bill', to);
    const cash = opts.basis === 'cash';
    const b = cash ? R.view(book, 'cash') : book;
    let rep;
    switch (kind) {
      case 'bs': rep = R.balanceSheet(b, to, opts); break;
      case 'is': rep = R.incomeStatement(b, from, to, opts); break;
      case 'tb': rep = R.trialBalance(b, to); break;
      case 'gl': rep = R.generalLedger(b, from, to); break;
      case 'cat': rep = R.categoryTotals(b, from, to, opts); break;
      default: throw new Error('Unknown report');
    }
    if (cash) rep.subtitle += ' · Cash basis';
    return rep;
  };

  // Transactions behind one amount. direct = only that account, else including sub-accounts.
  R.drill = function (book, d) {
    const sign = signOf(book.accountType(d.account));
    const inAcct = (a) => d.direct ? a === d.account : (a === d.account || a.startsWith(d.account + ':'));
    const items = [];
    let sum = 0;
    for (const t of book.sortedTxns()) {
      if (t.raw || (d.from && t.date < d.from) || (d.to && t.date > d.to)) continue;
      const mine = t.postings.filter(p => inAcct(p.account));
      if (!mine.length) continue;
      const amt = Money.sum(mine.map(p => p.amount)) * sign;
      sum += amt;
      items.push({ t, amount: amt });
    }
    return { items, sum };
  };

  R.toCSV = function (report) {
    const q = (s) => /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    const lines = [[report.title].map(q).join(','), [report.subtitle].map(q).join(','), ''];
    lines.push(report.columns.map(c => q(c.label)).join(','));
    for (const r of report.rows) {
      if (r.cls === 'blank') continue;
      lines.push(r.cells.map(c => c.c !== undefined ? Money.toInput(c.c) : q((c.indent ? '  '.repeat(c.indent) : '') + (c.t || ''))).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  };

  SL.Reports = R;
  if (typeof module !== 'undefined') module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
