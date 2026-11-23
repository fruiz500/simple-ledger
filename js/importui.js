/* Simple Ledger - importui.js: bank file import dialogs, plus the rules and activity log in Settings */
(function () {
  'use strict';
  const { Money, Book, UI, Import: I, Reconcile: Rec } = SL;
  const h = UI.h;

  const FMT = [['mdy', 'Month/Day/Year'], ['dmy', 'Day/Month/Year']];

  async function openImport(account) {
    const b = SL.state.book;
    const type = b.accountType(account);
    let parsed = null, items = [], fileName = '';
    const status = h('div', { class: 'note' }, 'Choose a file downloaded from your bank or card company: .ofx, .qfx, or .csv.');
    const mapBox = h('div', { class: 'csv-map' });
    const preview = h('div', { class: 'csv-preview' });
    const fileInp = h('input', { type: 'file', accept: '.ofx,.qfx,.csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp,.journal,.hledger' });

    const headersFor = (rows, hasHeader) => {
      const n = Math.max(...rows.slice(0, 20).map(r => r.length), 1);
      const hd = hasHeader ? rows[0].slice() : [];
      while (hd.length < n) hd.push('Column ' + (hd.length + 1));
      return hd;
    };

    function loadSaved(g, rows) {
      const sv = b.csvMaps.find(m => m.account === account);
      if (!sv) return g;
      const hasHeader = sv.header !== 'no';
      const headers = headersFor(rows, hasHeader);
      const resolve = (v) => (v == null || v === '') ? -1 : /^#\d+$/.test(v) ? +v.slice(1) - 1 : headers.indexOf(v);
      const map = { date: resolve(sv.date), desc: resolve(sv.desc), amount: resolve(sv.amount), debit: resolve(sv.debit), credit: resolve(sv.credit), num: resolve(sv.num) };
      if (map.date < 0 || (map.amount < 0 && map.debit < 0 && map.credit < 0)) return g;
      return Object.assign({}, g, { hasHeader, headers, map, fmt: sv.fmt || g.fmt, invert: sv.invert === 'yes' });
    }

    function saveMap() {
      const c = parsed.cfg;
      const name = (i) => i < 0 ? '' : (c.hasHeader ? c.headers[i] : '#' + (i + 1));
      const entry = { account, header: c.hasHeader ? 'yes' : 'no', date: name(c.map.date), desc: name(c.map.desc), amount: name(c.map.amount),
        debit: name(c.map.debit), credit: name(c.map.credit), num: name(c.map.num), fmt: c.fmt, invert: c.invert ? 'yes' : 'no' };
      b.csvMaps = b.csvMaps.filter(m => m.account !== account);
      b.csvMaps.push(entry);
    }

    function rebuild() {
      UI.clear(preview);
      const res = I.buildFromCSV(parsed.rows, parsed.cfg);
      items = res.items;
      status.classList.remove('bad');
      status.textContent = items.length + ' transaction' + (items.length === 1 ? '' : 's') + ' found' +
        (res.errors.length ? '; ' + res.errors.length + ' row(s) skipped (' + res.errors[0] + ')' : '') + '.';
      if (res.errors.length || !items.length) status.classList.add('bad');
      if (!items.length) return;
      const sample = items.slice(0, 5);
      const sgn = Rec.sign(b, account);
      preview.appendChild(h('table', { class: 'grid' },
        h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Description'), h('th', { class: 'num' }, type === 'Liability' ? 'Charge (+) / payment (−)' : 'Deposit (+) / withdrawal (−)'))),
        h('tbody', null, sample.map(it => h('tr', null, h('td', null, it.date), h('td', null, it.payee), h('td', { class: 'num' + (it.amount * sgn < 0 ? ' neg' : '') }, Money.format(it.amount * sgn)))))));
      preview.appendChild(h('p', { class: 'note' }, type === 'Liability'
        ? 'Purchases should be positive and payments negative. If it looks backwards, change "Reverse signs" above.'
        : 'Deposits should be positive and withdrawals negative. If it looks backwards, change "Reverse signs" above.'));
    }

    function buildMapUI() {
      UI.clear(mapBox);
      const cfg = parsed.cfg;
      const colOpts = (extra) => [[-1, '(none)'], ...cfg.headers.map((hd, i) => [i, hd || 'Column ' + (i + 1)])].map(([v, l]) => h('option', { value: v }, l));
      const sel = (label, key, hint) => {
        const s = h('select', { onchange: (e) => { cfg.map[key] = +e.target.value; rebuild(); } }, colOpts());
        s.value = String(cfg.map[key]);
        return h('label', { class: 'field' }, h('span', null, label), s, hint ? h('small', null, hint) : null);
      };
      const hdr = h('input', { type: 'checkbox', checked: cfg.hasHeader, onchange: (e) => {
        cfg.hasHeader = e.target.checked; cfg.headers = headersFor(parsed.rows, cfg.hasHeader); buildMapUI(); rebuild();
      } });
      const fmt = h('select', { onchange: (e) => { cfg.fmt = e.target.value; rebuild(); } }, FMT.map(([v, l]) => h('option', { value: v }, l)));
      fmt.value = cfg.fmt;
      const inv = h('input', { type: 'checkbox', checked: cfg.invert, onchange: (e) => { cfg.invert = e.target.checked; rebuild(); } });
      mapBox.appendChild(h('div', { class: 'map-grid' },
        h('label', { class: 'field check' }, hdr, h('span', null, 'First row is a header')),
        h('label', { class: 'field' }, h('span', null, 'Date order'), fmt),
        sel('Date column', 'date'), sel('Description column', 'desc'),
        sel('Amount column', 'amount', 'Use Amount, or Debit and Credit below.'),
        sel('Debit (money out)', 'debit'), sel('Credit (money in)', 'credit'), sel('Check number', 'num'),
        h('label', { class: 'field check' }, inv, h('span', null, 'Reverse signs (purchases shown as positive, typical for credit cards)'))));
    }

    fileInp.addEventListener('change', () => onFile().catch(e => { status.textContent = 'Could not read this file: ' + (e && e.message || e); status.classList.add('bad'); }));
    async function onFile() {
      const f = fileInp.files[0];
      if (!f) return;
      fileName = f.name;
      UI.clear(mapBox); UI.clear(preview);
      parsed = null; items = [];
      status.classList.remove('bad');
      if (/\.(pdf|png|jpe?g|webp)$/i.test(f.name) || /^(image\/|application\/pdf)/.test(f.type)) {
        status.textContent = 'Reading the statement with AI. This can take up to a minute…';
        try {
          const r = await SL.AIUI.extractStatement(f, account);
          parsed = { kind: 'pdf', info: r.info, check: r.check };
          items = r.items;
          const ds = items.map(i => i.date).sort();
          status.textContent = items.length + ' transactions read, ' + ds[0] + ' to ' + ds[ds.length - 1] + '.' + (r.skipped ? ' ' + r.skipped + ' unreadable line(s) skipped.' : '');
          if (r.check) {
            const ok = r.check.ok;
            preview.appendChild(h('p', { class: ok ? 'note' : 'note bad' }, ok
              ? 'Check passed: opening ' + Money.format(r.check.opening) + ' plus these transactions equals the closing balance ' + Money.format(r.check.closing) + '.'
              : 'Check FAILED: the transactions do not add up to the printed closing balance (off by ' + Money.format(r.check.off) + '). A line was probably missed or misread. Compare against the statement before importing.'));
          } else preview.appendChild(h('p', { class: 'note bad' }, 'The opening and closing balances could not be read, so the total could not be checked. Compare against the statement.'));
          preview.appendChild(h('p', { class: 'note' }, 'Read by AI. Check every row against your statement in the next step.'));
          const sd = SL.AIUI.sentNote && SL.AIUI.sentNote(); if (sd) preview.appendChild(sd);
        } catch (e) { status.textContent = e.message; status.classList.add('bad'); }
        return;
      }
      let text;
      try { const buf = new Uint8Array(await f.arrayBuffer()); const u16 = (buf[0] === 0xFF && buf[1] === 0xFE) ? 'utf-16le' : (buf[0] === 0xFE && buf[1] === 0xFF) ? 'utf-16be' : (buf[1] === 0 && buf[3] === 0 ? 'utf-16le' : ''); text = new TextDecoder(u16 || 'utf-8').decode(buf); } catch (e) { status.textContent = 'Could not read the file.'; status.classList.add('bad'); return; }
      if (SL.Merge.looksLikeJournal(f.name, text)) { if (UI.lastDialogClose) UI.lastDialogClose(null); return SL.MergeUI.review(text, f.name); }
      if (SL.Pocket.isPocketCSV(text)) { if (UI.lastDialogClose) UI.lastDialogClose(null); return SL.PocketUI.review(text, f.name); }
      if (/<OFX|<STMTTRN/i.test(text)) {
        try {
          const info = I.parseOFX(text);
          parsed = { kind: 'ofx', info };
          items = info.items;
          const ds = items.map(i => i.date).sort();
          status.textContent = items.length + ' transactions found, ' + ds[0] + ' to ' + ds[ds.length - 1] + '.' +
            (info.balance != null ? ' Statement balance: ' + Money.format(info.balance * Rec.sign(b, account)) + (info.balanceDate ? ' as of ' + info.balanceDate : '') + '.' : '');
        } catch (e) { status.textContent = e.message; status.classList.add('bad'); }
        return;
      }
      try {
        let rows = I.parseCSV(text);
        // skip title lines above the real table (some banks add them)
        const wide = Math.max(...rows.slice(0, 30).map(r => r.length), 1);
        const start = rows.findIndex(r => r.length >= Math.max(2, Math.ceil(wide * 0.8)));
        if (start > 0) rows = rows.slice(start);
        if (rows.length < 2) { status.textContent = 'This file has no rows to import.'; status.classList.add('bad'); return; }
        const cfg = loadSaved(I.guessCSV(rows, type), rows);
        parsed = { kind: 'csv', rows, cfg };
        buildMapUI();
        rebuild();
      } catch (e) { status.textContent = 'Could not read this file: ' + e.message; status.classList.add('bad'); }
    }

    const step1 = await UI.modal({
      title: 'Import into ' + account, wide: true,
      body: h('div', { class: 'import-step' }, h('label', { class: 'field' }, h('span', null, 'Bank file'), fileInp), status, mapBox, preview),
      buttons: [{ label: 'Cancel', value: null }, { label: 'Next', value: 'next', primary: true,
        validate: () => (!parsed || !items.length) ? 'Choose a file that contains transactions.' : '' }]
    });
    if (step1 !== 'next') return;
    if (parsed.kind === 'csv') saveMap();
    await review(account, items, fileName, parsed);
  }

  async function review(account, items, fileName, parsed) {
    const b = SL.state.book;
    I.annotate(b, account, items);
    const sgn = Rec.sign(b, account);
    const counts = () => ({
      n: items.filter(i => i.status === 'new').length, m: items.filter(i => i.status === 'match').length,
      d: items.filter(i => i.status === 'dup').length, l: items.filter(i => i.status === 'locked').length,
      sel: items.filter(i => i.include).length
    });
    const summary = h('div', { class: 'import-summary' });
    const checks = [];
    const refresh = () => {
      const c = counts();
      summary.textContent = c.n + ' new, ' + c.m + ' match existing entries, ' + c.d + ' already imported, ' + c.l + ' in locked periods. ' + c.sel + ' selected.';
    };
    const badge = (it) => ({ new: ['New', 'b-new'], match: ['Matches existing', 'b-match'], dup: ['Already imported', 'b-dup'], locked: ['Locked', 'b-dup'] }[it.status]);
    const rows = items.map((it) => {
      const cb = h('input', { type: 'checkbox', checked: it.include, disabled: it.status === 'dup' || it.status === 'locked', onchange: (e) => { it.include = e.target.checked; refresh(); } });
      checks.push([it, cb]);
      const [bl, bc] = badge(it);
      let acctCell = '', ruleCell = '';
      if (it.status === 'new') {
        const ruleBox = h('input', { type: 'checkbox', title: 'Remember: always use this account for "' + it.payee + '"', onchange: (e) => { it.rule = e.target.checked; } });
        const ai = h('input', { list: 'dl-accounts', value: it.account, placeholder: it.amount < 0 ? 'Expenses:Uncategorized' : 'Income:Uncategorized', title: it.via === 'rule' ? 'From a rule' : it.via === 'history' ? 'Same as the last "' + it.payee + '"' : '',
          oninput: (e) => { it.account = e.target.value.trim(); } });
        it._input = ai; acctCell = ai; ruleCell = ruleBox;
      } else acctCell = h('span', { class: 'note' }, it.note);
      return h('tr', { class: 'st-' + it.status },
        h('td', null, cb), h('td', null, h('span', { class: 'badge ' + bc }, bl)), h('td', { class: 'date' }, it.date),
        h('td', null, it.payee, it.memo ? h('div', { class: 'note' }, it.memo) : null, it.code ? h('small', { class: 'note' }, ' #' + it.code) : null),
        h('td', { class: 'num' + (it.amount * sgn < 0 ? ' neg' : '') }, Money.format(it.amount * sgn)), h('td', null, acctCell), h('td', null, ruleCell));
    });
    const setAll = (on) => { for (const [it, cb] of checks) if (!cb.disabled) { it.include = on; cb.checked = on; } refresh(); };
    refresh();
    const body = h('div', { class: 'import-step' }, summary,
      h('div', { class: 'import-tools' }, h('button', { type: 'button', onclick: () => setAll(true) }, 'Select all'), h('button', { type: 'button', onclick: () => setAll(false) }, 'Select none'),
        SL.AI.has() ? h('button', { type: 'button', onclick: (e) => { const bt = e.target; bt.disabled = true; SL.AIUI.suggestAccounts(items, account, refresh).catch(x => UI.toast(x.message, 'error')).then(() => { bt.disabled = false; }); } }, 'Suggest accounts with AI') : null),
      h('div', { class: 'import-scroll' }, h('table', { class: 'grid import' },
        h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Status'), h('th', null, 'Date'), h('th', null, 'Description'), h('th', { class: 'num' }, b.accountType(account) === 'Liability' ? 'Charge / payment' : 'Amount'), h('th', null, 'Account'), h('th', { title: 'Remember this choice for next time' }, 'Rule'))),
        h('tbody', null, rows))),
      h('p', { class: 'note' }, 'Entries that match something you already typed in (same amount, within 3 days, or 7 for credit cards) are marked cleared instead of being added twice. Rows without an account go to Expenses:Uncategorized or Income:Uncategorized.'));
    const r = await UI.modal({
      title: 'Review ' + fileName, body, wide: true, sticky: true,
      buttons: [{ label: 'Cancel', value: null }, { label: 'Import', value: 'go', primary: true,
        validate: () => {
          if (!items.some(i => i.include)) return 'Nothing is selected.';
          const unknown = items.find(i => i.include && i.status === 'new' && i.account && !b.accounts.has(i.account));
          if (unknown) return 'Unknown account "' + unknown.account + '". Pick an existing account or add it on the Accounts screen first.';
          const same = items.find(i => i.include && i.status === 'new' && i.account === account);
          if (same) return 'A row uses the account being imported (' + account + ') as its other side.';
          return '';
        } }]
    });
    if (r !== 'go') return;
    try {
      const res = I.apply(b, account, items, { file: fileName });
      if (parsed.kind !== 'csv' && parsed.info.balance != null) {
        SL.state.stmt = SL.state.stmt || {};
        SL.state.stmt[account] = { date: parsed.info.balanceDate, balance: parsed.info.balance * Rec.sign(b, account) };
      }
      UI.toast('Imported ' + res.added + ' new, ' + res.matched + ' matched.' + (parsed.kind !== 'csv' && parsed.info.balance != null ? ' Ready to reconcile.' : ''));
      SL.render();
      if (res.rejected.length) UI.alert('Some rows were not imported', res.rejected.slice(0, 8).join('\n'));
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  // ----- Settings: rules and activity log -----
  function settingsSection() {
    const b = SL.state.book;
    const wrap = h('div', { class: 'settings-extra' });
    function draw() {
      UI.clear(wrap);
      wrap.appendChild(h('h2', null, 'Import rules'));
      wrap.appendChild(h('p', { class: 'note' }, 'When an imported description contains the text, the account is filled in. The longest match wins.'));
      const tbody = h('tbody', null, b.rules.map((r, i) => h('tr', null,
        h('td', null, r.match), h('td', null, r.account),
        h('td', { class: 'row-actions' }, h('button', { class: 'link danger', onclick: () => { b.rules.splice(i, 1); b.changed('settings'); draw(); } }, 'Delete')))));
      wrap.appendChild(h('table', { class: 'grid rules' }, h('thead', null, h('tr', null, h('th', null, 'Description contains'), h('th', null, 'Account'), h('th', null, ''))), tbody));
      const m = h('input', { placeholder: 'e.g. COMED' });
      const a = h('input', { list: 'dl-accounts', placeholder: 'e.g. Expenses:Utilities' });
      wrap.appendChild(h('div', { class: 'rule-add' }, m, a, h('button', { onclick: () => {
        const mt = m.value.trim(), ac = a.value.trim();
        if (!mt) return UI.toast('Enter the text to look for.', 'error');
        if (!b.accounts.has(ac)) return UI.toast('Choose an existing account.', 'error');
        b.rules.push({ match: mt, account: ac }); b.changed('settings'); draw();
      } }, 'Add rule')));
      wrap.appendChild(h('h2', null, 'Activity log'));
      const log = b.log.slice(-100).reverse();
      wrap.appendChild(h('details', null, h('summary', null, b.log.length + ' entries (newest first, showing up to 100)'),
        h('pre', { class: 'source' }, log.join('\n') || 'Nothing yet.')));
      const recs = b.recons.slice().reverse();
      if (recs.length) {
        wrap.appendChild(h('h2', null, 'Reconciliations'));
        wrap.appendChild(h('table', { class: 'grid' }, h('thead', null, h('tr', null, h('th', null, 'Account'), h('th', null, 'Statement date'), h('th', { class: 'num' }, 'Ending balance'))),
          h('tbody', null, recs.map(r => h('tr', null, h('td', null, r.account), h('td', null, r.date), h('td', { class: 'num' }, Money.format(r.balance)))))));
      }
    }
    draw();
    return wrap;
  }

  SL.ImportUI = { openImport, settingsSection };
})();
