/* Simple Ledger - quickui.js: "Add…" in plain words, deposit dialog, people setting */
(function () {
  'use strict';
  const { Money, Book, UI, Biz: B, Flow: F, Checks: C } = SL;
  const h = UI.h;
  const S = () => SL.state;
  const money = (c) => Money.format(c);

  const leaves = (b, types, skip) => [...b.accounts.values()].filter(a => !a.hidden && types.includes(a.type) && b.isLeaf(a.name) && a.name !== F.UNDEPOSITED && !(skip || []).includes(a.name)).map(a => a.name).sort((a, b) => a.localeCompare(b));
  const opts = (list, groups) => groups ? groups.map(([label, l]) => l.length ? h('optgroup', { label }, l.map(a => h('option', { value: a }, a))) : null) : list.map(a => h('option', { value: a }, a));
  const ctls = (b) => [B.cfg(b).ar, B.cfg(b).ap];

  function whoSelect(b, value) {
    const people = B.people(b).slice();
    if (!B.peopleOn(b)) return null;
    if (value && !people.includes(value)) people.push(value); // a former person stays selectable on their own old entries
    const s = h('select', null, [h('option', { value: '' }, 'Shared / everyone')].concat(people.map(p => h('option', { value: p }, p + (B.people(b).includes(p) ? '' : ' (former)')))));
    s.value = value || '';
    return s;
  }
  const field = (label, el, help) => h('label', { class: 'field' }, h('span', null, label), el, help ? h('small', null, help) : null);

  // ---------- chooser ----------
  async function open(prefAccount) {
    const b = S().book;
    if (!b) return;
    const choice = await UI.modal({ title: 'What happened?', body: h('div', { class: 'quick-choose' },
      h('button', { class: 'big', onclick: () => UI.lastDialogClose && UI.lastDialogClose('pay') }, h('strong', null, 'I paid someone'), h('small', null, 'Bills, purchases, rent, payments out')),
      h('button', { class: 'big', onclick: () => UI.lastDialogClose && UI.lastDialogClose('get') }, h('strong', null, 'I got paid'), h('small', null, 'Salary, donations, customer payments, refunds')),
      h('button', { class: 'big', onclick: () => UI.lastDialogClose && UI.lastDialogClose('move') }, h('strong', null, 'I moved money between my accounts'), h('small', null, 'Transfers, credit card payments, cash withdrawals')),
      B.people(b).length ? h('button', { class: 'big', onclick: () => UI.lastDialogClose && UI.lastDialogClose('pocket') }, h('strong', null, 'Import entries from a phone'), h('small', null, 'A file sent from Simple Ledger Pocket')) : null,
      h('button', { class: 'big', onclick: () => UI.lastDialogClose && UI.lastDialogClose('helper') }, h('strong', null, 'Import entries from a helper'), h('small', null, 'A Simple Ledger file where someone else entered part of the work'))),
      buttons: [{ label: 'Cancel', value: null }] });
    if (choice === 'pay') return payForm(prefAccount);
    if (choice === 'get') return getForm(prefAccount);
    if (choice === 'move') return moveForm(prefAccount);
    if (choice === 'pocket') return SL.PocketUI.importFile();
    if (choice === 'helper') return SL.MergeUI.importFile();
  }

  // ---------- I paid someone ----------
  async function payForm(pref) {
    const b = S().book;
    const from = leaves(b, ['Asset', 'Liability'], ctls(b));
    if (!from.length) return UI.alert('No account to pay from', 'Add a bank, cash, or card account first (Accounts).');
    const f = {
      date: h('input', { type: 'date', value: S().lastDate || Book.today() }),
      payee: h('input', { list: 'dl-payees', autocomplete: 'off' }),
      amount: h('input', { inputmode: 'decimal', placeholder: '0.00', size: 12 }),
      category: h('select', null, opts(null, [['What it was for', leaves(b, ['Expense'])], ['Something else (loan payment, tax, owner draw…)', leaves(b, ['Liability', 'Equity', 'Asset'], ctls(b).concat(from))]])),
      from: h('select', null, opts(from)),
      how: h('select', null, F.PAY_METHODS.map(([v, l]) => h('option', { value: v }, l))),
      code: h('input', { size: 10 }),
      print: h('input', { type: 'checkbox', checked: true }),
      memo: h('input', { placeholder: 'Optional' }),
      who: whoSelect(b)
    };
    const remembered = S().quickFrom;
    f.from.value = from.includes(pref) ? pref : from.includes(remembered) ? remembered : (from.find(a => /check/i.test(a)) || from[0]);
    const codeLabel = h('span', null, 'Check number');
    const printRow = h('label', { class: 'field check' }, f.print, h('span', null, 'Print the check after saving'));
    function sync() {
      const chk = f.how.value === 'check';
      codeLabel.textContent = chk ? 'Check number' : 'Confirmation or reference (optional)';
      printRow.style.display = chk ? '' : 'none';
      if (chk) f.code.value = C.nextNumber(b, f.from.value); else if (/^\d+$/.test(f.code.value)) f.code.value = '';
    }
    f.how.addEventListener('change', sync); f.from.addEventListener('change', sync); sync();
    f.payee.addEventListener('change', () => {
      const last = b.lastFor(f.payee.value.trim());
      if (!last) return;
      const e = last.postings.find(p => b.accountType(p.account) === 'Expense');
      if (e && [...f.category.options].some(o => o.value === e.account)) f.category.value = e.account;
    });
    let made = null;
    const r = await UI.modal({ title: 'I paid someone', wide: true,
      body: h('div', { class: 'form quick' },
        h('div', { class: 'doc-top' }, field('Date', f.date), field('Paid to', f.payee), field('Amount', f.amount), f.who ? field('For', f.who) : null),
        field('What it was for', f.category),
        h('div', { class: 'doc-top' }, field('Paid from', f.from), field('How', f.how), h('label', { class: 'field' }, codeLabel, f.code)),
        printRow, field('Memo', f.memo),
        h('p', { class: 'note' }, 'Paying with a credit card? Choose the card as "Paid from". Paying cash? Choose your Cash account. For a supplier bill you entered earlier, use Bills → Pay instead, so the bill is marked paid.')),
      buttons: [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true, validate: () => {
        try {
          made = F.payOut(b, { date: f.date.value, payee: f.payee.value, amount: Money.parse(f.amount.value), category: f.category.value, from: f.from.value, method: f.how.value, code: f.code.value, memo: f.memo.value, who: f.who && f.who.value });
          return '';
        } catch (e) { return e.message; }
      } }] });
    if (r !== 'ok') return;
    S().lastDate = made.date; S().quickFrom = f.from.value;
    if (f.how.value === 'check' && f.print.checked) { S().checkJob = { bank: f.from.value, ids: [made.id] }; SL.app.go('checksheet'); }
    else { UI.toast('Saved'); SL.render(); }
  }

  // ---------- I got paid ----------
  async function getForm(pref) {
    const b = S().book;
    const to = leaves(b, ['Asset'], ctls(b));
    if (!to.length) return UI.alert('No account', 'Add a bank or cash account first (Accounts).');
    const f = {
      date: h('input', { type: 'date', value: S().lastDate || Book.today() }),
      payee: h('input', { list: 'dl-payees', autocomplete: 'off' }),
      amount: h('input', { inputmode: 'decimal', placeholder: '0.00', size: 12 }),
      category: h('select', null, opts(null, [['What it was for', leaves(b, ['Revenue'])], ['Something else (refund, loan, owner money in…)', leaves(b, ['Expense', 'Liability', 'Equity'], ctls(b))]])),
      how: h('select', null, F.GET_METHODS.map(([v, l]) => h('option', { value: v }, l))),
      code: h('input', { size: 10 }),
      to: h('select', null, opts(to)),
      hold: h('select', null, [h('option', { value: 'now' }, 'Deposited into my account'), h('option', { value: 'hold' }, 'Not deposited yet (I am holding the check)')]),
      memo: h('input', { placeholder: 'Optional' }),
      who: whoSelect(b)
    };
    f.to.value = to.includes(pref) ? pref : (to.find(a => /check/i.test(a)) || to[0]);
    const codeLabel = h('span', null, 'Check number');
    const holdRow = field('Where is it?', f.hold);
    function sync() {
      const chk = f.how.value === 'check';
      codeLabel.textContent = chk ? 'Check number' : 'Reference (optional)';
      holdRow.style.display = chk ? '' : 'none';
    }
    f.how.addEventListener('change', sync); sync();
    f.payee.addEventListener('change', () => {
      const last = b.lastFor(f.payee.value.trim());
      if (!last) return;
      const e = last.postings.find(p => b.accountType(p.account) === 'Revenue');
      if (e && [...f.category.options].some(o => o.value === e.account)) f.category.value = e.account;
    });
    const r = await UI.modal({ title: 'I got paid', wide: true,
      body: h('div', { class: 'form quick' },
        h('div', { class: 'doc-top' }, field('Date', f.date), field('Received from', f.payee), field('Amount', f.amount), f.who ? field('For', f.who) : null),
        field('What it was for', f.category),
        h('div', { class: 'doc-top' }, field('How', f.how), h('label', { class: 'field' }, codeLabel, f.code), field('Deposit into', f.to)),
        holdRow, field('Memo', f.memo),
        h('p', { class: 'note' }, 'A check you are holding is kept under "' + F.UNDEPOSITED.split(':')[1] + '" until you use Deposit checks (on the Checks screen), so your bank balance stays right. A customer paying an invoice you made: use Invoices → Record payment instead.')),
      buttons: [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true, validate: () => {
        try {
          const t = F.receive(b, { date: f.date.value, payee: f.payee.value, amount: Money.parse(f.amount.value), category: f.category.value, to: f.to.value, method: f.how.value,
            hold: f.how.value === 'check' && f.hold.value === 'hold', code: f.code.value, memo: f.memo.value, who: f.who && f.who.value });
          S().lastDate = t.date; return '';
        } catch (e) { return e.message; }
      } }] });
    if (r === 'ok') { UI.toast('Saved'); SL.render(); }
  }

  // ---------- move money ----------
  async function moveForm(pref) {
    const b = S().book;
    const accts = leaves(b, ['Asset', 'Liability'], ctls(b));
    if (accts.length < 2) return UI.alert('Two accounts needed', 'Add another bank, cash, or card account first (Accounts).');
    const f = {
      date: h('input', { type: 'date', value: S().lastDate || Book.today() }),
      from: h('select', null, opts(accts)), to: h('select', null, opts(accts)),
      amount: h('input', { inputmode: 'decimal', placeholder: '0.00', size: 12 }),
      memo: h('input', { placeholder: 'For example: credit card payment' })
    };
    f.from.value = accts.includes(pref) ? pref : (accts.find(a => /check/i.test(a)) || accts[0]);
    f.to.value = accts.find(a => a !== f.from.value);
    const r = await UI.modal({ title: 'Move money between my accounts',
      body: h('div', { class: 'form quick' }, field('Date', f.date), field('From', f.from), field('To', f.to), field('Amount', f.amount), field('Memo', f.memo),
        h('p', { class: 'note' }, 'Paying a credit card bill: from your bank account to the card. Depositing cash: from Cash to the bank.')),
      buttons: [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true, validate: () => {
        try { const t = F.move(b, { date: f.date.value, from: f.from.value, to: f.to.value, amount: Money.parse(f.amount.value), memo: f.memo.value }); S().lastDate = t.date; return ''; }
        catch (e) { return e.message; }
      } }] });
    if (r === 'ok') { UI.toast('Saved'); SL.render(); }
  }

  // ---------- deposit received checks ----------
  async function depositDialog() {
    const b = S().book;
    const items = F.pending(b);
    if (!items.length) return UI.alert('Nothing to deposit', 'No received checks are waiting. Record one with Add → I got paid → Check → Not deposited yet.');
    const banks = leaves(b, ['Asset'], ctls(b));
    if (!banks.length) return UI.alert('No bank account', 'Add a bank account first.');
    const bank = h('select', null, opts(banks)); bank.value = banks.find(a => /check/i.test(a)) || banks[0];
    const date = h('input', { type: 'date', value: Book.today() });
    const totalEl = h('strong', null, '');
    const cbs = items.map(i => ({ i, cb: h('input', { type: 'checkbox', checked: true }) }));
    const upd = () => { totalEl.textContent = money(cbs.reduce((a, x) => a + (x.cb.checked ? x.i.amount : 0), 0)); };
    cbs.forEach(x => x.cb.addEventListener('change', upd)); upd();
    const r = await UI.modal({ title: 'Deposit checks', wide: true,
      body: h('div', { class: 'form' },
        h('div', { class: 'doc-top' }, field('Deposit into', bank), field('Date', date)),
        h('table', { class: 'grid' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Received'), h('th', null, 'Check no.'), h('th', null, 'From'), h('th', { class: 'num' }, 'Amount'))),
          h('tbody', null, cbs.map(({ i, cb }) => h('tr', null, h('td', null, cb), h('td', { class: 'date' }, i.date), h('td', null, i.number), h('td', null, i.payee), h('td', { class: 'num' }, money(i.amount)))))),
        h('div', { class: 'doc-foot' }, h('span', { class: 'spacer' }), h('span', null, 'Deposit total '), totalEl)),
      buttons: [{ label: 'Cancel', value: null }, { label: 'Make deposit', value: 'ok', primary: true, validate: () => {
        try { F.deposit(b, { date: date.value, bank: bank.value, ids: cbs.filter(x => x.cb.checked).map(x => x.i.id) }); return ''; } catch (e) { return e.message; }
      } }] });
    if (r === 'ok') { UI.toast('Deposit recorded'); SL.render(); }
    return r === 'ok';
  }

  // ---------- settings: people ----------
  function peopleSection() {
    const b = S().book;
    const box = h('div', { class: 'settings-extra' });
    const clean = (n) => {
      n = (n || '').trim();
      if (!n) throw new Error('Enter a name.');
      if (/[;|,]/.test(n)) throw new Error('A name cannot contain ; | or a comma.');
      if (/^shared$/i.test(n)) throw new Error('"Shared" is built in.');
      return n;
    };
    const known = () => [...B.people(b), ...B.formerPeople(b), ...B.personUsage(b).keys()];
    const exists = (n) => known().some(x => x.toLowerCase() === n.toLowerCase() && x !== n); // same name in different capitals
    const exact = (n) => known().includes(n);
    function draw() {
      UI.clear(box);
      const act = B.people(b), form = B.formerPeople(b), use = B.personUsage(b);
      const strays = [...use.keys()].filter(n => !act.includes(n) && !form.includes(n));
      const row = (n, status) => h('tr', null, h('td', null, n), h('td', { class: 'note' }, status), h('td', { class: 'num' }, (use.get(n) || 0) + ' transactions'),
        h('td', { class: 'row-actions' },
          h('button', { class: 'link', onclick: async () => {
            const v = await UI.form('Rename ' + n, [{ name: 'name', label: 'New name', value: n, required: true }], 'Rename',
              (v) => { try { const c = clean(v.name); if (exists(c)) return 'A name that differs only in capitals already exists. Type it exactly as it appears in the list.'; return ''; } catch (e) { return e.message; } });
            if (!v) return;
            const to = clean(v.name);
                        const merging = known().includes(to) && to !== n;
            if (merging && !(await UI.confirm('Merge two people?', '"' + n + '" and "' + to + '" will become one person. All of ' + n + '\'s entries move to ' + to + '.', 'Merge'))) return;
            B.renamePerson(b, n, to);
            const a2 = act.map(x => x === n ? to : x).filter((x, i, arr) => arr.indexOf(x) === i), f2 = form.map(x => x === n ? to : x).filter((x, i, arr) => arr.indexOf(x) === i && !a2.includes(x));
            B.savePeople(b, a2, f2); UI.toast('Renamed in ' + (use.get(n) || 0) + ' transactions'); SL.render();
          } }, 'Rename'),
          status === 'Active' ? h('button', { class: 'link', title: 'Keeps their history, but hides them from new entries', onclick: () => { B.savePeople(b, act.filter(x => x !== n), form.concat([n])); SL.render(); } }, 'Retire')
            : status === 'Former' ? h('button', { class: 'link', onclick: () => { B.savePeople(b, act.concat([n]), form.filter(x => x !== n)); SL.render(); } }, 'Bring back')
              : h('button', { class: 'link', onclick: () => { B.savePeople(b, act.concat([n]), form); SL.render(); } }, 'Add to list'),
          !(use.get(n) || 0) ? h('button', { class: 'link danger', onclick: () => { B.savePeople(b, act.filter(x => x !== n), form.filter(x => x !== n)); SL.render(); } }, 'Remove') : null));
    const add = h('input', { placeholder: 'New person', size: 20 });
    box.appendChild(h('h2', null, 'People (optional)'));
    box.appendChild(h('p', { class: 'note' }, 'Track income and expenses per person. A "For" choice appears on transactions and each split line, and Reports gets "Income and expenses by person". Entries with no choice count as Shared.'));
    if (act.length || form.length || strays.length) box.appendChild(h('table', { class: 'grid', style: { maxWidth: '640px' } }, h('tbody', null,
      [...act.map(n => [n, 'Active']), ...form.map(n => [n, 'Former']), ...strays.map(n => [n, 'Not in list'])].sort((x, y) => x[0].localeCompare(y[0], undefined, { sensitivity: 'base' })).map(([n, st]) => row(n, st)))));
    box.appendChild(h('div', { class: 'key-row' }, add, h('button', { class: 'primary', onclick: () => {
      try { const n = clean(add.value); if (exists(n) || exact(n)) throw new Error('That name already exists.'); B.savePeople(b, act.concat([n]), form); SL.render(); }
      catch (e) { UI.toast(e.message, 'error'); }
    } }, 'Add person')));
    box.appendChild(h('p', { class: 'note' }, 'Someone leaves: Retire them. Their past entries and reports stay, and they no longer appear in the choices. Typo or new name: Rename, and every entry follows. Entries are chosen from this list, never typed, so a misspelling cannot create a second person.'));
    }
    draw();
    return box;
  }

  SL.Quick = { open, depositDialog, peopleSection, whoSelect };
})();
