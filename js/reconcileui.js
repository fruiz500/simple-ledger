/* Simple Ledger - reconcileui.js: the Reconcile screen */
(function () {
  'use strict';
  const { Money, Book, UI, Reconcile: Rec } = SL;
  const h = UI.h;

  const LABELS = { Asset: ['Deposits', 'Withdrawals'], Liability: ['Charges', 'Payments'] };

  function accountList(b) {
    return [...b.accounts.values()].filter(a => !a.hidden && (a.type === 'Asset' || a.type === 'Liability') && b.isLeaf(a.name)).map(a => a.name).sort();
  }

  function fresh(account) {
    const S = SL.state;
    const st = S.stmt && S.stmt[account];
    return { account, date: st && st.date ? st.date : Book.today(), balanceText: st ? Money.toInput(st.balance) : '', ticked: new Set(), started: false };
  }

  function begin(account) {
    SL.state.recon = fresh(account);
    SL.app.go('reconcile');
  }

  function render(main) {
    const S = SL.state, b = S.book;
    const accts = accountList(b);
    main.appendChild(h('h1', null, 'Reconcile'));
    if (!accts.length) { main.appendChild(h('p', { class: 'empty' }, 'There are no bank, cash, or card accounts to reconcile.')); return; }
    if (!S.recon || !b.accounts.has(S.recon.account)) S.recon = fresh(accts[0]);
    if (S.recon.started) renderWork(main); else renderStart(main, accts);
  }

  function renderStart(main, accts) {
    const S = SL.state, b = S.book, R = S.recon;
    const sel = h('select', { onchange: (e) => { S.recon = fresh(e.target.value); SL.render(); } }, accts.map(a => h('option', { value: a }, a)));
    sel.value = R.account;
    const date = h('input', { type: 'date', value: R.date, onchange: (e) => { R.date = e.target.value; } });
    const bal = h('input', { inputmode: 'decimal', value: R.balanceText, placeholder: '0.00', oninput: (e) => { R.balanceText = e.target.value; } });
    const type = b.accountType(R.account);
    const last = Rec.last(b, R.account);
    const opening = Rec.opening(b, R.account);
    main.appendChild(h('div', { class: 'form settings' },
      h('label', { class: 'field' }, h('span', null, 'Account'), sel),
      h('label', { class: 'field' }, h('span', null, 'Statement ending date'), date),
      h('label', { class: 'field' }, h('span', null, 'Statement ending balance'), bal,
        h('small', null, type === 'Liability' ? 'The amount you owe, as printed on the statement.' : 'The ending balance printed on the statement.')),
      h('p', { class: 'note' }, last ? 'Last reconciled ' + last.date + ' at ' + Money.format(last.balance) + '. Opening balance now: ' + Money.format(opening) + '.'
        : 'This account has not been reconciled yet. Opening balance: ' + Money.format(opening) + '.'),
      h('div', { class: 'actions' },
        h('button', { class: 'primary', onclick: start }, 'Start reconciling'),
        last ? h('button', { class: 'danger', onclick: undo }, 'Undo last reconciliation') : null),
      S.stmt && S.stmt[R.account] ? h('p', { class: 'note' }, 'The statement date and balance came from the file you imported.') : null,
      h('p', { class: 'note desktop-only' }, 'Reconciling is easiest on a computer, with the statement next to the list.')));
    const hist = Rec.history(b, R.account).slice().reverse();
    if (hist.length) {
      main.appendChild(h('h2', null, 'History'));
      main.appendChild(h('table', { class: 'grid', style: { maxWidth: '520px' } }, h('thead', null, h('tr', null, h('th', null, 'Statement date'), h('th', { class: 'num' }, 'Ending balance'))),
        h('tbody', null, hist.map(r => h('tr', null, h('td', null, r.date), h('td', { class: 'num' }, Money.format(r.balance)))))));
    }

    function start() {
      const v = Money.parse(R.balanceText);
      if (!R.date) return UI.toast('Enter the statement date.', 'error');
      if (v == null) return UI.toast('Enter the statement ending balance.', 'error');
      const l = Rec.last(b, R.account);
      if (l && R.date < l.date) return UI.toast('The statement date is earlier than the last reconciliation (' + l.date + ').', 'error');
      R.balance = v;
      R.started = true;
      R.ticked = new Set(Rec.candidates(b, R.account, R.date).filter(c => c.cleared).map(c => c.key));
      SL.render();
    }
    async function undo() {
      const l = Rec.last(b, R.account);
      if (!(await UI.confirm('Undo reconciliation?', 'This removes the reconciled marks from the ' + l.date + ' statement. The transactions themselves stay.', 'Undo', true))) return;
      try { Rec.undo(b, R.account); S.recon = fresh(R.account); UI.toast('Reconciliation undone.'); SL.render(); } catch (e) { UI.toast(e.message, 'error'); }
    }
  }

  function renderWork(main) {
    const S = SL.state, b = S.book, R = S.recon;
    const [incLabel, decLabel] = LABELS[b.accountType(R.account)];
    const cands = Rec.candidates(b, R.account, R.date);
    const keys = new Set(cands.map(c => c.key));
    for (const k of [...R.ticked]) if (!keys.has(k)) R.ticked.delete(k);
    const opening = Rec.opening(b, R.account);
    const bar = h('div', { class: 'recon-bar' });
    const finishBtn = h('button', { class: 'primary' }, 'Finish reconciliation');
    function update() {
      const ticked = Rec.tickedSum(cands, R.ticked);
      const diff = Rec.difference(opening, cands, R.ticked, R.balance);
      UI.clear(bar);
      const cell = (label, val, cls) => h('div', { class: 'rb-cell ' + (cls || '') }, h('small', null, label), h('strong', null, Money.format(val)));
      bar.append(cell('Opening balance', opening), cell('Ticked items', ticked), cell('Cleared balance', opening + ticked),
        cell('Statement balance', R.balance), cell('Difference', diff, diff === 0 ? 'ok' : 'bad'));
      finishBtn.disabled = diff !== 0;
    }
    const boxes = [];
    const tbody = h('tbody');
    for (const c of cands) {
      const cb = h('input', { type: 'checkbox', checked: R.ticked.has(c.key), onchange: () => toggle(c.key, cb.checked) });
      boxes.push([c.key, cb]);
      const tr = h('tr', { class: 'click', onclick: (e) => { if (e.target === cb) return; cb.checked = !cb.checked; toggle(c.key, cb.checked); } },
        h('td', null, cb), h('td', { class: 'date' }, c.t.date), h('td', null, c.t.code || ''), h('td', null, c.t.payee || ''), h('td', { class: 'memo' }, c.t.memo || ''),
        h('td', { class: 'num' }, c.amount > 0 ? Money.format(c.amount) : ''), h('td', { class: 'num' }, c.amount < 0 ? Money.format(-c.amount) : ''));
      tbody.appendChild(tr);
    }
    function toggle(key, on) { if (on) R.ticked.add(key); else R.ticked.delete(key); update(); }
    function all(on) { R.ticked = on ? new Set(keys) : new Set(); for (const [k, cb] of boxes) cb.checked = on; update(); }
    function findDiff() {
      const later = Rec.candidates(b, R.account, '9999-12-31').filter(c => c.t.date > R.date);
      SL.AIUI.balanceHelper({ account: R.account, date: R.date, opening, cands, ticked: R.ticked, statement: R.balance, last: Rec.last(b, R.account), later,
        setTick: (k, on) => { const e = boxes.find(x => x[0] === k); if (e) e[1].checked = on; toggle(k, on); } }).then(update);
    }
    finishBtn.onclick = () => {
      try {
        const n = Rec.finish(b, R.account, R.date, R.balance, cands, R.ticked);
        UI.toast('Reconciled ' + n + ' items to ' + R.date + '.');
        S.recon = fresh(R.account);
        SL.render();
      } catch (e) { UI.toast(e.message, 'error'); }
    };
    main.appendChild(h('p', { class: 'subtitle' }, R.account + ' · statement ending ' + R.date));
    main.appendChild(bar);
    main.appendChild(h('div', { class: 'actions recon-actions' },
      h('button', { onclick: () => all(true) }, 'Tick all'), h('button', { onclick: () => all(false) }, 'Untick all'),
      h('button', { onclick: () => SL.app.go('register', R.account) }, 'Open register'),
      h('button', { onclick: findDiff }, 'Find the difference'),
      h('span', { class: 'spacer' }),
      h('button', { onclick: () => { R.started = false; SL.render(); } }, 'Back'), finishBtn));
    main.appendChild(h('p', { class: 'note' }, 'Tick every item that appears on your statement. When the difference is zero, you can finish. Items already marked cleared (c) start ticked.'));
    main.appendChild(h('div', { class: 'reg-scroll' }, h('table', { class: 'grid register' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Date'), h('th', null, 'Num'), h('th', null, 'Payee'), h('th', { class: 'memo' }, 'Memo'),
        h('th', { class: 'num' }, incLabel), h('th', { class: 'num' }, decLabel))), tbody)));
    if (!cands.length) main.appendChild(h('p', { class: 'empty' }, 'No unreconciled transactions up to ' + R.date + '.'));
    update();
  }

  SL.ReconcileUI = { render, begin };
})();
