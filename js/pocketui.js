/* Simple Ledger - pocketui.js: phone app setup files and importing phone entries */
(function () {
  'use strict';
  const SL = window.SL;
  const UI = SL.UI, h = UI.h, Money = SL.Money, P = SL.Pocket, B = SL.Biz;
  const S = () => SL.state;
  const leaf = (n) => n.split(':').pop();

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- setup file for one person ----------
  async function setupDialog(person) {
    const b = S().book;
    const all = P.allChoices(b), cur = P.choicesFor(b, person);
    const boxes = {};
    const group = (key, title, help) => {
      const set = new Set(cur[key]);
      boxes[key] = all[key].map(n => ({ n, cb: h('input', { type: 'checkbox', checked: set.has(n) }) }));
      const setAll = (v) => boxes[key].forEach(x => { x.cb.checked = v; });
      return h('fieldset', { class: 'pocket-group' },
        h('legend', null, title),
        h('small', { class: 'note' }, help),
        h('div', { class: 'pocket-links' }, h('button', { type: 'button', class: 'link', onclick: () => setAll(true) }, 'All'), h('button', { type: 'button', class: 'link', onclick: () => setAll(false) }, 'None')),
        all[key].length ? h('div', { class: 'pocket-list' }, boxes[key].map(x => h('label', { class: 'check', title: x.n }, x.cb, ' ' + x.n)))
          : h('p', { class: 'note' }, 'No accounts of this kind yet.'));
    };
    const ccy = h('input', { value: P.homeCode(b), size: 4, maxlength: 3, placeholder: 'USD', style: { textTransform: 'uppercase' } });
    const body = h('div', { class: 'pocket-setup' },
      h('label', { class: 'field' }, h('span', null, 'Your book\'s currency (3-letter code)'), ccy, h('small', null, 'Lets the phone convert foreign money for travelers, for example USD, EUR, GBP.')),
      h('p', null, 'Choose what ', h('strong', null, person), ' can pick on the phone. Then send the setup file to their phone (email or a message) and open it in Simple Ledger Pocket. Send a new one whenever you change these choices.'),
      group('money', 'Pays from / receives into', 'Cash, their card, a shared card or bank account. At least one.'),
      group('spend', 'Spending categories', 'Expense accounts they can choose.'),
      group('earn', 'Income categories', 'Income accounts they can choose (leave empty if they only record spending).'));
    const read = () => ({ spend: boxes.spend.filter(x => x.cb.checked).map(x => x.n), earn: boxes.earn.filter(x => x.cb.checked).map(x => x.n), money: boxes.money.filter(x => x.cb.checked).map(x => x.n) });
    const r = await UI.modal({ title: 'Phone app setup: ' + person, body, wide: true, buttons: [
      { label: 'Cancel', value: null },
      { label: 'Save choices', value: 'save' },
      { label: 'Save and download setup file', value: 'file', primary: true,
        validate: () => { if (!/^[A-Za-z]{3}$/.test(ccy.value.trim())) return 'Enter the 3-letter currency code, such as USD.'; const c = read(); return !c.money.length ? 'Choose at least one account to pay from.' : (!c.spend.length && !c.earn.length) ? 'Choose at least one category.' : ''; } }] });
    if (!r) return;
    P.setHomeCode(b, ccy.value.trim());
    P.saveConfig(b, person, read());
    if (r === 'file') {
      try {
        const f = P.setupFile(b, person, SL.Book.today());
        download(P.setupFileName(b, person), JSON.stringify(f, null, 1));
        UI.toast('Setup file downloaded. Send it to ' + person + '\'s phone.');
      } catch (e) { UI.toast(e.message, 'error'); }
    }
    SL.render();
  }

  // ---------- import ----------
  function pickFile() {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', style: { display: 'none' } });
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
    let rows;
    try { rows = P.parse(text); } catch (e) { return UI.alert('Cannot import', e.message); }
    if (!rows.length) return UI.alert('Nothing to import', 'The file has no entries.');
    const map = {};
    let plan = P.plan(b, rows, map);
    const unknownNames = plan.unknown.slice();
    const choices = [...b.accounts.values()].filter(a => !a.hidden && b.isLeaf(a.name)).map(a => a.name)
      .sort((x, y) => SL.Book.TYPES.indexOf(b.accountType(x)) - SL.Book.TYPES.indexOf(b.accountType(y)) || x.localeCompare(y));
    const mapBox = h('div', { class: 'pocket-map' });
    const table = h('div');
    const summary = h('p', { class: 'note' });
    const status = { new: '', 'maybe-dup': 'Check', imported: 'Already in', bad: 'Problem', locked: 'Locked' };

    function drawMap() {
      UI.clear(mapBox);
      if (!unknownNames.length) return;
      mapBox.appendChild(h('p', { class: 'note bad' }, 'These names from the phone are not accounts in this book (perhaps renamed since the setup file was made). Choose where they go, or cancel and send the person a new setup file.'));
      for (const n of unknownNames) {
        const s = h('select', { onchange: (e) => { if (e.target.value) map[n] = e.target.value; else delete map[n]; redo(); } },
          [h('option', { value: '' }, 'Choose…')].concat(choices.map(c => h('option', { value: c }, c))));
        s.value = map[n] || '';
        mapBox.appendChild(h('label', { class: 'field' }, h('span', null, '"' + n + '" goes to'), s));
      }
    }
    function drawTable() {
      UI.clear(table);
      const it = plan.items;
      table.appendChild(h('table', { class: 'grid pocket-review' },
        h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Date'), h('th', null, 'Person'), h('th', null, 'Payee'), h('th', null, 'Category'), h('th', null, 'From / into'), h('th', { class: 'num' }, 'Amount'), h('th', null, ''))),
        h('tbody', null, it.map(x => {
          const r = x.row;
          const can = x.status === 'new' || x.status === 'maybe-dup';
          const amt = Money.parse(r.amountText);
          return h('tr', { class: can ? '' : 'muted' },
            h('td', null, h('input', { type: 'checkbox', checked: x.include, disabled: !can, onchange: (e) => { x.include = e.target.checked; count(); } })),
            h('td', null, r.date), h('td', null, r.person), h('td', null, r.payee || r.note || ''),
            h('td', { title: map[r.category] || r.category }, leaf(map[r.category] || r.category)),
            h('td', { title: map[r.account] || r.account }, leaf(map[r.account] || r.account)),
            h('td', { class: 'num' + (r.kind === 'spent' ? ' neg' : ''), title: r.origCur ? r.origCur + ' ' + r.origText + (r.rate ? ' at ' + r.rate : '') : '' }, amt == null ? r.amountText : Money.format(r.kind === 'spent' ? -amt : amt), r.origCur ? h('small', { class: 'note' }, ' ' + r.origCur + ' ' + r.origText) : null),
            h('td', { class: 'note' + (x.status === 'bad' || x.status === 'maybe-dup' ? ' bad' : '') }, (status[x.status] ? status[x.status] + ': ' : '') + x.note));
        }))));
      count();
    }
    function count() {
      const n = plan.items.filter(x => x.include).length;
      const c = (s) => plan.items.filter(x => x.status === s).length;
      summary.textContent = plan.items.length + ' entries in the file. ' + n + ' will be added.' +
        (c('imported') ? ' ' + c('imported') + ' already imported.' : '') + (c('maybe-dup') ? ' ' + c('maybe-dup') + ' look like entries you already have (unticked).' : '') +
        (c('bad') ? ' ' + c('bad') + ' need attention.' : '') + (c('locked') ? ' ' + c('locked') + ' in the locked period.' : '');
    }
    function redo() { plan = P.plan(b, rows, map); drawTable(); }
    drawMap(); drawTable();
    const ok = await UI.modal({ title: 'Import phone entries' + (fileName ? ': ' + fileName : ''), wide: true,
      body: h('div', null, summary, mapBox, table,
        h('p', { class: 'note' }, 'Each entry is recorded For its person. Importing the same file again never adds anything twice.')),
      buttons: [{ label: 'Cancel', value: null }, { label: 'Import', value: true, primary: true, validate: () => plan.items.some(x => x.include) ? '' : 'Nothing is ticked.' }] });
    if (!ok) return;
    const r = P.apply(b, plan, map, fileName);
    UI.toast('Added ' + r.added + ' entr' + (r.added === 1 ? 'y' : 'ies') + (r.errors.length ? '; ' + r.errors.length + ' rejected: ' + r.errors[0] : '.'), r.errors.length ? 'error' : null);
    SL.render();
  }

  // ---------- Settings section ----------
  function section() {
    const b = S().book;
    const people = B.people(b);
    const cfg = P.config(b);
    const box = h('div', { class: 'settings-extra' });
    box.appendChild(h('h2', null, 'Phone app (Simple Ledger Pocket)'));
    box.appendChild(h('p', { class: 'note' }, 'People on the list can record spending and income on their phone as it happens, then send you the entries as a file. Here you choose what each person can pick and make their setup file; to bring their entries in, use Import phone entries (also under + Add).'));
    if (!people.length) box.appendChild(h('p', { class: 'note' }, 'Add people above first.'));
    else box.appendChild(h('table', { class: 'grid', style: { maxWidth: '640px' } }, h('tbody', null, people.map(n => {
      const c = cfg[n];
      return h('tr', null, h('td', null, n),
        h('td', { class: 'note' }, c ? c.money.length + ' money account' + (c.money.length === 1 ? '' : 's') + ', ' + (c.spend.length + c.earn.length) + ' categories' : 'Not set up'),
        h('td', { class: 'row-actions' }, h('button', { class: 'link', onclick: () => setupDialog(n) }, c ? 'Change / new setup file…' : 'Set up…')));
    }))));
    box.appendChild(h('div', { class: 'key-row' }, h('button', { onclick: importFile }, 'Import phone entries…')));
    return box;
  }

  SL.PocketUI = { setupDialog, importFile, review, section };
})();
