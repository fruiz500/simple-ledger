/* Simple Ledger - storage.js
   The journal file is the source of truth. IndexedDB only keeps a crash-recovery
   draft and the Recent books list. */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const S = {};

  const canPick = typeof window !== 'undefined' && 'showOpenFilePicker' in window;
  const canSaveAs = typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  S.canWriteInPlace = canPick && canSaveAs;
  const PICK_TYPES = [{ description: 'Journal files', accept: { 'text/plain': ['.journal', '.ledger', '.hledger', '.txt'] } }];

  // ---- tiny IndexedDB key-value store ----
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('simple-ledger', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  async function kv(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  S.get = (k) => kv('readonly', s => s.get(k)).catch(() => undefined);
  S.set = (k, v) => kv('readwrite', s => s.put(v, k)).catch(e => console.warn('IndexedDB write failed', e));
  S.del = (k) => kv('readwrite', s => s.delete(k)).catch(() => {});

  // ---- recent books ----
  S.recent = async () => (await S.get('recent')) || [];
  S.addRecent = async (name, handle) => {
    let list = await S.recent();
    const keep = [];
    for (const r of list) {
      let same = r.name === name;
      if (handle && r.handle && r.handle.isSameEntry) { try { same = await r.handle.isSameEntry(handle); } catch (e) { /* ignore */ } }
      if (!same) keep.push(r);
    }
    keep.unshift({ name, handle: handle || null, time: Date.now() });
    try { await S.set('recent', keep.slice(0, 10)); }
    catch (e) { await S.set('recent', keep.slice(0, 10).map(r => ({ name: r.name, handle: null, time: r.time }))); }
  };
  S.removeRecent = async (name) => {
    const list = (await S.recent()).filter(r => r.name !== name);
    await S.set('recent', list);
  };

  // ---- drafts (autosave) ----
  S.saveDraft = (key, name, text) => S.set('draft:' + key, { key, name, text, time: Date.now() });
  S.getDraft = (key) => S.get('draft:' + key);
  S.clearDraft = (key) => S.del('draft:' + key);
  S.drafts = async () => {
    try {
      const d = await db();
      return await new Promise((res) => {
        const out = [];
        const tx = d.transaction('kv', 'readonly');
        const req = tx.objectStore('kv').openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return res(out);
          if (String(c.key).startsWith('draft:')) out.push(c.value);
          c.continue();
        };
        req.onerror = () => res(out);
      });
    } catch (e) { return []; }
  };

  // ---- files ----
  async function verify(handle, mode) {
    const opts = { mode };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return (await handle.requestPermission(opts)) === 'granted';
  }

  function pickWithInput() {
    return new Promise((res) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.journal,.ledger,.hledger,.txt,text/plain';
      inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return res(null);
        res({ name: f.name, text: await f.text(), lastModified: f.lastModified, handle: null });
      };
      inp.click();
    });
  }

  // Returns {name, text, lastModified, handle} or null if cancelled
  S.open = async function () {
    if (canPick) {
      try {
        const [h] = await window.showOpenFilePicker({ types: PICK_TYPES, multiple: false });
        const f = await h.getFile();
        return { name: f.name, text: await f.text(), lastModified: f.lastModified, handle: h };
      } catch (e) {
        if (e.name === 'AbortError') return null;
        console.warn('File picker failed, using fallback', e);
      }
    }
    return pickWithInput();
  };

  S.openHandle = async function (handle) {
    if (!(await verify(handle, 'read'))) throw new Error('Permission to read the file was not granted.');
    const f = await handle.getFile();
    return { name: f.name, text: await f.text(), lastModified: f.lastModified, handle };
  };

  function download(name, text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // Save to the existing handle; returns {name, handle, mode} or null if cancelled
  S.save = async function (doc, text) {
    if (doc.handle && doc.handle.createWritable) {
      if (!(await verify(doc.handle, 'readwrite'))) throw new Error('Permission to write the file was not granted.');
      const w = await doc.handle.createWritable();
      await w.write(text);
      await w.close();
      return { name: doc.handle.name, handle: doc.handle, mode: 'inplace' };
    }
    return S.saveAs(doc, text);
  };

  S.saveAs = async function (doc, text) {
    if (canSaveAs) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: doc.name || 'book.journal', types: PICK_TYPES });
        const w = await h.createWritable();
        await w.write(text);
        await w.close();
        return { name: h.name, handle: h, mode: 'inplace' };
      } catch (e) {
        if (e.name === 'AbortError') return null;
        console.warn('Save picker failed, downloading instead', e);
      }
    }
    download(doc.name || 'book.journal', text);
    return { name: doc.name || 'book.journal', handle: null, mode: 'download' };
  };

  // ---- dated backups ----
  // One file per day per book (name-YYYY-MM-DD.journal), newest 'keep' days retained.
  S.canBackupFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  S.backupFolder = () => S.get('backupDir');
  S.chooseBackupFolder = async function () {
    const h = await window.showDirectoryPicker({ mode: 'readwrite' });
    await S.set('backupDir', h);
    return h;
  };
  S.clearBackupFolder = () => S.del('backupDir');
  S.backup = async function (bookName, text, keep) {
    const dir = await S.backupFolder();
    if (!dir) return null;
    if (!(await verify(dir, 'readwrite'))) throw new Error('Permission to use the backup folder was not granted.');
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const base = String(bookName || 'book').replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|]/g, '_');
    const file = base + '-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.journal';
    const fh = await dir.getFileHandle(file, { create: true });
    const w = await fh.createWritable(); await w.write(text); await w.close();
    const mine = [];
    const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d{4}-\\d{2}-\\d{2}\\.journal$');
    for await (const [name] of dir.entries()) if (re.test(name)) mine.push(name);
    mine.sort();
    let removed = 0;
    for (const old of mine.slice(0, Math.max(0, mine.length - (keep || 30)))) { try { await dir.removeEntry(old); removed++; } catch (e) { /* ignore */ } }
    return { file, removed, kept: mine.length - removed, folder: dir.name };
  };

  SL.Storage = S;
})(typeof window !== 'undefined' ? window : globalThis);
