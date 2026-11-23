/* Simple Ledger - aiui.js
   The optional AI features and the "Review" screen. Everything here proposes; you decide. */
(function () {
  'use strict';
  const { Money, UI, AI, Diagnose: Dx } = SL;
  const h = UI.h;
  const fmt = (c) => Money.format(c);
  const S = () => SL.state;

  const SYSTEM = 'You are a careful bookkeeping assistant inside a small accounting app. Use only the data you are given. ' +
    'Never invent transactions, names, or amounts. Be brief and plain. American spelling.';

  // ---------- small helpers ----------
  function needKey() {
    if (AI.has()) return true;
    UI.alert('AI helper is off', 'Choose an AI provider and add its key (or a local server) under Settings, in the AI helper section. Until then everything else keeps working.');
    return false;
  }
  async function busy(btn, fn) {
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Working…';
    try { return await fn(); }
    catch (e) { UI.toast(e.message || String(e), 'error'); return null; }
    finally { btn.disabled = false; btn.textContent = old; }
  }
  const sentNote = () => AI.last && AI.last.sent ? h('details', { class: 'ai-sent' }, h('summary', null, 'What was sent to the AI' + (AI.last.provider ? ' (' + AI.PROVIDERS[AI.last.provider].short + ', ' + AI.last.model + ')' : '')), h('pre', null, AI.last.sent)) : null;
  const paras = (text) => text.trim().split(/\n{2,}/).map(p => h('p', null, p));
  const list = (items, n) => items.slice(0, n).map(x => '- ' + x).join('\n') + (items.length > n ? '\n(' + (items.length - n) + ' more not shown)' : '');

  function accountNames(b, types, skip) {
    return [...b.accounts.values()].filter(a => !a.hidden && types.includes(a.type) && b.isLeaf(a.name) && a.name !== skip).map(a => a.name).sort((a, b) => a.localeCompare(b));
  }

  // ---------- Settings ----------
  function settingsSection() {
    const box = h('div', { class: 'settings-extra' });
    function draw() {
      UI.clear(box);
      const cfg = AI.load(), P = AI.PROVIDERS[cfg.provider];
      const keyIn = h('input', { type: 'password', placeholder: P.keyHint, autocomplete: 'off', size: 36 });
      const model = h('input', { value: cfg.model, list: 'dl-ai-models', size: 36, autocomplete: 'off', placeholder: P.needsUrl ? 'Load the model list, then pick one' : '' });
      const urlIn = h('input', { value: cfg.url, size: 36, autocomplete: 'off', placeholder: 'http://localhost:11434/v1' });
      UI.datalist('dl-ai-models', P.presets);
      const provSel = h('select', { onchange: (e) => { AI.save({ provider: e.target.value }); draw(); } },
        Object.keys(AI.PROVIDERS).map(id => h('option', { value: id }, AI.PROVIDERS[id].label)));
      provSel.value = cfg.provider;
      const saveAddr = () => { if (P.needsUrl) AI.save({ url: urlIn.value }); };
      box.appendChild(h('h2', null, 'AI helper (optional)'));
      box.appendChild(h('p', { class: 'note' }, 'Adds four helpers: finding why a reconciliation is off, suggesting accounts for imported items, reading bills and statements from a PDF or photo, and drafting reminders and notes. ' +
        'You choose the provider and use your own account or your own computer. Nothing is sent unless you press one of the AI buttons, and nothing it suggests is saved until you review it.'));
      box.appendChild(h('div', { class: 'form settings' },
        h('label', { class: 'field' }, h('span', null, 'Provider'), provSel,
          h('small', null, P.needsUrl ? 'Ollama, LM Studio and similar run on your computer, so nothing leaves it. Other OpenAI-compatible services (xAI, Mistral, DeepSeek, Groq…) work here too: enter their address and key.' : 'Settings for each provider are remembered separately.')),
        P.needsUrl ? h('div', { class: 'field' }, h('span', null, 'Server address'), urlIn,
          h('div', { class: 'key-row' }, AI.LOCAL_PRESETS.map(([n, u]) => h('button', { type: 'button', onclick: () => { urlIn.value = u; } }, 'Use ' + n))),
          h('small', null, 'The address ends in /v1. Start the server first, then press "Load model list".')) : null,
        cfg.key
          ? h('div', { class: 'field' }, h('span', null, 'Key'),
            h('div', { class: 'key-row' }, h('strong', null, 'Saved (' + AI.maskedKey() + ')'),
              h('button', { onclick: () => { AI.clearKey(); draw(); } }, 'Change or remove key')),
            h('small', null, 'Stored in this browser only, never in your journal file. Anyone who can use this browser profile could use it.'))
          : h('label', { class: 'field' }, h('span', null, P.needsKey ? 'Key' : 'Key (usually not needed)'), keyIn,
            h('small', null, P.keyHelp + ' Stored in this browser only, never in your journal file.')),
        !cfg.key ? h('div', null, h('button', { class: P.needsKey ? 'primary' : '', onclick: () => {
          const k = keyIn.value.trim();
          if (!k) return UI.toast('Paste the key first.', 'error');
          try { AI.save({ key: k }); } catch (e) { return UI.toast(e.message, 'error'); }
          UI.toast('Key saved'); draw();
        } }, 'Save key')) : null,
        h('label', { class: 'field' }, h('span', null, 'Model'), model,
          h('small', null, 'Press "Load model list" to see the exact names your account offers. Reading PDFs and photos needs a model that accepts images' + (cfg.provider === 'gemini' ? ' (Gemini may accept photos but not PDFs through this connection)' : P.needsUrl ? ' (PDFs are not supported with local models; use a photo or screenshot)' : ' and files') + '. A smaller model is cheaper; a larger one reads messy scans better.')),
        h('div', { class: 'key-row' },
          h('button', { onclick: (e) => busy(e.target, async () => {
            saveAddr();
            const ids = await AI.models(); UI.datalist('dl-ai-models', P.presets.concat(ids.filter(i => !P.presets.includes(i))));
            if (!model.value && ids.length) model.value = ids[0];
            UI.toast(ids.length + ' models loaded into the list'); }) }, 'Load model list'),
          h('button', { onclick: (e) => busy(e.target, async () => {
            saveAddr();
            AI.save({ model: model.value.trim() });
            if (!AI.has()) throw new Error(P.needsUrl ? 'Enter the server address and a model first.' : 'Save your key first.');
            const t = await AI.test(); UI.toast('Connected: ' + AI.model() + ' answered "' + t.slice(0, 30) + '"'); draw(); }) }, 'Save model and test'))),
        h('p', { class: 'note' }, AI.sendsOffComputer()
          ? 'When you press an AI button, the request goes to ' + P.short + ' over the internet, under that company\'s own terms and privacy policy.'
          : 'Requests go to a server on your own computer or network and do not leave it.'),
        h('details', null, h('summary', null, 'Exactly what is sent'),
          h('ul', null,
            h('li', null, h('strong', null, 'Reconciliation help:'), ' the statement date and balance, and the date, payee and amount of the items being compared.'),
            h('li', null, h('strong', null, 'Account suggestions:'), ' the payee text and memo of imported rows you have not categorized, whether each is money in or out (no amounts), and your account names.'),
            h('li', null, h('strong', null, 'Reading a bill or statement:'), ' the PDF or photo you choose, plus your account names and supplier names.'),
            h('li', null, h('strong', null, 'Drafts:'), ' your organization name, the contact name, and the facts shown on the screen (invoice number, amount, due date).'),
            h('li', null, 'After any AI result you can open "What was sent to the AI" to see the request.'))));
    }
    draw();
    return box;
  }

  // ---------- reconciliation: find the difference ----------
  async function balanceHelper(ctx) {
    const body = h('div', { class: 'helper' });
    let aiText = null;
    function draw() {
      UI.clear(body);
      const finds = Dx.reconcile(ctx);
      const tickedSum = ctx.cands.reduce((s, c) => s + (ctx.ticked.has(c.key) ? c.amount : 0), 0);
      const diff = ctx.statement - (ctx.opening + tickedSum);
      if (diff === 0) { body.appendChild(h('p', null, 'The difference is $0.00. You can finish the reconciliation.')); return; }
      body.appendChild(h('p', null, 'Difference: ', h('strong', { class: 'neg' }, fmt(diff)), ' (statement balance minus your ticked items). Here are the likely causes, checked by simple arithmetic on your own entries:'));
      body.appendChild(h('ol', { class: 'finds' }, finds.map(f => h('li', null, f.text,
        (f.tick && f.tick.length) || (f.untick && f.untick.length) ? h('div', null, h('button', { class: 'link', onclick: () => {
          (f.tick || []).forEach(k => ctx.setTick(k, true)); (f.untick || []).forEach(k => ctx.setTick(k, false)); draw();
        } }, f.tick && f.tick.length ? 'Tick it' : 'Untick it')) : null))));
      const aiBtn = h('button', { onclick: (e) => busy(e.target, async () => {
        aiText = await explainWithAI(ctx, finds, diff); draw();
      }) }, aiText ? 'Ask again' : 'Explain with AI');
      body.appendChild(h('div', { class: 'ai-box' },
        AI.has() ? aiBtn : h('p', { class: 'note' }, 'For a plain-language explanation of unusual cases, set up the AI helper in Settings.'),
        aiText ? h('div', { class: 'ai-answer' }, paras(aiText), sentNote()) : null));
    }
    draw();
    await UI.modal({ title: 'Find the difference', body, wide: true, buttons: [{ label: 'Close', value: null, primary: true }] });
  }

  async function explainWithAI(ctx, finds, diff) {
    if (!needKey()) return null;
    const row = (c) => c.t.date + ' | ' + (c.t.payee || '') + ' | ' + (c.t.memo || '') + ' | ' + fmt(c.amount);
    const on = ctx.cands.filter(c => ctx.ticked.has(c.key)), off = ctx.cands.filter(c => !ctx.ticked.has(c.key));
    const prompt = 'Account: ' + ctx.account + '. Statement date ' + ctx.date + ', statement balance ' + fmt(ctx.statement) + '. ' +
      'Opening balance (already reconciled items) ' + fmt(ctx.opening) + '. Ticked items total ' + fmt(on.reduce((s, c) => s + c.amount, 0)) + '. ' +
      'Difference (statement minus opening minus ticked) is ' + fmt(diff) + '.\n\n' +
      'Checks my code already ran:\n' + list(finds.map(f => f.text), 8) + '\n\n' +
      'Ticked items (date | payee | memo | amount):\n' + list(on.map(row), 120) + '\n\nNot ticked:\n' + list(off.map(row), 120) +
      '\n\nExplain the most likely causes of the difference in plain language, most likely first, and what I should check on my statement. Under 180 words.';
    const text = await AI.chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], { feature: 'balance', sent: prompt });
    return text;
  }

  // ---------- import: suggest accounts ----------
  async function suggestAccounts(items, account, afterApply) {
    const b = S().book;
    if (!needKey()) return 0;
    const todo = items.filter(i => i.status === 'new' && !i.account);
    if (!todo.length) { UI.toast('Every row already has an account.'); return 0; }
    const groups = new Map();
    for (const it of todo) {
      const key = SL.Import.payeeKey(it.payee) || it.payee.toLowerCase();
      if (!groups.has(key)) groups.set(key, { text: (it.payee + (it.memo ? ' — ' + it.memo : '')).slice(0, 120), dir: it.amount < 0 ? 'money out' : 'money in', items: [] });
      groups.get(key).items.push(it);
    }
    const accts = accountNames(b, ['Asset', 'Liability', 'Expense', 'Revenue'], account);
    const gl = [...groups.values()];
    let applied = 0;
    for (let i = 0; i < gl.length; i += 80) {
      const batch = gl.slice(i, i + 80);
      const prompt = 'Chart of accounts (use these names exactly):\n' + accts.join('\n') + '\n\nBank rows to classify (id | text | direction):\n' +
        batch.map((g, j) => j + ' | ' + g.text + ' | ' + g.dir).join('\n') +
        '\n\nFor each id choose the best account from the chart, or "" if none fits. Money out usually belongs to an expense account (or an asset/liability account for a transfer or loan payment); money in usually to income, or a transfer. ' +
        'Reply ONLY with JSON: {"suggestions":[{"id":0,"account":"Expenses:Groceries"}]}';
      const res = await AI.json([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], { feature: 'accounts', sent: prompt });
      for (const s of res.suggestions || []) {
        const g = batch[s.id];
        if (!g || !s.account || !b.accounts.has(s.account) || s.account === account) continue;
        for (const it of g.items) {
          if (it.account) continue;
          it.account = s.account; it.via = 'ai';
          if (it._input) { it._input.value = s.account; it._input.classList.add('ai-suggest'); it._input.title = 'Suggested by AI. Check it.'; }
          applied++;
        }
      }
    }
    UI.toast(applied ? 'Suggested accounts for ' + applied + ' row' + (applied === 1 ? '' : 's') + '. Blue boxes are AI suggestions, so check them.' : 'The AI had no suggestions for these rows.', applied ? '' : 'warn');
    if (afterApply) afterApply();
    return applied;
  }

  // ---------- read a bill or receipt ----------
  const iso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim()) ? String(s).trim() : '';
  async function extractBill(file, b) {
    if (!needKey()) throw new Error('Set up the AI helper in Settings first.');
    const part = await AI.filePart(file);
    const accts = accountNames(b, ['Expense', 'Asset', 'Liability']).filter(n => !/receivable|payable/i.test(n));
    const suppliers = SL.Biz.contacts(b, 'supplier').map(c => c.name);
    const prompt = 'Read this supplier bill, invoice, or receipt. Reply ONLY with JSON:\n' +
      '{"supplier":"", "bill_number":"", "date":"YYYY-MM-DD", "due_date":"YYYY-MM-DD or empty", "lines":[{"description":"", "amount":"12.34", "account":""}], "total":"12.34"}\n' +
      'Rules: amounts are plain decimals (no currency symbol), positive. Show tax, shipping, and discounts (negative) as their own lines so the lines add up to the total. ' +
      'For "account" use ONLY a name from the list, or "" if unsure. If a supplier below is clearly the same company, use its exact name. Use "" for anything unreadable; never guess numbers.\n\n' +
      'Accounts:\n' + accts.join('\n') + '\n\nKnown suppliers:\n' + (suppliers.join('\n') || '(none yet)');
    const sent = prompt + '\n\n[The file "' + file.name + '" (' + Math.round(file.size / 1024) + ' KB) was attached.]';
    const r = await AI.json([{ role: 'system', content: SYSTEM }, { role: 'user', content: [{ type: 'text', text: prompt }, part] }], { feature: 'bill', sent, maxTokens: 3000 });
    const lines = (r.lines || []).map(l => ({ desc: String(l.description || '').slice(0, 120), amount: Money.parse(l.amount), account: b.accounts.has(l.account) ? l.account : '' }))
      .filter(l => l.amount);
    if (!lines.length) throw new Error('No amounts could be read from that file. Try a clearer scan, or enter the bill by hand.');
    const known = suppliers.find(n => n.toLowerCase() === String(r.supplier || '').trim().toLowerCase());
    return { supplier: known || String(r.supplier || '').trim(), number: String(r.bill_number || '').trim().replace(/[;,)]/g, ''), date: iso(r.date), due: iso(r.due_date),
      lines, total: r.total ? Money.parse(r.total) : null };
  }

  // ---------- read a statement (PDF or photo) ----------
  function hash(s) { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); }
  async function extractStatement(file, account) {
    if (!needKey()) throw new Error('Set up the AI helper in Settings first.');
    const b = S().book;
    const part = await AI.filePart(file);
    const liab = b.accountType(account) === 'Liability';
    const prompt = 'Read this ' + (liab ? 'credit card' : 'bank') + ' statement. Reply ONLY with JSON:\n' +
      '{"statement_end_date":"YYYY-MM-DD", "opening_balance":"0.00", "closing_balance":"0.00", "transactions":[{"date":"YYYY-MM-DD", "description":"", "amount":"-12.34"}]}\n' +
      'Rules: include every transaction exactly as listed, in order, across all pages. amount is NEGATIVE for purchases, withdrawals, checks, and fees' + (liab ? ' (anything that increases what is owed)' : ' (anything that reduces the balance)') +
      ' and POSITIVE for deposits, payments received, refunds, and interest earned. Plain decimals, no symbols. ' +
      'Do not include running balances, daily totals, or summary lines as transactions. opening_balance and closing_balance are the balances printed on the statement' + (liab ? ' (the amount owed, shown as a positive number)' : '') + '. ' +
      'Use the statement year for dates. Use "" for anything unreadable; never guess numbers.';
    const sent = prompt + '\n\n[The file "' + file.name + '" (' + Math.round(file.size / 1024) + ' KB) was attached.]';
    const r = await AI.json([{ role: 'system', content: SYSTEM }, { role: 'user', content: [{ type: 'text', text: prompt }, part] }], { feature: 'statement', sent, maxTokens: 12000 });
    const items = [], seen = new Map();
    let skipped = 0;
    for (const t of r.transactions || []) {
      const amount = Money.parse(t.amount), date = iso(t.date);
      if (!amount || !date) { skipped++; continue; }
      const payee = SL.Import.safePayee(t.description || '');
      const k = date + '|' + amount + '|' + payee;
      const n = (seen.get(k) || 0) + 1; seen.set(k, n);
      items.push({ date, amount, payee, memo: '', code: '', fitid: 'ai' + hash(k) + '-' + n });
    }
    if (!items.length) throw new Error('No transactions could be read from that file.');
    const sign = b.normalSign(account);
    const opening = Money.parse(r.opening_balance), closing = Money.parse(r.closing_balance);
    const total = Money.sum(items.map(i => i.amount));
    let check = null;
    if (opening != null && closing != null) {
      const expect = liab ? opening - total : opening + total;
      check = { ok: expect === closing, off: closing - expect, opening, closing };
    }
    return { items, info: { balance: closing != null ? closing * sign : null, balanceDate: iso(r.statement_end_date) || null }, skipped, check };
  }

  // ---------- check stock: find where the fields go ----------
  async function locateCheckFields(file) {
    if (!needKey()) throw new Error('Set up the AI helper in Settings first.');
    const part = await AI.filePart(file);
    const prompt = 'This is a flat scan of ONE blank pre-printed US business check sheet, the full 8.5 x 11 inch page, with the check in the middle third and a stub (voucher) area above and below. ' +
      'Find where the variable data must be typed. Measure everything as a fraction of the full page: x from the left edge (0 to 1) and y from the top edge (0 to 1). ' +
      'For each field give "x","y" = the top-left corner of the space where the text should start (just above the printed line, at the left end of the blank), and "right" = the x of the right end of that blank. Fields: ' +
      'date (the blank next to "DATE"), payee (the "PAY TO THE ORDER OF" blank), amount (the box or blank for the numeric dollar amount), words (the long blank for the amount written in words), memo (the "MEMO" blank), ' +
      'stub1 (top stub: where its first line of text would start), stub2 (bottom stub: same). ' +
      'Reply ONLY with JSON: {"whole_page_visible":true,"date":{"x":0,"y":0,"right":0},"payee":{...},"amount":{...},"words":{...},"memo":{...},"stub1":{...},"stub2":{...}}. ' +
      'Set whole_page_visible to false if the image is cropped or shows only part of the sheet. Omit a field you cannot find; never guess.';
    const sent = prompt + '\n\n[The image "' + file.name + '" of blank check stock was attached. No account data is involved.]';
    const r = await AI.json([{ role: 'system', content: SYSTEM }, { role: 'user', content: [{ type: 'text', text: prompt }, part] }], { feature: 'check-layout', sent, maxTokens: 1500 });
    if (r.whole_page_visible === false) throw new Error('The scan does not show the whole page. Scan or photograph the entire sheet, flat and square, and try again.');
    const layout = {};
    for (const id of ['date', 'payee', 'amount', 'words', 'memo', 'stub1', 'stub2']) {
      const v = r[id];
      if (v && isFinite(v.x) && isFinite(v.y) && v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1)
        layout[id] = { x: v.x * 8.5, y: v.y * 11, right: isFinite(v.right) && v.right > v.x && v.right <= 1 ? v.right * 8.5 : null };
    }
    if (!layout.payee && !layout.amount) throw new Error('Could not find the check fields in that image. Try a sharper, flatter scan.');
    return layout;
  }

  // ---------- drafts ----------
  async function draftReminder(doc) {
    const b = S().book, cfg = SL.Biz.cfg(b);
    const tone = h('select', null, [['friendly', 'Friendly'], ['neutral', 'Neutral'], ['firm', 'Firm but polite']].map(([v, l]) => h('option', { value: v }, l)));
    const out = h('textarea', { rows: 12, placeholder: 'Press Draft to write it.' });
    const days = Math.round((Date.now() - Date.parse(doc.due + 'T00:00:00')) / 864e5);
    const gen = h('button', { class: 'primary', type: 'button', onclick: (e) => busy(e.target, async () => {
      if (!needKey()) return;
      const prompt = 'Write a short email reminding a customer about an overdue invoice. Tone: ' + tone.value + '. Facts: sender organization "' + cfg.org + '"; customer "' + doc.contact +
        '"; invoice ' + doc.number + ' dated ' + doc.date + ' for ' + fmt(doc.total) + '; ' + (doc.paid ? fmt(doc.paid) + ' already paid, ' : '') + fmt(doc.balance) + ' still due; it was due ' + doc.due + ' (' + days + ' days ago). ' +
        'Use only these facts. Do not mention fees, interest, or legal action. Start with "Subject:" on the first line, then a blank line, then the body. Sign it with the organization name.';
      out.value = await AI.chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], { feature: 'reminder', sent: prompt, maxTokens: 600 });
    }) }, 'Draft');
    await UI.modal({ title: 'Reminder for invoice ' + doc.number, wide: true,
      body: h('div', { class: 'form' }, h('div', { class: 'key-row' }, h('label', null, 'Tone ', tone), gen), out,
        h('p', { class: 'note' }, 'Edit it, copy it into your email program, and send it yourself. Simple Ledger does not send email.')),
      buttons: [{ label: 'Close', value: null }, { label: 'Copy', value: 'copy', primary: true, validate: () => { if (out.value) navigator.clipboard.writeText(out.value).then(() => UI.toast('Copied')); return out.value ? '' : 'Draft something first.'; } }] });
  }

  async function draftDonorNote(donor, year, gifts) {
    if (!needKey()) return '';
    const cfg = SL.Biz.cfg(S().book);
    const prompt = 'Write one or two warm sentences (at most 40 words) thanking a donor, to place inside a formal acknowledgment letter. Facts: organization "' + cfg.org + '"; donor "' + donor + '"; year ' + year + '; ' + gifts + ' gift' + (gifts === 1 ? '' : 's') +
      ' this year. Do not mention amounts, taxes, or goods. No greeting and no sign-off.';
    return (await AI.chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], { feature: 'donor-note', sent: prompt, maxTokens: 200 })).trim();
  }

  // ---------- Review screen ----------
  function count(b) { return Dx.review(b).length; }

  function reviewScreen(main) {
    const b = S().book;
    const finds = Dx.review(b);
    let summary = null;
    const box = h('div', { class: 'ai-box' });
    const aiBtn = h('button', { onclick: (e) => busy(e.target, async () => {
      if (!needKey()) return;
      const prompt = 'These are findings from an automatic check of a small set of books. In plain language, tell me which two or three to deal with first and why, in under 120 words.\n\n' +
        list(finds.map(f => '[' + f.sev + '] ' + f.title + ' - ' + f.detail), 25);
      summary = await AI.chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], { feature: 'review', sent: prompt, maxTokens: 500 });
      UI.clear(box); box.appendChild(h('div', { class: 'ai-answer' }, paras(summary), sentNote()));
    }) }, 'What should I do first? (AI)');
    main.appendChild(h('div', { class: 'screen-head' }, h('h1', null, 'Things to review'), h('div', { class: 'actions' }, finds.length > 1 && AI.has() ? aiBtn : null)));
    main.appendChild(h('p', { class: 'note' }, 'Automatic checks on your own entries: nothing here is an error by itself, just worth a look. Checks run on this computer; no AI is involved unless you press the AI button.'));
    main.appendChild(box);
    if (!finds.length) { main.appendChild(h('p', { class: 'empty' }, 'Nothing to review. Everything looks in order.')); return; }
    main.appendChild(h('div', { class: 'review-list' }, finds.map(f => h('div', { class: 'review-item ' + f.sev },
      h('div', null, h('strong', null, f.title), h('div', { class: 'note' }, f.detail)),
      h('button', { onclick: () => SL.app.go(f.go.screen, f.go.account) }, 'Go')))));
  }

  SL.AIUI = { settingsSection, balanceHelper, suggestAccounts, extractBill, extractStatement, draftReminder, draftDonorNote, locateCheckFields, reviewScreen, count, needKey, sentNote };
})();
