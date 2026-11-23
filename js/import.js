/* Simple Ledger - import.js
   Parses bank downloads (OFX/QFX, CSV), matches them against what is already in the book,
   suggests accounts, and applies the result. No screen code here. */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const Money = SL.Money || (typeof require !== 'undefined' ? require('./money.js') : null);
  const I = {};

  const pad = (n) => String(n).padStart(2, '0');
  const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const clean = (s) => decode(s || '').replace(/\s+/g, ' ').trim();
  // Text that ends up in the journal must not contain characters the format treats specially
  const safePayee = (s) => clean(s).replace(/[;|]/g, ' ').replace(/^[*!(\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const safeMemo = (s) => clean(s).replace(/;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const safeCode = (s) => clean(s).replace(/[;)(]/g, '').slice(0, 12);
  I.safePayee = safePayee;

  // ---------- OFX / QFX ----------
  function ofxAmount(s) {
    s = (s || '').trim();
    if (/^[-+]?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    return Money.parse(s.replace(/,/g, ''));
  }

  I.parseOFX = function (text) {
    const t = text.replace(/\r/g, '');
    if (!/<OFX|<STMTTRN/i.test(t)) throw new Error('This does not look like an OFX or QFX file.');
    const tag = (blk, name) => { const m = blk.match(new RegExp('<' + name + '>([^<\\n]*)', 'i')); return m ? m[1].trim() : ''; };
    const info = { kind: 'ofx', account: tag(t, 'ACCTID'), type: tag(t, 'ACCTTYPE'), balance: null, balanceDate: '', items: [] };
    const lb = t.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>|$)/i);
    if (lb) {
      const v = ofxAmount(tag(lb[1], 'BALAMT'));
      if (v != null) {
        info.balance = v;
        const d = tag(lb[1], 'DTASOF').slice(0, 8);
        if (/^\d{8}$/.test(d)) info.balanceDate = d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8);
      }
    }
    const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi;
    let m;
    while ((m = re.exec(t))) {
      const blk = m[1];
      const d = tag(blk, 'DTPOSTED').slice(0, 8);
      if (!/^\d{8}$/.test(d)) continue;
      const amt = ofxAmount(tag(blk, 'TRNAMT'));
      if (amt == null || amt === 0) continue;
      const name = clean(tag(blk, 'NAME') || tag(blk, 'PAYEE'));
      const memo = clean(tag(blk, 'MEMO'));
      info.items.push({
        date: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), amount: amt,
        payee: safePayee(name || memo), memo: name && memo && memo !== name ? safeMemo(memo) : '',
        code: safeCode(tag(blk, 'CHECKNUM')), fitid: tag(blk, 'FITID').replace(/[,;\s]/g, '')
      });
    }
    if (!info.items.length) throw new Error('No transactions were found in this file.');
    return info;
  };

  // ---------- CSV ----------
  I.parseCSV = function (text) {
    text = text.replace(/^﻿/, '');
    const head = text.split(/\r?\n/).slice(0, 6);
    const count = (d) => head.reduce((n, l) => n + l.split(d).length - 1, 0);
    let delim = ',', best = count(',');
    for (const d of [';', '\t', '|']) { const c = count(d); if (c > best) { best = c; delim = d; } }
    const rows = [];
    let row = [], cell = '', q = false;
    const endRow = () => { row.push(cell); cell = ''; if (row.some(c => c.trim() !== '')) rows.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow(); }
      else cell += ch;
    }
    endRow();
    return rows.map(r => r.map(c => c.trim()));
  };

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  I.parseDate = function (s, fmt) {
    s = (s || '').trim();
    if (!s) return null;
    let y, m, d, x;
    if ((x = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) { y = +x[1]; m = +x[2]; d = +x[3]; }
    else if ((x = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?!\d)/))) {
      const a = +x[1], b = +x[2];
      y = +x[3]; if (y < 100) y += y < 70 ? 2000 : 1900;
      if (fmt === 'dmy') { d = a; m = b; } else { m = a; d = b; }
    }
    else if ((x = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})/))) { m = MONTHS.indexOf(x[1].slice(0, 3).toLowerCase()) + 1; d = +x[2]; y = +x[3]; }
    else if ((x = s.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})\.?[ ,-]*(\d{2,4})/))) { d = +x[1]; m = MONTHS.indexOf(x[2].slice(0, 3).toLowerCase()) + 1; y = +x[3]; if (y < 100) y += 2000; }
    else return null;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100)) return null;
    if (new Date(Date.UTC(y, m - 1, d)).getUTCMonth() !== m - 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  };

  I.detectDateFormat = function (samples) {
    let dmy = false, mdy = false;
    for (const s of samples) {
      const x = (s || '').match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
      if (!x) continue;
      if (+x[1] > 12) dmy = true;
      if (+x[2] > 12) mdy = true;
    }
    return dmy && !mdy ? 'dmy' : 'mdy';
  };

  function csvAmount(s) {
    if (s == null) return null;
    s = String(s).trim();
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/\s*DR$/i.test(s)) { neg = !neg; s = s.replace(/\s*DR$/i, ''); }
    s = s.replace(/\s*CR$/i, '');
    s = s.replace(/[^\d.,+\-]/g, '');
    if (!s) return null;
    if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > ld && /,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    const v = Money.parse(s);
    if (v == null) return null;
    return neg ? -v : v;
  }
  I.csvAmount = csvAmount;

  // Guess the column layout. Returns {hasHeader, headers, map:{date,desc,amount,debit,credit,num}, fmt}
  I.guessCSV = function (rows, targetType) {
    const first = rows[0] || [];
    const hasHeader = !first.some(c => I.parseDate(c, 'mdy'));
    const ncol = Math.max(...rows.slice(0, 20).map(r => r.length), 1);
    const headers = hasHeader ? first.slice() : Array.from({ length: ncol }, (_, i) => 'Column ' + (i + 1));
    while (headers.length < ncol) headers.push('Column ' + (headers.length + 1));
    const find = (re) => headers.findIndex(h => re.test(h));
    const map = {
      date: find(/date|posted/i), desc: find(/desc|payee|name|merchant|details|narrat|particulars|memo/i),
      amount: find(/^\W*amount|^value|^sum/i), debit: find(/debit|withdraw|paid out|money out/i),
      credit: find(/credit|deposit|paid in|money in/i), num: find(/check|chk|cheque|number|reference|\bref\b/i)
    };
    const body = (hasHeader ? rows.slice(1) : rows).slice(0, 40);
    const frac = (i, test) => body.length ? body.filter(r => test(r[i])).length / body.length : 0;
    if (map.date < 0) for (let i = 0; i < ncol; i++) if (frac(i, v => !!I.parseDate(v, 'mdy')) > 0.6) { map.date = i; break; }
    if (map.amount < 0 && map.debit < 0 && map.credit < 0) {
      for (let i = 0; i < ncol; i++) if (i !== map.date && frac(i, v => v && csvAmount(v) != null && /\d/.test(v)) > 0.6) { map.amount = i; }
    }
    if (map.desc < 0) {
      let bestLen = 0;
      for (let i = 0; i < ncol; i++) {
        if (i === map.date || i === map.amount) continue;
        const len = body.reduce((n, r) => n + (r[i] || '').length, 0);
        if (len > bestLen) { bestLen = len; map.desc = i; }
      }
    }
    if (map.amount >= 0) { map.debit = -1; map.credit = -1; }
    if (map.num === map.desc || map.num === map.date) map.num = -1;
    const fmt = map.date >= 0 ? I.detectDateFormat(body.map(r => r[map.date])) : 'mdy';
    // credit-card style files usually list charges as positive numbers
    let invert = false;
    if (targetType === 'Liability' && map.amount >= 0) {
      const vals = body.map(r => csvAmount(r[map.amount])).filter(v => v != null && v !== 0);
      invert = vals.length > 0 && vals.filter(v => v > 0).length > vals.length / 2;
    }
    return { hasHeader, headers, map, fmt, invert };
  };

  // cfg: {hasHeader, map, fmt, invert}. Returns {items, errors}
  I.buildFromCSV = function (rows, cfg) {
    const body = cfg.hasHeader ? rows.slice(1) : rows;
    const m = cfg.map;
    const items = [], errors = [];
    body.forEach((r, i) => {
      const line = i + 1 + (cfg.hasHeader ? 1 : 0);
      const d = m.date >= 0 ? I.parseDate(r[m.date], cfg.fmt) : null;
      if (!d) { errors.push('Row ' + line + ': date not recognized'); return; }
      let amt = null;
      if (m.amount >= 0) amt = csvAmount(r[m.amount]);
      else {
        const dv = m.debit >= 0 ? csvAmount(r[m.debit]) : null, cv = m.credit >= 0 ? csvAmount(r[m.credit]) : null;
        if (dv != null || cv != null) amt = Math.abs(cv || 0) - Math.abs(dv || 0);
      }
      if (amt == null) { errors.push('Row ' + line + ': amount not recognized'); return; }
      if (cfg.invert) amt = -amt;
      if (amt === 0) return;
      items.push({ date: d, amount: amt, payee: m.desc >= 0 ? safePayee(r[m.desc]) : '', memo: '',
        code: m.num >= 0 ? safeCode(r[m.num]) : '', fitid: '' });
    });
    return { items, errors };
  };

  // ---------- matching ----------
  const dayNum = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;

  // "JEWEL OSCO #3342" and "Jewel Osco" are the same payee
  I.payeeKey = (p) => (p || '').toLowerCase().replace(/[#*]\s*\d+/g, ' ').replace(/\b\d{3,}\b/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  I.suggestAccount = function (book, item, acct) {
    const text = (item.payee + ' ' + item.memo).toLowerCase();
    const rules = book.rules.filter(r => r.match && r.account).sort((a, b) => b.match.length - a.match.length);
    for (const r of rules) if (text.includes(r.match.toLowerCase()) && book.accounts.has(r.account) && r.account !== acct) return { account: r.account, via: 'rule' };
    const key = I.payeeKey(item.payee);
    if (key) {
      const list = book.sortedTxns();
      for (let i = list.length - 1; i >= 0; i--) {
        const t = list[i];
        if (t.raw || t.postings.length !== 2 || I.payeeKey(t.payee) !== key) continue;
        const o = t.postings.find(p => p.account !== acct);
        if (o && book.accounts.has(o.account) && o.account !== acct && book.accountType(o.account) !== 'Equity') return { account: o.account, via: 'history' };
      }
    }
    return { account: '', via: '' };
  };

  // Annotates each item: status 'new' | 'match' | 'dup' | 'locked', plus account suggestion for new ones
  I.annotate = function (book, acct, items, opts) {
    opts = opts || {};
    const window_ = opts.days != null ? opts.days : (book.accountType(acct) === 'Liability' ? 7 : 3);
    const fitids = new Set();
    const pool = [];
    for (const t of book.txns) {
      if (t.raw) continue;
      const idx = t.postings.findIndex(p => p.account === acct);
      if (idx < 0) continue;
      if (t.tags.fitid) fitids.add(t.tags.fitid);
      const p = t.postings[idx];
      if (!(p.tags && p.tags.rec)) pool.push({ t, idx, p, used: false });
    }
    const seen = new Set();
    for (const it of items) {
      it.include = true; it.status = 'new'; it.matchTxn = null; it.matchIdx = -1; it.account = ''; it.via = ''; it.rule = false; it.note = '';
      if (it.fitid && (fitids.has(it.fitid) || seen.has(it.fitid))) { it.status = 'dup'; it.include = false; it.note = 'Already imported'; continue; }
      if (it.fitid) seen.add(it.fitid);
      if (book.settings.lockDate && it.date <= book.settings.lockDate) { it.status = 'locked'; it.include = false; it.note = 'Books are locked through ' + book.settings.lockDate; }
    }
    const order = items.filter(it => it.status === 'new').sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    for (const it of order) {
      let best = null, bestDiff = Infinity;
      for (const e of pool) {
        if (e.used) continue;
        if (e.p.amount !== it.amount) {
          // phone entries in a foreign currency: the card's converted amount differs a little
          if (!e.t.tags.fx) continue;
          const a = Math.abs(e.p.amount), b = Math.abs(it.amount);
          if ((e.p.amount < 0) !== (it.amount < 0) || Math.abs(a - b) > Math.round(a * 0.05)) continue;
        }
        if (e.t.tags.fitid && e.t.tags.fitid !== it.fitid) continue;
        const diff = Math.abs(dayNum(e.t.date) - dayNum(it.date));
        if (diff <= window_ && diff < bestDiff) { best = e; bestDiff = diff; }
      }
      if (best) {
        best.used = true;
        it.status = 'match'; it.matchTxn = best.t; it.matchIdx = best.idx;
        it.note = 'Matches ' + best.t.date + ' ' + (best.t.payee || '') + (best.p.amount !== it.amount ? ' (foreign currency, amount differs slightly)' : '');
      }
    }
    for (const it of items) {
      if (it.status !== 'new') continue;
      const s = I.suggestAccount(book, it, acct);
      it.account = s.account; it.via = s.via;
    }
    return items;
  };

  // items: annotated and possibly edited by the user. Returns {added, matched, rejected[]}
  I.apply = function (book, acct, items, meta) {
    meta = meta || {};
    const fresh = [];
    let matched = 0;
    for (const it of items) {
      if (!it.include) continue;
      if (it.status === 'match' && it.matchTxn) {
        const p = it.matchTxn.postings[it.matchIdx];
        p.status = '*';
        if (it.fitid) it.matchTxn.tags.fitid = it.fitid;
        matched++;
        continue;
      }
      if (it.status !== 'new') continue;
      const other = it.account || (it.amount < 0 ? 'Expenses:Uncategorized' : 'Income:Uncategorized');
      if (!book.accounts.has(other)) {
        const a = book.ensureAccount(other, it.amount < 0 ? 'Expense' : 'Revenue');
        a.implied = false;
      }
      const t = Object.assign(book.blank(), {
        date: it.date, payee: it.payee, memo: it.memo, code: it.code,
        tags: it.fitid ? { fitid: it.fitid } : {},
        postings: [
          { account: acct, amount: it.amount, status: '*', text: '', tags: {} },
          { account: other, amount: -it.amount, status: '', text: '', tags: {} }
        ]
      });
      fresh.push(t);
      if (it.rule && it.account && it.payee && !book.rules.some(r => r.match === it.payee)) book.rules.push({ match: it.payee, account: it.account });
    }
    const label = acct + ' ' + fresh.length + ' new, ' + matched + ' matched' + (meta.file ? ' from ' + meta.file : '');
    const rejected = book.importTxns(fresh, label);
    return { added: fresh.length - rejected.length, matched, rejected };
  };

  SL.Import = I;
  if (typeof module !== 'undefined') module.exports = I;
})(typeof window !== 'undefined' ? window : globalThis);
