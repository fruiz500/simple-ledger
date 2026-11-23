/* Simple Ledger - reconcile.js
   Statement reconciliation. A reconciled posting carries the tag rec:<statement date>.
   Each finished reconciliation is also recorded in the file as "; sb:recon ..." so the next
   one starts from the right opening balance. */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const Money = SL.Money || (typeof require !== 'undefined' ? require('./money.js') : null);
  const Rec = {};

  Rec.sign = (book, account) => book.normalSign(account);

  // Opening balance for the next reconciliation: reconciled postings, in the account's display sign
  Rec.opening = function (book, account) {
    let s = 0;
    for (const t of book.txns) {
      if (t.raw) continue;
      for (const p of t.postings) if (p.account === account && p.tags && p.tags.rec) s += p.amount;
    }
    return s * Rec.sign(book, account);
  };

  Rec.history = (book, account) => book.recons.filter(r => r.account === account);
  Rec.last = (book, account) => { const h = Rec.history(book, account); return h.length ? h[h.length - 1] : null; };

  // Unreconciled postings dated on or before the statement date, oldest first
  Rec.candidates = function (book, account, date) {
    const sign = Rec.sign(book, account);
    const out = [];
    for (const t of book.sortedTxns()) {
      if (t.raw || t.date > date) continue;
      t.postings.forEach((p, idx) => {
        if (p.account !== account || (p.tags && p.tags.rec)) return;
        out.push({ key: t.id + '#' + idx, t, p, amount: p.amount * sign, cleared: p.status === '*' });
      });
    }
    return out;
  };

  // total of the ticked candidates (display sign)
  Rec.tickedSum = (cands, ticked) => cands.reduce((s, c) => s + (ticked.has(c.key) ? c.amount : 0), 0);
  Rec.difference = (opening, cands, ticked, statement) => statement - (opening + Rec.tickedSum(cands, ticked));

  Rec.finish = function (book, account, date, statementBalance, cands, ticked) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Enter the statement date.');
    const last = Rec.last(book, account);
    if (last && date < last.date) throw new Error('The statement date must not be earlier than the last reconciliation (' + last.date + ').');
    const opening = Rec.opening(book, account);
    if (Rec.difference(opening, cands, ticked, statementBalance) !== 0) throw new Error('The difference must be zero to finish.');
    let n = 0;
    for (const c of cands) {
      if (!ticked.has(c.key)) continue;
      c.p.status = '*';
      c.p.tags = Object.assign({}, c.p.tags, { rec: date });
      n++;
    }
    book.recons.push({ account, date, balance: statementBalance });
    book.addLog('reconcile', '-', account + ' ' + date + ' ' + Money.toInput(statementBalance) + ' (' + n + ' items)');
    book.changed('txns');
    return n;
  };

  Rec.undo = function (book, account) {
    const idx = book.recons.map((r, i) => r.account === account ? i : -1).filter(i => i >= 0).pop();
    if (idx === undefined) throw new Error('There is no reconciliation to undo.');
    const rec = book.recons[idx];
    let n = 0;
    for (const t of book.txns) {
      if (t.raw) continue;
      for (const p of t.postings) {
        if (p.account === account && p.tags && p.tags.rec === rec.date) { const tags = Object.assign({}, p.tags); delete tags.rec; p.tags = tags; n++; }
      }
    }
    book.recons.splice(idx, 1);
    book.addLog('unreconcile', '-', account + ' ' + rec.date + ' (' + n + ' items)');
    book.changed('txns');
    return rec;
  };

  SL.Reconcile = Rec;
  if (typeof module !== 'undefined') module.exports = Rec;
})(typeof window !== 'undefined' ? window : globalThis);
