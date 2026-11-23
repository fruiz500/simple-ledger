/* Simple Ledger - checksui.js: Checks screen, check sheet preview/print, calibration */
(function () {
  'use strict';
  const { Money, Book, UI, Biz: B, Checks: C } = SL;
  const h = UI.h;
  const S = () => SL.state;
  const money = (c) => Money.format(c);
  const go = (s) => SL.app.go(s);

  function banks(b) {
    return [...b.accounts.values()].filter(a => !a.hidden && (a.type === 'Asset' || a.type === 'Liability') && b.isLeaf(a.name)).map(a => a.name).sort((a, b) => a.localeCompare(b));
  }
  function currentBank(b) {
    const list = banks(b);
    const st = S();
    if (!list.includes(st.checkBank)) st.checkBank = list.find(a => /check/i.test(a)) || list[0] || '';
    return st.checkBank;
  }

  // ---------- one sheet ----------
  function sheetEl(chk, cfg, guides) {
    const sheet = h('div', { class: 'check-sheet' });
    const put = (f, text, extra) => {
      const p = C.position(cfg, f);
      const box = h('div', { class: 'ck-f' + (guides ? ' guide' : '') + (f.align === 'right' ? ' r' : ''),
        style: { left: p.x + 'in', top: p.y + 'in', width: f.w + 'in', fontSize: f.size + 'pt' } });
      if (Array.isArray(text)) text.forEach(l => box.appendChild(h('div', null, l))); else box.textContent = text;
      if (extra) box.classList.add(extra);
      sheet.appendChild(box);
    };
    const F = Object.fromEntries(C.FIELDS.map(f => [f.id, f]));
    const amt = money(chk.amount).replace('$', '');
    put(F.date, chk.date);
    put(F.payee, chk.payee);
    put(F.amount, '**' + amt);
    put(F.words, C.words(chk.amount) + ' ' + '*'.repeat(Math.max(3, 62 - C.words(chk.amount).length)).slice(0, 12));
    put(F.memo, chk.memo);
    if (cfg.stubs) {
      const stub = [chk.payee + '    ' + chk.date + '    No. ' + chk.number + '    ' + money(chk.amount), chk.memo].concat(chk.lines).filter(Boolean).slice(0, 7);
      put(F.stub1, stub); put(F.stub2, stub);
    }
    if (guides) {
      // panel lines and rulers so a test page can be held against the real stock
      for (const y of [3.667, 7.333]) sheet.appendChild(h('div', { class: 'ck-line', style: { top: y + 'in' } }));
      for (let i = 1; i < 11; i++) sheet.appendChild(h('div', { class: 'ck-tick', style: { top: i + 'in' } }, i + ' in'));
    }
    return sheet;
  }

  // ---------- the sheet screen (preview + print) ----------
  function sheetScreen(main) {
    const b = S().book, job = S().checkJob;
    if (!job) return go('checks');
    const cfg = C.load();
    const bank = job.bank;
    const checks = job.sample ? [C.sample()] : job.ids.map(id => { const t = b.getTxn(id); return t && C.fromTxn(b, t, bank); }).filter(Boolean);
    main.appendChild(h('div', { class: 'screen-head no-print' }, h('h1', null, job.sample ? 'Alignment test page' : 'Print ' + checks.length + ' check' + (checks.length === 1 ? '' : 's')),
      h('div', { class: 'actions' },
        h('button', { onclick: () => go('checks') }, '← Back'),
        h('button', { onclick: () => calibrate().then(() => SL.render()) }, 'Calibrate…'),
        h('button', { class: 'primary', onclick: () => {
          window.print();
          if (!job.sample) { b.setTags(checks.map(c => c.id), { printed: Book.today() }, 'check printed'); }
        } }, 'Print'))));
    main.appendChild(h('p', { class: 'note no-print' }, job.sample
      ? 'Print this on plain paper first, then hold it against a check sheet in front of a light. Adjust under Calibrate until the text lands where you want it. The grey rule marks the top and bottom of the check panel.'
      : 'Load pre-printed check stock face up as your printer expects, and print at 100% (Actual size, no "fit to page"). Print one page on plain paper first to test.'));
    if (!checks.length) { main.appendChild(h('p', { class: 'empty' }, 'Nothing to print.')); return; }
    const wrap = h('div', { class: 'check-pages' });
    for (const c of checks) wrap.appendChild(h('div', { class: 'check-wrap' }, sheetEl(c, cfg, job.sample || job.guides)));
    main.appendChild(wrap);
    SL.Storage.get('checkScan').then(img => {
      if (!img) return;
      const box = h('label', { class: 'note no-print check-scan-toggle' });
      const cb = h('input', { type: 'checkbox', checked: true });
      const apply = () => wrap.querySelectorAll('.check-sheet').forEach(s => s.classList.toggle('with-scan', cb.checked));
      cb.onchange = apply; box.append(cb, ' Show my scan of the stock behind the text (screen only, never printed)');
      wrap.parentNode.insertBefore(box, wrap);
      wrap.querySelectorAll('.check-sheet').forEach(s => { s.style.setProperty('--scan', 'url("' + img + '")'); });
      apply();
    });
  }

  // downscale a scan to a modest JPEG (full page, so the aspect ratio is kept)
  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const w = Math.min(1100, img.width), k = w / img.width;
        const cv = document.createElement('canvas'); cv.width = w; cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that image.')); };
      img.src = url;
    });
  }

  // ---------- calibration ----------
  async function calibrate() {
    const cfg = C.load();
    const num = (v, w) => h('input', { value: String(v || 0), size: w || 5, inputmode: 'decimal' });
    const dx = num(cfg.dx), dy = num(cfg.dy);
    const stubs = h('input', { type: 'checkbox', checked: cfg.stubs });
    const rows = C.FIELDS.map(f => {
      const o = cfg.fields[f.id] || {};
      return { f, x: num(o.x), y: num(o.y) };
    });
    let scanData = null;
    const scanNote = h('p', { class: 'note' });
    const scanBtn = h('button', { type: 'button', onclick: () => {
      if (!SL.AI.has()) return UI.toast('Set up an AI provider in Settings first, or enter the offsets by hand.', 'error');
      const inp = h('input', { type: 'file', accept: '.png,.jpg,.jpeg,.webp,.pdf', onchange: async () => {
        const file = inp.files[0]; if (!file) return;
        scanBtn.disabled = true; scanNote.textContent = 'Reading the scan with AI…';
        try {
          const layout = await SL.AIUI.locateCheckFields(file);
          const offs = C.offsetsFrom(layout);
          dx.value = '0'; dy.value = '0';
          for (const r of rows) { const o = offs[r.f.id]; if (o) { r.x.value = String(o.x); r.y.value = String(o.y); } }
          if (/^image\//.test(file.type)) scanData = await shrink(file);
          scanNote.textContent = 'Found ' + Object.keys(offs).length + ' of ' + C.FIELDS.length + ' fields and filled in the offsets below. Press Save, then use Alignment test: your scan is shown behind the sample text so you can check each field. AI positions are usually within about a quarter inch, so fine-tune afterward.';
        } catch (e) { scanNote.textContent = e.message; }
        scanBtn.disabled = false;
      } });
      inp.click();
    } }, 'Set up from a scan of blank check stock (AI)…');
    const body = h('div', { class: 'form' },
      h('div', null, scanBtn), scanNote,
      h('p', { class: 'note' }, 'Offsets are in inches. Positive moves right (X) or down (Y). Use "Everything" to fix a printer that shifts the whole page, and the rows below for individual fields.'),
      h('div', { class: 'cal-grid' },
        h('span', null, 'Everything'), h('label', null, 'X ', dx), h('label', null, 'Y ', dy),
        rows.flatMap(r => [h('span', null, r.f.label), h('label', null, 'X ', r.x), h('label', null, 'Y ', r.y)])),
      h('label', { class: 'field check' }, stubs, h('span', null, 'Print the details on the stubs above and below the check')),
      h('p', { class: 'note' }, 'Saved in this browser for this printer. Typical fix: measure how far the text is from where it should be, and enter that distance.'));
    const r = await UI.modal({ title: 'Calibrate check printing', body, wide: true, buttons: [
      { label: 'Cancel', value: null }, { label: 'Reset', value: 'reset' },
      { label: 'Save', value: 'save', primary: true, validate: () => {
        for (const i of [dx, dy, ...rows.flatMap(r => [r.x, r.y])]) if (i.value.trim() !== '' && !isFinite(Number(i.value))) return 'Offsets must be numbers, like 0.05 or -0.1.';
        return '';
      } }] });
    if (r === 'reset') { C.save(C.defaults()); return UI.toast('Calibration reset.'); }
    if (r !== 'save') return;
    const n = (i) => Math.round((Number(i.value) || 0) * 1000) / 1000;
    const next = { dx: n(dx), dy: n(dy), stubs: stubs.checked, fields: {} };
    for (const r2 of rows) if (n(r2.x) || n(r2.y)) next.fields[r2.f.id] = { x: n(r2.x), y: n(r2.y) };
    C.save(next); if (scanData) await SL.Storage.set('checkScan', scanData); UI.toast('Calibration saved.');
  }

  // ---------- write a check ----------
  async function writeDialog(bank) {
    const b = S().book;
    const f = {
      payee: h('input', { list: 'dl-supp', autocomplete: 'off' }),
      date: h('input', { type: 'date', value: Book.today() }),
      number: h('input', { size: 8, value: C.nextNumber(b, bank) }),
      memo: h('input', { placeholder: 'Printed on the memo line' }),
      other: h('input', { list: 'dl-accounts', autocomplete: 'off', placeholder: 'Expenses:…' }),
      amount: h('input', { inputmode: 'decimal', size: 10, placeholder: '0.00' })
    };
    const billBox = h('div', { class: 'bill-pick' });
    const otherBox = h('div', { class: 'form' },
      h('label', { class: 'field' }, h('span', null, 'Account this check is for'), f.other),
      h('label', { class: 'field' }, h('span', null, 'Amount'), f.amount),
      h('label', { class: 'field' }, h('span', null, 'Memo'), f.memo));
    const picks = [];
    function drawBills() {
      UI.clear(billBox); picks.length = 0;
      const docs = B.docs(b, 'bill').filter(d => d.balance > 0 && d.contact.toLowerCase() === f.payee.value.trim().toLowerCase());
      if (!docs.length) { billBox.appendChild(h('p', { class: 'note' }, f.payee.value.trim() ? 'No unpaid bills for this payee. Fill in the account and amount below.' : 'Choose a supplier to see their unpaid bills, or fill in the account and amount below.')); return; }
      billBox.appendChild(h('p', { class: 'note' }, 'Tick the bills this check pays. Leave all unticked to write a check for something else.'));
      billBox.appendChild(h('table', { class: 'grid' }, h('tbody', null, docs.map(d => {
        const cb = h('input', { type: 'checkbox' });
        const amt = h('input', { value: Money.toInput(d.balance), size: 9, inputmode: 'decimal' });
        picks.push({ d, cb, amt });
        return h('tr', null, h('td', null, cb), h('td', null, 'Bill ' + (d.number || d.date)), h('td', null, 'due ' + (d.due || '')), h('td', { class: 'num' }, money(d.balance)), h('td', null, amt));
      }))));
    }
    f.payee.addEventListener('input', drawBills); drawBills();
    let made = null;
    const r = await UI.modal({ title: 'Write a check from ' + bank, wide: true,
      body: h('div', { class: 'form' },
        h('div', { class: 'doc-top' },
          h('label', { class: 'field' }, h('span', null, 'Pay to'), f.payee),
          h('label', { class: 'field' }, h('span', null, 'Date'), f.date),
          h('label', { class: 'field' }, h('span', null, 'Check number'), f.number)),
        billBox, otherBox),
      buttons: [{ label: 'Cancel', value: null }, { label: 'Save and preview', value: 'ok', primary: true, validate: () => {
        try {
          const chosen = picks.filter(p => p.cb.checked);
          const payee = f.payee.value.trim(), number = f.number.value.trim();
          if (!f.date.value) return 'Enter the date.';
          if (chosen.length) {
            if (!number) return 'Enter a check number.';
            if (b.txns.some(t => !t.raw && t.code === number && t.postings.some(p => p.account === bank))) return 'Check number ' + number + ' is already used in this account.';
            made = B.pay(b, { kind: 'bill', contact: payee, date: f.date.value, account: bank, ref: number,
              allocations: chosen.map(p => ({ id: p.d.id, amount: Money.parse(p.amt.value) })) });
          } else made = C.writeOther(b, { bank, payee, date: f.date.value, number, account: f.other.value.trim(), amount: Money.parse(f.amount.value), memo: f.memo.value.trim() });
          return '';
        } catch (e) { return e.message; }
      } }] });
    return r === 'ok' ? made : null;
  }

  // ---------- Checks screen ----------
  function checksScreen(main) {
    const b = S().book, st = S();
    const bank = currentBank(b);
    const sel = h('select', { onchange: (e) => { st.checkBank = e.target.value; st.checkSel = new Set(); SL.render(); } }, banks(b).map(a => h('option', { value: a }, a)));
    sel.value = bank;
    const picked = st.checkSel = st.checkSel || new Set();
    if (st.checkOnlyOut == null) st.checkOnlyOut = false;
    const all = bank ? C.recent(b, bank, 200) : [];
    const list = (st.checkOnlyOut ? all.filter(c => !c.cleared) : all).slice(0, 60);
    for (const id of [...picked]) if (!list.some(c => c.id === id)) picked.delete(id);
    const printBtn = h('button', { class: 'primary' }, 'Print selected');
    const upd = () => { printBtn.textContent = 'Print selected (' + picked.size + ')'; printBtn.disabled = !picked.size; };
    printBtn.onclick = () => { st.checkJob = { bank, ids: [...picked] }; go('checksheet'); };
    main.appendChild(h('div', { class: 'screen-head' }, h('h1', null, 'Checks'),
      h('div', { class: 'actions' }, sel,
        h('button', { onclick: async () => { const t = await writeDialog(bank); if (t) { st.checkJob = { bank, ids: [t.id] }; go('checksheet'); } } }, 'Write a check…'),
        printBtn, h('button', { onclick: () => SL.Quick.depositDialog() }, 'Deposit checks…'), h('button', { onclick: () => { st.checkJob = { bank, sample: true }; go('checksheet'); } }, 'Alignment test'),
        h('button', { onclick: () => calibrate() }, 'Calibrate…'))));
    main.appendChild(h('p', { class: 'note' }, 'For pre-printed 8.5 × 11 check stock with the check in the middle and a stub above and below. Checks you enter in a register with a check number appear here too, so you can print them. Printed checks are marked with the date.'));
    const wait = SL.Flow.pending(b);
    if (wait.length) {
      main.appendChild(h('h2', null, 'Received checks waiting to be deposited'));
      main.appendChild(h('table', { class: 'grid' }, h('thead', null, h('tr', null, h('th', null, 'Received'), h('th', null, 'Check no.'), h('th', null, 'From'), h('th', { class: 'num' }, 'Amount'))),
        h('tbody', null, wait.map(w => h('tr', null, h('td', { class: 'date' }, w.date), h('td', null, w.number), h('td', null, w.payee), h('td', { class: 'num' }, money(w.amount)))))));
      main.appendChild(h('p', { class: 'note' }, money(wait.reduce((s, w) => s + w.amount, 0)) + ' held. Press Deposit checks… when you take them to the bank.'));
    }
    main.appendChild(h('h2', null, 'Checks written'));
    if (!bank) { main.appendChild(h('p', { class: 'empty' }, 'Add a bank account first.')); return; }
    main.appendChild(h('label', { class: 'check note' }, h('input', { type: 'checkbox', checked: st.checkOnlyOut, onchange: (e) => { st.checkOnlyOut = e.target.checked; SL.render(); } }), ' Show only outstanding checks (written, not yet cleared by the bank)'));
    if (!list.length) { main.appendChild(h('p', { class: 'empty' }, 'No checks yet in ' + bank + '. Use "Write a check…", or enter a check number on a payment.')); upd(); return; }
    main.appendChild(h('table', { class: 'grid' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'No.'), h('th', null, 'Date'), h('th', null, 'Pay to'), h('th', null, 'Memo'), h('th', { class: 'num' }, 'Amount'), h('th', null, 'Bank'), h('th', null, 'Printed'))),
      h('tbody', null, list.map(c => {
        const cb = h('input', { type: 'checkbox', checked: picked.has(c.id), onchange: () => { if (cb.checked) picked.add(c.id); else picked.delete(c.id); upd(); } });
        return h('tr', null, h('td', null, cb), h('td', null, c.number), h('td', { class: 'date' }, c.date), h('td', null, c.payee), h('td', { class: 'memo' }, c.memo),
          h('td', { class: 'num' }, money(c.amount)), h('td', null, c.cleared ? 'Cleared' : h('span', { class: 'note' }, 'Outstanding')), h('td', null, c.printed || h('span', { class: 'note' }, 'not yet')));
      }))));
    upd();
  }

  SL.ChecksUI = { screens: { checks: checksScreen, checksheet: sheetScreen }, calibrate };
})();
