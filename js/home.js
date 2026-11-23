/* Simple Ledger - home.js: dashboard extras, backup settings, Help screen */
(function () {
  'use strict';
  const { Money, Book, UI, Storage } = SL;
  const h = UI.h;
  const S = () => SL.state;
  const money = (c) => Money.format(c);

  // ---------- dashboard ----------
  function monthsBack(n) {
    const out = [], d = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const p = (x) => String(x).padStart(2, '0');
      const from = m.getFullYear() + '-' + p(m.getMonth() + 1) + '-01';
      const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      out.push({ from, to: m.getFullYear() + '-' + p(m.getMonth() + 1) + '-' + p(last), label: m.toLocaleString('en-US', { month: 'short' }) });
    }
    return out;
  }

  function extras(b) {
    const wrap = h('div');
    if (!b.txns.length) return wrap;
    // review nudge
    const n = SL.AIUI ? SL.AIUI.count(b) : 0;
    if (n) wrap.appendChild(h('div', { class: 'tip click', onclick: () => SL.app.go('review') }, h('strong', null, n + ' thing' + (n === 1 ? '' : 's') + ' to review. '), 'Open the Review list.'));
    const wait = SL.Flow.pending(b);
    if (wait.length) wrap.appendChild(h('div', { class: 'tip click', onclick: () => SL.app.go('checks') }, h('strong', null, wait.length + ' received check' + (wait.length === 1 ? '' : 's') + ' (' + money(wait.reduce((s, w) => s + w.amount, 0)) + ') waiting to be deposited. '), 'Open Checks.'));
    // income vs expenses
    const ms = monthsBack(6).map(m => ({ ...m, inc: -b.totalByType('Revenue', m.from, m.to), exp: b.totalByType('Expense', m.from, m.to) }));
    const max = Math.max(1, ...ms.map(m => Math.max(m.inc, m.exp)));
    const bar = (v, cls, label) => h('div', { class: 'bar ' + cls, title: label + ' ' + money(v), style: { height: Math.max(0, v) / max * 100 + '%' } });
    const left = h('div', null, h('h2', null, 'Income and expenses, last 6 months'),
      h('div', { class: 'chart-bars' }, ms.map(m => h('div', { class: 'mo' }, h('div', { class: 'pair' }, bar(m.inc, 'inc', m.label + ' income'), bar(m.exp, 'exp', m.label + ' expenses'))))),
      h('div', { class: 'chart-labels' }, ms.map(m => h('span', null, m.label))),
      h('p', { class: 'note' }, h('span', { style: { color: '#3b8f5a' } }, '■ '), 'Income  ', h('span', { style: { color: '#c9743a' } }, '■ '), 'Expenses. Hover a bar for the amount.'));
    // top expenses, last 90 days
    const since = new Date(Date.now() - 90 * 864e5), p2 = (x) => String(x).padStart(2, '0');
    const from = since.getFullYear() + '-' + p2(since.getMonth() + 1) + '-' + p2(since.getDate());
    const by = new Map();
    for (const t of b.txns) { if (t.raw || t.date < from) continue; for (const p of t.postings) if (b.accountType(p.account) === 'Expense') by.set(p.account, (by.get(p.account) || 0) + p.amount); }
    const top = [...by].filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).slice(0, 6);
    const right = h('div', null, h('h2', null, 'Top expenses, last 90 days'),
      top.length ? top.map(([a, v]) => h('div', { class: 'hbar' }, h('span', null, Book.leafOf(a)), h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: v / top[0][1] * 100 + '%' } })), h('span', { class: 'num' }, money(v)))) : h('p', { class: 'note' }, 'No expenses yet.'));
    wrap.appendChild(h('div', { class: 'dash-cols' }, left, right));
    // recent activity
    const rec = b.sortedTxns().filter(t => !t.raw).slice(-8).reverse();
    wrap.appendChild(h('h2', null, 'Recent activity'));
    wrap.appendChild(h('table', { class: 'grid' }, h('tbody', null, rec.map(t => {
      const amt = t.postings.reduce((s, p) => s + Math.max(0, p.amount), 0);
      return h('tr', { class: 'click', onclick: () => SL.app.go('journal') }, h('td', { class: 'date' }, t.date), h('td', null, t.payee || t.memo || ''),
        h('td', { class: 'note' }, t.postings.map(p => Book.leafOf(p.account)).join(' · ')), h('td', { class: 'num' }, money(amt)));
    }))));
    return wrap;
  }

  // ---------- backups ----------
  function backupSection() {
    const box = h('div', { class: 'settings-extra' });
    async function draw() {
      UI.clear(box);
      box.appendChild(h('h2', null, 'Backups'));
      const dir = Storage.canBackupFolder ? await Storage.backupFolder() : null;
      const body = h('div', { class: 'form settings' });
      if (!Storage.canBackupFolder) {
        body.appendChild(h('p', { class: 'note' }, 'This browser cannot write to a backup folder automatically (Chrome or Edge on a computer can). You can still download a dated copy whenever you like.'));
      } else if (dir) {
        body.appendChild(h('p', null, 'Every time you save, a dated copy (', h('code', null, 'name-YYYY-MM-DD.journal'), ') is also written to the folder ', h('strong', null, dir.name), '. The newest 30 days are kept; older copies are removed. Point the folder at Dropbox, iCloud, or a USB drive for safety.'));
        body.appendChild(h('div', { class: 'key-row' },
          h('button', { onclick: async () => {
            try { const r = await Storage.backup(S().doc.name, S().book.toText(), 30); UI.toast('Backed up as ' + r.file + ' (' + r.kept + ' kept)'); } catch (e) { UI.toast(e.message, 'error'); }
          } }, 'Back up now'),
          h('button', { onclick: async () => { try { await Storage.chooseBackupFolder(); draw(); } catch (e) { if (e.name !== 'AbortError') UI.toast(e.message, 'error'); } } }, 'Change folder'),
          h('button', { onclick: async () => { await Storage.clearBackupFolder(); draw(); } }, 'Stop backing up')));
      } else {
        body.appendChild(h('p', null, 'No backup folder is set. Pick a folder and every save will also leave a dated copy there. The saved file is the only copy until you do.'));
        body.appendChild(h('div', null, h('button', { class: 'primary', onclick: async () => { try { await Storage.chooseBackupFolder(); draw(); } catch (e) { if (e.name !== 'AbortError') UI.toast(e.message, 'error'); } } }, 'Choose backup folder…')));
      }
      body.appendChild(h('div', null, h('button', { onclick: () => {
        const d = new Date(), p = (x) => String(x).padStart(2, '0');
        const base = (S().doc && S().doc.name || 'book').replace(/\.[^.]*$/, '');
        const a = h('a', { href: URL.createObjectURL(new Blob([S().book.toText()], { type: 'text/plain' })), download: base + '-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.journal' });
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } }, 'Download a dated copy')));
      box.appendChild(body);
    }
    draw();
    return box;
  }

  // ---------- help ----------
  function helpScreen(main) { SL.HelpContent.render(main); }

  SL.Home = { extras, backupSection, helpScreen };
})();
