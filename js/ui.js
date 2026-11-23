/* Simple Ledger - ui.js: small DOM helpers, dialogs and toasts */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const UI = {};

  // h('div', {class:'x', onclick: fn}, child, 'text', [more])
  UI.h = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'value') e.value = v;
        else if (k === 'checked') e.checked = !!v;
        else if (k === 'html') e.innerHTML = v;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (k) => {
      if (k == null || k === false) return;
      if (Array.isArray(k)) k.forEach(add);
      else e.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    };
    kids.forEach(add);
    return e;
  };
  const h = UI.h;

  UI.clear = (e) => { while (e.firstChild) e.removeChild(e.firstChild); return e; };

  UI.toast = function (msg, kind) {
    let box = document.getElementById('toasts');
    if (!box) { box = h('div', { id: 'toasts' }); document.body.appendChild(box); }
    const t = h('div', { class: 'toast ' + (kind || '') }, msg);
    box.appendChild(t);
    setTimeout(() => t.classList.add('fade'), kind === 'error' ? 5000 : 2800);
    setTimeout(() => t.remove(), kind === 'error' ? 5600 : 3400);
  };

  // modal({title, body: Node, buttons:[{label, value, primary, danger}], onOpen, wide})
  // Resolves with the clicked button's value (or null on Escape / backdrop).
  // A button may have validate(): returning a string keeps the dialog open and shows it.
  UI.modal = function (opts) {
    return new Promise((resolve) => {
      const err = h('div', { class: 'dlg-error' });
      const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
      UI.lastDialogClose = close;
      const btns = (opts.buttons || [{ label: 'OK', value: true, primary: true }]).map(b =>
        h('button', {
          class: (b.primary ? 'primary ' : '') + (b.danger ? 'danger ' : '') + (b.left ? 'left' : ''),
          type: 'button',
          onclick: () => {
            if (b.validate) { const m = b.validate(); if (m) { err.textContent = m; return; } }
            close(b.value);
          }
        }, b.label));
      const dlg = h('div', { class: 'dlg' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
        h('h2', null, opts.title || ''),
        h('div', { class: 'dlg-body' }, opts.body || ''),
        err,
        h('div', { class: 'dlg-buttons' }, btns));
      const back = h('div', { class: 'backdrop', onmousedown: (e) => { if (e.target === back && !opts.sticky) close(null); } }, dlg);
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
          const p = btns.find(b => b.classList.contains('primary'));
          if (p) { e.preventDefault(); p.click(); }
        }
      };
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(back);
      UI.lastDialogError = (m) => { err.textContent = m; };
      if (opts.onOpen) opts.onOpen(dlg);
      const first = dlg.querySelector('input, select, textarea');
      (first || btns[btns.length - 1]).focus();
    });
  };

  UI.alert = (title, msg) => UI.modal({ title, body: h('p', null, msg), buttons: [{ label: 'OK', value: true, primary: true }] });

  UI.confirm = (title, msg, okLabel, danger) => UI.modal({
    title, body: h('p', null, msg),
    buttons: [{ label: 'Cancel', value: false }, { label: okLabel || 'OK', value: true, primary: !danger, danger: !!danger }]
  }).then(v => !!v);

  // fields: [{name, label, type:'text'|'select'|'date'|'checkbox'|'amount'|'month', value, options:[[v,label]], list, help, required}]
  UI.form = function (title, fields, okLabel, check) {
    const inputs = {};
    const rows = fields.map(f => {
      let inp;
      if (f.type === 'select' || f.type === 'month') {
        const opts = f.type === 'month'
          ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => [String(i + 1), m])
          : f.options;
        inp = h('select', { name: f.name }, opts.map(([v, l]) => h('option', { value: v }, l)));
        inp.value = f.value != null ? String(f.value) : opts[0][0];
      } else if (f.type === 'checkbox') {
        inp = h('input', { type: 'checkbox', name: f.name, checked: !!f.value });
      } else {
        inp = h('input', {
          type: f.type === 'date' ? 'date' : 'text', name: f.name, value: f.value || '',
          inputmode: f.type === 'amount' ? 'decimal' : null, list: f.list || null,
          placeholder: f.placeholder || null, autocomplete: 'off'
        });
      }
      inputs[f.name] = inp;
      if (f.onchange) inp.addEventListener('change', () => f.onchange(inp, inputs));
      return h('label', { class: 'field' + (f.type === 'checkbox' ? ' check' : '') },
        f.type === 'checkbox' ? [inp, h('span', null, f.label)] : [h('span', null, f.label), inp],
        f.help ? h('small', null, f.help) : null);
    });
    const read = () => {
      const v = {};
      for (const f of fields) {
        const i = inputs[f.name];
        v[f.name] = f.type === 'checkbox' ? i.checked : i.value.trim();
      }
      return v;
    };
    return UI.modal({
      title,
      body: h('div', { class: 'form' }, rows),
      buttons: [{ label: 'Cancel', value: null }, {
        label: okLabel || 'OK', value: 'ok', primary: true,
        validate: () => {
          const v = read();
          for (const f of fields) if (f.required && !v[f.name]) return f.label + ' is required.';
          return check ? check(v) : '';
        }
      }]
    }).then(r => r === 'ok' ? read() : null);
  };

  UI.datalist = function (id, values) {
    let dl = document.getElementById(id);
    if (!dl) { dl = h('datalist', { id }); document.body.appendChild(dl); }
    UI.clear(dl);
    for (const v of values) dl.appendChild(h('option', { value: v }));
    return dl;
  };

  SL.UI = UI;
})(window);
