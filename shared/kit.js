/* Kit: small shared helpers for the static games (hub, Word Drop, City Run, Hot Seat).
   A classic script (not a module) so every page still opens straight from file://.
   Load it in <head>, before the page's CSS paints:
     <script src="../shared/config.js"></script>
     <script src="../shared/kit.js"></script>
     <script src="../shared/strings.js"></script>
   It sets <html data-brand> and <html lang>, fills [data-logo], translates [data-i18n],
   and exposes window.Kit. Nothing here touches the network. */
(function () {
  'use strict';
  const W = window, D = document;
  const CFG = Object.assign({ brand: 'neutral', defaultLang: '' }, W.HUB_CONFIG || {});
  const ROOT = (() => { try { return new URL('..', D.currentScript.src).href; } catch { return '../'; } })();

  /* ---------- Storage (never throws: private mode or blocked storage just forgets) ---------- */
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } },
  };

  /* ---------- Brand and language: ?brand= / ?lang= in the address, remembered, else config ---------- */
  const BRANDS = ['neutral', 'speakplus'];
  const LANGS = ['en', 'es'];
  function choose(param, key, allowed) {
    let v = null;
    try { v = new URLSearchParams(location.search).get(param); } catch { /* ignore */ }
    if (v && allowed.includes(v)) { store.set(key, v); return v; }
    const saved = store.get(key, null);
    return allowed.includes(saved) ? saved : null;
  }
  const brand = choose('brand', 'hub-brand-v1', BRANDS) || (BRANDS.includes(CFG.brand) ? CFG.brand : 'neutral');
  const navLang = ((navigator.languages && navigator.languages[0]) || navigator.language || 'en').slice(0, 2).toLowerCase();
  const lang = choose('lang', 'hub-lang-v1', LANGS) || (LANGS.includes(CFG.defaultLang) ? CFG.defaultLang : LANGS.includes(navLang) ? navLang : 'en');
  D.documentElement.dataset.brand = brand;
  D.documentElement.lang = lang;

  const SITE = { neutral: 'Classroom Games', speakplus: 'Speak Plus Games' };
  const PLUS = '<svg viewBox="0 0 40 40" aria-hidden="true"><g transform="rotate(12 20 20)"><line x1="20" y1="6" x2="20" y2="34" stroke="#E8483B" stroke-width="8.5" stroke-linecap="round"/><line x1="6" y1="20" x2="34" y2="20" stroke="#E8483B" stroke-width="8.5" stroke-linecap="round"/></g></svg>';
  const BUBBLE = '<svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true"><path d="M8 6h24a6 6 0 0 1 6 6v13a6 6 0 0 1-6 6H18l-8 7v-7H8a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z" fill="var(--accent)"/><circle cx="13" cy="18.5" r="2.6" fill="#fff"/><circle cx="20" cy="18.5" r="2.6" fill="#fff"/><circle cx="27" cy="18.5" r="2.6" fill="#fff"/></svg>';
  function logoHTML() {
    return brand === 'speakplus' ? 'speak' + PLUS : BUBBLE + '<span>classroom<b>games</b></span>';
  }

  /* ---------- Strings ---------- */
  const STR = { en: {}, es: {} };
  function addStrings(table) { for (const l in table) Object.assign(STR[l] || (STR[l] = {}), table[l]); }
  // t('wordsN', {n: 3}) → "3 words". A value can be {one, other} for plurals.
  function t(key, vars) {
    let s = STR[lang] && STR[lang][key];
    if (s == null) s = STR.en[key];
    if (s == null) return key;
    if (typeof s === 'object') s = (vars && vars.n === 1 ? s.one : s.other) ?? s.other;
    return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m));
  }
  // <b data-i18n="key">, <p data-i18n-html="key">, <input data-i18n-attr="placeholder:key; aria-label:key2">
  function applyI18n(root) {
    root = root || D;
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-attr]').forEach(el => {
      el.dataset.i18nAttr.split(';').forEach(pair => {
        const [attr, key] = pair.split(':').map(x => x && x.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
  }
  const LANG_NAMES = {
    en: { en: 'English', es: 'Spanish', ja: 'Japanese', fr: 'French', pt: 'Portuguese', de: 'German', it: 'Italian', zh: 'Chinese', ko: 'Korean' },
    es: { en: 'inglés', es: 'español', ja: 'japonés', fr: 'francés', pt: 'portugués', de: 'alemán', it: 'italiano', zh: 'chino', ko: 'coreano' },
  };
  const langName = code => (LANG_NAMES[lang] && LANG_NAMES[lang][code]) || LANG_NAMES.en[code] || code || '';

  /* ---------- Small helpers ---------- */
  const $ = (s, root) => (root || D).querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const dedupe = (list, key) => { const seen = new Set(); return list.filter(x => { const k = key ? key(x) : x; if (!k || seen.has(k)) return false; seen.add(k); return true; }); };
  // "a, b、c" and new lines → ['a', 'b', 'c'], without repeats
  const parseList = s => dedupe(String(s || '').split(/[,、，\n]+/).map(x => x.trim()));

  /* ---------- Content: "prompt = answer" lines ---------- */
  // A line with "=" or a tab is one item with an answer. A line without one can hold several
  // prompts separated by commas, like the old Word Drop lists.
  function parseItems(text) {
    const out = [];
    String(text || '').split(/\r?\n/).forEach(line => {
      const m = line.match(/^(.*?)\s*(?:=|\t)\s*(.*)$/);
      if (m && m[1].trim()) out.push({ prompt: m[1].trim(), answer: m[2].trim() });
      else line.split(/[,、，]+/).map(x => x.trim()).filter(Boolean).forEach(p => out.push({ prompt: p, answer: '' }));
    });
    return dedupe(out, x => x.prompt);
  }
  const itemsToText = items => items.map(x => x.answer ? x.prompt + ' = ' + x.answer : x.prompt).join('\n');

  // Teams: "Team A: Aiko, Ken" lines keep their members; a line without ":" is split by commas into teams.
  function parseTeams(text) {
    const out = [];
    String(text || '').split(/\r?\n/).forEach(line => {
      const i = line.indexOf(':');
      if (i > 0) out.push({ name: line.slice(0, i).trim(), members: parseList(line.slice(i + 1)) });
      else line.split(/[,、，]+/).map(x => x.trim()).filter(Boolean).forEach(n => out.push({ name: n, members: [] }));
    });
    return dedupe(out, x => x.name);
  }

  // Letters typed by students: case and accents don't matter (canción = CANCION).
  const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleUpperCase();

  /* ---------- Packs: built-in (shared/registry.js), files, and share links ---------- */
  const packs = type => (W.HUB_PACKS || []).filter(p => !type || p.type === type);
  function download(name, text, mime) {
    const a = D.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' }));
    a.download = name; D.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const slug = s => String(s || 'my-list').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-list';
  function exportPack(pack) {
    download(slug(pack.title) + '.json', JSON.stringify(Object.assign({ license: 'CC-BY-4.0' }, pack), null, 2) + '\n');
  }
  // Reads a .json pack, or a .txt/.csv list. Resolves to {title, type?, items?, text?, ...}.
  function readFile(file) {
    return file.text().then(text => {
      const title = file.name.replace(/\.[^.]+$/, '');
      if (/\.json$/i.test(file.name)) {
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object') throw new Error('bad');
        return Object.assign({ title }, data);
      }
      // CSV with two columns becomes "prompt = answer"
      const lines = text.split(/\r?\n/).map(l => (/\.csv$/i.test(file.name) && /^[^,]*,[^,]*$/.test(l)) ? l.replace(',', ' = ') : l);
      return { title, text: lines.join('\n') };
    });
  }
  function b64(json) {
    const bytes = new TextEncoder().encode(json);
    let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  // A link that opens this game with this content already loaded (#share=…). Nothing is uploaded.
  function shareLink(payload) {
    const u = new URL(location.href); u.hash = 'share=' + b64(JSON.stringify(payload)); return u.href;
  }
  function readShare() {
    const m = location.hash.match(/share=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    try { const data = JSON.parse(unb64(m[1])); history.replaceState(null, '', location.pathname + location.search); return data; }
    catch { return null; }
  }
  function copy(text) {
    if (navigator.clipboard && W.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => { W.prompt(t('kit.copyThis'), text); return false; });
    W.prompt(t('kit.copyThis'), text); return Promise.resolve(false);
  }

  /* ---------- Sound (Web Audio, no files) ---------- */
  let ac = null;
  const sound = { on: true };
  const TONES = {
    hit: ['triangle', 660, 1320, .12, .42], go: ['sine', 520, 780, .15, .3], ok: ['triangle', 660, 1320, .14, .22],
    step: ['triangle', 520, 0, 0, .07], turn: ['triangle', 360, 0, 0, .07], tick: ['square', 880, 0, 0, .05],
    alert: ['sine', 880, 660, -.13, .28], bad: ['sawtooth', 220, 90, .3, .34], miss: ['sawtooth', 240, 80, .4, .42],
  };
  function beep(kind) {
    if (!sound.on) return;
    try {
      ac = ac || new (W.AudioContext || W.webkitAudioContext)();
      const [type, f1, f2, ramp, len] = TONES[kind] || TONES.bad;
      const o = ac.createOscillator(), g = ac.createGain(), now = ac.currentTime;
      o.type = type; o.connect(g); g.connect(ac.destination);
      o.frequency.setValueAtTime(f1, now);
      if (f2 && ramp > 0) o.frequency.exponentialRampToValueAtTime(f2, now + ramp);
      if (f2 && ramp < 0) o.frequency.setValueAtTime(f2, now - ramp);
      g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(.16, now + .015); g.gain.exponentialRampToValueAtTime(.0001, now + len);
      o.start(now); o.stop(now + len + .03);
    } catch { /* no audio */ }
  }

  /* ---------- Screen: keep awake, full screen ---------- */
  let lock = null;
  const wake = {
    on() { try { navigator.wakeLock && navigator.wakeLock.request('screen').then(l => { lock = l; }, () => {}); } catch { /* ignore */ } },
    off() { try { lock && lock.release(); } catch { /* ignore */ } lock = null; },
  };
  function toggleFullscreen() {
    try {
      if (D.fullscreenElement) D.exitFullscreen && D.exitFullscreen();
      else D.documentElement.requestFullscreen && D.documentElement.requestFullscreen().catch(() => {});
    } catch { /* ignore */ }
  }

  /* ---------- Classes (rosters), shared by every game in this browser ---------- */
  const CLASSES = 'hub-classes-v1';
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Builds: [Saved classes ▾] [Save list] [Make teams: 2 3 4 …]. The textarea stays the source of truth.
  function mountRoster(box, textarea, max, onChange) {
    const changed = () => { textarea.dispatchEvent(new Event('input', { bubbles: true })); onChange && onChange(); };
    function render() {
      const classes = store.get(CLASSES, []);
      box.innerHTML = `
        <select class="kit-select" aria-label="${esc(t('kit.savedClasses'))}"><option value="">${esc(t('kit.savedClasses'))}${classes.length ? '' : ' · ' + esc(t('kit.none'))}</option>${classes.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join('')}</select>
        <button class="chip-btn" type="button" data-r="save">${esc(t('kit.saveClass'))}</button>
        ${classes.length ? `<button class="chip-btn" type="button" data-r="forget">${esc(t('kit.forgetClass'))}</button>` : ''}
        <span class="kit-split"><span class="hint">${esc(t('kit.makeTeams'))}</span>${Array.from({ length: Math.max(0, Math.min(max, 6) - 1) }, (_, i) => `<button class="chip-btn" type="button" data-r="split" data-n="${i + 2}">${i + 2}</button>`).join('')}</span>`;
    }
    box.classList.add('kit-roster');
    render();
    box.addEventListener('change', e => {
      if (!e.target.matches('select') || e.target.value === '') return;
      const c = store.get(CLASSES, [])[+e.target.value];
      if (c) { textarea.value = c.text; changed(); }
    });
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      if (b.dataset.r === 'save') {
        const name = (W.prompt(t('kit.className')) || '').trim(); if (!name) return;
        const classes = store.get(CLASSES, []).filter(c => c.name !== name);
        classes.unshift({ name, text: textarea.value.trim() }); store.set(CLASSES, classes.slice(0, 40)); render();
      } else if (b.dataset.r === 'forget') {
        const sel = box.querySelector('select');
        const classes = store.get(CLASSES, []);
        const i = sel.value === '' ? -1 : +sel.value;
        if (i < 0) { W.alert(t('kit.pickClassFirst')); return; }
        if (!W.confirm(t('kit.forgetSure', { name: classes[i].name }))) return;
        classes.splice(i, 1); store.set(CLASSES, classes); render();
      } else if (b.dataset.r === 'split') {
        // Everybody in the list (team members, or plain names) dealt into n teams at random
        const people = parseTeams(textarea.value).flatMap(x => x.members.length ? x.members : [x.name]);
        const n = +b.dataset.n;
        if (people.length < n) { W.alert(t('kit.needNames', { n })); return; }
        const teams = Array.from({ length: n }, () => []);
        shuffle(people).forEach((p, i) => teams[i % n].push(p));
        textarea.value = teams.map((m, i) => t('kit.teamX', { x: LETTERS[i] }) + ': ' + m.join(', ')).join('\n');
        changed();
      }
    });
  }

  /* ---------- Content box: packs, import, export, share ---------- */
  // opts: {type, textarea, getPack():{title, items...}, setPack(pack), label}
  function mountContent(box, opts) {
    const list = packs(opts.type);
    box.classList.add('kit-content');
    box.innerHTML = `
      <select class="kit-select" aria-label="${esc(t('kit.loadPack'))}"><option value="">${esc(t('kit.loadPack'))}</option>${list.map(p => `<option value="${esc(p.id)}">${esc(p.title)}${p.language ? ' · ' + esc(langName(p.language)) : ''}</option>`).join('')}</select>
      <button class="chip-btn" type="button" data-c="import">${esc(t('kit.import'))}</button>
      <button class="chip-btn" type="button" data-c="export">${esc(t('kit.export'))}</button>
      <button class="chip-btn" type="button" data-c="share">${esc(t('kit.share'))}</button>
      <input type="file" accept=".json,.txt,.csv,.tsv" hidden>
      <span class="hint kit-msg" role="status"></span>`;
    const msg = box.querySelector('.kit-msg'), file = box.querySelector('input[type=file]');
    const say = s => { msg.textContent = s; clearTimeout(say.t); say.t = setTimeout(() => { msg.textContent = ''; }, 4000); };
    box.querySelector('select').addEventListener('change', e => {
      const p = list.find(x => x.id === e.target.value); e.target.value = '';
      if (p) { opts.setPack(p); say(t('kit.loaded', { title: p.title })); }
    });
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      if (b.dataset.c === 'import') file.click();
      else if (b.dataset.c === 'export') exportPack(Object.assign({ type: opts.type }, opts.getPack()));
      else if (b.dataset.c === 'share') {
        const url = shareLink(Object.assign({ type: opts.type }, opts.getPack()));
        copy(url).then(ok => ok && say(t('kit.linkCopied')));
      }
    });
    file.addEventListener('change', () => {
      const f = file.files && file.files[0]; file.value = '';
      if (!f) return;
      readFile(f).then(p => {
        if (p.type && p.type !== opts.type) throw new Error('type');
        opts.setPack(p); say(t('kit.loaded', { title: p.title || f.name }));
      }).catch(() => say(t('kit.badFile')));
    });
    const shared = readShare();
    if (shared && (!shared.type || shared.type === opts.type)) { opts.setPack(shared); say(t('kit.loaded', { title: shared.title || t('kit.sharedList') })); }
  }

  /* ---------- Language switch ---------- */
  function mountLangSwitch(el) {
    el.innerHTML = `<select class="kit-select kit-lang" aria-label="Language / Idioma">${LANGS.map(l => `<option value="${l}" ${l === lang ? 'selected' : ''}>${l === 'en' ? 'English' : 'Español'}</option>`).join('')}</select>`;
    el.querySelector('select').addEventListener('change', e => { store.set('hub-lang-v1', e.target.value); const u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.href); });
  }

  /* ---------- Offline: the service worker at the root caches the static games ---------- */
  function registerOffline() {
    if (!/^https?:$/.test(location.protocol) || !('serviceWorker' in navigator)) return;
    // Not on this computer's own server: there it would keep serving old copies while you edit files.
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
    navigator.serviceWorker.register(ROOT + 'sw.js').catch(() => { /* a server that can't serve it: fine */ });
  }

  /* ---------- Page setup once the DOM is ready ---------- */
  function ready() {
    D.querySelectorAll('[data-logo]').forEach(el => { el.innerHTML = logoHTML(); el.classList.add('logo', 'logo-' + brand); el.setAttribute('aria-label', SITE[brand]); });
    D.querySelectorAll('[data-logo-sub]').forEach(el => { el.hidden = brand !== 'speakplus'; });
    D.querySelectorAll('[data-lang-switch]').forEach(mountLangSwitch);
    applyI18n();
    const base = D.title.replace(/\s*·.*$/, '');
    D.title = base && base !== SITE[brand] ? base + ' · ' + SITE[brand] : SITE[brand];
    registerOffline();
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', ready); else ready();

  W.Kit = {
    ROOT, brand, lang, LANGS, site: () => SITE[brand], store, t, addStrings, applyI18n, langName,
    $, esc, shuffle, pick, dedupe, parseList, parseItems, itemsToText, parseTeams, fold,
    packs, exportPack, readFile, shareLink, readShare, copy, download,
    sound, beep, wake, toggleFullscreen, mountRoster, mountContent, mountLangSwitch,
  };
})();
