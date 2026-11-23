/* Simple Ledger Pocket: record spending and income on a phone, send them to the bookkeeper as a CSV file.
   Everything stays in this browser (localStorage) until you send it.
   File format (matches Simple Ledger's importer):
   pocket_id,date,person,kind,amount,category,account,payee,note   kind = spent | received, amount > 0 */
(function () {
  'use strict';
  const KEY = 'simpleLedgerPocket';
  const KEEP_SENT_DAYS = 90;
  const APP_VERSION = '6'; // keep in step with VERSION in sw.js
  const $ = (id) => document.getElementById(id);
  const main = $('main');

  // ---------- tiny helpers ----------
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
    const add = (c) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else e.appendChild(c.nodeType ? c : document.createTextNode(String(c))); };
    kids.forEach(add);
    return e;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const daysAgo = (date) => Math.round((Date.parse(today()) - Date.parse(date)) / 864e5);
  const leaf = (n) => String(n || '').split(':').pop();
  const parseAmount = (s) => {
    s = String(s || '').replace(/[\s$€£,]/g, '');
    if (!/^\d*(\.\d{0,2})?$/.test(s) || s === '' || s === '.') return null;
    return Math.round(parseFloat(s) * 100);
  };
  // Amounts in a foreign currency may carry more decimals (crypto): kept as a plain number, not cents
  const parseNum = (s, maxDec) => {
    s = String(s || '').replace(/[\s$€£,]/g, '');
    if (!new RegExp('^\\d*(\\.\\d{0,' + maxDec + '})?$').test(s) || s === '' || s === '.') return null;
    const v = parseFloat(s); return v > 0 ? v : null;
  };
  const origVal = (e) => e.origAmt != null ? e.origAmt : (e.orig || 0) / 100; // older entries stored cents in e.orig
  const trimNum = (v) => { let t = (+v).toFixed(8).replace(/0+$/, ''); if (/\.$/.test(t)) t += '00'; else if (/\.\d$/.test(t)) t += '0'; return t; };
  const fmt = (cents) => (st.setup ? st.setup.currency : '$') + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ---------- foreign currency ----------
  const CURRENCIES = { USD: 'US dollar', EUR: 'Euro', GBP: 'British pound', JPY: 'Japanese yen', CAD: 'Canadian dollar', AUD: 'Australian dollar', CHF: 'Swiss franc', CNY: 'Chinese yuan',
    MXN: 'Mexican peso', INR: 'Indian rupee', KRW: 'South Korean won', BRL: 'Brazilian real', NZD: 'New Zealand dollar', SEK: 'Swedish krona', NOK: 'Norwegian krone', DKK: 'Danish krone',
    PLN: 'Polish zloty', CZK: 'Czech koruna', HUF: 'Hungarian forint', TRY: 'Turkish lira', ZAR: 'South African rand', SGD: 'Singapore dollar', HKD: 'Hong Kong dollar', THB: 'Thai baht',
    IDR: 'Indonesian rupiah', MYR: 'Malaysian ringgit', PHP: 'Philippine peso', ILS: 'Israeli shekel', AED: 'UAE dirham', COP: 'Colombian peso', ARS: 'Argentine peso', CLP: 'Chilean peso',
    PEN: 'Peruvian sol', ISK: 'Icelandic krona', RON: 'Romanian leu', BGN: 'Bulgarian lev', CZK2: '' };
  delete CURRENCIES.CZK2;
  const homeCode = () => (st.setup && st.setup.homeCode) || '';
  const rateKey = (from, to) => from + '>' + to;
  const cachedRate = (from, to) => st.rates[rateKey(from, to)] || null;
  // Latest reference rate (central banks, via frankfurter.dev). Returns {rate, date} or null when offline or unavailable.
  async function fetchRate(from, to) {
    if (!navigator.onLine) return null;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), 7000);
    try {
      const r = await fetch('https://api.frankfurter.dev/v2/rates?base=' + from + '&quotes=' + to, ctl ? { signal: ctl.signal } : undefined);
      if (!r.ok) return null;
      const j = await r.json();
      const row = Array.isArray(j) ? j.find(x => x.quote === to) : null;
      const rate = row ? Number(row.rate) : (j && j.rates ? Number(j.rates[to]) : NaN);
      if (!(rate > 0)) return null;
      const got = { rate, date: (row && row.date) || (j && j.date) || today(), fetched: Date.now() };
      st.rates[rateKey(from, to)] = got; save();
      return got;
    } catch (e) { return null; } finally { clearTimeout(timer); }
  }
  const fmtRate = (x) => String(+Number(x).toPrecision(6));
  const money2 = (v, code) => (code ? code + ' ' : '') + Number(trimNum(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });

  let toastTimer;
  function toast(msg) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = h('div', { class: 'toast' }, msg);
    document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 3200);
  }

  // ---------- state ----------
  let st = load();
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') return Object.assign({ setup: null, entries: [], lastCat: {}, lastMoney: '', rates: {}, lastCur: '' }, s); } catch (e) { /* fresh start */ }
    return { setup: null, entries: [], lastCat: {}, lastMoney: '', rates: {}, lastCur: '' };
  }
  function save() {
    // forget sent entries after a while so the phone does not fill up
    st.entries = st.entries.filter(e => !e.sent || daysAgo(e.sent) <= KEEP_SENT_DAYS);
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { alert('Could not save on this phone: ' + e.message); }
  }
  const unsent = () => st.entries.filter(e => !e.sent).sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  const sentList = () => st.entries.filter(e => e.sent).sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);

  // ---------- setup file ----------
  function readSetup(text) {
    let s;
    try { s = JSON.parse(text); } catch (e) { throw new Error('This is not a setup file.'); }
    if (!s || s.app !== 'simple-ledger-pocket') throw new Error('This is not a Simple Ledger Pocket setup file.');
    if (!s.person || !Array.isArray(s.money) || !s.money.length) throw new Error('The setup file is incomplete. Ask for a new one.');
    return { book: String(s.book || ''), person: String(s.person), currency: s.currency || '$', homeCode: /^[A-Za-z]{3}$/.test(s.homeCode || '') ? s.homeCode.toUpperCase() : '', spend: s.spend || [], earn: s.earn || [], money: s.money, made: s.made || '' };
  }
  function pickSetup() {
    const inp = h('input', { type: 'file', accept: '.json,application/json,text/plain', style: 'display:none' });
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; inp.remove();
      if (!f) return;
      try {
        const s = readSetup(await f.text());
        const pending = unsent().length;
        if (st.setup && (st.setup.person !== s.person || st.setup.book !== s.book) && pending &&
          !confirm('This setup is for ' + s.person + ' (' + s.book + '), but there are ' + pending + ' unsent entries for ' + st.setup.person + '. Send them first, or they will be sent under the new name. Continue anyway?')) return;
        st.setup = s; save();
        toast('Set up for ' + s.person + '.');
        home();
      } catch (e) { alert(e.message); }
    });
    document.body.appendChild(inp); inp.click();
  }

  // ---------- screens ----------
  function header(title, sub, menu) {
    const t = $('title');
    t.textContent = ''; t.appendChild(document.createTextNode(title)); if (sub) t.appendChild(h('small', null, sub));
    $('btn-menu').hidden = !menu;
  }
  function clear() { main.textContent = ''; window.scrollTo(0, 0); }

  function welcome() {
    header('Simple Ledger Pocket', null, false);
    $('sendbar').hidden = true;
    clear();
    main.appendChild(h('div', { class: 'welcome' },
      h('p', null, h('strong', null, 'Record spending and income as it happens, then send it to whoever keeps your books in Simple Ledger.')),
      h('ol', null,
        h('li', null, 'Get your setup file from your bookkeeper (it ends in ', h('kbd', null, '.pocket.json'), '). Save it to your phone, for example from the email to Files.'),
        h('li', null, 'Press the button below and choose it.'),
        h('li', null, 'Tip: add this page to your Home Screen (Share → Add to Home Screen on iPhone, or the ⋮ menu → Add to Home screen on Android). It then opens like an app and works offline.')),
      h('button', { class: 'primary', style: 'width:100%;margin-top:8px', onclick: pickSetup }, 'Open setup file')));
  }

  function home() {
    if (!st.setup) return welcome();
    const s = st.setup;
    header(s.person, s.book, true);
    clear();
    const list = unsent();
    main.appendChild(h('div', { class: 'big2' },
      h('button', { class: 'spent', onclick: () => edit({ kind: 'spent' }), disabled: !s.spend.length }, '− Spent'),
      h('button', { class: 'got', onclick: () => edit({ kind: 'received' }), disabled: !s.earn.length }, '+ Received')));
    main.appendChild(h('h2', null, 'Not sent yet' + (list.length ? ' (' + list.length + ')' : '')));
    main.appendChild(h('div', { class: 'card' }, list.length ? list.map(e => entryRow(e, true)) : h('div', { class: 'empty' }, 'Nothing to send. Press Spent or Received to add an entry.')));
    if (list.length) {
      const out = list.filter(e => e.kind === 'spent').reduce((a, e) => a + e.amount, 0), inn = list.filter(e => e.kind === 'received').reduce((a, e) => a + e.amount, 0);
      main.appendChild(h('div', { class: 'total' }, h('span', null, 'Spent ' + fmt(out)), inn ? h('span', null, 'Received ' + fmt(inn)) : null));
    }
    const sent = sentList();
    if (sent.length) main.appendChild(h('p', null, h('button', { class: 'link', onclick: sentScreen }, 'Sent earlier (' + sent.length + ')')));
    $('sendbar').hidden = !list.length;
    $('btn-send').textContent = 'Send ' + list.length + ' to bookkeeper';
  }

  function entryRow(e, editable) {
    return h('div', { class: 'row' + (editable ? ' click' : ''), onclick: editable ? () => edit(e) : null },
      h('div', { class: 'main' },
        h('strong', null, e.payee || leaf(e.category)),
        h('small', null, e.date + ' · ' + leaf(e.category) + ' · ' + leaf(e.account) + (e.note ? ' · ' + e.note : ''))),
      h('span', { class: 'amt ' + (e.kind === 'spent' ? 'neg' : 'pos') }, (e.kind === 'spent' ? '−' : '+') + fmt(e.amount), e.cur ? h('small', { class: 'orig' }, money2(origVal(e), e.cur)) : null));
  }

  function edit(e) {
    const s = st.setup;
    const isNew = !e.id;
    let kind = e.kind || 'spent';
    $('sendbar').hidden = true;
    header(isNew ? (kind === 'spent' ? 'Spent' : 'Received') : 'Change entry', s.person, false);
    clear();
    const payees = [...new Set(st.entries.map(x => x.payee).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const H = homeCode();
    let cur = e.cur || (H && st.lastCur && st.lastCur !== H ? st.lastCur : H); // currency being typed; home when empty
    const amount = h('input', { class: 'money', style: 'flex:1 1 0;width:0;min-width:0', inputmode: 'decimal', placeholder: '0.00', value: e.amount ? (e.cur ? trimNum(origVal(e)) : (e.amount / 100).toFixed(2)) : '', autocomplete: 'off' });
    const curSel = h('select', { class: 'cur', 'aria-label': 'Currency', style: 'flex:0 0 84px;width:84px;min-width:0;font-size:16px;font-weight:600;padding:8px 22px 8px 8px' });
    const rate = h('input', { inputmode: 'decimal', value: e.cur ? fmtRate(e.rate) : '', autocomplete: 'off' });
    const conv = h('input', { inputmode: 'decimal', value: e.cur ? (e.amount / 100).toFixed(2) : '', autocomplete: 'off' });
    const rateNote = h('p', { class: 'note' });
    const rateLabel = h('span'), convLabel = h('span');
    const fxBox = h('div', { class: 'fx' },
      h('label', { class: 'f' }, rateLabel, rate),
      h('label', { class: 'f' }, convLabel, conv),
      rateNote);
    const fillCur = () => {
      curSel.textContent = '';
      if (!H) return;
      const used = [...new Set([cur, st.lastCur, ...st.entries.map(x => x.cur)].filter(c => c && c !== H))];
      const rest = Object.keys(CURRENCIES).filter(c => c !== H && !used.includes(c)).sort();
      const opt = (c) => h('option', { value: c, title: CURRENCIES[c] || '' }, c);
      curSel.appendChild(h('option', { value: H }, H));
      used.forEach(c => curSel.appendChild(opt(c)));
      curSel.appendChild(h('option', { disabled: true }, '──────'));
      rest.forEach(c => curSel.appendChild(opt(c)));
      curSel.appendChild(h('option', { value: '?' }, 'Other…'));
      curSel.value = cur;
    };
    const orig = () => parseNum(amount.value, 8);
    const recalc = () => { // typed amount or rate changed: update what it counts as
      const o = orig(), r = parseFloat(rate.value);
      conv.value = o && r > 0 ? (Math.round(o * r * 100) / 100).toFixed(2) : '';
    };
    const reverse = () => { // the amount the card charged was typed: work out the rate
      const o = orig(), c = parseNum(conv.value, 2);
      if (o && c) rate.value = fmtRate(c / o);
    };
    async function setRate() {
      if (cur === H) return;
      const c = cachedRate(cur, H);
      if (c && Date.now() - c.fetched < 6 * 3600e3 && !rate.value) { rate.value = fmtRate(c.rate); rateNote.textContent = 'Rate from ' + c.date + '. You can change it.'; recalc(); return; }
      rateNote.textContent = 'Getting today\'s rate…';
      const got = await fetchRate(cur, H);
      const want = cur; if (want !== cur) return;
      if (got) { rate.value = fmtRate(got.rate); rateNote.textContent = 'Rate from ' + got.date + ' (reference rate). You can change it, or type the amount your card charged.'; }
      else if (c) { rate.value = fmtRate(c.rate); rateNote.textContent = 'Offline. Using the rate from ' + c.date + '. You can change it, or type the amount your card charged.'; }
      else { rateNote.textContent = navigator.onLine ? 'No official rate found for ' + cur + '. Type the rate, or the amount it counts as in ' + H + '.' : 'Offline, and no rate saved yet. Type the rate, or the amount your card charged.'; }
      recalc();
    }
    const showCur = () => {
      const foreign = !!H && cur !== H;
      fxBox.hidden = !foreign;
      if (foreign) { rateLabel.textContent = 'Rate: 1 ' + cur + ' = ? ' + H; convLabel.textContent = 'Counts as (' + H + ')'; }
    };
    curSel.addEventListener('change', () => {
      let v = curSel.value;
      if (v === '?') { v = (prompt('Currency code, for example CHF or BTC') || '').trim().toUpperCase(); if (!/^[A-Z]{3,5}$/.test(v)) { curSel.value = cur; return; } if (!CURRENCIES[v]) CURRENCIES[v] = ''; }
      cur = v; rate.value = ''; conv.value = ''; fillCur(); showCur(); setRate();
    });
    amount.addEventListener('input', () => { if (cur !== H) recalc(); });
    rate.addEventListener('input', recalc);
    conv.addEventListener('input', reverse);
    fillCur(); showCur(); if (cur !== H && !e.cur) setRate();
    const payee = h('input', { list: 'payees', value: e.payee || '', autocomplete: 'off', placeholder: 'Store or person (optional)' });
    const cat = h('select');
    const money = h('select', null, s.money.map(n => h('option', { value: n }, leaf(n))));
    const date = h('input', { type: 'date', value: e.date || today(), max: today() });
    const note = h('input', { value: e.note || '', placeholder: 'Optional', autocomplete: 'off' });
    const catLabel = h('span'), moneyLabel = h('span'), payeeLabel = h('span');
    const fillCats = (keep) => {
      const list = kind === 'spent' ? s.spend : s.earn;
      const extra = keep && !list.includes(keep) ? [keep] : []; // an old entry keeps its category even if no longer offered
      cat.textContent = '';
      cat.appendChild(h('option', { value: '' }, 'Choose…'));
      for (const n of list.concat(extra)) cat.appendChild(h('option', { value: n, title: n }, leaf(n) + (extra.includes(n) ? ' (old)' : '')));
      cat.value = keep || '';
      catLabel.textContent = kind === 'spent' ? 'What for' : 'What kind of income';
      moneyLabel.textContent = kind === 'spent' ? 'Paid with' : 'Went into';
      payeeLabel.textContent = kind === 'spent' ? 'Where / who' : 'From';
    };
    if (e.account && !s.money.includes(e.account)) money.appendChild(h('option', { value: e.account }, leaf(e.account) + ' (old)'));
    money.value = e.account || (s.money.includes(st.lastMoney) ? st.lastMoney : s.money[0]);
    fillCats(e.category || '');
    payee.addEventListener('change', () => { const c = st.lastCat[payee.value.trim().toLowerCase()]; if (c && !cat.value && [...cat.options].some(o => o.value === c)) cat.value = c; });
    const segS = h('button', { type: 'button', class: 'spent' }, 'Spent'), segR = h('button', { type: 'button', class: 'got' }, 'Received');
    const setKind = (k) => { kind = k; segS.classList.toggle('on', k === 'spent'); segR.classList.toggle('on', k === 'received'); fillCats(''); };
    segS.onclick = () => setKind('spent'); segR.onclick = () => setKind('received');
    segS.classList.toggle('on', kind === 'spent'); segR.classList.toggle('on', kind === 'received');
    segS.disabled = !s.spend.length; segR.disabled = !s.earn.length;
    const err = h('p', { class: 'warn' });

    const form = h('form', { onsubmit: (ev) => {
      ev.preventDefault();
      const foreign = !!H && cur !== H;
      const a = foreign ? parseNum(amount.value, 8) : parseAmount(amount.value); // foreign: plain number; home: cents
      if (!a) { err.textContent = 'Enter the amount, like 12.50'; amount.focus(); return; }
      if (!cat.value) { err.textContent = 'Choose ' + (kind === 'spent' ? 'what it was for.' : 'the kind of income.'); cat.focus(); return; }
      if (!date.value) { err.textContent = 'Choose the date.'; return; }
      let homeCents = a, r = null;
      if (foreign) {
        r = parseFloat(rate.value); homeCents = parseAmount(conv.value);
        if (homeCents) r = homeCents / 100 / a; // exact effective rate
        if (!(r > 0) || !homeCents) { err.textContent = 'Enter the rate, or the amount in ' + H + ' that it counts as.'; rate.focus(); return; }
      }
      const rec = Object.assign(e.id ? e : { id: newId(), created: Date.now(), sent: null }, {
        kind, amount: homeCents, category: cat.value, account: money.value, date: date.value, payee: payee.value.trim(), note: note.value.trim(),
        cur: foreign ? cur : '', origAmt: foreign ? a : null, orig: null, rate: foreign ? r : null
      });
      if (H) st.lastCur = cur;
      if (isNew) st.entries.push(rec);
      if (rec.payee) st.lastCat[rec.payee.toLowerCase()] = rec.category;
      st.lastMoney = rec.account;
      save(); toast(isNew ? 'Saved.' : 'Changed.'); home();
    } },
      h('div', { class: 'seg' }, segS, segR),
      h('label', { class: 'f' }, 'Amount', h('div', { class: 'amtbox', style: 'display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:8px;width:100%;min-width:0;box-sizing:border-box' }, amount, H ? curSel : null)),
      fxBox,
      h('label', { class: 'f' }, catLabel, cat),
      h('label', { class: 'f' }, moneyLabel, money),
      h('label', { class: 'f' }, payeeLabel, payee),
      h('label', { class: 'f' }, 'Date', date),
      h('label', { class: 'f' }, 'Note', note),
      err,
      h('div', { class: 'actions' },
        h('button', { type: 'button', onclick: home }, 'Cancel'),
        isNew ? null : h('button', { type: 'button', class: 'danger', onclick: () => { if (confirm('Delete this entry?')) { st.entries = st.entries.filter(x => x !== e); save(); home(); } } }, 'Delete'),
        h('button', { type: 'submit', class: 'primary grow' }, isNew ? 'Save' : 'Save changes')),
      h('datalist', { id: 'payees' }, payees.map(p => h('option', { value: p }))));
    main.appendChild(form);
    if (isNew) setTimeout(() => amount.focus(), 50);
  }

  function sentScreen() {
    header('Sent earlier', st.setup.person, false);
    $('sendbar').hidden = true;
    clear();
    const list = sentList();
    main.appendChild(h('p', { class: 'note' }, 'Kept for ' + KEEP_SENT_DAYS + ' days. Sending again is safe: Simple Ledger skips entries it already has.'));
    main.appendChild(h('div', { class: 'actions' },
      h('button', { onclick: home }, 'Back'),
      h('button', { class: 'grow', onclick: () => send(list, true) }, 'Send all ' + list.length + ' again')));
    main.appendChild(h('h2', null, 'Sent'));
    main.appendChild(h('div', { class: 'card' }, list.map(e => h('div', null, entryRow(e, false)))));
  }

  function menu() {
    const s = st.setup;
    $('sendbar').hidden = true;
    header('Menu', s.person, false);
    clear();
    main.appendChild(h('div', { class: 'card' },
      h('div', { class: 'row' }, h('div', { class: 'main' }, h('strong', null, s.person + ' · ' + s.book), h('small', null, 'App version ' + APP_VERSION + ' · Setup file from ' + (s.made || 'unknown date') + ' · ' + s.money.length + ' money accounts, ' + (s.spend.length + s.earn.length) + ' categories')))));
    main.appendChild(h('p', { class: 'note' }, 'When your bookkeeper adds or renames categories, they send you a new setup file. Open it here; your entries stay.'));
    main.appendChild(h('div', { style: 'display:grid;gap:10px' },
      h('button', { onclick: pickSetup }, 'Open a new setup file'),
      sentList().length ? h('button', { onclick: sentScreen }, 'Sent earlier (' + sentList().length + ')') : null,
      h('button', { class: 'danger', onclick: () => {
        const n = unsent().length;
        if (!confirm(n ? 'Remove everything from this phone, including ' + n + ' entries that were never sent?' : 'Remove the setup and all entries from this phone?')) return;
        localStorage.removeItem(KEY); st = load(); home();
      } }, 'Remove everything from this phone'),
      h('button', { class: 'primary', onclick: home }, 'Done')));
  }

  // ---------- sending ----------
  const csvCell = (v) => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  function toCSV(list) {
    const s = st.setup;
    const lines = ['pocket_id,date,person,kind,amount,category,account,payee,note,orig_amount,orig_currency,rate'];
    for (const e of list.slice().sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created))
      lines.push([e.id, e.date, s.person, e.kind, (e.amount / 100).toFixed(2), e.category, e.account, e.payee, e.note, e.cur ? trimNum(origVal(e)) : '', e.cur || '', e.cur ? fmtRate(e.rate) : ''].map(csvCell).join(','));
    return lines.join('\r\n') + '\r\n';
  }
  async function send(list, again) {
    if (!list.length) return;
    const s = st.setup;
    const name = (s.person + ' ' + s.book + ' ' + today()).replace(/[\\/:*?"<>|]+/g, '-') + '.csv';
    const text = toCSV(list);
    const file = typeof File === 'function' ? new File([text], name, { type: 'text/csv' }) : null;
    const mark = () => { const d = today(); for (const e of list) if (!e.sent) e.sent = d; save(); };
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name, text: list.length + ' entries from ' + s.person + ' for ' + s.book + '. Import in Simple Ledger: + Add → Import entries from a phone.' });
        if (!again) { mark(); toast('Sent. ' + list.length + ' entries moved to Sent earlier.'); }
        home();
      } catch (e) {
        if (e && e.name === 'AbortError') return; // cancelled: nothing marked
        alert('Could not share: ' + e.message);
      }
      return;
    }
    // No share sheet (desktop browsers, older phones): download the file instead
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: name });
    document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
    if (!again && confirm('The file "' + name + '" was saved to Downloads. Attach it to an email to your bookkeeper.\n\nMark these ' + list.length + ' entries as sent?')) { mark(); }
    home();
  }

  $('btn-send').onclick = () => send(unsent(), false);
  $('btn-menu').onclick = menu;
  // Opening the app again later should always show the current list
  window.addEventListener('pageshow', () => { if (!document.querySelector('form')) home(); });
  home();

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
