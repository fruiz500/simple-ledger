/* Simple Ledger - journal.js
   Reads and writes hledger-compatible plain-text journals.
   Anything the app does not understand is kept verbatim and marked read-only. */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const Money = SL.Money || (typeof require !== 'undefined' ? require('./money.js') : null);
  const J = {};

  const DATE_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;

  function normDate(y, m, d) {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  // "free text, key:value, key:value" -> { text, tags }
  J.parseComment = function (c) {
    const tags = {};
    const free = [];
    if (!c) return { text: '', tags };
    for (const part of c.split(',')) {
      const p = part.trim();
      if (!p) continue;
      const m = p.match(/^([^\s:,]+):(.*)$/);
      if (m) tags[m[1]] = m[2].trim();
      else free.push(p);
    }
    return { text: free.join(', '), tags };
  };

  J.formatComment = function (text, tags) {
    const parts = [];
    if (text) parts.push(text);
    for (const k of Object.keys(tags || {})) parts.push(k + ':' + tags[k]);
    return parts.join(', ');
  };

  // key:value pairs in "; sb:" lines, values may be "quoted strings"
  J.parseKV = function (s) {
    const out = {};
    const re = /([\w-]+):(?:"((?:[^"\\]|\\.)*)"|(\S+))/g;
    let m;
    while ((m = re.exec(s))) out[m[1]] = m[2] != null ? m[2].replace(/\\"/g, '"') : m[3];
    return out;
  };
  J.formatKV = function (obj) {
    return Object.keys(obj).filter(k => obj[k] !== '' && obj[k] != null).map(k => {
      const v = String(obj[k]);
      return /[\s"]/.test(v) || v === '' ? k + ':"' + v.replace(/"/g, '\\"') + '"' : k + ':' + v;
    }).join(' ');
  };

  // Journal amount -> cents, or undefined if it uses a commodity we do not support
  function parseAmount(s, currency) {
    s = s.trim();
    if (!s) return null;
    if (/@/.test(s)) return undefined; // prices / conversions
    let t = s.replace(/\s+/g, '');
    if (currency && currency !== '$') t = t.split(currency).join('');
    t = t.replace(/\$/g, '');
    if (/[^0-9.,+\-()]/.test(t)) return undefined; // other commodity
    const v = Money.parse(t);
    return v == null ? undefined : v;
  }

  function splitComment(s) {
    const i = s.indexOf(';');
    if (i < 0) return [s, null];
    return [s.slice(0, i), s.slice(i + 1).trim()];
  }

  function isIndented(line) { return /^[ \t]/.test(line); }

  /* Parse journal text into a plain data object:
     { sb: [{kind, rest}], headerComments: [], commodities: [], accounts: [], payees: [],
       raw: [], txns: [], trailing: [], warnings: [] } */
  J.parse = function (text, currency) {
    currency = currency || '$';
    const lines = text.replace(/^﻿/, '').split(/\r?\n/);
    const data = { sb: [], headerComments: [], commodities: [], accounts: [], payees: [],
      raw: [], txns: [], trailing: [], warnings: [] };
    let pending = [];        // comment lines waiting to attach to the next item
    let seenItem = false;    // header comments are those before any item
    let order = 0;
    let i = 0;

    const takeBlock = () => { // current line plus following indented lines
      const block = [lines[i]];
      while (i + 1 < lines.length && isIndented(lines[i + 1]) && lines[i + 1].trim() !== '') block.push(lines[++i]);
      return block;
    };
    const attach = (item) => { item.pre = pending; pending = []; seenItem = true; };

    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') {
        if (!seenItem && pending.length) { data.headerComments.push(...pending); pending = []; }
        continue;
      }
      if (/^[;#*]/.test(line)) {
        const sb = line.match(/^;\s*sb:(\w[\w-]*)\s*(.*)$/);
        if (sb) data.sb.push({ kind: sb[1], rest: sb[2] });
        else pending.push(line);
        continue;
      }
      if (/^comment\s*$/.test(line)) {
        const block = [line];
        while (i + 1 < lines.length) { block.push(lines[++i]); if (/^end comment\s*$/.test(lines[i])) break; }
        const item = { text: block.join('\n'), order: order++ };
        attach(item); data.raw.push(item);
        continue;
      }
      if (DATE_RE.test(line)) {
        const block = takeBlock();
        const t = parseTxn(block, currency, data.warnings);
        t.order = order++;
        attach(t);
        data.txns.push(t);
        continue;
      }
      let m;
      if ((m = line.match(/^account\s+(.*)$/))) {
        const block = takeBlock();
        let [name, c] = splitComment(m[1]);
        name = name.replace(/(\s{2,}|\t).*$/, '').trim();
        const extra = [];
        let comment = c || '';
        for (const l of block.slice(1)) {
          const [, cc] = splitComment(l);
          if (cc != null && l.trim().startsWith(';')) comment += (comment ? ', ' : '') + cc;
          else extra.push(l);
        }
        const pc = J.parseComment(comment);
        const item = { name, text: pc.text, tags: pc.tags, extra };
        attach(item); data.accounts.push(item);
        continue;
      }
      if ((m = line.match(/^payee\s+(.*)$/))) {
        const block = takeBlock();
        let [name, c] = splitComment(m[1]);
        name = name.trim();
        let comment = c || '';
        for (const l of block.slice(1)) {
          const [, cc] = splitComment(l);
          if (cc != null) comment += (comment ? ', ' : '') + cc;
        }
        const pc = J.parseComment(comment);
        const item = { name, text: pc.text, tags: pc.tags };
        attach(item); data.payees.push(item);
        continue;
      }
      if (/^commodity\s/.test(line)) {
        const block = takeBlock();
        data.commodities.push(block.join('\n'));
        continue;
      }
      // Anything else (include, P, ~, =, alias, apply, Y, D, ...) is kept verbatim
      const block = takeBlock();
      const item = { text: block.join('\n'), order: order++ };
      attach(item);
      data.raw.push(item);
      data.warnings.push('Kept unsupported directive as-is: ' + line.trim().slice(0, 60));
    }
    if (!seenItem) data.headerComments.push(...pending);
    else data.trailing.push(...pending);
    return data;
  };

  function parseTxn(block, currency, warnings) {
    const head = block[0];
    const t = { date: '', status: '', code: '', payee: '', memo: '', text: '', tags: {},
      extraComments: [], postings: [], raw: null };
    const unsupported = (why) => {
      t.raw = block.join('\n');
      t.readOnly = why;
      warnings.push(t.date + ' ' + (t.payee || '') + ': ' + why + ' (kept as-is, read-only)');
      return t;
    };
    const dm = head.match(DATE_RE);
    t.date = normDate(dm[1], dm[2], dm[3]);
    let rest = head.slice(dm[0].length);
    if (/^=\S+/.test(rest)) { t.payee = rest; return unsupported('secondary date'); }
    let [desc, c] = splitComment(rest);
    desc = desc.trim();
    const sm = desc.match(/^([*!])\s*/);
    if (sm) { t.status = sm[1]; desc = desc.slice(sm[0].length); }
    const cm = desc.match(/^\(([^)]*)\)\s*/);
    if (cm) { t.code = cm[1]; desc = desc.slice(cm[0].length); }
    const bar = desc.indexOf('|');
    if (bar >= 0) { t.payee = desc.slice(0, bar).trim(); t.memo = desc.slice(bar + 1).trim(); }
    else t.payee = desc.trim();
    const pc = J.parseComment(c);
    t.text = pc.text; t.tags = pc.tags;

    for (const l of block.slice(1)) {
      const s = l.trim();
      if (s.startsWith(';') || s.startsWith('#')) {
        const cc = J.parseComment(s.slice(1).trim());
        const target = t.postings.length ? t.postings[t.postings.length - 1] : t;
        Object.assign(target.tags, cc.tags);
        if (cc.text) {
          if (target === t) t.extraComments.push(cc.text);
          else target.text = target.text ? target.text + ', ' + cc.text : cc.text;
        }
        continue;
      }
      let [body, pcom] = splitComment(s);
      body = body.replace(/\s+$/, '');
      const p = { account: '', amount: null, status: '', assertion: null, text: '', tags: {} };
      const ps = body.match(/^([*!])\s*/);
      if (ps) { p.status = ps[1]; body = body.slice(ps[0].length); }
      const am = body.match(/^(.*?)(?:(?:\s{2,}|\t)\s*(.*))?$/);
      p.account = am[1].trim();
      let amt = (am[2] || '').trim();
      if (/^[(\[]/.test(p.account)) return unsupported('virtual posting');
      if (amt) {
        const eq = amt.indexOf('=');
        if (eq >= 0) {
          const as = amt.slice(eq + 1).replace(/^=/, '').replace(/^\*/, '');
          const av = parseAmount(as, currency);
          if (av === undefined || av === null) return unsupported('balance assertion format');
          p.assertion = av;
          amt = amt.slice(0, eq).trim();
        }
        if (amt) {
          const v = parseAmount(amt, currency);
          if (v === undefined) return unsupported('other commodity or price');
          p.amount = v;
        }
      }
      if (pcom) { const x = J.parseComment(pcom); p.text = x.text; p.tags = x.tags; }
      if (!p.status) p.status = t.status;
      t.postings.push(p);
    }
    const missing = t.postings.filter(p => p.amount == null);
    if (missing.length > 1) return unsupported('more than one posting without an amount');
    const sum = Money.sum(t.postings.map(p => p.amount));
    if (missing.length === 1) missing[0].amount = -sum;
    else if (sum !== 0) return unsupported('transaction does not balance');
    if (t.postings.length < 2) return unsupported('fewer than two postings');
    return t;
  }

  function pad(s, n) { return s.length >= n ? s : s + ' '.repeat(n - s.length); }
  function padLeft(s, n) { return s.length >= n ? s : ' '.repeat(n - s.length) + s; }

  J.formatTxn = function (t) {
    if (t.raw) return t.raw;
    const st = t.postings.map(p => p.status || '');
    const same = st.every(s => s === st[0]);
    const txStatus = same ? st[0] : '';
    let head = t.date;
    if (txStatus) head += ' ' + txStatus;
    if (t.code) head += ' (' + t.code + ')';
    let desc = t.payee || '';
    if (t.memo) desc += ' | ' + t.memo;
    if (desc) head += ' ' + desc;
    const hc = J.formatComment(t.text, t.tags);
    if (hc) head += '  ; ' + hc;
    const out = [head];
    for (const x of t.extraComments || []) out.push('    ; ' + x);
    const w = Math.max(36, ...t.postings.map(p => p.account.length + 4));
    for (const p of t.postings) {
      let line = '    ' + (same || !p.status ? '' : p.status + ' ') + pad(p.account, w) +
        padLeft(Money.toJournal(p.amount), 12);
      if (p.assertion != null) line += ' = ' + Money.toJournal(p.assertion);
      const pc = J.formatComment(p.text, p.tags);
      if (pc) line += '  ; ' + pc;
      out.push(line);
    }
    return out.join('\n');
  };

  // Serialize a Book (see book.js) back to journal text, in a fixed order.
  J.serialize = function (book) {
    const out = [];
    const s = book.settings;
    out.push('; sb:book ' + J.formatKV({ name: s.name, template: s.template, 'fy-start': String(s.fyStart).padStart(2, '0'),
      currency: s.currency !== '$' ? s.currency : '' }));
    if (s.lockDate) out.push('; sb:lock ' + s.lockDate);
    if (s.advanced) out.push('; sb:view advanced:yes');
    if (Object.keys(s.checks || {}).length) out.push('; sb:checks ' + J.formatKV(s.checks));
    if (Object.keys(s.biz || {}).length) out.push('; sb:biz ' + J.formatKV(s.biz));
    for (const r of book.rules) out.push('; sb:rule ' + J.formatKV(r));
    for (const m of book.csvMaps) out.push('; sb:csvmap ' + J.formatKV(m));
    for (const r of book.recons) out.push('; sb:recon ' + J.formatKV({ account: r.account, date: r.date, balance: Money.toInput(r.balance) }));
    for (const o of book.sbOther) out.push('; sb:' + o.kind + (o.rest ? ' ' + o.rest : ''));
    out.push(...book.headerComments);
    out.push('');
    if (book.commodities.length) out.push(...book.commodities);
    else out.push('commodity ' + s.currency + '1,000.00');
    out.push('');
    const accts = [...book.accounts.values()].filter(a => !a.implied).sort((a, b) => a.name.localeCompare(b.name));
    const aw = Math.max(36, ...accts.map(a => a.name.length + 10));
    for (const a of accts) {
      out.push(...(a.pre || []));
      const tags = Object.assign({ type: a.type }, a.tags);
      if (a.hidden) tags.hidden = 'yes'; else delete tags.hidden;
      out.push(pad('account ' + a.name, aw) + '; ' + J.formatComment(a.text, tags));
      out.push(...(a.extra || []));
    }
    const payees = [...book.payees.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (payees.length) out.push('');
    const pw = Math.max(24, ...payees.map(p => p.name.length + 8));
    for (const p of payees) {
      out.push(...(p.pre || []));
      const c = J.formatComment(p.text, p.tags);
      out.push(c ? pad('payee ' + p.name, pw) + '; ' + c : 'payee ' + p.name);
    }
    for (const r of book.raw) { out.push(''); out.push(...(r.pre || [])); out.push(r.text); }
    const txns = book.sortedTxns();
    for (const t of txns) {
      out.push('');
      out.push(...(t.pre || []));
      out.push(J.formatTxn(t));
    }
    if (book.trailing.length) { out.push(''); out.push(...book.trailing); }
    if (book.log.length) {
      out.push('');
      for (const l of book.log) out.push('; sb:log ' + l);
    }
    return out.join('\n') + '\n';
  };

  SL.Journal = J;
  if (typeof module !== 'undefined') module.exports = J;
})(typeof window !== 'undefined' ? window : globalThis);
