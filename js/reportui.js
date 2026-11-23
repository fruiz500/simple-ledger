/* Simple Ledger - reportui.js: the Reports screen */
(function () {
  'use strict';
  const { Money, Book, UI, Reports: R } = SL;
  const h = UI.h;

  const KINDS = [['is', 'Income statement'], ['bs', 'Balance sheet'], ['tb', 'Trial balance'], ['gl', 'General ledger'], ['cat', 'Category totals']];

  function slug(s) { return (s || 'book').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'book'; }

  function ensureState() {
    const S = SL.state;
    if (!S.report) {
      const p = R.period(S.book, 'fy', Book.today());
      S.report = { kind: 'is', preset: 'fy', from: p.from, to: p.to, zero: false, basis: 'accrual' };
    }
    return S.report;
  }

  function drillDialog(d) {
    const b = SL.state.book;
    const res = R.drill(R.view(b, SL.state.report && SL.state.report.basis), d);
    const rows = res.items.map(({ t, amount }) => h('tr', null,
      h('td', null, t.date), h('td', null, t.payee || ''), h('td', { class: 'memo' }, t.memo || ''),
      h('td', { class: 'num' + (amount < 0 ? ' neg' : '') }, Money.format(amount))));
    const body = h('div', null,
      h('p', { class: 'note' }, (d.from || 'beginning') + ' to ' + d.to + ' · ' + res.items.length + ' transaction' + (res.items.length === 1 ? '' : 's')),
      h('div', { class: 'drill-scroll' }, h('table', { class: 'grid' },
        h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Payee'), h('th', null, 'Memo'), h('th', { class: 'num' }, 'Amount'))),
        h('tbody', null, rows),
        h('tfoot', null, h('tr', null, h('td', { colspan: 3 }, 'Total'), h('td', { class: 'num' }, Money.format(res.sum)))))));
    const acct = b.accounts.get(d.account);
    const buttons = [{ label: 'Close', value: null }];
    if (acct && (acct.type === 'Asset' || acct.type === 'Liability') && b.isLeaf(d.account)) buttons.unshift({ label: 'Open register', value: 'reg' });
    UI.modal({ title: d.account, body, buttons, wide: true }).then(v => { if (v === 'reg') SL.app.go('register', d.account); });
  }

  function cellEl(c, num) {
    if (c.c !== undefined) {
      const txt = Money.format(c.c);
      const td = h('td', { class: 'num' + (c.c < 0 ? ' neg' : '') });
      if (c.drill) td.appendChild(h('a', { href: '#', title: 'Show transactions', onclick: (e) => { e.preventDefault(); drillDialog(c.drill); } }, txt));
      else td.appendChild(document.createTextNode(txt));
      return td;
    }
    return h('td', { class: num ? 'num' : '', style: c.indent ? { paddingLeft: (8 + c.indent * 20) + 'px' } : null }, c.t);
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/csv' });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function render(main) {
    const b = SL.state.book;
    const st = ensureState();
    const N = R.names(b);
    const biz = SL.Biz.cfg(b).invoices;
    const aging = st.kind === 'ar' || st.kind === 'ap';
    if (aging && !biz) st.kind = 'is';
    if (st.kind === 'people' && !SL.Biz.peopleOn(b)) st.kind = 'is';
    const asOfOnly = st.kind === 'bs' || st.kind === 'tb' || aging;
    const redraw = () => SL.render();

    const kind = h('select', { onchange: (e) => { st.kind = e.target.value; redraw(); } },
      KINDS.concat(SL.Biz.peopleOn(b) ? [['people', 'Income and expenses by person']] : [], biz ? [['ar', 'Customer aging (A/R)'], ['ap', 'Supplier aging (A/P)']] : []).map(([v, l]) => h('option', { value: v }, N[v] || l)));
    kind.value = st.kind;
    const preset = h('select', { onchange: (e) => {
      st.preset = e.target.value;
      const p = R.period(b, st.preset, Book.today());
      if (p) { st.from = p.from; st.to = p.to; }
      redraw();
    } }, R.PRESETS.map(([v, l]) => h('option', { value: v }, l)));
    preset.value = st.preset;
    const from = h('input', { type: 'date', value: st.from, onchange: (e) => { st.from = e.target.value; st.preset = 'custom'; redraw(); } });
    const to = h('input', { type: 'date', value: st.to, onchange: (e) => { st.to = e.target.value; st.preset = 'custom'; redraw(); } });

    main.appendChild(h('div', { class: 'report-controls' },
      h('h1', null, 'Reports'),
      h('div', { class: 'rc-row' },
        h('label', null, 'Report', kind),
        h('label', null, 'Period', preset),
        asOfOnly ? null : h('label', null, 'From', from),
        h('label', null, asOfOnly ? 'As of' : 'To', to),
        biz && !aging ? h('label', null, 'Basis', h('select', { onchange: (e) => { st.basis = e.target.value; redraw(); } },
          [['accrual', 'Accrual (invoices count when issued)'], ['cash', 'Cash (counts when paid)']].map(([v, l]) => h('option', { value: v, selected: st.basis === v ? true : null }, l)))) : null,
        st.kind === 'gl' || aging ? null : h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.zero, onchange: (e) => { st.zero = e.target.checked; redraw(); } }), ' Show zero accounts'),
        h('span', { class: 'spacer' }),
        h('button', { onclick: () => window.print() }, 'Print / PDF'),
        h('button', { id: 'btn-csv' }, 'Download CSV'))));

    if (!st.from || !st.to || (!asOfOnly && st.from > st.to)) {
      main.appendChild(h('p', { class: 'empty' }, 'Choose a valid date range.'));
      return;
    }
    const rep = R.build(b, st.kind, st.from, st.to, { zero: st.zero, basis: biz ? st.basis : 'accrual' });
    document.getElementById('btn-csv').onclick = () => download(slug(b.settings.name) + '-' + st.kind + '-' + st.to + '.csv', R.toCSV(rep));

    const page = h('div', { class: 'report' },
      h('div', { class: 'rep-head' }, h('div', { class: 'rep-org' }, b.settings.name), h('h2', null, rep.title), h('div', { class: 'rep-sub' }, rep.subtitle)),
      rep.notes.length ? h('ul', { class: 'warnings' }, rep.notes.map(n => h('li', null, n))) : null);
    const cols = rep.columns;
    const table = h('table', { class: 'grid rep rep-' + st.kind },
      h('thead', null, h('tr', null, cols.map(c => h('th', { class: c.num ? 'num' : '' }, c.label)))),
      h('tbody', null, rep.rows.map(r => h('tr', { class: 'r-' + r.cls }, r.cells.map((c, i) => cellEl(c, cols[i] && cols[i].num))))));
    page.appendChild(h('div', { class: 'rep-scroll' }, table));
    if (rep.rows.filter(r => r.cls !== 'blank').length <= (st.kind === 'tb' ? 1 : 3) && st.kind !== 'gl')
      page.appendChild(h('p', { class: 'empty' }, 'Nothing to report for these dates.'));
    main.appendChild(page);
  }

  SL.ReportUI = { render };
})();
