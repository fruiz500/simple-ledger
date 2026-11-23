/* Simple Ledger - app.js: screens and wiring */
(function () {
  'use strict';
  const { Money, Book, Storage, Templates, UI } = SL;
  const h = UI.h;

  const state = {
    book: null,
    doc: null,          // {name, handle, key}
    screen: 'welcome',
    account: null,      // for register screen
    showHidden: false,
    editId: null        // transaction being edited in the register entry row
  };
  SL.state = state;

  const $ = (id) => document.getElementById(id);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // ---------- helpers ----------
  function err(e) { UI.toast(e.message || String(e), 'error'); }
  function money(c, opts) { return Money.format(c, opts); }
  function amtCell(c, cls) { return h('td', { class: 'num ' + (cls || '') + (c < 0 ? ' neg' : '') }, c == null ? '' : money(c)); }
  function typeLabels(name) {
    const t = state.book.accountType(name);
    const L = {
      Asset: ['Deposit', 'Withdrawal'], Liability: ['Payment', 'Charge'], Equity: ['Decrease', 'Increase'],
      Revenue: ['Refund', 'Income'], Expense: ['Expense', 'Refund']
    }[t];
    // [debit label, credit label]
    const adv = state.book.settings.advanced;
    return adv ? [L[0] + ' (Dr)', L[1] + ' (Cr)'] : L;
  }
  function slug(s) { return (s || 'book').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'book'; }
  function equityAccount() {
    const b = state.book;
    const pref = Templates.get(b.settings.template).equity;
    if (b.accounts.has(pref)) return pref;
    const any = [...b.accounts.values()].find(a => a.type === 'Equity' && b.isLeaf(a.name));
    if (any) return any.name;
    b.addAccount('Equity:Opening Balances', 'Equity');
    return 'Equity:Opening Balances';
  }
  function visibleAccounts() {
    return [...state.book.accounts.values()].filter(a => !a.hidden).map(a => a.name).sort((a, b) => a.localeCompare(b));
  }
  function refreshLists() {
    UI.datalist('dl-accounts', visibleAccounts());
    UI.datalist('dl-payees', state.book.payeeNames());
    SL.BizUI.refreshLists();
  }
  function fyStartDate(date) {
    const fy = state.book.settings.fyStart;
    const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
    const sy = m >= fy ? y : y - 1;
    return sy + '-' + String(fy).padStart(2, '0') + '-01';
  }

  // ---------- top-level render ----------
  function render() {
    renderToolbar();
    renderSidebar();
    const main = UI.clear($('main'));
    document.body.classList.toggle('no-book', !state.book);
    if (!state.book) return renderWelcome(main);
    refreshLists();
    const screens = { home: renderHome, accounts: renderAccounts, register: renderRegister, journal: renderJournal, reports: (m) => SL.ReportUI.render(m), reconcile: (m) => SL.ReconcileUI.render(m), settings: renderSettings, source: renderSource, help: (m) => SL.Home.helpScreen(m), review: (m) => SL.AIUI.reviewScreen(m) };
    Object.assign(screens, SL.BizUI.screens, SL.ChecksUI.screens);
    (screens[state.screen] || renderHome)(main);
  }
  SL.render = render;

  function go(screen, account) {
    state.screen = screen;
    state.account = account || null;
    state.editId = null;
    render();
    $('main').scrollTop = 0;
  }

  function renderToolbar() {
    const b = state.book;
    $('book-title').textContent = b ? b.settings.name : 'Simple Ledger';
    $('file-name').textContent = state.doc ? state.doc.name : '';
    $('dirty').classList.toggle('on', !!(b && b.dirty));
    $('dirty').title = b && b.dirty ? 'Unsaved changes' : 'Saved';
    for (const id of ['btn-add', 'btn-save', 'btn-saveas', 'btn-close']) $(id).disabled = !b;
    document.title = (b && b.dirty ? '• ' : '') + (b ? b.settings.name + ' - ' : '') + 'Simple Ledger';
  }

  function renderSidebar() {
    const nav = UI.clear($('nav'));
    const b = state.book;
    if (!b) return;
    const item = (label, screen, account, cls) => h('a', {
      href: '#', class: 'nav-item ' + (cls || '') + ((state.screen === screen && state.account === (account || null)) ? ' active' : ''),
      onclick: (e) => { e.preventDefault(); go(screen, account); }
    }, label);
    nav.appendChild(item('Home', 'home'));
    nav.appendChild(item('Accounts', 'accounts'));
    nav.appendChild(item('All transactions', 'journal'));
    nav.appendChild(item('Reports', 'reports'));
    nav.appendChild(item('Reconcile', 'reconcile'));
    nav.appendChild(item('Checks', 'checks'));
    { const n = SL.AIUI.count(b); nav.appendChild(item(n ? 'Review (' + n + ')' : 'Review', 'review')); }
    for (const n of SL.BizUI.navItems(b, item)) nav.appendChild(n);
    const regs = [...b.accounts.values()].filter(a => !a.hidden && (a.type === 'Asset' || a.type === 'Liability') && b.isLeaf(a.name))
      .sort((x, y) => x.name.split(':').pop().localeCompare(y.name.split(':').pop()) || x.name.localeCompare(y.name));
    if (regs.length) {
      nav.appendChild(h('div', { class: 'nav-head' }, 'Registers'));
      for (const a of regs) {
        const bal = b.displayBalance(a.name);
        nav.appendChild(h('a', {
          href: '#', class: 'nav-item reg' + (state.screen === 'register' && state.account === a.name ? ' active' : ''),
          title: a.name, onclick: (e) => { e.preventDefault(); go('register', a.name); }
        }, h('span', { class: 'nav-name' }, Book.leafOf(a.name)), h('span', { class: 'nav-bal' + (bal < 0 ? ' neg' : '') }, money(bal))));
      }
    }
    nav.appendChild(h('div', { class: 'nav-head' }, 'Book'));
    nav.appendChild(item('Settings', 'settings'));
    if (b.settings.advanced) nav.appendChild(item('Journal text', 'source'));
    nav.appendChild(item('Help', 'help'));
  }

  async function tryDemo() {
    if (!(await confirmDiscard())) return;
    const book = SL.Demo.build();
    book.dirty = true;
    attach(book, { name: 'demo.journal', handle: null, key: 'demo' });
    UI.toast('This is a demo. Save it only if you want to keep it.');
  }

  // ---------- welcome ----------
  async function renderWelcome(main) {
    const wrap = h('div', { class: 'welcome' },
      h('h1', null, 'Simple Ledger'),
      h('p', { class: 'lead' }, 'Double-entry bookkeeping for households, small businesses, and nonprofits. Your books live in one plain-text file that you own.'),
      h('div', { class: 'big-buttons' },
        h('button', { class: 'primary', onclick: newBook }, 'New book…'),
        h('button', { onclick: openBook }, 'Open book…'),
        h('button', { onclick: tryDemo }, 'Try the demo')),
      !Storage.canWriteInPlace ? h('p', { class: 'note' }, 'This browser cannot save back to the same file, so Save downloads a new copy. Chrome or Edge on a computer can save in place.') : null);
    main.appendChild(wrap);
    const recent = await Storage.recent();
    const drafts = await Storage.drafts();
    if (recent.length) {
      wrap.appendChild(h('h2', null, 'Recent books'));
      wrap.appendChild(h('ul', { class: 'recent' }, recent.map(r => h('li', null,
        h('a', { href: '#', onclick: (e) => { e.preventDefault(); openRecent(r); } }, r.name),
        h('small', null, ' ' + new Date(r.time).toLocaleString()),
        h('button', { class: 'link', title: 'Remove from list', onclick: async () => { await Storage.removeRecent(r.name); render(); } }, '×')))));
    }
    if (drafts.length) {
      wrap.appendChild(h('h2', null, 'Unsaved work'));
      wrap.appendChild(h('p', { class: 'note' }, 'These books had changes that were never saved to a file.'));
      wrap.appendChild(h('ul', { class: 'recent' }, drafts.map(d => h('li', null,
        h('a', { href: '#', onclick: (e) => { e.preventDefault(); openDraft(d); } }, d.name),
        h('small', null, ' ' + new Date(d.time).toLocaleString()),
        h('button', { class: 'link', title: 'Discard', onclick: async () => {
          if (await UI.confirm('Discard unsaved work?', 'The unsaved changes to ' + d.name + ' will be lost.', 'Discard', true)) { await Storage.clearDraft(d.key); render(); }
        } }, '×')))));
    }
  }

  // ---------- home ----------
  function renderHome(main) {
    const b = state.book;
    const t = Book.today();
    const monthStart = t.slice(0, 8) + '01';
    const fyStart = fyStartDate(t);
    const netWorth = b.totalByType('Asset') + b.totalByType('Liability');
    const card = (label, value, sub) => h('div', { class: 'card' }, h('div', { class: 'card-label' }, label),
      h('div', { class: 'card-value' + (value < 0 ? ' neg' : '') }, money(value)), sub ? h('div', { class: 'card-sub' }, sub) : null);
    const incM = -b.totalByType('Revenue', monthStart, t), expM = b.totalByType('Expense', monthStart, t);
    const incY = -b.totalByType('Revenue', fyStart, t), expY = b.totalByType('Expense', fyStart, t);
    const nonprofit = b.settings.template === 'nonprofit';
    main.appendChild(h('h1', null, b.settings.name));
    main.appendChild(h('div', { class: 'cards' },
      card(nonprofit ? 'Net assets' : 'Net worth', netWorth, 'Assets minus liabilities'),
      card('This month', incM - expM, 'Income ' + money(incM) + ' · Expenses ' + money(expM)),
      card('Fiscal year to date', incY - expY, 'Since ' + fyStart)));
    const bizCards = SL.BizUI.homeCards(b);
    if (bizCards) main.appendChild(bizCards);
    main.appendChild(SL.Home.extras(b));
    const accts = [...b.accounts.values()].filter(a => !a.hidden && (a.type === 'Asset' || a.type === 'Liability') && b.isLeaf(a.name))
      .sort((x, y) => x.name.localeCompare(y.name));
    const tbl = h('table', { class: 'grid' },
      h('thead', null, h('tr', null, h('th', null, 'Account'), h('th', { class: 'num' }, 'Balance'))),
      h('tbody', null, accts.map(a => h('tr', { class: 'click', onclick: () => go('register', a.name) },
        h('td', null, a.name), amtCell(b.displayBalance(a.name))))));
    main.appendChild(h('h2', null, 'Bank, cash, and credit accounts'));
    main.appendChild(tbl);
    if (!b.txns.length) {
      main.appendChild(h('div', { class: 'tip' },
        h('strong', null, 'Getting started. '),
        'Go to ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); go('accounts'); } }, 'Accounts'),
        ', rename or add the bank and card accounts you have, and use "Opening balance" on each one. Then open a register and start entering transactions.'));
    }
    if (b.warnings.length) {
      main.appendChild(h('h2', null, 'Notes about this file'));
      main.appendChild(h('ul', { class: 'warnings' }, b.warnings.slice(0, 50).map(w => h('li', null, w))));
    }
  }

  // ---------- accounts ----------
  function renderAccounts(main) {
    const b = state.book;
    main.appendChild(h('div', { class: 'screen-head' },
      h('h1', null, 'Accounts'),
      h('div', { class: 'actions' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: state.showHidden, onchange: (e) => { state.showHidden = e.target.checked; render(); } }), ' Show hidden'),
        h('button', { class: 'primary', onclick: () => addAccountDialog('') }, 'Add account…'))));
    const tbody = h('tbody');
    const walk = (parent, depth) => {
      const kids = b.children(parent);
      if (!parent) { const rank = (n) => Book.TYPES.indexOf(b.accounts.get(n).type); kids.sort((x, y) => rank(x) - rank(y) || x.localeCompare(y)); }
      for (const name of kids) {
        const a = b.accounts.get(name);
        if (a.hidden && !state.showHidden) continue;
        const leaf = b.isLeaf(name);
        const used = b.accountUsed(name);
        const bal = b.displayBalance(name);
        tbody.appendChild(h('tr', { class: (a.hidden ? 'hidden-acct ' : '') + (depth === 0 ? 'top' : '') },
          h('td', { style: { paddingLeft: (8 + depth * 20) + 'px' } },
            h('a', { href: '#', onclick: (e) => { e.preventDefault(); go('register', name); } }, Book.leafOf(name)),
            a.hidden ? h('small', null, ' (hidden)') : null),
          h('td', { class: 'type' }, a.type),
          h('td', { class: 'num' + (bal < 0 ? ' neg' : '') + (leaf ? '' : ' subtotal') }, money(bal)),
          h('td', { class: 'row-actions' },
            h('button', { class: 'link', onclick: () => addAccountDialog(name) }, 'Add sub-account'),
            h('button', { class: 'link', onclick: () => renameDialog(name) }, 'Rename'),
            leaf && (a.type === 'Asset' || a.type === 'Liability') ? h('button', { class: 'link', onclick: () => openingDialog(name) }, 'Opening balance') : null,
            depth === 0 ? null : h('button', { class: 'link', onclick: () => { b.setHidden(name, !a.hidden); render(); } }, a.hidden ? 'Show' : 'Hide'),
            !used ? h('button', { class: 'link danger', onclick: () => deleteAccount(name) }, 'Delete') : null)));
        walk(name, depth + 1);
      }
    };
    walk('', 0);
    main.appendChild(h('table', { class: 'grid accounts' },
      h('thead', null, h('tr', null, h('th', null, 'Account'), h('th', null, 'Type'), h('th', { class: 'num' }, 'Balance'), h('th', null, ''))),
      tbody));
    main.appendChild(h('p', { class: 'note' }, 'Accounts with transactions cannot be deleted; hide them instead. Balances include sub-accounts.'));
  }

  async function addAccountDialog(parent) {
    const b = state.book;
    const parents = [['', '(top level)'], ...[...b.accounts.keys()].sort((a, b) => a.localeCompare(b)).map(n => [n, n])];
    const v = await UI.form('Add account', [
      { name: 'parent', label: 'Inside', type: 'select', options: parents, value: parent,
        onchange: (inp, all) => { if (inp.value) all.type.value = b.accountType(inp.value); } },
      { name: 'name', label: 'Name', placeholder: 'e.g. Chase Checking (Ana)', required: true },
      { name: 'type', label: 'Type', type: 'select', options: Book.TYPES.map(t => [t, t]), value: parent ? b.accountType(parent) : 'Expense',
        help: 'Asset: bank, cash, things owned. Liability: cards, loans. Equity: opening balances, owner. Revenue: income. Expense: spending.' }
    ], 'Add', (v) => {
      if (v.name.includes(':')) return 'Use "Inside" to place the account; the name cannot contain ":".';
      const full = v.parent ? v.parent + ':' + v.name : v.name;
      return b.validAccountName(full) || (b.accounts.has(full) ? 'That account already exists.' : '');
    });
    if (!v) return;
    try {
      const full = v.parent ? v.parent + ':' + v.name : v.name;
      b.addAccount(full, v.type);
      UI.toast('Added ' + full);
      render();
    } catch (e) { err(e); }
  }

  async function renameDialog(name) {
    const b = state.book;
    const v = await UI.form('Rename or move account', [
      { name: 'full', label: 'Full name', value: name, help: 'Use ":" to place it under another account, e.g. Assets:Bank:Savings (Ana).', required: true }
    ], 'Rename', (v) => v.full === name ? '' : (b.validAccountName(v.full) || (b.accounts.has(v.full) && !b.accounts.get(v.full).implied ? 'That name is already used.' : '')));
    if (!v || v.full === name) return;
    try {
      if (b.accounts.has(v.full)) b.accounts.delete(v.full); // an implied parent placeholder
      b.renameAccount(name, v.full);
      if (state.account === name) state.account = v.full;
      render();
    } catch (e) { err(e); }
  }

  async function deleteAccount(name) {
    if (!(await UI.confirm('Delete account?', 'Delete ' + name + ' and any empty sub-accounts?', 'Delete', true))) return;
    try { state.book.deleteAccount(name); render(); } catch (e) { err(e); }
  }

  async function openingDialog(name) {
    const b = state.book;
    const v = await UI.form('Opening balance: ' + name, [
      { name: 'date', label: 'As of', type: 'date', value: Book.today(), required: true },
      { name: 'amount', label: b.accountType(name) === 'Liability' ? 'Amount owed' : 'Balance', type: 'amount', required: true,
        help: 'Use the balance on your statement for that date. It is recorded against ' + equityAccount() + '.' }
    ], 'Record', (v) => Money.parse(v.amount) == null ? 'Enter a valid amount.' : '');
    if (!v) return;
    try {
      const amt = Money.parse(v.amount) * b.normalSign(name);
      const eq = equityAccount();
      b.addTxn(Object.assign(b.blank(), {
        date: v.date, payee: 'Opening balance',
        postings: [{ account: name, amount: amt, status: '', text: '', tags: {} },
          { account: eq, amount: -amt, status: '', text: '', tags: {} }]
      }));
      UI.toast('Opening balance recorded');
      render();
    } catch (e) { err(e); }
  }

  // ---------- register ----------
  function renderRegister(main) {
    const b = state.book;
    const name = state.account;
    if (!b.accounts.has(name)) return go('home');
    const [drLabel, crLabel] = typeLabels(name);
    const sign = b.normalSign(name);
    const rows = b.register(name);
    const leaf = b.isLeaf(name);
    main.appendChild(h('div', { class: 'screen-head' },
      h('div', null, h('h1', null, Book.leafOf(name)), h('div', { class: 'subtitle' }, name + ' · ' + b.accountType(name))),
      h('div', { class: 'reg-right' },
        leaf && ['Asset', 'Liability'].includes(b.accountType(name)) ? h('div', { class: 'reg-actions' },
          h('button', { onclick: () => SL.ImportUI.openImport(name) }, 'Import…'),
          h('button', { onclick: () => SL.ReconcileUI.begin(name) }, 'Reconcile…')) : null,
        h('div', { class: 'reg-balance' }, h('small', null, 'Balance'), h('strong', { class: b.displayBalance(name) < 0 ? 'neg' : '' }, money(b.displayBalance(name)))))));

    const showWho = SL.Biz.peopleOn(b);
    const tbody = h('tbody');
    for (const r of rows) {
      const t = r.txn;
      const dr = r.amount > 0 ? r.amount : null, cr = r.amount < 0 ? -r.amount : null;
      const statusBtn = h('td', {
        class: 'status s-' + (r.status === 'R' ? 'R' : r.status === '*' ? 'c' : r.status === '!' ? 'p' : 'n'),
        title: r.status === 'R' ? 'Reconciled' : r.status === '*' ? 'Cleared (click to unmark)' : r.status === '!' ? 'Pending (click to clear)' : 'Not cleared (click to clear)',
        onclick: (e) => {
          e.stopPropagation();
          if (r.status === 'R' || r.locked || !leaf) return;
          try { b.setPostingStatus(t.id, name, r.status === '*' ? '' : '*'); render(); } catch (x) { err(x); }
        }
      }, r.status === 'R' ? 'R' : r.status === '*' ? 'c' : r.status === '!' ? '!' : '');
      tbody.appendChild(h('tr', {
        class: 'click' + (r.locked ? ' locked' : '') + (state.editId === t.id ? ' editing' : ''),
        title: r.locked ? 'Locked period' : '',
        onclick: () => editInRegister(t, r)
      },
        h('td', { class: 'date' }, t.date),
        h('td', { class: 'numcol' }, t.code),
        h('td', null, t.payee),
        h('td', { class: 'xfer' }, r.transfer),
        h('td', { class: 'memo' }, t.memo),
        showWho ? h('td', { class: 'who' }, SL.Biz.personOf(t, t.postings.find(p => p.account === name)) || '') : null,
        statusBtn,
        amtCell(dr), amtCell(cr), amtCell(r.balance, 'bal')));
    }
    const table = h('table', { class: 'grid register' },
      h('thead', null, h('tr', null,
        h('th', null, 'Date'), h('th', { class: 'numcol' }, 'Num'), h('th', null, 'Payee'), h('th', { class: 'xfer' }, 'Account'),
        h('th', { class: 'memo' }, 'Memo'), showWho ? h('th', { class: 'who' }, 'For') : null, h('th', { title: 'c = cleared, R = reconciled' }, 'C'),
        h('th', { class: 'num' }, drLabel), h('th', { class: 'num' }, crLabel), h('th', { class: 'num' }, 'Balance'))),
      tbody);
    const scroller = h('div', { class: 'reg-scroll' }, table);
    main.appendChild(scroller);
    if (!rows.length) scroller.appendChild(h('p', { class: 'empty' }, 'No transactions yet. Enter one below.'));
    if (leaf) main.appendChild(entryForm(name, drLabel, crLabel, sign));
    else main.appendChild(h('p', { class: 'note' }, 'This account has sub-accounts. Enter transactions in a sub-account register.'));
    setTimeout(() => { scroller.scrollTop = scroller.scrollHeight; }, 0);
  }

  function entryForm(name, drLabel, crLabel) {
    const b = state.book;
    const editing = state.editId ? b.getTxn(state.editId) : null;
    const f = {};
    const inp = (key, attrs) => (f[key] = h('input', Object.assign({ autocomplete: 'off' }, attrs)));
    const lastDate = state.lastDate || Book.today();
    let mine = null, other = null;
    if (editing) {
      mine = editing.postings.find(p => p.account === name);
      other = editing.postings.find(p => p !== mine);
    }
    const form = h('form', { class: 'entry' + (editing ? ' editing' : ''), onsubmit: (e) => { e.preventDefault(); save(); } },
      h('div', { class: 'entry-title' }, editing ? 'Edit transaction' : 'New transaction'),
      h('div', { class: 'entry-row' },
        h('label', { class: 'f-date' }, 'Date', inp('date', { type: 'date', value: editing ? editing.date : lastDate, required: true })),
        h('label', { class: 'f-num' }, 'Num', inp('code', { value: editing ? editing.code : '', size: 5 })),
        h('label', { class: 'f-payee' }, 'Payee', inp('payee', { list: 'dl-payees', value: editing ? editing.payee : '' })),
        h('label', { class: 'f-acct' }, 'Account', inp('acct', { list: 'dl-accounts', value: other ? other.account : '', placeholder: 'e.g. Expenses:Groceries' })),
        h('label', { class: 'f-memo' }, 'Memo', inp('memo', { value: editing ? editing.memo : '' })),
        (f.who = SL.Quick.whoSelect(b, editing ? (() => { const w = [...new Set(editing.postings.map(p => SL.Biz.personOf(editing, p)).filter(Boolean))]; return w.length === 1 ? w[0] : ''; })() : '')) ? h('label', { class: 'f-who' }, 'For', f.who) : null,
        h('label', { class: 'f-amt' }, drLabel, inp('dr', { inputmode: 'decimal', value: mine && mine.amount > 0 ? Money.toInput(mine.amount) : '' })),
        h('label', { class: 'f-amt' }, crLabel, inp('cr', { inputmode: 'decimal', value: mine && mine.amount < 0 ? Money.toInput(-mine.amount) : '' }))),
      h('div', { class: 'entry-buttons' },
        h('button', { type: 'submit', class: 'primary' }, editing ? 'Save changes' : 'Enter'),
        h('button', { type: 'button', onclick: () => splitFromForm() }, 'Split…'),
        editing ? h('button', { type: 'button', onclick: () => { state.editId = null; render(); } }, 'Cancel') : null,
        editing ? h('button', { type: 'button', class: 'danger', onclick: () => del() }, 'Delete') : null));

    f.dr.addEventListener('input', () => { if (f.dr.value) f.cr.value = ''; });
    f.cr.addEventListener('input', () => { if (f.cr.value) f.dr.value = ''; });
    // payee memory: fill account and amount from the last transaction with this payee
    f.payee.addEventListener('change', () => {
      if (editing || f.acct.value || f.dr.value || f.cr.value) return;
      const last = b.lastFor(f.payee.value.trim(), name) || b.lastFor(f.payee.value.trim());
      if (!last) return;
      if (last.postings.length !== 2) return;
      const lm = last.postings.find(p => p.account === name);
      // same register: reuse the other side; another register: reuse the income or expense side
      const lo = lm ? last.postings.find(p => p !== lm)
        : last.postings.find(p => ['Expense', 'Revenue'].includes(b.accountType(p.account)));
      if (lo && b.accounts.has(lo.account) && lo.account !== name) f.acct.value = lo.account;
      if (lm) { if (lm.amount > 0) f.dr.value = Money.toInput(lm.amount); else f.cr.value = Money.toInput(-lm.amount); }
    });

    function readAmount() {
      const dr = f.dr.value.trim(), cr = f.cr.value.trim();
      if (dr && cr) throw new Error('Enter an amount in only one column.');
      const v = Money.parse(dr || cr);
      if (v == null) throw new Error('Enter an amount.');
      if (v < 0) throw new Error('Enter a positive amount; use the other column to reverse the direction.');
      return dr ? v : -v;
    }
    async function ensureAcct(acct) {
      if (!acct) throw new Error('Enter the other account (where the money came from or went).');
      if (b.accounts.has(acct)) return acct;
      const errMsg = b.validAccountName(acct);
      if (errMsg) throw new Error(errMsg);
      const ok = await UI.confirm('New account?', '"' + acct + '" does not exist. Create it as ' + b.inferType(acct) + '?', 'Create');
      if (!ok) throw new Error('Choose an existing account.');
      b.addAccount(acct, b.inferType(acct));
      return acct;
    }
    function base() {
      return Object.assign(b.blank(), {
        date: f.date.value, code: f.code.value.trim(), payee: f.payee.value.trim(), memo: f.memo.value.trim(),
        tags: editing ? Object.assign({}, editing.tags) : {}, text: editing ? editing.text : '',
        extraComments: editing ? editing.extraComments : []
      });
    }
    function baseWho(t) { if (f.who) { if (f.who.value) t.tags.for = SL.Biz.enc(f.who.value); else delete t.tags.for; } return t; }
    async function save() {
      try {
        if (editing && !(editing.postings.length === 2 && mine && other)) return splitFromForm();
        const amt = readAmount();
        const acct = await ensureAcct(f.acct.value.trim());
        if (acct === name) throw new Error('Pick a different account than this register.');
        const t = baseWho(base());
        const keep = (p, acc) => p && p.account === acc ? { status: p.status, text: p.text, tags: Object.assign({}, p.tags) } : { status: '', text: '', tags: {} };
        t.postings = [
          Object.assign({ account: name, amount: amt }, keep(mine, name)),
          Object.assign({ account: acct, amount: -amt }, keep(other, acct))
        ];
        if (f.who) for (const p of t.postings) delete p.tags.for; // the For choice applies to the whole entry
        if (editing) b.updateTxn(editing.id, t); else b.addTxn(t);
        state.lastDate = t.date;
        state.editId = null;
        render();
        setTimeout(() => { const p = document.querySelector('.entry input[list=dl-payees]'); if (p) p.focus(); }, 0);
      } catch (e) { err(e); }
    }
    async function del() {
      if (!(await UI.confirm('Delete transaction?', 'Delete this transaction? It is recorded in the edit log.', 'Delete', true))) return;
      try { b.deleteTxn(editing.id); state.editId = null; render(); } catch (e) { err(e); }
    }
    async function splitFromForm() {
      let t;
      if (editing) t = JSON.parse(JSON.stringify(editing));
      else {
        t = baseWho(base());
        let amt = null;
        try { amt = readAmount(); } catch (e) { /* empty is fine */ }
        t.postings = [{ account: name, amount: amt || 0, status: '', text: '', tags: {} }];
        const acct = f.acct.value.trim();
        if (acct && amt) t.postings.push({ account: acct, amount: -amt, status: '', text: '', tags: {} });
      }
      const res = await splitEditor(t, editing ? editing.id : null);
      if (res) { state.editId = null; render(); }
    }
    return form;
  }

  function editInRegister(t, r) {
    const b = state.book;
    if (SL.Biz.docKind(t)) return SL.BizUI.openDoc(t.id);
    if (t.tags && t.tags.gift && !r.locked) return SL.BizUI.openGift(t.id);
    if (r.locked) return UI.alert('Locked period', 'The books are locked through ' + b.settings.lockDate + '. To correct this entry, enter a new transaction dated after the lock.');
    if (r.simple && b.isLeaf(state.account) && t.postings.length === 2) { state.editId = t.id; render(); return; }
    splitEditor(JSON.parse(JSON.stringify(t)), t.id).then(res => { if (res) render(); });
  }

  // ---------- split editor ----------
  async function splitEditor(t, id) {
    const b = state.book;
    const locked = id && b.isLocked(b.getTxn(id));
    const f = {
      date: h('input', { type: 'date', value: t.date }),
      code: h('input', { value: t.code || '', size: 6 }),
      payee: h('input', { list: 'dl-payees', value: t.payee || '' }),
      memo: h('input', { value: t.memo || '' })
    };
    const people = SL.Biz.peopleOn(b);
    const tbody = h('tbody');
    const diffEl = h('span', { class: 'diff' });
    const lines = [];
    function addLine(p) {
      const acct = h('input', { list: 'dl-accounts', value: p ? p.account : '' });
      const note = h('input', { value: p ? p.text || '' : '' });
      const dr = h('input', { inputmode: 'decimal', class: 'amt', value: p && p.amount > 0 ? Money.toInput(p.amount) : '' });
      const cr = h('input', { inputmode: 'decimal', class: 'amt', value: p && p.amount < 0 ? Money.toInput(-p.amount) : '' });
      const rec = p && p.tags && p.tags.rec;
      const who = SL.Quick.whoSelect(b, SL.Biz.personOf(t, p || null));
      const line = { acct, note, dr, cr, who, src: p || null };
      const row = h('tr', null, h('td', null, acct), h('td', null, note), people ? h('td', null, who) : null, h('td', null, dr), h('td', null, cr),
        h('td', null, rec ? h('span', { title: 'Reconciled ' + rec }, 'R') :
          h('button', { type: 'button', class: 'link danger', title: 'Remove line', onclick: () => { lines.splice(lines.indexOf(line), 1); row.remove(); update(); } }, '×')));
      line.row = row;
      if (rec) { acct.disabled = dr.disabled = cr.disabled = true; }
      for (const x of [dr, cr]) x.addEventListener('input', () => { if (x.value) (x === dr ? cr : dr).value = ''; update(); });
      lines.push(line);
      tbody.appendChild(row);
      return line;
    }
    function amountOf(l) {
      const d = Money.parse(l.dr.value), c = Money.parse(l.cr.value);
      if (l.dr.value.trim() && d == null) return NaN;
      if (l.cr.value.trim() && c == null) return NaN;
      return (d || 0) - (c || 0);
    }
    function update() {
      const s = lines.reduce((acc, l) => acc + (amountOf(l) || 0), 0);
      diffEl.textContent = s === 0 ? 'Balanced' : 'Out of balance by ' + money(Math.abs(s)) + (s > 0 ? ' (needs more credit)' : ' (needs more debit)');
      diffEl.classList.toggle('bad', s !== 0);
      return s;
    }
    function fill() {
      const s = update();
      if (!s) return;
      let l = lines.find(x => !x.dr.value.trim() && !x.cr.value.trim() && !x.acct.disabled) || addLine(null);
      if (s > 0) l.cr.value = Money.toInput(s); else l.dr.value = Money.toInput(-s);
      update();
      l.acct.focus();
    }
    for (const p of t.postings) addLine(p);
    while (lines.length < 2) addLine(null);
    update();
    const body = h('div', { class: 'split' },
      locked ? h('p', { class: 'note warn' }, 'This transaction is in a locked period and cannot be changed.') : null,
      h('div', { class: 'entry-row' },
        h('label', { class: 'f-date' }, 'Date', f.date), h('label', { class: 'f-num' }, 'Num', f.code),
        h('label', { class: 'f-payee' }, 'Payee', f.payee), h('label', { class: 'f-memo' }, 'Memo', f.memo)),
      h('table', { class: 'grid split-lines' },
        h('thead', null, h('tr', null, h('th', null, 'Account'), h('th', null, 'Line memo'), people ? h('th', null, 'For') : null,
          h('th', { class: 'num', title: 'Increases assets and expenses; decreases liabilities, equity, and income' }, 'Debit'),
          h('th', { class: 'num', title: 'Increases liabilities, equity, and income; decreases assets and expenses' }, 'Credit'), h('th', null, ''))),
        tbody),
      h('div', { class: 'split-foot' },
        h('button', { type: 'button', onclick: () => { addLine(null).acct.focus(); } }, 'Add line'),
        h('button', { type: 'button', onclick: fill }, 'Fill difference'),
        diffEl),
      h('p', { class: 'note' }, 'Debit means money flowing into an account: more in a bank account, more spent on an expense, less owed on a card.'));

    const buttons = [];
    if (id && !locked) buttons.push({ label: 'Delete', value: 'delete', danger: true, left: true });
    buttons.push({ label: 'Cancel', value: null });
    if (!locked) buttons.push({
      label: id ? 'Save changes' : 'Save', value: 'save', primary: true,
      validate: () => {
        try { build(true); return ''; } catch (e) { return e.message; }
      }
    });
    let built = null;
    function build(check) {
      const out = Object.assign(b.blank(), {
        date: f.date.value, code: f.code.value.trim(), payee: f.payee.value.trim(), memo: f.memo.value.trim(),
        tags: Object.assign({}, t.tags), text: t.text || '', extraComments: t.extraComments || [], postings: []
      });
      for (const l of lines) {
        const acct = l.acct.value.trim();
        const a = amountOf(l);
        if (!acct && !a) continue;
        if (isNaN(a)) throw new Error('Check the amounts; one is not a number.');
        if (!acct) throw new Error('A line with an amount needs an account.');
        if (!b.accounts.has(acct)) throw new Error('Unknown account "' + acct + '". Add it on the Accounts screen first.');
        const src = l.src && l.src.account === acct ? l.src : null;
        out.postings.push({ account: acct, amount: a, status: src ? src.status : '', text: l.note.value.trim(),
          tags: src ? Object.assign({}, src.tags) : {}, assertion: null });
        if (people) { const pp = out.postings[out.postings.length - 1]; if (l.who.value) pp.tags.for = SL.Biz.enc(l.who.value); else delete pp.tags.for; }
      }
      if (people) {
        // one person on every line: keep it on the whole entry; otherwise per line
        const ws = [...new Set(out.postings.map(p => p.tags.for || ''))];
        delete out.tags.for;
        if (ws.length === 1 && ws[0]) { out.tags.for = ws[0]; for (const p of out.postings) delete p.tags.for; }
      }
      if (check) {
        const e = b.validateTxn(out);
        if (e) throw new Error(e);
      }
      built = out;
      return out;
    }
    const r = await UI.modal({ title: id ? 'Edit transaction' : 'Split transaction', body, buttons, wide: true, sticky: true });
    try {
      if (r === 'delete') {
        if (!(await UI.confirm('Delete transaction?', 'Delete this transaction? It is recorded in the edit log.', 'Delete', true))) return false;
        b.deleteTxn(id);
        return true;
      }
      if (r === 'save') {
        if (id) b.updateTxn(id, built); else b.addTxn(built);
        state.lastDate = built.date;
        return true;
      }
    } catch (e) { err(e); }
    return false;
  }

  // ---------- all transactions (general journal) ----------
  function renderJournal(main) {
    const b = state.book;
    const all = b.sortedTxns();
    const q = state.jq || '';
    main.appendChild(h('div', { class: 'screen-head' },
      h('h1', null, 'All transactions'),
      h('div', { class: 'actions' },
        SL.Biz.peopleOn(b) ? (() => { const s = h('select', { onchange: (e) => { state.jwho = e.target.value; drawList(); } },
          [['', 'Everyone'], ...[...new Set([...SL.Biz.people(b), ...SL.Biz.formerPeople(b), ...SL.Biz.personUsage(b).keys()])].sort((x, y) => x.localeCompare(y)).map(n => [n, n]), ['(shared)', 'Shared only']].map(([v, l]) => h('option', { value: v }, l)));
          s.value = state.jwho || ''; return s; })() : null,
        h('input', { type: 'search', placeholder: 'Search payee, memo, account, amount', value: q, oninput: (e) => { state.jq = e.target.value; drawList(); } }),
        h('button', { class: 'primary', onclick: async () => { const t = b.blank(); t.date = state.lastDate || Book.today(); if (await splitEditor(t, null)) render(); } }, 'New transaction…'))));
    const list = h('div', { class: 'journal-list' });
    const sel = state.jsel = new Set();
    const bar = h('div', { class: 'select-bar' });
    main.appendChild(bar);
    main.appendChild(list);
    let shownIds = [];
    function drawBar() {
      UI.clear(bar);
      const n = sel.size;
      bar.appendChild(h('span', { class: 'sel-count' }, n ? n + ' selected' : 'Tick transactions to change their account together'));
      bar.appendChild(h('button', { onclick: () => { shownIds.forEach(i => sel.add(i)); drawList(); } }, 'Select all shown (' + shownIds.length + ')'));
      if (n) bar.appendChild(h('button', { onclick: () => { sel.clear(); drawList(); } }, 'Clear'));
      if (n) bar.appendChild(h('button', { class: 'primary', onclick: () => reclassifyDialog([...sel]) }, 'Change account…'));
    }
    function drawList() {
      UI.clear(list);
      const needle = (state.jq || '').toLowerCase();
      const who = state.jwho || '';
      const whoOf = (t) => new Set([SL.Biz.personOf(t, null), ...t.postings.map(p => SL.Biz.personOf(t, p))]);
      const shown = all.filter(t => !who || t.raw ? !who || false : (who === '(shared)' ? whoOf(t).has('') : whoOf(t).has(who))).filter(t => !needle || b.describe(t).toLowerCase().includes(needle) || (t.memo || '').toLowerCase().includes(needle) || (t.raw || '').toLowerCase().includes(needle));
      shownIds = shown.filter(t => !t.raw).map(t => t.id);
      for (const t of shown.slice(-500).reverse()) {
        if (t.raw) {
          list.appendChild(h('div', { class: 'jtx raw', title: t.readOnly }, h('pre', null, t.raw), h('small', null, 'Read-only: ' + t.readOnly)));
          continue;
        }
        list.appendChild(h('div', {
          class: 'jtx click' + (b.isLocked(t) ? ' locked' : ''),
          onclick: async () => { if (SL.Biz.docKind(t)) return SL.BizUI.openDoc(t.id); if (await splitEditor(JSON.parse(JSON.stringify(t)), t.id)) render(); }
        },
          h('div', { class: 'jhead' },
            h('input', { type: 'checkbox', class: 'jsel', title: 'Select', checked: sel.has(t.id), onclick: (e) => { e.stopPropagation(); if (e.target.checked) sel.add(t.id); else sel.delete(t.id); drawBar(); } }),
            h('span', { class: 'date' }, t.date), t.code ? h('span', { class: 'code' }, '#' + t.code) : null,
            h('strong', null, t.payee || '(no payee)'), t.tags && t.tags.for ? h('span', { class: 'who-badge' }, 'For ' + SL.Biz.dec(t.tags.for)) : null, t.memo ? h('span', { class: 'memo' }, ' — ' + t.memo) : null),
          h('table', { class: 'jlines' }, t.postings.map(p => h('tr', null,
            h('td', null, p.account, p.tags && p.tags.for ? h('span', { class: 'who-badge' }, SL.Biz.dec(p.tags.for)) : null), amtCell(p.amount > 0 ? p.amount : null), amtCell(p.amount < 0 ? -p.amount : null))))));
      }
      if (shown.length > 500) list.appendChild(h('p', { class: 'note' }, 'Showing the latest 500 of ' + shown.length + '. Search to narrow the list.'));
      if (!shown.length) list.appendChild(h('p', { class: 'empty' }, 'No transactions.'));
      drawBar();
    }
    drawList();
  }

  // Change the account on one side of many transactions at once
  async function reclassifyDialog(ids) {
    const b = state.book;
    const counts = new Map();
    for (const id of ids) { const t = b.getTxn(id); if (t && !t.raw) for (const p of new Set(t.postings.map(p => p.account))) counts.set(p, (counts.get(p) || 0) + 1); }
    if (!counts.size) return;
    const rank = (n) => Book.TYPES.indexOf(b.accountType(n));
    // Most useful default: the income/expense account used most; otherwise the most common one
    const fromList = [...counts.keys()].sort((x, y) => (rank(x) < 3 ? 1 : 0) - (rank(y) < 3 ? 1 : 0) || counts.get(y) - counts.get(x) || x.localeCompare(y));
    const dests = [...b.accounts.values()].filter(a => !a.hidden && b.isLeaf(a.name)).map(a => a.name)
      .sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
    const v = await UI.form('Change account for ' + ids.length + ' transaction' + (ids.length === 1 ? '' : 's'), [
      { name: 'from', label: 'Move lines now in', type: 'select', options: fromList.map(n => [n, n + ' (' + counts.get(n) + ')']), value: fromList[0],
        help: 'The number is how many of the selected transactions use that account. Only those lines move; the other side of each transaction stays as it is.' },
      { name: 'to', label: 'to this account', type: 'select', options: dests.map(n => [n, n]), value: dests[0] }
    ], 'Change account', (v) => v.from === v.to ? 'Choose a different account.' : '');
    if (!v) return;
    if (!(await UI.confirm('Change account?', 'Move the "' + v.from + '" lines of the selected transactions to "' + v.to + '"? Locked periods, invoices and bills, and reconciled lines are skipped. The change is recorded in the edit log.', 'Change account'))) return;
    try {
      const r = b.reclassify(ids, v.from, v.to);
      UI.toast(r.moved ? 'Moved ' + r.moved + ' line' + (r.moved === 1 ? '' : 's') + ' in ' + r.txns + ' transaction' + (r.txns === 1 ? '' : 's') + (r.skipped ? '; skipped ' + r.skipped + ' (locked, reconciled, or an invoice or bill).' : '.') : 'Nothing moved' + (r.skipped ? ': ' + r.skipped + ' skipped (locked, reconciled, or an invoice or bill).' : '.'));
      if (r.moved) state.jsel.clear();
      render();
    } catch (e) { err(e); }
  }

  // ---------- settings ----------
  function renderSettings(main) {
    const b = state.book;
    const s = b.settings;
    const f = {
      name: h('input', { value: s.name }),
      fy: h('select', null, MONTHS.map((m, i) => h('option', { value: i + 1 }, m))),
      currency: h('input', { value: s.currency, size: 3, maxlength: 3 }),
      lock: h('input', { type: 'date', value: s.lockDate || '' }),
      adv: h('input', { type: 'checkbox', checked: s.advanced })
    };
    f.fy.value = String(s.fyStart);
    main.appendChild(h('h1', null, 'Settings'));
    main.appendChild(h('div', { class: 'form settings' },
      h('label', { class: 'field' }, h('span', null, 'Book name'), f.name),
      h('label', { class: 'field' }, h('span', null, 'Fiscal year starts in'), f.fy),
      h('label', { class: 'field' }, h('span', null, 'Currency symbol'), f.currency, h('small', null, 'One currency per book.')),
      h('label', { class: 'field' }, h('span', null, 'Lock books through'), f.lock,
        h('small', null, 'Transactions on or before this date cannot be changed. Leave empty for no lock.')),
      h('label', { class: 'field check' }, f.adv, h('span', null, 'Advanced view (show Dr/Cr labels and the journal text)')),
      h('p', { class: 'note' }, 'Template: ' + Templates.get(s.template).label + (state.doc ? ' · File: ' + state.doc.name : '')),
      h('div', null, h('button', { class: 'primary', onclick: apply }, 'Save settings'))));
    main.appendChild(SL.BizUI.settingsSection());
    main.appendChild(SL.ImportUI.settingsSection());
    main.appendChild(SL.Quick.peopleSection());
    if (SL.Biz.people(b).length) main.appendChild(SL.PocketUI.section());
    main.appendChild(SL.Home.backupSection());
    main.appendChild(SL.AIUI.settingsSection());
    function apply() {
      const name = f.name.value.trim();
      if (!name) return err(new Error('The book needs a name.'));
      if (/["\n]/.test(name)) return err(new Error('The name cannot contain double quotes.'));
      const cur = f.currency.value.trim() || '$';
      if (/[\d\s.,;+\-()]/.test(cur)) return err(new Error('The currency symbol cannot contain digits, spaces, or punctuation used in amounts.'));
      const lock = f.lock.value;
      if (lock !== (s.lockDate || '')) b.addLog('lock', '-', (s.lockDate || 'none') + ' -> ' + (lock || 'none'));
      s.name = name; s.fyStart = Number(f.fy.value); s.lockDate = lock; s.advanced = f.adv.checked;
      if (cur !== s.currency) { s.currency = cur; Money.currency = cur; b.commodities = []; }
      b.changed('settings');
      UI.toast('Settings saved');
      render();
    }
  }

  function renderSource(main) {
    const text = state.book.toText();
    main.appendChild(h('div', { class: 'screen-head' }, h('h1', null, 'Journal text'),
      h('div', { class: 'actions' }, h('button', { onclick: () => { navigator.clipboard.writeText(text).then(() => UI.toast('Copied')); } }, 'Copy'))));
    main.appendChild(h('p', { class: 'note' }, 'This is exactly what Save writes. It works with hledger and Ledger.'));
    main.appendChild(h('pre', { class: 'source' }, text));
  }

  // ---------- files ----------
  async function confirmDiscard() {
    if (!state.book || !state.book.dirty) return true;
    const r = await UI.modal({
      title: 'Unsaved changes', body: h('p', null, 'Save changes to ' + state.book.settings.name + ' first?'),
      buttons: [{ label: 'Cancel', value: null }, { label: "Don't save", value: 'discard', danger: true }, { label: 'Save', value: 'save', primary: true }]
    });
    if (r === 'save') return await save();
    if (r === 'discard') { if (state.doc) await Storage.clearDraft(state.doc.key); return true; }
    return false;
  }

  function attach(book, doc) {
    state.book = book;
    state.doc = doc;
    Money.currency = book.settings.currency;
    let timer = null;
    book.onChange(() => {
      renderToolbar();
      clearTimeout(timer);
      timer = setTimeout(() => { if (state.book === book && book.dirty && doc.key !== 'demo') Storage.saveDraft(doc.key, doc.name, book.toText()); }, 800);
    });
    state.screen = 'home';
    state.account = null;
    state.editId = null;
    render();
  }

  async function newBook() {
    if (!(await confirmDiscard())) return;
    const v = await UI.form('New book', [
      { name: 'name', label: 'Book name', placeholder: 'e.g. Ruiz Household', required: true },
      { name: 'template', label: 'Kind of book', type: 'select', options: Templates.list.map(t => [t.id, t.label]), value: 'household',
        help: 'Sets up a starter chart of accounts. Keep each household, business, or nonprofit in its own book.' },
      { name: 'fy', label: 'Fiscal year starts in', type: 'month', value: '1' }
    ], 'Create', (v) => /["\n]/.test(v.name) ? 'The name cannot contain double quotes.' : '');
    if (!v) return;
    const text = Templates.newBook(v.template, v.name, Number(v.fy));
    const book = Book.fromText(text);
    book.dirty = true;
    const name = slug(v.name) + '.journal';
    attach(book, { name, handle: null, key: 'new:' + Date.now() });
    Storage.saveDraft(state.doc.key, name, book.toText());
    state.screen = 'accounts';
    render();
    UI.toast('Book created. Save it to choose where the file lives.');
  }

  async function loadFile(f, opts) {
    let text = f.text;
    let restored = false;
    const key = 'file:' + f.name;
    const draft = await Storage.getDraft(key);
    if (draft && draft.text !== text && (!f.lastModified || draft.time > f.lastModified)) {
      const ok = await UI.confirm('Restore unsaved changes?', 'There are changes to ' + f.name + ' from ' + new Date(draft.time).toLocaleString() +
        ' that were never saved to the file. Restore them?', 'Restore');
      if (ok) { text = draft.text; restored = true; } else await Storage.clearDraft(key);
    }
    let book;
    try { book = Book.fromText(text); } catch (e) { return UI.alert('Could not read the file', e.message); }
    if (restored) book.dirty = true;
    attach(book, { name: f.name, handle: f.handle, key });
    await Storage.addRecent(f.name, f.handle);
    if (book.warnings.length && !(opts && opts.quiet)) UI.toast(book.warnings.length + ' note(s) about this file; see Home.', 'warn');
  }

  async function openBook() {
    if (!(await confirmDiscard())) return;
    try {
      const f = await Storage.open();
      if (f) await loadFile(f);
    } catch (e) { err(e); }
  }

  async function openRecent(r) {
    if (!(await confirmDiscard())) return;
    if (!r.handle) {
      const d = await Storage.getDraft('file:' + r.name);
      if (d) return openDraft(d);
      return UI.alert('Open again', 'This browser cannot reopen files by itself. Use Open book… and pick ' + r.name + '.');
    }
    try { await loadFile(await Storage.openHandle(r.handle)); }
    catch (e) { err(e); }
  }

  async function openDraft(d) {
    if (!(await confirmDiscard())) return;
    const book = Book.fromText(d.text);
    book.dirty = true;
    attach(book, { name: d.name, handle: null, key: d.key });
    UI.toast('Restored unsaved work. Save it to a file.');
  }

  async function save(asNew) {
    const b = state.book;
    if (!b) return false;
    try {
      const text = b.toText();
      const res = asNew || !state.doc.handle ? await Storage.saveAs(state.doc, text) : await Storage.save(state.doc, text);
      if (!res) return false;
      const oldKey = state.doc.key;
      state.doc.name = res.name;
      state.doc.handle = res.handle;
      state.doc.key = 'file:' + res.name;
      b.dirty = false;
      await Storage.clearDraft(oldKey);
      await Storage.clearDraft(state.doc.key);
      await Storage.addRecent(res.name, res.handle);
      renderToolbar();
      let bk = null;
      try { bk = await Storage.backup(res.name, text, 30); } catch (e) { UI.toast('Saved, but the backup failed: ' + e.message, 'warn'); }
      UI.toast((res.mode === 'download' ? 'Downloaded ' + res.name + '. Keep the newest copy; open it next time.' : 'Saved ' + res.name) + (bk ? ' · backup ' + bk.file : ''));
      return true;
    } catch (e) { err(e); return false; }
  }

  async function closeBook() {
    if (!(await confirmDiscard())) return;
    state.book = null; state.doc = null; state.screen = 'welcome';
    render();
  }

  // ---------- start ----------
  function init() {
    $('btn-new').onclick = newBook;
    $('btn-open').onclick = openBook;
    $('btn-help').onclick = () => window.open('help.html', '_blank');
    $('btn-add').onclick = () => SL.Quick.open(state.screen === 'register' ? state.account : null);
    $('btn-save').onclick = () => save(false);
    $('btn-saveas').onclick = () => save(true);
    $('btn-close').onclick = closeBook;
    $('btn-menu').onclick = () => document.body.classList.toggle('nav-open');
    $('nav').addEventListener('click', (e) => { if (e.target.closest('a')) document.body.classList.remove('nav-open'); });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(e.shiftKey); }
    });
    window.addEventListener('beforeunload', (e) => {
      if (state.book && state.book.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    render();
  }
  SL.app = { loadFile, save, go };
  document.addEventListener('DOMContentLoaded', init);
})();
