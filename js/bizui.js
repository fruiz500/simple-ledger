/* Simple Ledger - bizui.js
   Screens for contacts, invoices, bills, payments, donations and donor letters, plus their settings. */
(function () {
  'use strict';
  const { Money, Book, UI, Biz: B } = SL;
  const h = UI.h;
  const S = () => SL.state;
  const money = (c) => Money.format(c);
  const err = (e) => UI.toast(e.message || String(e), 'error');
  const go = (screen) => SL.app.go(screen);
  const amt = (c, cls) => h('td', { class: 'num ' + (cls || '') + (c < 0 ? ' neg' : '') }, c == null ? '' : money(c));
  const lines = (s) => String(s || '').split('\n').filter(Boolean);
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const longDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) ? MON[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)) + ', ' + d.slice(0, 4) : d;
  const slug = (s) => (s || 'book').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'book';

  function download(name, text) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function refreshLists() {
    const b = S().book;
    UI.datalist('dl-cust', B.contacts(b, 'customer').map(c => c.name));
    UI.datalist('dl-supp', B.contacts(b, 'supplier').map(c => c.name));
    UI.datalist('dl-donor', B.contacts(b, 'donor').map(c => c.name));
  }

  function leafAccounts(b, types, skip) {
    return [...b.accounts.values()].filter(a => !a.hidden && types.includes(a.type) && b.isLeaf(a.name) && a.name !== skip)
      .map(a => a.name).sort((a, b) => a.localeCompare(b));
  }
  function firstLeaf(b, type, pattern) {
    const list = [...b.accounts.values()].filter(a => !a.hidden && a.type === type && b.isLeaf(a.name)).map(a => a.name).sort((a, b) => a.localeCompare(b));
    return list.find(n => pattern && pattern.test(n)) || list[0] || '';
  }

  // ---------- navigation and home ----------
  function navItems(b, item) {
    const c = B.cfg(b);
    const out = [];
    if (c.invoices || c.donations) {
      out.push(h('div', { class: 'nav-head' }, 'People'));
      out.push(item('Contacts', 'contacts'));
      if (c.invoices) { out.push(item('Invoices', 'invoices')); out.push(item('Bills', 'bills')); }
      if (c.donations) out.push(item('Donations', 'donations'));
    }
    return out;
  }

  function homeCards(b) {
    const c = B.cfg(b);
    if (!c.invoices) return null;
    const a = B.outstanding(b, 'invoice'), p = B.outstanding(b, 'bill');
    if (!a.total && !p.total) return null;
    const card = (label, v, sub, screen) => h('div', { class: 'card click', onclick: () => go(screen) }, h('div', { class: 'card-label' }, label),
      h('div', { class: 'card-value' }, money(v)), h('div', { class: 'card-sub' }, sub));
    return h('div', { class: 'cards' },
      card('Customers owe you', a.total, a.overdue ? money(a.overdue) + ' overdue' : 'Nothing overdue', 'invoices'),
      card('You owe suppliers', p.total, p.overdue ? money(p.overdue) + ' overdue' : 'Nothing overdue', 'bills'));
  }

  // ---------- contacts ----------
  function contactsScreen(main) {
    const b = S().book, st = S();
    const filter = st.contactFilter || '';
    const invs = B.docs(b, 'invoice'), bills = B.docs(b, 'bill');
    const sel = h('select', { onchange: (e) => { st.contactFilter = e.target.value; SL.render(); } },
      [['', 'Everyone'], ['customer', 'Customers'], ['supplier', 'Suppliers'], ['donor', 'Donors']].map(([v, l]) => h('option', { value: v }, l)));
    sel.value = filter;
    main.appendChild(h('div', { class: 'screen-head' }, h('h1', null, 'Contacts'),
      h('div', { class: 'actions' }, sel, h('button', { class: 'primary', onclick: () => contactDialog(null) }, 'Add contact…'))));
    const list = B.contacts(b, filter);
    const label = (c) => c.roles.map(r => ({ customer: 'Customer', supplier: 'Supplier', donor: 'Donor' }[r])).join(', ');
    const rows = list.map(c => {
      const owes = invs.filter(d => d.contact === c.name).reduce((s, d) => s + Math.max(0, d.balance), 0);
      const owed = bills.filter(d => d.contact === c.name).reduce((s, d) => s + Math.max(0, d.balance), 0);
      return h('tr', { class: 'click', onclick: () => contactDialog(c.name) },
        h('td', null, c.name), h('td', null, label(c)), h('td', null, c.email), h('td', null, c.phone),
        amt(owes || null), amt(owed || null));
    });
    main.appendChild(h('table', { class: 'grid' },
      h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Type'), h('th', null, 'Email'), h('th', null, 'Phone'),
        h('th', { class: 'num' }, 'Owes you'), h('th', { class: 'num' }, 'You owe'))),
      h('tbody', null, rows)));
    if (!list.length) main.appendChild(h('p', { class: 'empty' }, 'No contacts yet. Add the customers, suppliers, and donors you deal with. They are also created automatically when you use a new name on an invoice, bill, or donation.'));
  }

  async function contactDialog(name, preset) {
    const b = S().book;
    const c = name ? B.contact(b, name) : Object.assign({ name: '', roles: [], email: '', phone: '', address: '', terms: '' }, preset || {});
    const used = name ? B.payeeUsed(b, name) : false;
    const f = {
      name: h('input', { value: c.name, disabled: used || null }),
      email: h('input', { value: c.email, type: 'text', inputmode: 'email' }),
      phone: h('input', { value: c.phone }),
      address: h('textarea', { rows: 3, value: c.address }),
      terms: h('input', { value: c.terms, size: 4, inputmode: 'numeric', placeholder: B.cfg(b).terms })
    };
    const roles = B.ROLES.map(([k, l]) => ({ k, box: h('input', { type: 'checkbox', checked: c.roles.includes(k) }), l }));
    const body = h('div', { class: 'form' },
      h('label', { class: 'field' }, h('span', null, 'Name'), f.name, used ? h('small', null, 'The name is used on transactions, so it cannot be changed.') : null),
      h('div', { class: 'field' }, h('span', null, 'Type'), h('div', { class: 'role-row' }, roles.map(r => h('label', { class: 'check' }, r.box, ' ', r.l)))),
      h('label', { class: 'field' }, h('span', null, 'Email'), f.email),
      h('label', { class: 'field' }, h('span', null, 'Phone'), f.phone),
      h('label', { class: 'field' }, h('span', null, 'Mailing address'), f.address, h('small', null, 'Printed on invoices and donor letters.')),
      h('label', { class: 'field' }, h('span', null, 'Payment terms (days)'), f.terms, h('small', null, 'Leave empty to use the book default.')));
    const buttons = [{ label: 'Cancel', value: null }, {
      label: 'Save', value: 'save', primary: true,
      validate: () => {
        try {
          B.saveContact(b, { name: f.name.value.trim() || c.name, roles: roles.filter(r => r.box.checked).map(r => r.k), email: f.email.value, phone: f.phone.value, address: f.address.value, terms: f.terms.value.trim() }, name);
          return '';
        } catch (e) { return e.message; }
      }
    }];
    if (name && !used) buttons.unshift({ label: 'Delete', value: 'del', danger: true, left: true });
    const r = await UI.modal({ title: name ? 'Contact' : 'New contact', body, buttons });
    if (r === 'del') {
      if (await UI.confirm('Delete contact?', 'Delete ' + name + '?', 'Delete', true)) { try { B.deleteContact(b, name); } catch (e) { err(e); } }
    }
    if (r) SL.render();
    return r === 'save' ? (f.name.value.trim() || c.name) : null;
  }

  // ---------- invoices and bills list ----------
  const STATUS = { open: 'Unpaid', partial: 'Partly paid', overdue: 'Overdue', paid: 'Paid' };

  function docsScreen(main, kind) {
    const b = S().book, st = S();
    st.docFilter = st.docFilter || {};
    const filter = st.docFilter[kind] || 'unpaid';
    const inv = kind === 'invoice';
    const all = B.docs(b, kind);
    const shown = all.filter(d => filter === 'all' || (filter === 'unpaid' && d.balance > 0) || (filter === 'overdue' && d.status === 'overdue') || (filter === 'paid' && d.status === 'paid'));
    const out = B.outstanding(b, kind);
    const sel = h('select', { onchange: (e) => { st.docFilter[kind] = e.target.value; SL.render(); } },
      [['unpaid', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['all', 'All']].map(([v, l]) => h('option', { value: v }, l)));
    sel.value = filter;
    main.appendChild(h('div', { class: 'screen-head' }, h('h1', null, inv ? 'Invoices' : 'Bills'),
      h('div', { class: 'actions' }, sel,
        h('button', { onclick: () => paymentDialog(kind, null).then(ok => ok && SL.render()) }, inv ? 'Record payment…' : 'Pay bills…'),
        h('button', { class: 'primary', onclick: () => docEditor(kind, null) }, inv ? 'New invoice…' : 'New bill…'))));
    main.appendChild(h('div', { class: 'cards' },
      h('div', { class: 'card' }, h('div', { class: 'card-label' }, inv ? 'Customers owe you' : 'You owe suppliers'), h('div', { class: 'card-value' }, money(out.total))),
      h('div', { class: 'card' }, h('div', { class: 'card-label' }, 'Overdue'), h('div', { class: 'card-value' + (out.overdue ? ' neg' : '') }, money(out.overdue)))));
    const rows = shown.map(d => h('tr', { class: 'click', onclick: () => openDoc(d.id) },
      h('td', null, d.number), h('td', { class: 'date' }, d.date), h('td', null, d.contact), h('td', { class: 'date' }, d.due),
      amt(d.total), amt(d.paid || null), amt(d.balance),
      h('td', null, h('span', { class: 'badge b-' + d.status }, STATUS[d.status])),
      h('td', { class: 'row-actions' }, d.balance > 0 ? h('button', { class: 'link', onclick: (e) => { e.stopPropagation(); paymentDialog(kind, d.id).then(ok => ok && SL.render()); } }, inv ? 'Payment' : 'Pay') : null)));
    main.appendChild(h('div', { class: 'rep-scroll' }, h('table', { class: 'grid docs' },
      h('thead', null, h('tr', null, h('th', null, 'No.'), h('th', null, 'Date'), h('th', null, inv ? 'Customer' : 'Supplier'), h('th', null, 'Due'),
        h('th', { class: 'num' }, 'Total'), h('th', { class: 'num' }, 'Paid'), h('th', { class: 'num' }, 'Balance'), h('th', null, 'Status'), h('th', null, ''))),
      h('tbody', null, rows))));
    if (!shown.length) main.appendChild(h('p', { class: 'empty' }, all.length ? 'Nothing matches this filter.' : (inv ? 'No invoices yet. Create one with "New invoice".' : 'No bills yet. Enter the bills you receive with "New bill".')));
  }

  function openDoc(id) { S().docId = id; go('doc'); }

  // ---------- invoice / bill editor ----------
  async function docEditor(kind, existing, presetContact) {
    const b = S().book, cfg = B.cfg(b), inv = kind === 'invoice';
    const f = {
      contact: h('input', { list: inv ? 'dl-cust' : 'dl-supp', value: existing ? existing.contact : (presetContact || ''), autocomplete: 'off', disabled: existing && existing.paid ? true : null }),
      date: h('input', { type: 'date', value: existing ? existing.date : (S().lastDate || Book.today()) }),
      number: h('input', { value: existing ? existing.number : (inv ? B.nextNumber(b) : ''), size: 10 }),
      due: h('input', { type: 'date', value: existing ? existing.due : '' }),
      memo: h('textarea', { rows: 2, value: existing ? existing.memo : '', placeholder: inv ? 'Shown on the invoice (optional)' : 'Private note (optional)' })
    };
    let dueTouched = !!existing;
    f.due.addEventListener('change', () => { dueTouched = true; });
    const autoDue = () => {
      if (dueTouched || !f.date.value) return;
      const c = B.contact(b, f.contact.value.trim());
      f.due.value = B.addDays(f.date.value, parseInt((c && c.terms) || cfg.terms, 10));
    };
    f.date.addEventListener('change', autoDue); f.contact.addEventListener('change', autoDue);
    autoDue();
    const defAcct = inv ? firstLeaf(b, 'Revenue', /service|sales|contrib/i) : firstLeaf(b, 'Expense', /other|office/i);
    const rows = [];
    const tbody = h('tbody');
    const totalEl = h('strong', null, '$0.00');
    function addLine(l) {
      l = l || {};
      const r = {
        desc: h('input', { value: l.desc || '', placeholder: 'Description', class: 'l-desc' }),
        qty: h('input', { value: l.qty != null ? String(l.qty) : '1', class: 'l-qty', inputmode: 'decimal' }),
        price: h('input', { value: l.price != null ? Money.toInput(l.price) : '', class: 'l-amt', inputmode: 'decimal', placeholder: '0.00' }),
        acct: h('input', { list: 'dl-accounts', value: l.account || defAcct, class: 'l-acct', autocomplete: 'off' }),
        total: h('td', { class: 'num' })
      };
      if (!inv) r.price.value = l.amount != null ? Money.toInput(l.amount) : '';
      r.tr = h('tr', null, h('td', null, r.desc), inv ? h('td', null, r.qty) : null, h('td', null, r.price), h('td', null, r.acct), inv ? r.total : null,
        h('td', null, h('button', { type: 'button', class: 'link danger', title: 'Remove line', onclick: () => { if (rows.length > 1) { rows.splice(rows.indexOf(r), 1); r.tr.remove(); update(); } } }, '×')));
      rows.push(r); tbody.appendChild(r.tr);
    }
    function read(strict) {
      return rows.map(r => {
        const blank = !r.desc.value.trim() && !r.price.value.trim();
        if (blank) return { desc: '', account: '', amount: 0 };
        const price = Money.parse(r.price.value);
        if (price == null) { if (strict) throw new Error('Enter an amount on every line.'); return { desc: r.desc.value.trim(), account: r.acct.value.trim(), amount: 0 }; }
        if (!inv) return { desc: r.desc.value.trim(), account: r.acct.value.trim(), amount: price };
        const qty = r.qty.value.trim() === '' ? 1 : Number(r.qty.value);
        if (!isFinite(qty)) { if (strict) throw new Error('Quantity must be a number.'); return { desc: r.desc.value.trim(), account: r.acct.value.trim(), amount: 0 }; }
        return { desc: r.desc.value.trim(), qty, price, account: r.acct.value.trim(), amount: B.lineAmount(qty, price) };
      });
    }
    function update() {
      const ls = read(false);
      ls.forEach((l, i) => { rows[i].total.textContent = l.amount ? money(l.amount) : ''; });
      totalEl.textContent = money(Money.sum(ls.map(l => l.amount)));
    }
    if (existing) existing.lines.forEach(addLine); else { addLine(); addLine(); }
    const scanNote = h('div');
    function scan() {
      const inp = h('input', { type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.webp', onchange: async () => {
        const file = inp.files[0]; if (!file) return;
        UI.clear(scanNote); scanNote.appendChild(h('p', { class: 'note' }, 'Reading with AI…'));
        try {
          const r = await SL.AIUI.extractBill(file, b);
          if (r.supplier) f.contact.value = r.supplier;
          if (r.date) f.date.value = r.date;
          if (r.number) f.number.value = r.number;
          if (r.due) { f.due.value = r.due; dueTouched = true; } else autoDue();
          rows.length = 0; UI.clear(tbody);
          r.lines.forEach(l => addLine({ desc: l.desc, amount: l.amount, account: l.account || defAcct }));
          update();
          const sum = Money.sum(r.lines.map(l => l.amount));
          UI.clear(scanNote);
          scanNote.appendChild(h('p', { class: 'note' + (r.total != null && r.total !== sum ? ' bad' : '') },
            'Filled in by AI from ' + file.name + '. Check every field against the original. ' +
            (r.total == null ? 'No total was read, so the lines could not be checked.' : r.total === sum ? 'The lines add up to the total printed on the bill (' + money(r.total) + ').' : 'The lines add up to ' + money(sum) + ' but the bill total read was ' + money(r.total) + '. Something is missing or misread.') +
            (r.supplier && !B.contact(b, r.supplier) ? ' "' + r.supplier + '" is not in your suppliers yet; it will be added when you save.' : '')));
          const sd = SL.AIUI.sentNote(); if (sd) scanNote.appendChild(sd);
        } catch (e) { UI.clear(scanNote); scanNote.appendChild(h('p', { class: 'note bad' }, e.message)); }
      } });
      inp.click();
    }
    const body = h('div', { class: 'form doc-form' },
      h('div', { class: 'doc-top' },
        h('label', { class: 'field' }, h('span', null, inv ? 'Customer' : 'Supplier'), f.contact),
        h('label', { class: 'field' }, h('span', null, inv ? 'Invoice date' : 'Bill date'), f.date),
        h('label', { class: 'field' }, h('span', null, inv ? 'Invoice number' : 'Supplier\'s bill number'), f.number),
        h('label', { class: 'field' }, h('span', null, 'Due date'), f.due)),
      h('table', { class: 'grid biz-lines' },
        h('thead', null, h('tr', null, h('th', null, 'Description'), inv ? h('th', null, 'Qty') : null, h('th', { class: inv ? '' : 'num' }, inv ? 'Price' : 'Amount'),
          h('th', null, inv ? 'Income account' : 'Expense account'), inv ? h('th', { class: 'num' }, 'Amount') : null, h('th', null, ''))),
        tbody),
      h('div', { class: 'doc-foot' }, h('button', { type: 'button', onclick: () => addLine() }, 'Add line'),
        !inv && !existing && SL.AI.has() ? h('button', { type: 'button', onclick: scan }, 'Read a bill from PDF or photo (AI)') : null,
        h('span', { class: 'spacer' }), h('span', null, 'Total '), totalEl),
      scanNote,
      h('label', { class: 'field' }, h('span', null, 'Notes'), f.memo),
      inv ? h('p', { class: 'note' }, 'For sales tax, add a line to your sales tax payable account. Simple Ledger does not calculate tax for you.') : null);
    body.addEventListener('input', update);
    update();
    let savedId = null;
    const buttons = [{ label: 'Cancel', value: null }, {
      label: 'Save', value: 'save', primary: true,
      validate: () => {
        try {
          const t = B.saveDoc(b, { kind, contact: f.contact.value, date: f.date.value, due: f.due.value, number: f.number.value, memo: f.memo.value, lines: read(true) }, existing ? existing.id : null);
          savedId = t.id; S().lastDate = f.date.value;
          return '';
        } catch (e) { return e.message; }
      }
    }];
    const r = await UI.modal({ title: (existing ? 'Edit ' : 'New ') + (inv ? 'invoice' : 'bill'), body, buttons, wide: true });
    if (r === 'save') { S().docId = savedId; SL.app.go('doc'); }
    return r === 'save';
  }

  // ---------- payment dialog ----------
  async function paymentDialog(kind, docId) {
    const b = S().book, inv = kind === 'invoice';
    const doc = docId ? B.getDoc(b, docId) : null;
    const ctl = B.ctlName(b, kind);
    const accts = leafAccounts(b, inv ? ['Asset'] : ['Asset', 'Liability'], ctl);
    if (!accts.length) { await UI.alert('No bank account', 'Add a bank or cash account first (Accounts).'); return false; }
    const remembered = S().payAcct && S().payAcct[kind];
    const f = {
      contact: h('input', { list: inv ? 'dl-cust' : 'dl-supp', value: doc ? doc.contact : '', autocomplete: 'off' }),
      date: h('input', { type: 'date', value: Book.today() }),
      acct: h('select', null, accts.map(a => h('option', { value: a }, a))),
      ref: h('input', { size: 10 }),
      how: h('select', null, (inv ? SL.Flow.GET_METHODS : SL.Flow.PAY_METHODS).map(([v, l]) => h('option', { value: v }, l))),
      hold: h('input', { type: 'checkbox' }),
      print: h('input', { type: 'checkbox', checked: true })
    };
    f.acct.value = accts.includes(remembered) ? remembered : (accts.find(a => /check/i.test(a)) || accts[0]);
    const tbody = h('tbody'); const inputs = new Map();
    const totalEl = h('strong', null, '$0.00');
    let first = true;
    const total = () => {
      let s = 0;
      for (const i of inputs.values()) { const v = Money.parse(i.value); if (v) s += v; }
      totalEl.textContent = money(s);
    };
    function draw() {
      UI.clear(tbody); inputs.clear();
      const name = f.contact.value.trim();
      const open = B.docs(b, kind).filter(d => d.contact === name && d.balance > 0).sort((x, y) => x.date < y.date ? -1 : 1);
      for (const d of open) {
        const i = h('input', { class: 'l-amt', inputmode: 'decimal', value: first && doc && doc.id === d.id ? Money.toInput(d.balance) : '', placeholder: '0.00' });
        inputs.set(d.id, i);
        tbody.appendChild(h('tr', null, h('td', null, (inv ? 'Invoice ' : 'Bill ') + (d.number || d.date)), h('td', null, d.due), amt(d.balance), h('td', null, i),
          h('td', null, h('button', { type: 'button', class: 'link', onclick: () => { i.value = Money.toInput(d.balance); total(); } }, 'Pay in full'))));
      }
      if (!open.length) tbody.appendChild(h('tr', null, h('td', { colspan: 5, class: 'empty' }, name ? 'Nothing outstanding for ' + name + '.' : 'Choose a ' + (inv ? 'customer' : 'supplier') + '.')));
      first = false; total();
    }
    const refLabel = h('span', null, 'Reference');
    const holdRow = h('label', { class: 'field check' }, f.hold, h('span', null, 'I am holding this check; it is not deposited yet'));
    const printRow = h('label', { class: 'field check' }, f.print, h('span', null, 'Print the check after saving'));
    function syncHow() {
      const chk = f.how.value === 'check';
      refLabel.textContent = chk ? 'Check number' : 'Reference (optional)';
      holdRow.style.display = chk && inv ? '' : 'none';
      printRow.style.display = chk && !inv ? '' : 'none';
      f.acct.disabled = inv && chk && f.hold.checked;
      if (chk && !inv) f.ref.value = SL.Checks.nextNumber(b, f.acct.value);
      else if (!chk && /^\d+$/.test(f.ref.value)) f.ref.value = '';
    }
    f.how.addEventListener('change', syncHow); f.acct.addEventListener('change', syncHow); f.hold.addEventListener('change', syncHow);
    f.contact.addEventListener('change', draw);
    draw(); syncHow();
    const body = h('div', { class: 'form doc-form' },
      h('div', { class: 'doc-top' },
        h('label', { class: 'field' }, h('span', null, inv ? 'Received from' : 'Paid to'), f.contact),
        h('label', { class: 'field' }, h('span', null, 'Date'), f.date),
        h('label', { class: 'field' }, h('span', null, inv ? 'Deposit to' : 'Pay from'), f.acct),
        h('label', { class: 'field' }, h('span', null, 'How'), f.how), h('label', { class: 'field' }, refLabel, f.ref)),
      holdRow, printRow,
      h('table', { class: 'grid biz-lines' }, h('thead', null, h('tr', null, h('th', null, inv ? 'Invoice' : 'Bill'), h('th', null, 'Due'), h('th', { class: 'num' }, 'Balance'), h('th', null, 'Payment'), h('th', null, ''))), tbody),
      h('div', { class: 'doc-foot' }, h('span', { class: 'spacer' }), h('span', null, 'Total payment '), totalEl));
    body.addEventListener('input', total);
    let paid = null;
    const r = await UI.modal({
      title: inv ? 'Record a customer payment' : 'Pay supplier bills', body, wide: true,
      buttons: [{ label: 'Cancel', value: null }, {
        label: 'Save payment', value: 'save', primary: true,
        validate: () => {
          try {
            const allocations = [];
            for (const [id, i] of inputs) {
              if (!i.value.trim()) continue;
              const v = Money.parse(i.value);
              if (v == null) throw new Error('One of the payment amounts is not a number.');
              allocations.push({ id, amount: v });
            }
            const chk = f.how.value === 'check', hold = inv && chk && f.hold.checked;
            let ref = f.ref.value.trim();
            if (chk && !inv && !/^\d+$/.test(ref)) throw new Error('Enter the check number (digits only).');
            if (!chk && !ref) ref = { online: 'ACH', zelle: 'Zelle', debit: 'Debit', cash: 'Cash', transfer: 'Transfer', card: 'Card' }[f.how.value] || '';
            const account = hold ? SL.Flow.ensureUndeposited(b) : f.acct.value;
            paid = B.pay(b, { kind, contact: f.contact.value.trim(), date: f.date.value, account, ref, allocations });
            S().payAcct = Object.assign(S().payAcct || {}, { [kind]: f.acct.value });
            return '';
          } catch (e) { return e.message; }
        }
      }]
    });
    if (r === 'save') {
      UI.toast('Payment recorded');
      if (!inv && f.how.value === 'check' && f.print.checked && paid) { S().checkJob = { bank: f.acct.value, ids: [paid.id] }; go('checksheet'); }
    }
    return r === 'save';
  }

  // ---------- invoice / bill view ----------
  function docScreen(main) {
    const b = S().book;
    const d = S().docId && B.getDoc(b, S().docId);
    if (!d) return go('invoices');
    const c = B.cfg(b), inv = d.kind === 'invoice';
    const contact = B.contact(b, d.contact) || { name: d.contact, address: '', email: '' };
    main.appendChild(h('div', { class: 'screen-head no-print' }, h('h1', null, (inv ? 'Invoice ' : 'Bill ') + (d.number || '')),
      h('div', { class: 'actions' },
        h('button', { onclick: () => go(inv ? 'invoices' : 'bills') }, '← Back'),
        h('button', { onclick: () => docEditor(d.kind, d) }, 'Edit'),
        d.balance > 0 ? h('button', { onclick: () => paymentDialog(d.kind, d.id).then(ok => ok && SL.render()) }, inv ? 'Record payment' : 'Pay') : null,
        inv && d.balance > 0 && d.due && d.due < Book.today() && SL.AI.has() ? h('button', { onclick: () => SL.AIUI.draftReminder(d) }, 'Draft reminder (AI)') : null,
        h('button', { class: 'primary', onclick: () => window.print() }, 'Print / PDF'),
        h('button', { class: 'danger', onclick: async () => {
          if (!(await UI.confirm('Delete ' + d.kind + '?', 'Delete this ' + d.kind + '? This is recorded in the edit log.', 'Delete', true))) return;
          try { B.deleteDoc(b, d.id); go(inv ? 'invoices' : 'bills'); } catch (e) { err(e); }
        } }, 'Delete'))));
    const sheet = h('div', { class: 'doc-sheet' });
    sheet.appendChild(h('div', { class: 'ds-head' },
      h('div', null, h('div', { class: 'ds-org' }, c.org), lines(c.address).map(l => h('div', null, l)),
        c.phone ? h('div', null, c.phone) : null, c.email ? h('div', null, c.email) : null),
      h('div', { class: 'ds-title' }, h('h2', null, inv ? 'INVOICE' : 'BILL'),
        h('table', { class: 'ds-meta' },
          h('tr', null, h('td', null, inv ? 'Invoice no.' : 'Bill no.'), h('td', null, d.number || '—')),
          h('tr', null, h('td', null, 'Date'), h('td', null, d.date)),
          h('tr', null, h('td', null, 'Due'), h('td', null, d.due))))));
    sheet.appendChild(h('div', { class: 'ds-to' }, h('small', null, inv ? 'Bill to' : 'From'), h('strong', null, d.contact),
      lines(contact.address).map(l => h('div', null, l))));
    sheet.appendChild(h('table', { class: 'grid ds-lines' },
      h('thead', null, h('tr', null, h('th', null, 'Description'), inv ? h('th', { class: 'num' }, 'Qty') : null, inv ? h('th', { class: 'num' }, 'Price') : null, h('th', { class: 'num' }, 'Amount'))),
      h('tbody', null, d.lines.map(l => h('tr', null, h('td', null, l.desc || l.account),
        inv ? h('td', { class: 'num' }, String(l.qty)) : null, inv ? amt(l.price) : null, amt(l.amount)))),
      h('tfoot', null,
        h('tr', null, h('td', { colspan: inv ? 3 : 1 }, 'Total'), amt(d.total)),
        d.payments.length ? d.payments.sort((x, y) => x.t.date < y.t.date ? -1 : 1).map(p => h('tr', { class: 'ds-pay' },
          h('td', { colspan: inv ? 3 : 1 }, (inv ? 'Payment received ' : 'Payment made ') + p.t.date + (p.t.code ? ' (' + p.t.code + ')' : '')), amt(-p.amount))) : null,
        h('tr', { class: 'ds-due' }, h('td', { colspan: inv ? 3 : 1 }, inv ? 'Balance due' : 'Balance owed'), amt(d.balance)))));
    if (d.memo) sheet.appendChild(h('p', { class: 'ds-notes' }, d.memo));
    if (inv && c.footer) sheet.appendChild(h('p', { class: 'ds-footer' }, c.footer));
    main.appendChild(sheet);
  }

  // ---------- donations ----------
  function defaultYear() {
    const t = Book.today();
    return Number(t.slice(5, 7)) <= 4 ? Number(t.slice(0, 4)) - 1 : Number(t.slice(0, 4));
  }

  function donationsScreen(main) {
    const b = S().book, st = S();
    const all = B.gifts(b);
    const years = [...new Set(all.map(g => Number(g.date.slice(0, 4))).concat([defaultYear(), Number(Book.today().slice(0, 4))]))].sort((x, y) => y - x);
    if (!st.donYear) st.donYear = defaultYear();
    const year = st.donYear;
    const sel = h('select', { onchange: (e) => { st.donYear = Number(e.target.value); SL.render(); } }, years.map(y => h('option', { value: y }, String(y))));
    sel.value = String(year);
    const letters = B.letters(b, year);
    const gifts = B.gifts(b, year);
    main.appendChild(h('div', { class: 'screen-head' }, h('h1', null, 'Donations'),
      h('div', { class: 'actions' }, sel,
        h('button', { onclick: () => download(slug(b.settings.name) + '-donors-' + year + '.csv', B.giftsCSV(b, year)) }, 'Donor totals (CSV)'),
        h('button', { onclick: () => { st.lettersYear = year; st.lettersDonor = ''; go('letters'); }, disabled: letters.length ? null : true }, 'Thank-you letters…'),
        h('button', { class: 'primary', onclick: () => giftDialog(null) }, 'Record donation…'))));
    const total = Money.sum(gifts.map(g => g.amount));
    const acked = letters.filter(l => l.acked).length;
    main.appendChild(h('div', { class: 'cards' },
      h('div', { class: 'card' }, h('div', { class: 'card-label' }, 'Gifts in ' + year), h('div', { class: 'card-value' }, money(total)), h('div', { class: 'card-sub' }, gifts.length + ' gift' + (gifts.length === 1 ? '' : 's'))),
      h('div', { class: 'card' }, h('div', { class: 'card-label' }, 'Donors'), h('div', { class: 'card-value plain' }, String(letters.length)), h('div', { class: 'card-sub' }, acked + ' acknowledged'))));
    main.appendChild(h('h2', null, 'Donors in ' + year));
    main.appendChild(h('table', { class: 'grid' },
      h('thead', null, h('tr', null, h('th', null, 'Donor'), h('th', { class: 'num' }, 'Gifts'), h('th', { class: 'num' }, 'Total'), h('th', null, 'Letter'), h('th', null, ''))),
      h('tbody', null, letters.map(l => h('tr', { class: 'click', onclick: () => { st.lettersYear = year; st.lettersDonor = l.donor; go('letters'); } },
        h('td', null, l.donor), h('td', { class: 'num' }, String(l.gifts.length)), amt(l.total),
        h('td', null, h('span', { class: 'badge ' + (l.acked ? 'b-paid' : 'b-open') }, l.acked ? 'Sent' : 'Not yet')),
        h('td', { class: 'row-actions' }, h('button', { class: 'link' }, 'View letter')))))));
    if (!letters.length) main.appendChild(h('p', { class: 'empty' }, 'No donations recorded for ' + year + '.'));
    main.appendChild(h('h2', null, 'All gifts in ' + year));
    main.appendChild(h('table', { class: 'grid' },
      h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Donor'), h('th', null, 'Type'), h('th', null, 'Reference'), h('th', { class: 'num' }, 'Amount'), h('th', { class: 'num' }, 'Goods / services'))),
      h('tbody', null, gifts.map(g => h('tr', { class: 'click' + (b.isLocked(g.txn) ? ' locked' : ''), onclick: () => openGift(g.id) },
        h('td', { class: 'date' }, g.date), h('td', null, g.donor), h('td', null, g.kind === 'noncash' ? 'Non-cash' : 'Cash / check'), h('td', null, g.ref),
        amt(g.amount), amt(g.goods || null))))));
  }

  function openGift(id) {
    const b = S().book;
    const g = B.gifts(b).find(x => x.id === id);
    if (!g) return;
    if (b.isLocked(g.txn)) return UI.alert('Locked period', 'The books are locked through ' + b.settings.lockDate + '.');
    giftDialog(g);
  }

  async function giftDialog(g) {
    const b = S().book;
    const spec = g ? B.giftSpec(b, g) : { donor: '', date: S().lastDate || Book.today(), amount: 0, deposit: '', income: '', kind: 'cash', ref: '', goods: 0, goodsDesc: '', goodsIncome: '', noncash: '' };
    const assets = leafAccounts(b, ['Asset'], B.ctlName(b, 'invoice'));
    const incomeDef = spec.income || firstLeaf(b, 'Revenue', /contribution|donation/i);
    const f = {
      donor: h('input', { list: 'dl-donor', value: spec.donor, autocomplete: 'off' }),
      date: h('input', { type: 'date', value: spec.date }),
      amount: h('input', { value: spec.amount ? Money.toInput(spec.amount) : '', inputmode: 'decimal', size: 12 }),
      kind: h('select', null, [['cash', 'Cash or check'], ['noncash', 'Non-cash (property)']].map(([v, l]) => h('option', { value: v }, l))),
      deposit: h('select', null, assets.map(a => h('option', { value: a }, a))),
      income: h('input', { list: 'dl-accounts', value: incomeDef, autocomplete: 'off' }),
      ref: h('input', { value: spec.ref, size: 12, placeholder: 'Check no.' }),
      noncash: h('input', { value: spec.noncash, placeholder: 'For example: used laptop and two monitors' }),
      goods: h('input', { value: spec.goods ? Money.toInput(spec.goods) : '', inputmode: 'decimal', size: 10, placeholder: '0.00' }),
      goodsDesc: h('input', { value: spec.goodsDesc, placeholder: 'For example: gala dinner, one seat' }),
      goodsIncome: h('input', { list: 'dl-accounts', value: spec.goodsIncome || firstLeaf(b, 'Revenue', /event|program/i) || incomeDef, autocomplete: 'off' })
    };
    f.kind.value = spec.kind; if (spec.deposit) f.deposit.value = spec.deposit;
    const ncRow = h('label', { class: 'field' }, h('span', null, 'Describe the property'), f.noncash,
      h('small', null, 'The amount above is the value you record in your books. The letter lists the description only; donors value non-cash gifts themselves.'));
    const syncKind = () => { ncRow.style.display = f.kind.value === 'noncash' ? '' : 'none'; };
    f.kind.addEventListener('change', syncKind); syncKind();
    const body = h('div', { class: 'form' },
      h('label', { class: 'field' }, h('span', null, 'Donor'), f.donor),
      h('div', { class: 'doc-top' },
        h('label', { class: 'field' }, h('span', null, 'Date'), f.date),
        h('label', { class: 'field' }, h('span', null, 'Amount'), f.amount),
        h('label', { class: 'field' }, h('span', null, 'Type'), f.kind),
        h('label', { class: 'field' }, h('span', null, 'Reference'), f.ref)),
      ncRow,
      h('label', { class: 'field' }, h('span', null, 'Deposited to'), f.deposit),
      h('label', { class: 'field' }, h('span', null, 'Income account'), f.income,
        h('small', null, 'Use a "with donor restrictions" account for restricted gifts.')),
      h('details', { open: spec.goods ? true : null }, h('summary', null, 'Donor received something in return (dinner, merchandise)?'),
        h('label', { class: 'field' }, h('span', null, 'Value of goods or services'), f.goods),
        h('label', { class: 'field' }, h('span', null, 'What was provided'), f.goodsDesc),
        h('label', { class: 'field' }, h('span', null, 'Income account for that part'), f.goodsIncome)));
    const buttons = [{ label: 'Cancel', value: null }, {
      label: 'Save', value: 'save', primary: true,
      validate: () => {
        try {
          const a = Money.parse(f.amount.value);
          if (a == null) throw new Error('Enter the amount of the gift.');
          const gv = f.goods.value.trim() ? Money.parse(f.goods.value) : 0;
          if (gv == null) throw new Error('The value of goods or services is not a number.');
          B.saveGift(b, { donor: f.donor.value, date: f.date.value, amount: a, deposit: f.deposit.value, income: f.income.value.trim(), kind: f.kind.value,
            ref: f.ref.value, goods: gv, goodsDesc: f.goodsDesc.value, goodsIncome: f.goodsIncome.value.trim(), noncash: f.noncash.value }, g ? g.id : null);
          S().lastDate = f.date.value;
          return '';
        } catch (e) { return e.message; }
      }
    }];
    if (g) buttons.unshift({ label: 'Delete', value: 'del', danger: true, left: true });
    const r = await UI.modal({ title: g ? 'Edit donation' : 'Record donation', body, buttons, wide: true });
    if (r === 'del') {
      if (await UI.confirm('Delete donation?', 'Delete this gift? It is recorded in the edit log.', 'Delete', true)) { try { b.deleteTxn(g.id); } catch (e) { err(e); } }
    }
    if (r) SL.render();
  }

  // ---------- donor letters ----------
  function letterEl(lc) {
    const gifts = lc.gifts;
    return h('div', { class: 'letter' },
      h('div', { class: 'lt-org' }, h('strong', null, lc.org), lines(lc.orgAddress).map(l => h('div', null, l)),
        lc.orgPhone || lc.orgEmail ? h('div', null, [lc.orgPhone, lc.orgEmail].filter(Boolean).join(' · ')) : null),
      h('div', { class: 'lt-date' }, longDate(lc.date)),
      h('div', { class: 'lt-to' }, h('div', null, lc.donor), lines(lc.donorAddress).map(l => h('div', null, l))),
      h('p', null, 'Dear ' + lc.donor + ','),
      h('p', null, lc.intro),
      lc.note ? h('p', null, lc.note) : null,
      h('table', { class: 'grid lt-gifts' },
        h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Gift'), h('th', { class: 'num' }, 'Amount'))),
        h('tbody', null, gifts.map(g => [
          h('tr', null, h('td', { class: 'nowrap' }, longDate(g.date)), h('td', null, g.desc), h('td', { class: 'num' }, g.amount == null ? 'see below' : money(g.amount))),
          h('tr', { class: 'lt-stmt' }, h('td', null, ''), h('td', { colspan: 2 }, g.statement))])),
        lc.hasCash ? h('tfoot', null, h('tr', null, h('td', { colspan: 2 }, 'Total cash contributions in ' + lc.year), h('td', { class: 'num' }, money(lc.total)))) : null),
      h('p', null, lc.closing),
      h('p', { class: 'lt-sign' }, 'Sincerely,'),
      h('p', { class: 'lt-signer' }, lc.signer ? h('strong', null, lc.signer) : null, lc.title ? h('div', null, lc.title) : null));
  }

  function lettersScreen(main) {
    const b = S().book, st = S();
    const year = st.lettersYear || defaultYear();
    const all = B.letters(b, year);
    const pick = st.lettersDonor || '';
    const shown = pick ? all.filter(l => l.donor === pick) : all;
    const c = B.cfg(b);
    const sel = h('select', { onchange: (e) => { st.lettersDonor = e.target.value; st.lettersNote = ''; SL.render(); } },
      [h('option', { value: '' }, 'All donors (' + all.length + ')')].concat(all.map(l => h('option', { value: l.donor }, l.donor))));
    sel.value = pick;
    const dateIn = h('input', { type: 'date', value: st.lettersDate || Book.today(), onchange: (e) => { st.lettersDate = e.target.value; SL.render(); } });
    main.appendChild(h('div', { class: 'screen-head no-print' }, h('h1', null, 'Thank-you letters for ' + year),
      h('div', { class: 'actions' },
        h('button', { onclick: () => go('donations') }, '← Back'), sel, h('label', null, 'Letter date ', dateIn),
        h('button', { class: 'primary', onclick: () => window.print(), disabled: shown.length ? null : true }, 'Print / PDF'),
        h('button', { disabled: shown.length ? null : true, onclick: () => {
          const ids = shown.flatMap(l => l.gifts.map(g => g.id));
          B.markAcked(b, ids, year);
          UI.toast('Marked ' + shown.length + ' donor' + (shown.length === 1 ? '' : 's') + ' as acknowledged');
          SL.render();
        } }, pick ? 'Mark as sent' : 'Mark all as sent'))));
    const missing = [];
    if (!c.address) missing.push('mailing address'); if (!c.ein) missing.push('EIN'); if (!c.signer) missing.push('signer');
    if (missing.length) main.appendChild(h('p', { class: 'note warn no-print' }, 'Your organization\'s ' + missing.join(', ') + ' is not set. Add it in Settings so letters are complete.'));
    main.appendChild(h('p', { class: 'note no-print' }, 'Use Print / PDF and choose "Save as PDF" to make one file with a page per donor. "Mark as sent" records that these gifts were acknowledged for ' + year + '.'));
    if (pick && shown.length === 1 && SL.AI.has()) {
      const ta = h('textarea', { rows: 3, value: st.lettersNote || '', placeholder: 'Optional personal note, placed after the opening paragraph.', onchange: () => { st.lettersNote = ta.value.trim(); SL.render(); } });
      main.appendChild(h('div', { class: 'no-print letter-note' }, h('label', { class: 'field' }, h('span', null, 'Personal note for ' + pick + ' (not saved)'), ta),
        h('button', { onclick: (e) => { const bt = e.target; bt.disabled = true; SL.AIUI.draftDonorNote(pick, year, shown[0].gifts.length).then(t => { if (t) { st.lettersNote = t; SL.render(); } }).catch(x => UI.toast(x.message, 'error')).then(() => { bt.disabled = false; }); } }, 'Draft note (AI)'),
        h('button', { onclick: () => { st.lettersNote = ''; SL.render(); } }, 'Clear note')));
    }
    const wrap = h('div', { class: 'letters' });
    for (const l of shown) { const lc = B.letterContent(b, l, st.lettersDate || Book.today()); if (pick && st.lettersNote) lc.note = st.lettersNote; wrap.appendChild(letterEl(lc)); }
    if (!shown.length) wrap.appendChild(h('p', { class: 'empty' }, 'No donations for ' + year + '.'));
    main.appendChild(wrap);
  }

  // ---------- settings section ----------
  function settingsSection() {
    const b = S().book, c = B.cfg(b);
    const f = {
      invoices: h('input', { type: 'checkbox', checked: c.invoices }),
      donations: h('input', { type: 'checkbox', checked: c.donations }),
      org: h('input', { value: c.org }),
      address: h('textarea', { rows: 3, value: c.address }),
      phone: h('input', { value: c.phone }), email: h('input', { value: c.email }),
      ein: h('input', { value: c.ein, placeholder: '12-3456789' }),
      signer: h('input', { value: c.signer }), title: h('input', { value: c.title }),
      terms: h('input', { value: c.terms, size: 4, inputmode: 'numeric' }),
      footer: h('input', { value: c.footer, placeholder: 'For example: Please pay by check or bank transfer.' }),
      intro: h('textarea', { rows: 3, value: c.intro }), closing: h('textarea', { rows: 3, value: c.closing }),
      ar: h('input', { value: c.ar }), ap: h('input', { value: c.ap })
    };
    const row = (label, el, help) => h('label', { class: 'field' }, h('span', null, label), el, help ? h('small', null, help) : null);
    return h('div', { class: 'settings-extra' },
      h('h2', null, 'Invoices, bills, and donations'),
      h('div', { class: 'form settings' },
        h('label', { class: 'field check' }, f.invoices, h('span', null, 'Use customers, suppliers, invoices, and bills')),
        h('label', { class: 'field check' }, f.donations, h('span', null, 'Record donations and send donor letters')),
        row('Organization name (on invoices and letters)', f.org),
        row('Mailing address', f.address),
        row('Phone', f.phone), row('Email', f.email),
        row('EIN (tax ID, for donor letters)', f.ein),
        row('Letters are signed by', f.signer), row('Signer\'s title', f.title),
        row('Default payment terms (days)', f.terms),
        row('Invoice footer', f.footer),
        row('Letter opening', f.intro, 'You can use {org}, {year}, and {donor}.'),
        row('Letter closing', f.closing, 'You can use {org}, {year}, and {ein}. Edit this to match your organization\'s tax status.'),
        row('Receivable account', f.ar, 'Created the first time you make an invoice.'),
        row('Payable account', f.ap, 'Created the first time you enter a bill.'),
        h('div', null, h('button', { class: 'primary', onclick: () => {
          const ar = f.ar.value.trim(), ap = f.ap.value.trim();
          for (const n of [ar, ap]) { const e = b.validAccountName(n); if (e) return err(new Error(e)); }
          B.setCfg(b, { invoices: f.invoices.checked, donations: f.donations.checked, org: f.org.value.trim() === b.settings.name ? '' : f.org.value.trim(),
            address: f.address.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), ein: f.ein.value.trim(),
            signer: f.signer.value.trim(), title: f.title.value.trim(), terms: /^\d+$/.test(f.terms.value.trim()) ? f.terms.value.trim() : '',
            footer: f.footer.value.trim(), intro: f.intro.value.trim(), closing: f.closing.value.trim(),
            ar: ar === 'Assets:Accounts Receivable' ? '' : ar, ap: ap === 'Liabilities:Accounts Payable' ? '' : ap });
          UI.toast('Saved');
          SL.render();
        } }, 'Save these settings'))));
  }

  SL.BizUI = {
    navItems, homeCards, refreshLists, settingsSection, openDoc, openGift,
    screens: {
      contacts: contactsScreen, invoices: (m) => docsScreen(m, 'invoice'), bills: (m) => docsScreen(m, 'bill'),
      doc: docScreen, donations: donationsScreen, letters: lettersScreen
    }
  };
})();
