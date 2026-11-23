/* Simple Ledger - mergeui.js: review and bring in entries from a helper's file (see merge.js) */
(function () {
  'use strict';
  const SL = window.SL;
  const UI = SL.UI, h = UI.h, Money = SL.Money, M = SL.Merge;
  const S = () => SL.state;
  const leaf = (n) => n.split(':').pop();

  function pickFile() {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept: '.journal,.hledger,.ledger,.txt', style: { display: 'none' } });
      inp.addEventListener('change', async () => {
        const f = inp.files[0]; inp.remove();
        if (!f) return resolve(null);
        try { resolve({ name: f.name, text: await f.text() }); } catch (e) { UI.toast('Could not read the file.', 'error'); resolve(null); }
      });
      document.body.appendChild(inp); inp.click();
    });
  }

  async function importFile() {
    const f = await pickFile();
    if (f) return review(f.text, f.name);
  }

  async function review(text, fileName) {
    const b = S().book;
    let other;
    try { other = SL.Book.fromText(text); } catch (e) { return UI.alert('Cannot read that file', e.message); }
    if (!other.txns.some(t => !t.raw)) return UI.alert('Nothing to import', 'That file has no transactions.');
    const map = {};
    let plan = M.plan(b, other, map);
    const unknownNames = plan.unknown.slice();
    const choices = [...b.accounts.values()].filter(a => !a.hidden && b.isLeaf(a.name)).map(a => a.name)
      .sort((x, y) => SL.Book.TYPES.indexOf(b.accountType(x)) - SL.Book.TYPES.indexOf(b.accountType(y)) || x.localeCompare(y));
    const mapBox = h('div', { class: 'pocket-map' });
    const table = h('div');
    const summary = h('p', { class: 'note' });
    const label = { new: '', 'maybe-dup': 'Check', have: '', bad: 'Problem', locked: 'Locked' };

    function drawMap() {
      UI.clear(mapBox);
      if (!unknownNames.length) return;
      mapBox.appendChild(h('p', { class: 'note bad' }, 'These accounts in the helper\'s file are not in this book. Add each one as a new account, or choose an existing account for it.'));
      for (const n of unknownNames) {
        const s = h('select', { onchange: (e) => { if (e.target.value) map[n] = e.target.value; else delete map[n]; redo(); } },
          [h('option', { value: '' }, 'Choose…'), h('option', { value: '+' }, 'Add it as a new ' + other.accountType(n) + ' account')].concat(choices.map(c => h('option', { value: c }, c))));
        s.value = map[n] || '';
        mapBox.appendChild(h('label', { class: 'field' }, h('span', null, '"' + n + '" goes to'), s));
      }
    }
    function drawTable() {
      UI.clear(table);
      const rows = plan.items.filter(x => x.status !== 'have' || showHave.checked);
      table.appendChild(h('table', { class: 'grid pocket-review' },
        h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Date'), h('th', null, 'Payee'), h('th', null, 'Accounts'), h('th', { class: 'num' }, 'Amount'), h('th', null, ''))),
        h('tbody', null, rows.map(x => {
          const t = x.txn;
          const can = x.status === 'new' || x.status === 'maybe-dup';
          const size = Money.sum(t.postings.filter(p => p.amount > 0).map(p => p.amount));
          const accts = t.postings.map(p => { const a = b.accounts.has(p.account) ? p.account : (map[p.account] && map[p.account] !== '+' ? map[p.account] : p.account); return leaf(a); }).join(', ');
          return h('tr', { class: can ? '' : 'muted' },
            h('td', null, h('input', { type: 'checkbox', checked: x.include, disabled: !can, onchange: (e) => { x.include = e.target.checked; count(); } })),
            h('td', null, t.date), h('td', null, t.payee || t.memo || ''),
            h('td', { title: t.postings.map(p => p.account + '  ' + Money.format(p.amount)).join('\n') }, accts),
            h('td', { class: 'num' }, Money.format(size)),
            h('td', { class: 'note' + (x.status === 'bad' || x.status === 'maybe-dup' ? ' bad' : '') }, (label[x.status] ? label[x.status] + ': ' : '') + x.note));
        }))));
      count();
    }
    function count() {
      const n = plan.items.filter(x => x.include).length;
      const c = (s) => plan.items.filter(x => x.status === s).length;
      summary.textContent = plan.items.length + ' entries in ' + (fileName || 'the file') + '. ' + n + ' will be added.' +
        (c('have') ? ' ' + c('have') + ' are already in this book.' : '') +
        (c('maybe-dup') ? ' ' + c('maybe-dup') + ' look like entries you already have (unticked; tick them if they are really new).' : '') +
        (c('bad') ? ' ' + c('bad') + ' need attention.' : '') + (c('locked') ? ' ' + c('locked') + ' in the locked period.' : '');
    }
    const showHave = h('input', { type: 'checkbox', onchange: () => drawTable() });
    function redo() { plan = M.plan(b, other, map); drawTable(); }
    drawMap(); drawTable();
    const ok = await UI.modal({ title: 'Import entries from a helper\'s file', wide: true,
      body: h('div', null, summary, mapBox,
        h('label', { class: 'check' }, showHave, ' Also list entries that are already in this book'), table,
        h('p', { class: 'note' }, 'Only new entries come in. Nothing already in this book is changed or deleted, and importing the same file again never adds anything twice. Reconciliation marks from the helper\'s file are left behind; reconcile here.')),
      buttons: [{ label: 'Cancel', value: null }, { label: 'Import', value: true, primary: true, validate: () => plan.items.some(x => x.include) ? '' : 'Nothing is ticked.' }] });
    if (!ok) return;
    let r;
    try { r = M.apply(b, other, plan, map, fileName); } catch (e) { return UI.alert('Import failed', e.message); }
    const extra = [r.accounts ? r.accounts + ' account' + (r.accounts === 1 ? '' : 's') : '', r.contacts ? r.contacts + ' contact' + (r.contacts === 1 ? '' : 's') : '', r.people ? r.people + ' person' + (r.people === 1 ? '' : 's') : ''].filter(Boolean);
    UI.toast('Added ' + r.added + ' entr' + (r.added === 1 ? 'y' : 'ies') + (extra.length ? ' and ' + extra.join(', ') : '') + (r.errors.length ? '; ' + r.errors.length + ' rejected: ' + r.errors[0] : '.'), r.errors.length ? 'error' : null);
    SL.render();
  }

  SL.MergeUI = { importFile, review };
})();
