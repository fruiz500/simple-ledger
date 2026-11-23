/* Simple Ledger - diagnose.js
   Finds likely causes when things do not add up, and builds the "things to review" list.
   Plain code, no AI: it works offline and the AI layer only explains what it finds. */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const Money = SL.Money || (typeof require !== 'undefined' ? require('./money.js') : null);
  const Dx = {};

  const fmt = (c) => Money.format(c);
  const label = (c) => c.t.date + ' ' + (c.t.payee || '(no payee)') + ' ' + fmt(c.amount);
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const dayNum = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;

  const digits = (c) => String(Math.abs(c));
  function isAdjacentSwap(a, b) {
    if (a === b || a.length !== b.length) return false;
    const diff = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }

  /* Why does the statement not match? ctx: {opening, cands, ticked(Set), statement, last, later[]}
     cands: {key, t, p, amount (display sign)}. Returns findings, most likely first:
     {kind, text, tick:[keys], untick:[keys]} */
  Dx.reconcile = function (ctx) {
    const { opening, cands, ticked, statement } = ctx;
    const tickedSum = cands.reduce((s, c) => s + (ticked.has(c.key) ? c.amount : 0), 0);
    const diff = statement - (opening + tickedSum);
    const out = [];
    if (diff === 0) return out;
    const on = cands.filter(c => ticked.has(c.key));
    const off = cands.filter(c => !ticked.has(c.key));
    const dir = diff > 0 ? 'The statement is higher than your ticked items' : 'The statement is lower than your ticked items';

    // 0. the last reconciliation no longer agrees with what is marked reconciled
    if (ctx.last && ctx.last.balance !== opening)
      out.push({ kind: 'opening', text: 'Your last reconciliation ended at ' + fmt(ctx.last.balance) + ' (' + ctx.last.date + '), but the items marked reconciled now add up to ' + fmt(opening) +
        '. Something reconciled earlier was undone or changed. That alone can explain a difference of ' + fmt(ctx.last.balance - opening) + '.' });

    // 1. one unticked item equals the difference
    for (const c of off) if (c.amount === diff) out.push({ kind: 'tick-one', text: 'Not ticked, but exactly the difference: ' + label(c) + '. Is it on your statement?', tick: [c.key], untick: [] });
    // 2. one ticked item equals minus the difference
    for (const c of on) if (c.amount === -diff) out.push({ kind: 'untick-one', text: 'Ticked, and exactly the difference: ' + label(c) + '. Is it missing from your statement, or dated in another month?', tick: [], untick: [c.key] });
    // 3. entered backwards: the statement has the opposite sign of what you entered
    for (const c of cands) {
      if (diff % 2 === 0 && c.amount === -diff / 2 && ticked.has(c.key))
        out.push({ kind: 'sign', text: label(c) + ' may be entered backwards (a ' + (c.amount > 0 ? 'deposit' : 'withdrawal') + ' that is really a ' + (c.amount > 0 ? 'withdrawal' : 'deposit') + '). That would cause exactly this difference.' });
    }
    // 4. a digit swap, such as 54.00 typed as 45.00
    if (Math.abs(diff) % 9 === 0) {
      for (const c of on) {
        const want = c.amount + diff;
        if (Math.sign(want) === Math.sign(c.amount) && isAdjacentSwap(digits(c.amount), digits(want)))
          out.push({ kind: 'swap', text: label(c) + ' may have two digits swapped. The statement would show ' + fmt(want) + '.' });
      }
    }
    // 5. two or three unticked items add up to the difference; or ticked items that add up to minus the difference
    const combos = (pool, target, maxN) => {
      const res = [];
      const n = Math.min(pool.length, maxN);
      const list = pool.slice(0, n);
      for (let i = 0; i < list.length && res.length < 3; i++)
        for (let j = i + 1; j < list.length && res.length < 3; j++) {
          if (list[i].amount + list[j].amount === target) res.push([list[i], list[j]]);
          if (list.length <= 60) for (let k = j + 1; k < list.length && res.length < 3; k++)
            if (list[i].amount + list[j].amount + list[k].amount === target) res.push([list[i], list[j], list[k]]);
        }
      return res;
    };
    for (const g of combos(off, diff, 200)) out.push({ kind: 'tick-many', text: 'Not ticked, and together exactly the difference: ' + g.map(label).join('; ') + '.', tick: g.map(c => c.key), untick: [] });
    for (const g of combos(on, -diff, 200)) out.push({ kind: 'untick-many', text: 'Ticked, and together exactly the difference: ' + g.map(label).join('; ') + '. Are some of them missing from the statement?', tick: [], untick: g.map(c => c.key) });
    // 6. the same item entered twice
    const seen = new Map();
    for (const c of cands) {
      const k = c.t.date + '|' + (c.t.payee || '') + '|' + c.amount;
      if (seen.has(k)) {
        const first = seen.get(k);
        out.push({ kind: 'dup', text: 'Possible duplicate: ' + label(c) + ' appears twice.' + (ticked.has(c.key) && ticked.has(first.key) && c.amount === -diff ? ' Ticking only one would fix the difference.' : '') });
      } else seen.set(k, c);
    }
    // 7. an item dated after the statement date has the right amount
    for (const c of ctx.later || []) if (c.amount === diff) out.push({ kind: 'later', text: label(c) + ' is dated after the statement date but equals the difference. Is its date wrong?' });
    // 8. nothing matched: say so plainly
    if (!out.length) out.push({ kind: 'none', text: dir + ' by ' + fmt(Math.abs(diff)) + '. No single item, pair, backwards entry, or swapped digits explains it. Look for a bank fee or interest you have not entered, or an item entered with the wrong amount.' });
    return out;
  };

  /* Things to review. Each: {sev: 'warn'|'info', title, detail, go: {screen, account?}} */
  Dx.review = function (book, todayStr) {
    const tod = todayStr || today();
    const out = [];
    const txns = book.txns.filter(t => !t.raw);
    const Biz = SL.Biz;

    // uncategorized pile
    for (const name of book.accounts.keys()) {
      if (!/Uncategorized$/.test(name)) continue;
      const n = txns.filter(t => t.postings.some(p => p.account === name)).length;
      if (n) out.push({ sev: 'warn', title: n + ' transaction' + (n === 1 ? '' : 's') + ' in ' + name, detail: 'Imported items waiting for a real account.', go: { screen: 'register', account: name } });
    }

    // possible duplicates: same date, payee, amount, and accounts (documents excluded)
    const dupSeen = new Map();
    for (const t of txns) {
      if (!t.payee || (Biz && (Biz.docKind(t) || t.tags.gift))) continue;
      const k = t.date + '|' + t.payee + '|' + t.postings.map(p => p.account + ':' + p.amount).sort().join(',');
      if (dupSeen.has(k)) out.push({ sev: 'warn', title: 'Possible duplicate: ' + t.date + ' ' + t.payee, detail: 'Two transactions with the same date, payee, accounts, and amount (' + fmt(Math.max(...t.postings.map(p => p.amount))) + ').', go: { screen: 'journal' } });
      else dupSeen.set(k, t);
    }

    // unusual amount for a payee: much larger than their usual, in the last 90 days
    const byPayee = new Map();
    for (const t of txns) {
      if (!t.payee || t.postings.length !== 2) continue;
      const exp = t.postings.find(p => book.accountType(p.account) === 'Expense' && p.amount > 0);
      if (!exp) continue;
      if (!byPayee.has(t.payee)) byPayee.set(t.payee, []);
      byPayee.get(t.payee).push({ t, amount: exp.amount });
    }
    for (const [payee, list] of byPayee) {
      if (list.length < 5) continue;
      list.sort((a, b) => a.t.date < b.t.date ? -1 : 1);
      const recent = list[list.length - 1];
      if (dayNum(tod) - dayNum(recent.t.date) > 90) continue;
      const before = list.slice(0, -1).map(x => x.amount).sort((a, b) => a - b);
      const median = before[Math.floor(before.length / 2)];
      if (recent.amount > median * 3 && recent.amount - median > 5000)
        out.push({ sev: 'info', title: payee + ' on ' + recent.t.date + ' was ' + fmt(recent.amount), detail: 'Usually about ' + fmt(median) + '. A typo, or a real one-off?', go: { screen: 'journal' } });
    }

    // a regular monthly payee that has gone quiet
    for (const [payee, list] of byPayee) {
      if (list.length < 4) continue;
      const days = list.map(x => dayNum(x.t.date)).sort((a, b) => a - b);
      const gaps = days.slice(1).map((d, i) => d - days[i]);
      const med = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
      const spread = Math.max(...gaps) - Math.min(...gaps);
      const since = dayNum(tod) - days[days.length - 1];
      if (med >= 26 && med <= 35 && spread <= 12 && since > med * 1.5 && since < 200)
        out.push({ sev: 'info', title: 'No ' + payee + ' payment since ' + list[list.length - 1].t.date, detail: 'It usually arrives about every month. Was it missed or paid another way?', go: { screen: 'journal' } });
    }

    // accounts not reconciled lately but active
    for (const a of book.accounts.values()) {
      if (a.hidden || !book.isLeaf(a.name) || !['Asset', 'Liability'].includes(a.type)) continue;
      const mine = txns.filter(t => t.postings.some(p => p.account === a.name));
      if (mine.length < 5) continue;
      const rec = book.recons.filter(r => r.account === a.name).map(r => r.date).sort().pop();
      const lastAct = mine.map(t => t.date).sort().pop();
      if (/receivable|payable/i.test(a.name)) continue;
      if (!rec) out.push({ sev: 'info', title: a.name + ' has never been reconciled', detail: mine.length + ' transactions so far.', go: { screen: 'reconcile' } });
      else if (dayNum(tod) - dayNum(rec) > 45 && lastAct > rec) out.push({ sev: 'info', title: a.name + ' was last reconciled ' + rec, detail: Math.round(dayNum(tod) - dayNum(rec)) + ' days ago, with activity since.', go: { screen: 'reconcile' } });
    }

    // negative balance on a bank or cash account
    for (const a of book.accounts.values()) {
      if (a.hidden || a.type !== 'Asset' || !book.isLeaf(a.name) || /receivable/i.test(a.name)) continue;
      if (book.balance(a.name) < 0) out.push({ sev: 'warn', title: a.name + ' is negative (' + fmt(book.balance(a.name)) + ')', detail: 'A missing deposit or an item entered backwards is the usual cause.', go: { screen: 'register', account: a.name } });
    }

    // dates far in the future
    const future = txns.filter(t => dayNum(t.date) - dayNum(tod) > 45 && !(Biz && Biz.docKind(t)));
    if (future.length) out.push({ sev: 'info', title: future.length + ' transaction' + (future.length === 1 ? '' : 's') + ' dated more than 45 days from now', detail: 'First one: ' + future[0].date + ' ' + (future[0].payee || '') + '. A wrong year is easy to type.', go: { screen: 'journal' } });

    // invoices and bills
    if (Biz && Biz.cfg(book).invoices) {
      const inv = Biz.outstanding(book, 'invoice', tod), bill = Biz.outstanding(book, 'bill', tod);
      if (inv.overdue) out.push({ sev: 'warn', title: fmt(inv.overdue) + ' of customer invoices are overdue', detail: 'Open an invoice to record a payment or draft a reminder.', go: { screen: 'invoices' } });
      if (bill.overdue) out.push({ sev: 'warn', title: fmt(bill.overdue) + ' of supplier bills are overdue', detail: 'Pay them or check that they were already paid.', go: { screen: 'bills' } });
      const soon = Biz.docs(book, 'bill', null, tod).filter(d => d.balance > 0 && d.due >= tod && dayNum(d.due) - dayNum(tod) <= 7);
      if (soon.length) out.push({ sev: 'info', title: soon.length + ' bill' + (soon.length === 1 ? '' : 's') + ' due within a week', detail: soon.map(d => d.contact + ' ' + fmt(d.balance) + ' on ' + d.due).slice(0, 4).join('; '), go: { screen: 'bills' } });
    }

    // donors: letters not sent, addresses missing
    if (Biz && Biz.cfg(book).donations) {
      const y = +tod.slice(0, 4), m = +tod.slice(5, 7);
      const year = m <= 6 ? y - 1 : y;
      const L = Biz.letters(book, year);
      const todo = L.filter(l => !l.acked);
      if (m <= 4 && todo.length) out.push({ sev: 'warn', title: todo.length + ' donor' + (todo.length === 1 ? '' : 's') + ' still waiting for a ' + year + ' thank-you letter', detail: 'Donors need the letter by the time they file their return.', go: { screen: 'donations' } });
      const noAddr = L.filter(l => !l.contact.address);
      if (noAddr.length) out.push({ sev: 'info', title: noAddr.length + ' ' + year + ' donor' + (noAddr.length === 1 ? ' has' : 's have') + ' no mailing address', detail: noAddr.map(l => l.donor).slice(0, 5).join(', '), go: { screen: 'contacts' } });
    }
    return out.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'warn' ? -1 : 1));
  };

  SL.Diagnose = Dx;
  if (typeof module !== 'undefined') module.exports = Dx;
})(typeof window !== 'undefined' ? window : globalThis);
