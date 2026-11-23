/* Simple Ledger - ai.js
   Optional AI helper. Off until you add a key (or a local server) in Settings.
   Providers: OpenRouter, Anthropic (Claude), OpenAI, Google (Gemini), and Local or other (any OpenAI-compatible
   server: Ollama, LM Studio, llama.cpp, vLLM, xAI, Mistral, DeepSeek, Groq...).
   Keys and model names are kept in this browser only (localStorage), never in the journal file.
   AI only proposes; nothing it says is written to a book without your review. */
(function (root) {
  'use strict';
  const SL = root.SL = root.SL || {};
  const AI = {};
  const STORE = 'simpleLedger.ai';

  // kind 'openai' = OpenAI-style /chat/completions; kind 'anthropic' = Anthropic Messages API
  AI.PROVIDERS = {
    openrouter: { label: 'OpenRouter (many models, one key)', short: 'OpenRouter', kind: 'openai', base: 'https://openrouter.ai/api/v1', needsKey: true,
      keyHint: 'sk-or-…', keyHelp: 'Create one at openrouter.ai/keys.', defaultModel: 'anthropic/claude-sonnet-5.5',
      presets: ['anthropic/claude-sonnet-5.5', 'anthropic/claude-opus-5.5', 'anthropic/claude-haiku-5.5'], pdf: true },
    anthropic: { label: 'Anthropic (Claude)', short: 'Anthropic', kind: 'anthropic', base: 'https://api.anthropic.com/v1', needsKey: true,
      keyHint: 'sk-ant-…', keyHelp: 'Create one at console.anthropic.com (API keys).', defaultModel: 'claude-sonnet-5-5',
      presets: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'], pdf: true },
    openai: { label: 'OpenAI (ChatGPT models)', short: 'OpenAI', kind: 'openai', base: 'https://api.openai.com/v1', needsKey: true, tokenParam: 'max_completion_tokens', tokenFactor: 4,
      keyHint: 'sk-…', keyHelp: 'Create one at platform.openai.com/api-keys.', defaultModel: 'gpt-6.1-sol',
      presets: ['gpt-6.1-sol', 'gpt-6-astra'], pdf: true },
    gemini: { label: 'Google (Gemini)', short: 'Google', kind: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true,
      keyHint: 'AIza…', keyHelp: 'Create one at aistudio.google.com/apikey.', defaultModel: 'gemini-3.8-flash',
      presets: ['gemini-3.8-flash'], pdf: false },
    local: { label: 'Local or other (OpenAI-compatible server)', short: 'the server', kind: 'openai', base: '', needsKey: false, needsUrl: true,
      keyHint: 'optional', keyHelp: 'Local servers usually need no key.', defaultModel: '', presets: [], pdf: false }
  };
  AI.LOCAL_PRESETS = [['Ollama', 'http://localhost:11434/v1'], ['LM Studio', 'http://localhost:1234/v1']];
  AI.DEFAULT_PROVIDER = 'openrouter';
  AI.DEFAULT_MODEL = AI.PROVIDERS.openrouter.defaultModel;
  AI.PRESETS = AI.PROVIDERS.openrouter.presets; // kept for older callers
  AI.last = null; // {feature, sent} for "what was sent"

  // ---------- stored settings ----------
  // Stored shape: { provider, keys:{id:key}, models:{id:model}, url } ; the older {key, model} (OpenRouter) is migrated on read.
  function read() {
    let v = {};
    try { v = JSON.parse(root.localStorage.getItem(STORE) || '{}') || {}; } catch (e) { v = {}; }
    const s = { provider: AI.PROVIDERS[v.provider] ? v.provider : AI.DEFAULT_PROVIDER, keys: Object.assign({}, v.keys), models: Object.assign({}, v.models), url: v.url || '' };
    if (v.key && !s.keys.openrouter) s.keys.openrouter = v.key;
    if (v.model && !s.models.openrouter) s.models.openrouter = v.model;
    return s;
  }
  function write(s) {
    try { root.localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { throw new Error('This browser would not store the key (private mode?).'); }
  }
  // What the rest of the app sees: the active provider's key, model and address
  AI.load = function () {
    const s = read(), p = AI.PROVIDERS[s.provider];
    return { provider: s.provider, key: s.keys[s.provider] || '', model: s.models[s.provider] || p.defaultModel, url: s.url, base: AI.base(s) };
  };
  AI.save = function (patch) {
    const s = read();
    if (patch.provider && AI.PROVIDERS[patch.provider]) s.provider = patch.provider;
    if ('key' in patch) { if (patch.key) s.keys[s.provider] = patch.key; else delete s.keys[s.provider]; }
    if ('model' in patch) { if (patch.model) s.models[s.provider] = patch.model; else delete s.models[s.provider]; }
    if ('url' in patch) s.url = String(patch.url || '').trim().replace(/\/+$/, '');
    write(s);
    return AI.load();
  };
  AI.base = function (s) { s = s || read(); const p = AI.PROVIDERS[s.provider]; return p.needsUrl ? (s.url || '') : p.base; };
  AI.provider = () => AI.PROVIDERS[read().provider];
  AI.providerId = () => read().provider;
  AI.clearKey = () => AI.save({ key: '' });
  AI.has = function () { const c = AI.load(), p = AI.PROVIDERS[c.provider]; return p.needsUrl ? !!c.url && !!c.model : !!c.key; };
  AI.model = () => AI.load().model || AI.provider().defaultModel;
  AI.maskedKey = () => { const k = AI.load().key; return k ? '…' + k.slice(-4) : ''; };
  // A server on this computer or home network: nothing leaves it, and PDFs are not accepted
  AI.isLocal = function () {
    const c = AI.load(); if (c.provider !== 'local') return false;
    return /^https?:\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^/:]+\.local)/i.test(c.url);
  };
  AI.sendsOffComputer = () => !AI.isLocal();

  AI._fetch = (...a) => root.fetch(...a);

  // ---------- requests ----------
  function headers(c) {
    const p = AI.PROVIDERS[c.provider];
    if (p.kind === 'anthropic') return { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    const h = { 'Content-Type': 'application/json' };
    if (c.key) h.Authorization = 'Bearer ' + c.key;
    if (c.provider === 'openrouter') {
      h['X-Title'] = 'Simple Ledger';
      try { if (root.location && /^https?:/.test(root.location.origin)) h['HTTP-Referer'] = root.location.origin; } catch (e) { /* ignore */ }
    }
    return h;
  }

  function explain(c, status, body) {
    const p = AI.PROVIDERS[c.provider];
    const who = p.needsUrl ? 'The server' : p.short;
    const msg = body && body.error ? (body.error.message || (typeof body.error === 'string' ? body.error : '')) : '';
    if (status === 401 || status === 403) return who + ' did not accept the key. Check it in Settings.';
    if (status === 402) return who + ' says the account is out of credits.';
    if (status === 404 || /no endpoints|not a valid model|model.*not found|does not exist|unknown model/i.test(msg)) return 'That model is not available: ' + c.model + '. Press "Load model list" in Settings and pick one.';
    if (status === 429) return who + ' is rate limiting this key. Wait a moment and try again.';
    if (status === 413 || /too large|too long|context/i.test(msg)) return 'That was too much for the model. Try a smaller file or a model with a larger context.';
    return who + ' returned an error (' + status + ')' + (msg ? ': ' + msg : '.');
  }
  const cannotReach = (c) => {
    const p = AI.PROVIDERS[c.provider];
    if (p.needsUrl) return 'Could not reach the server at ' + c.url + '. Is it running? Local servers also need to allow this page to connect (see Help, AI helper).';
    return 'Could not reach ' + p.short + '. Check your internet connection.';
  };

  // Convert our OpenAI-style message parts into Anthropic's format
  function toAnthropic(messages) {
    let system = '';
    const out = [];
    const part = (x) => {
      if (typeof x === 'string') return { type: 'text', text: x };
      if (x.type === 'text') return { type: 'text', text: x.text };
      const data = (x.type === 'image_url' ? x.image_url.url : x.file.file_data) || '';
      const m = /^data:([^;]+);base64,(.*)$/s.exec(data);
      if (!m) throw new Error('Could not attach that file.');
      return { type: x.type === 'image_url' ? 'image' : 'document', source: { type: 'base64', media_type: m[1], data: m[2] } };
    };
    for (const m of messages) {
      if (m.role === 'system') { system += (system ? '\n\n' : '') + (typeof m.content === 'string' ? m.content : m.content.map(p => p.text || '').join('')); continue; }
      out.push({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.map(part) });
    }
    return { system, messages: out };
  }

  /* messages: [{role, content}]; content may be a string or an array of parts.
     meta.feature and meta.sent describe the request for the "what was sent" note. */
  AI.chat = async function (messages, meta) {
    const c = AI.load(), p = AI.PROVIDERS[c.provider];
    if (!AI.has()) throw new Error(p.needsUrl ? 'Set the server address and model in Settings first (AI helper).' : 'Add your ' + p.short + ' key in Settings first (AI helper).');
    meta = meta || {};
    AI.last = { feature: meta.feature || '', sent: meta.sent || '', provider: c.provider, model: c.model };
    const max = meta.maxTokens || 2000;
    let url, body;
    if (p.kind === 'anthropic') {
      const a = toAnthropic(messages);
      url = p.base + '/messages';
      body = { model: c.model, max_tokens: max, messages: a.messages };
      if (a.system) body.system = a.system;
    } else {
      url = c.base + '/chat/completions';
      body = { model: c.model, messages };
      body[p.tokenParam || 'max_tokens'] = max * (p.tokenFactor || 1); // some models spend part of the limit thinking
    }
    let res;
    try { res = await AI._fetch(url, { method: 'POST', headers: headers(c), body: JSON.stringify(body) }); }
    catch (e) { throw new Error(cannotReach(c)); }
    let data = null;
    try { data = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok) throw new Error(explain(c, res.status, data));
    let text;
    if (p.kind === 'anthropic') text = data && Array.isArray(data.content) ? data.content.map(x => x.text || '').join('') : '';
    else text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('The AI service sent an empty answer. Try again.');
    return typeof text === 'string' ? text : text.map(x => x.text || '').join('');
  };

  // Ask for JSON and parse it forgivingly (code fences, text around it)
  AI.json = async function (messages, meta) {
    const text = await AI.chat(messages, meta);
    const a = text.indexOf('{'), z = text.lastIndexOf('}');
    if (a < 0 || z < a) throw new Error('The AI did not return structured data. Try again, or choose a more capable model.');
    try { return JSON.parse(text.slice(a, z + 1)); }
    catch (e) { throw new Error('The AI answer could not be read. Try again, or choose a more capable model.'); }
  };

  // Model ids offered by the provider (needs the key for all but OpenRouter)
  AI.models = async function () {
    const c = AI.load(), p = AI.PROVIDERS[c.provider];
    const url = (p.needsUrl ? c.base : p.base) + '/models' + (p.kind === 'anthropic' ? '?limit=100' : '');
    if (!url.startsWith('http')) throw new Error('Set the server address first.');
    let res;
    try { res = await AI._fetch(url, c.provider === 'openrouter' ? undefined : { headers: headers(c) }); } catch (e) { throw new Error(cannotReach(c)); }
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) throw new Error(explain(c, res.status, data));
    const skip = /embed|whisper|tts|dall|image|moderation|audio|realtime|transcribe|speech|video|rerank/i;
    const ids = ((data && (data.data || data.models)) || []).map(m => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean);
    return ids.filter(i => c.provider === 'openrouter' || !skip.test(i)).sort();
  };

  AI.test = async function () {
    const t = await AI.chat([{ role: 'user', content: 'Reply with the single word: ready' }], { feature: 'test', sent: 'The word "ready" request only.', maxTokens: 20 });
    return t.trim();
  };

  // File -> message part (images and PDFs). The shape is OpenAI-style; Anthropic parts are converted when sending.
  AI.filePart = function (file) {
    return new Promise((resolve, reject) => {
      const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
      const isImg = /^image\//.test(file.type);
      if (!isPdf && !isImg) return reject(new Error('Choose a PDF or an image (photo or screenshot).'));
      if (isPdf && AI.isLocal()) return reject(new Error('Local models cannot read PDFs here. Take a photo or screenshot of the page instead (use a model that accepts images).'));
      if (file.size > 15 * 1024 * 1024) return reject(new Error('That file is over 15 MB. Use a smaller scan or photo.'));
      const r = new root.FileReader();
      r.onerror = () => reject(new Error('Could not read the file.'));
      r.onload = () => resolve(isPdf ? { type: 'file', file: { filename: file.name || 'document.pdf', file_data: r.result } } : { type: 'image_url', image_url: { url: r.result } });
      r.readAsDataURL(file);
    });
  };

  SL.AI = AI;
  if (typeof module !== 'undefined') module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
