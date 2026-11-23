/* Simple Ledger - demo.js: builds a small sample business, with dates relative to today so it always looks current */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const D = {};

  D.build = function (todayStr) {
    const { Book, Templates, Biz: B } = SL;
    const pad = (n) => String(n).padStart(2, '0');
    const now = todayStr ? new Date(todayStr + 'T12:00:00') : new Date();
    const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const ago = (months, day) => { const d = new Date(now.getFullYear(), now.getMonth() - months, Math.min(day, 28), 12); return d > now ? new Date(now.getTime() - 864e5) : d; };
    const dstr = (m, day) => iso(ago(m, day));
    const bk = Book.fromText(Templates.newBook('business', 'Hillside Design Studio (demo)', 1));
    const P = (a, c) => ({ account: a, amount: c, status: '', text: '', tags: {} });
    const add = (date, payee, memo, postings, code) => { const t = bk.blank(); Object.assign(t, { date, payee, memo, postings, code: code || '' }); return bk.addTxn(t); };
    B.setCfg(bk, { org: 'Hillside Design Studio', address: '12 Hillside Rd\nEvanston, IL 60201', phone: '555-0100', email: 'hello@hillside.example', signer: 'Alex Rivera', title: 'Owner', footer: 'Please pay by check or bank transfer. Thank you!' });
    B.saveContact(bk, { name: 'Globex Corporation', roles: ['customer'], email: 'ap@globex.example', address: '1 Main St\nChicago, IL 60601', terms: '30' });
    B.saveContact(bk, { name: 'Initech', roles: ['customer'], address: '4120 Freidrich Ln\nAustin, TX 78744', terms: '15' });
    B.saveContact(bk, { name: 'Paper & Print Co', roles: ['supplier'], terms: '30' });
    B.saveContact(bk, { name: 'Lakeside Realty', roles: ['supplier'] });

    add(dstr(6, 1), 'Alex Rivera', 'Starting capital', [P('Assets:Checking', 2500000), P('Equity:Owner Contributions', -2500000)]);
    const inv = [];
    let n = 1001;
    for (let m = 5; m >= 0; m--) {
      add(dstr(m, 1), 'Lakeside Realty', 'Studio rent', [P('Assets:Checking', -180000), P('Expenses:Rent', 180000)], String(2001 + (5 - m)));
      add(dstr(m, 3), 'Adobe', 'Design software', [P('Liabilities:Credit Card', -5999), P('Expenses:Software', 5999)]);
      add(dstr(m, 9), 'City Power & Light', 'Electric', [P('Assets:Checking', -(8000 + (m * 733) % 4000)), P('Expenses:Utilities', 8000 + (m * 733) % 4000)]);
      add(dstr(m, 15), 'Corner Cafe', 'Client lunch', [P('Liabilities:Credit Card', -(3800 + (m * 311) % 2500)), P('Expenses:Meals', 3800 + (m * 311) % 2500)]);
      if (m > 0) add(dstr(m, 25), 'First Bank', 'Card payment', [P('Assets:Checking', -30000), P('Liabilities:Credit Card', 30000)]);
      const a = B.saveDoc(bk, { kind: 'invoice', contact: 'Globex Corporation', date: dstr(m, 5), due: B.addDays(dstr(m, 5), 30), number: String(n++), memo: '',
        lines: [{ desc: 'Brand design, monthly retainer', qty: 1, price: 350000, account: 'Income:Services' }, { desc: 'Stock images', qty: 4, price: 2500, account: 'Income:Sales' }] });
      const c = B.saveDoc(bk, { kind: 'invoice', contact: 'Initech', date: dstr(m, 12), due: B.addDays(dstr(m, 12), 15), number: String(n++), memo: '',
        lines: [{ desc: 'Website update', qty: 12, price: 9500, account: 'Income:Services' }] });
      inv.push([a, c, m]);
      const bl = B.saveDoc(bk, { kind: 'bill', contact: 'Paper & Print Co', date: dstr(m, 7), due: B.addDays(dstr(m, 7), 30), number: 'PP-' + (400 + m), memo: '',
        lines: [{ desc: 'Printing and supplies', amount: 24000 + (m * 1700) % 9000, account: 'Expenses:Office Supplies' }] });
      if (m >= 2) B.pay(bk, { kind: 'bill', contact: 'Paper & Print Co', date: dstr(m - 1, 6), account: 'Assets:Checking', ref: String(3001 + (5 - m)), allocations: [{ id: bl.id, amount: B.getDoc(bk, bl.id).balance }] });
    }
    // customers pay: Globex pays the invoices older than 2 months; Initech pays all but the last two
    for (const [a, c, m] of inv) {
      if (m >= 2) B.pay(bk, { kind: 'invoice', contact: 'Globex Corporation', date: dstr(m - 1, 4), account: 'Assets:Checking', ref: 'ACH', allocations: [{ id: a.id, amount: B.getDoc(bk, a.id).balance }] });
      if (m >= 2) B.pay(bk, { kind: 'invoice', contact: 'Initech', date: dstr(m - 1, 20), account: 'Assets:Checking', ref: String(8800 + m), allocations: [{ id: c.id, amount: B.getDoc(bk, c.id).balance }] });
    }
    // a couple of things for the Review screen to find
    add(dstr(0, 2), 'Mystery Vendor 4471', 'Unknown charge', [P('Liabilities:Credit Card', -4900), P('Expenses:Other', 4900)]);
    add(dstr(0, 2), 'Mystery Vendor 4471', 'Unknown charge', [P('Liabilities:Credit Card', -4900), P('Expenses:Other', 4900)]);
    bk.dirty = false;
    return bk;
  };

  D.text = (todayStr) => D.build(todayStr).toText();
  if (typeof module !== 'undefined') module.exports = D;
  SL.Demo = D;
})(typeof window !== 'undefined' ? window : globalThis);
