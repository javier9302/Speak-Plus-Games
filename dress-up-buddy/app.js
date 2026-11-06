/* Dress Up Buddy — app logic (screens, saving, speech, printing) */
(function () {
  'use strict';
  const D = window.DUB;
  const $ = s => document.querySelector(s);
  const KEY = 'sp-dressup-v1';

  /* ---------- saving (works without localStorage too) ---------- */
  let canSave = true;
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && Array.isArray(d.chars)) return d;
    } catch (e) { canSave = false; }
    return { v: 1, chars: [], settings: {} };
  }
  const data = load();
  data.settings = Object.assign({ words: true, wordList: true }, data.settings);
  const S = data.settings;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { canSave = false; }
    $('#store-note').hidden = canSave;
  }

  /* ---------- speech ---------- */
  const synth = window.speechSynthesis;
  let voice = null;
  function pickVoice() {
    if (!synth) return;
    const vs = synth.getVoices().filter(v => /^en[-_]/i.test(v.lang) || v.lang === 'en');
    const pref = [/samantha/i, /google us english/i, /aria|jenny/i, /karen|serena|moira/i];
    voice = null;
    for (const re of pref) { voice = vs.find(v => re.test(v.name)); if (voice) break; }
    voice = voice || vs.find(v => /en[-_]US/i.test(v.lang)) || vs[0] || null;
  }
  if (synth) { pickVoice(); synth.addEventListener && synth.addEventListener('voiceschanged', pickVoice); }
  let sayTimer = 0;
  function say(text) {
    if (!synth) return;
    try {
      clearTimeout(sayTimer);
      synth.cancel();
      // a short pause after cancel() keeps iOS Safari from dropping the new line
      sayTimer = setTimeout(() => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = voice ? voice.lang : 'en-US';
        if (voice) u.voice = voice;
        u.rate = 0.8;
        u.pitch = 1.05;
        synth.speak(u);
      }, 60);
    } catch (e) { /* no speech: the word is still on screen */ }
  }

  /* ---------- characters ---------- */
  let cur = null;
  let tab = 'body';
  let sel = null; // slot whose color the palette changes

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function newChar() {
    return { id: uid(), name: '', body: 'neutral', hair: 'short', face: 'happy', wear: {}, created: Date.now() };
  }
  function changed() { save(); drawFigure(); updateTalk(); }

  /* ---------- views ---------- */
  function show(v) {
    for (const k of ['home', 'make', 'print']) $('#view-' + k).hidden = k !== v;
    window.scrollTo(0, 0);
  }

  function renderGallery() {
    const g = $('#gallery');
    g.innerHTML = '';
    for (const ch of data.chars.slice().reverse()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.innerHTML = D.render(ch, 'color', { box: '20 14 200 352' }) +
        `<span class="nm ${ch.name ? '' : 'empty'}"></span>`;
      b.querySelector('.nm').textContent = ch.name || '?';
      b.addEventListener('click', () => openChar(ch));
      g.appendChild(b);
    }
    $('#btn-print-all').disabled = !data.chars.length;
  }
  function goHome() {
    if (synth) synth.cancel();
    renderGallery();
    show('home');
  }

  function openChar(ch) {
    cur = ch;
    sel = null;
    tab = 'body';
    $('#name').value = ch.name || '';
    $('#word').hidden = true;
    setTalk(false);
    show('make');
    drawFigure();
    drawPanel();
  }

  function drawFigure() {
    $('#figure').innerHTML = D.render(cur, 'color', { box: '10 8 220 366' });
  }

  /* ---------- tabs and choices ---------- */
  const BASE_TABS = [
    { id: 'body', word: 'body', icon: () => D.render({ body: 'neutral', hair: 'short', face: 'happy' }, 'color', { box: '30 18 180 256' }) },
    { id: 'hair', word: 'hair', icon: () => D.render({ hair: 'long', face: 'happy' }, 'color', { box: '40 16 160 170', only: ['hairBack', 'body', 'face', 'hairFront'] }) },
    { id: 'face', word: 'face', icon: () => D.render({ face: 'happy', hair: 'short' }, 'color', { box: '50 30 140 130', only: ['body', 'face', 'hairFront'] }) }
  ];
  function tabs() {
    const t = BASE_TABS.slice();
    for (const c of D.CATS) {
      const first = D.ITEMS.find(i => i.cat === c.id);
      if (first) t.push({ id: c.id, word: c.word, icon: () => D.icon(first.id) });
    }
    return t;
  }

  function drawPanel() {
    document.body.classList.toggle('no-words', !S.words);
    const nav = $('#tabs');
    nav.innerHTML = '';
    for (const t of tabs()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(t.id === tab));
      b.setAttribute('aria-label', t.word);
      b.innerHTML = t.icon() + `<span class="lbl-s">${t.word}</span>`;
      b.addEventListener('click', () => { tab = t.id; drawPanel(); });
      nav.appendChild(b);
    }
    drawItems();
    drawPalette();
  }

  function option(html, label, on, isSel, onTap) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt' + (on ? ' on' : '') + (isSel ? ' sel' : '');
    b.setAttribute('aria-pressed', String(!!on));
    b.setAttribute('aria-label', label);
    b.innerHTML = html + `<span class="lbl">${label}</span>`;
    b.addEventListener('click', onTap);
    return b;
  }

  function drawItems() {
    const box = $('#items');
    box.innerHTML = '';
    if (tab === 'body') {
      for (const b of D.BODIES) {
        const preview = Object.assign({}, cur, { body: b.id, wear: {} });
        box.appendChild(option(D.render(preview, 'color', { box: '30 18 180 256' }), b.word, cur.body === b.id, false,
          () => { cur.body = b.id; changed(); drawItems(); }));
      }
    } else if (tab === 'hair') {
      for (const h of D.HAIRS) {
        const preview = Object.assign({}, cur, { hair: h.id });
        box.appendChild(option(D.render(preview, 'color', { box: '40 16 160 170', only: ['hairBack', 'body', 'face', 'hairFront'] }), h.word.replace(' hair', ''),
          cur.hair === h.id, false, () => { cur.hair = h.id; changed(); drawItems(); }));
      }
    } else if (tab === 'face') {
      for (const f of D.FACES) {
        const preview = Object.assign({}, cur, { face: f.id });
        box.appendChild(option(D.render(preview, 'color', { box: '50 22 140 140', only: ['hairBack', 'body', 'face', 'hairFront'] }), f.word,
          cur.face === f.id, false, () => { cur.face = f.id; changed(); drawItems(); }));
      }
    } else {
      for (const it of D.ITEMS.filter(i => i.cat === tab)) {
        const w = cur.wear[it.slot];
        const on = !!(w && w.id === it.id);
        box.appendChild(option(D.icon(it.id, on ? w.color : it.color), it.word, on, on && sel === it.slot, () => tapItem(it)));
      }
    }
  }

  function tapItem(it) {
    const w = cur.wear[it.slot];
    if (w && w.id === it.id) {
      if (sel === it.slot) { delete cur.wear[it.slot]; sel = null; }   // second tap: take it off
      else { sel = it.slot; announce(it, w.color); }
    } else {
      cur.wear[it.slot] = { id: it.id, color: it.color };
      sel = it.slot;
      announce(it, it.color);
    }
    changed();
    drawItems();
    drawPalette();
  }

  let wordTimer = 0;
  function showWord(big, small) {
    $('#word-big').textContent = big;
    $('#word-small').textContent = small || '';
    const w = $('#word');
    w.hidden = true;
    void w.offsetWidth; // restart the pop animation
    w.hidden = false;
    clearTimeout(wordTimer);
    wordTimer = setTimeout(() => { w.hidden = true; }, 3200);
  }
  function announce(it, color) {
    const sentence = "I'm wearing " + D.phrase(it, color) + '.';
    showWord(it.word, sentence);
    say(it.word + '. ' + sentence);
  }

  function drawPalette() {
    const p = $('#palette');
    p.innerHTML = '';
    const w = sel && cur.wear[sel];
    for (const c of D.COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw';
      b.disabled = !w;
      b.setAttribute('aria-label', c.id);
      b.setAttribute('aria-pressed', String(!!(w && w.color === c.id)));
      b.innerHTML = `<i style="background:${c.hex}"></i><span>${c.id}</span>`;
      b.addEventListener('click', () => {
        if (!w) return;
        w.color = c.id;
        say(c.id);
        showWord(c.id, "I'm wearing " + D.phrase(D.item(w.id), c.id) + '.');
        changed();
        drawItems();
        drawPalette();
      });
      p.appendChild(b);
    }
  }

  /* ---------- random ---------- */
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function randomize() {
    const wear = {};
    const slots = [...new Set(D.ITEMS.map(i => i.slot))];
    for (const s of slots) {
      const must = s === 'top' || s === 'bottom' || s === 'shoes';
      if (!must && Math.random() < 0.5) continue;
      const it = pick(D.ITEMS.filter(i => i.slot === s));
      wear[s] = { id: it.id, color: pick(D.COLORS).id };
    }
    cur.wear = wear;
    sel = null;
    changed();
    drawItems();
    drawPalette();
    say(D.sentence(cur));
  }

  /* ---------- talk ---------- */
  function setTalk(on) {
    $('#talk').hidden = !on;
    $('#btn-talk').setAttribute('aria-pressed', String(on));
    updateTalk();
  }
  function updateTalk() {
    if (cur) $('#talk-text').textContent = D.sentence(cur);
  }

  /* ---------- print ---------- */
  let printing = [];
  function esc(s) {
    return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }
  function pageHTML(ch) {
    const words = S.wordList ? D.worn(ch).map(w =>
      `<div class="p-word">${D.icon(w.item.id, null, 'line')}<span>${esc(w.item.word)}</span></div>`).join('') : '';
    return `<div class="page">
      <div class="p-brand">Speak Plus</div>
      <div class="p-name"><span>My name is</span><span class="fill">${esc(ch.name || '')}</span></div>
      <div class="p-art">${D.render(ch, 'line', { box: '8 6 224 370' })}</div>
      <div class="p-frame"><span>I'm wearing</span><span class="blank"></span><span>.</span></div>
      <div class="p-lines"><div class="gl"></div><div class="gl"></div><div class="gl"></div></div>
      ${words ? `<div class="p-words">${words}</div>` : ''}
    </div>`;
  }
  function fitPages() {
    const mm = 96 / 25.4;
    const z = Math.min(1, (window.innerWidth - 24) / (210 * mm));
    document.querySelectorAll('.page').forEach(p => { p.style.zoom = z; });
  }
  function drawPages() {
    $('#pages').innerHTML = printing.map(pageHTML).join('');
    $('#btn-wordlist').setAttribute('aria-pressed', String(S.wordList));
    fitPages();
  }
  let printFrom = 'home';
  function openPrint(list, from) {
    printing = list;
    printFrom = from;
    if (synth) synth.cancel();
    show('print');
    drawPages();
  }

  /* ---------- events ---------- */
  $('#btn-new').addEventListener('click', () => {
    const ch = newChar();
    data.chars.push(ch);
    save();
    openChar(ch);
  });
  $('#btn-print-all').addEventListener('click', () => { if (data.chars.length) openPrint(data.chars.slice(), 'home'); });
  $('#btn-home').addEventListener('click', goHome);
  $('#name').addEventListener('input', e => { cur.name = e.target.value.trim(); save(); });
  $('#btn-random').addEventListener('click', randomize);
  $('#btn-talk').addEventListener('click', () => {
    const on = $('#talk').hidden;
    setTalk(on);
    if (on) say(D.sentence(cur));
  });
  $('#btn-say').addEventListener('click', () => say(D.sentence(cur)));
  $('#btn-print').addEventListener('click', () => openPrint([cur], 'make'));
  $('#btn-print-back').addEventListener('click', () => (printFrom === 'make' ? show('make') : goHome()));
  $('#btn-wordlist').addEventListener('click', () => { S.wordList = !S.wordList; save(); drawPages(); });
  $('#btn-print-go').addEventListener('click', () => window.print());
  window.addEventListener('resize', () => { if (!$('#view-print').hidden) fitPages(); });
  window.addEventListener('beforeprint', () => document.querySelectorAll('.page').forEach(p => { p.style.zoom = ''; }));
  window.addEventListener('afterprint', fitPages);

  /* for tests and the teacher tools */
  window.DUB.app = { data, openChar, openPrint, show };

  save();
  renderGallery();
  show('home');
})();
