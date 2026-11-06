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
    return { id: uid(), name: '', body: 'neutral', skin: 's2', hair: 'short', hairColor: 'dark', face: 'happy', wear: {}, created: Date.now() };
  }
  function changed() { save(); drawFigure(); updateTalk(); checkGame(); }

  /* ---------- views ---------- */
  function show(v) {
    for (const k of ['home', 'make', 'print', 'teacher']) $('#view-' + k).hidden = k !== v;
    window.scrollTo(0, 0);
  }

  function renderGallery() {
    const g = $('#gallery');
    g.innerHTML = '';
    for (const ch of data.chars.slice().reverse()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.innerHTML = D.render(ch, 'color', { box: '20 4 200 362' }) +
        `<span class="nm ${ch.name ? '' : 'empty'}"></span>`;
      b.querySelector('.nm').textContent = ch.name || '?';
      b.addEventListener('click', () => openChar(ch));
      g.appendChild(b);
    }
    $('#btn-print-all').disabled = !data.chars.length;
  }
  function goHome() {
    if (synth) synth.cancel();
    endGame();
    renderGallery();
    show('home');
  }

  function openChar(ch) {
    cur = ch;
    sel = null;
    tab = 'body';
    $('#btn-random').hidden = !!game;
    $('#btn-print').hidden = !!game;
    $('#game').hidden = !game;
    $('#name').value = ch.name || '';
    $('#word').hidden = true;
    setTalk(false);
    show('make');
    drawFigure();
    drawPanel();
  }

  function drawFigure() {
    $('#figure').innerHTML = D.render(cur, 'color', { box: '10 2 220 372' });
  }

  /* ---------- tabs and choices ---------- */
  const BASE_TABS = [
    { id: 'body', word: 'body', icon: () => D.render({ body: 'neutral', hair: 'short', face: 'happy' }, 'color', { box: '30 18 180 256' }) },
    { id: 'hair', word: 'hair', icon: () => D.render({ hair: 'long', face: 'happy' }, 'color', { box: '36 6 168 180', only: ['hairBack', 'body', 'face', 'hairFront'] }) },
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
        box.appendChild(option(D.render(preview, 'color', { box: '36 6 168 180', only: ['hairBack', 'body', 'face', 'hairFront'] }), h.word,
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

  /* swatch row: clothes colors (spoken), or skin / hair colors on the base tabs (silent) */
  function swatches(list, current, label, onPick) {
    const p = $('#palette');
    p.innerHTML = '';
    for (const c of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw';
      b.disabled = current === undefined;
      b.setAttribute('aria-label', c.id);
      b.setAttribute('aria-pressed', String(current === c.id));
      b.innerHTML = `<i style="background:${c.hex}"></i>` + (label ? `<span>${c.id}</span>` : '');
      b.addEventListener('click', () => onPick(c));
      p.appendChild(b);
    }
  }
  function drawPalette() {
    const p = $('#palette');
    p.hidden = tab === 'face';
    p.classList.toggle('base', tab === 'body' || tab === 'hair');
    if (tab === 'body') {
      return swatches(D.SKINS, cur.skin, false, c => { cur.skin = c.id; changed(); drawItems(); drawPalette(); });
    }
    if (tab === 'hair') {
      return swatches(D.HAIR_COLORS, cur.hairColor, false, c => { cur.hairColor = c.id; changed(); drawItems(); drawPalette(); });
    }
    const w = sel && cur.wear[sel];
    swatches(D.COLORS, w ? w.color : undefined, true, c => {
      if (!w) return;
      w.color = c.id;
      say(c.id);
      showWord(c.id, "I'm wearing " + D.phrase(D.item(w.id), c.id) + '.');
      changed();
      drawItems();
      drawPalette();
    });
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
      <div class="p-name"><span>My name is</span><span class="fill">${esc(ch.name || '')}</span></div>
      <div class="p-art">${D.render(ch, 'line', { box: '8 2 224 376' })}</div>
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

  /* ---------- teacher ---------- */
  function openTeacher() {
    if (synth) synth.cancel();
    $('#btn-words').setAttribute('aria-pressed', String(S.words));
    const list = $('#t-list');
    list.innerHTML = '';
    for (const ch of data.chars.slice().reverse()) {
      const row = document.createElement('div');
      row.className = 't-row';
      row.innerHTML = D.render(ch, 'color', { box: '40 10 160 170', only: ['hairBack', 'body', 'face', 'hairFront', 'head', 'glasses'] }) +
        '<span class="nm"></span><button class="btn" type="button">Delete</button>';
      row.querySelector('.nm').textContent = ch.name || '?';
      const del = row.querySelector('button');
      del.addEventListener('click', () => {
        if (!del.classList.contains('sure')) { del.classList.add('sure'); del.textContent = 'Sure?'; return; }
        data.chars = data.chars.filter(x => x !== ch);
        save();
        openTeacher();
      });
      list.appendChild(row);
    }
    $('#t-empty').hidden = data.chars.length > 0;
    $('#btn-clear').disabled = !data.chars.length;
    show('teacher');
  }

  /* ---------- Listen and dress ---------- */
  let game = null; // { target: {item, color}, busy }
  function startGame() {
    game = { target: null, busy: false };
    const ch = newChar();
    ch.name = 'Buddy';
    openChar(ch); // not added to the gallery
    tab = 'tops';
    drawPanel();
    nextTarget();
  }
  function endGame() {
    game = null;
    $('#game').hidden = true;
    $('#star').hidden = true;
  }
  function done(t) {
    const w = cur.wear[t.item.slot];
    return !!(w && w.id === t.item.id && w.color === t.color);
  }
  function nextTarget() {
    if (!game) return;
    let t;
    do t = { item: pick(D.ITEMS), color: pick(D.COLORS).id };
    while (done(t) || (game.target && game.target.item === t.item));
    game.target = t;
    game.busy = false;
    $('#game-text').textContent = 'Put on ' + D.phrase(t.item, t.color) + '!';
    sayTarget();
  }
  function sayTarget() {
    if (game && game.target) say('Put on ' + D.phrase(game.target.item, game.target.color) + '!');
  }
  function checkGame() {
    if (!game || game.busy || !game.target || !done(game.target)) return;
    game.busy = true;
    clearTimeout(wordTimer);
    $('#word').hidden = true;
    clearTimeout(sayTimer);
    if (synth) synth.cancel();
    const star = $('#star');
    star.hidden = true;
    void star.offsetWidth;
    star.hidden = false;
    cheer();
    setTimeout(() => { if (!game) return; star.hidden = true; nextTarget(); }, 2200);
  }

  /* happy sound made with Web Audio (no audio files) */
  let actx = null;
  function cheer() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = actx || new AC();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime + 0.02;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        const t = t0 + i * 0.11;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (i === 3 ? 0.6 : 0.22));
        o.connect(g).connect(actx.destination);
        o.start(t);
        o.stop(t + 0.7);
      });
    } catch (e) { /* no sound: the star is enough */ }
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
  $('#btn-teacher').addEventListener('click', openTeacher);
  $('#btn-teacher-back').addEventListener('click', goHome);
  $('#btn-words').addEventListener('click', () => {
    S.words = !S.words;
    save();
    $('#btn-words').setAttribute('aria-pressed', String(S.words));
  });
  $('#btn-game').addEventListener('click', startGame);
  $('#btn-clear').addEventListener('click', () => {
    if (!window.confirm('Delete all characters?')) return;
    data.chars = [];
    save();
    openTeacher();
  });
  $('#btn-again').addEventListener('click', sayTarget);
  $('#btn-skip').addEventListener('click', () => { if (game && !game.busy) nextTarget(); });
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
  window.DUB.app = { data, openChar, openPrint, show, startGame, get game() { return game; }, get cur() { return cur; } };

  save();
  renderGallery();
  show('home');
})();
