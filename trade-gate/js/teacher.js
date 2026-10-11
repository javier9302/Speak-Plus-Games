// The Teacher Panel. It is ordinary HTML (not canvas) so it can have buttons
// and a notes box. The same panel is used in two places:
//   - inside the game window (press T)
//   - in its own window (index.html?teacher=1), kept in step by sync.js
// It only shows what the game tells it (update) and sends commands back (send).

import { resolveLevel } from './levels.js';
import { gateSummary, escapeHtml as esc, fmtTime } from './util.js';

const NOTES_KEY = (levelId) => `trade-gate-notes-${levelId}`;
const STATUS = { locked: 'not started', active: 'WAITING FOR CODE', open: 'open' };
const SCREENS = { lobby: 'Lobby', select: 'Level select', play: 'Playing', win: 'Level complete' };

export function createTeacherPanel(root, { config, levels, send, standalone }) {
  root.innerHTML = `
    <header>
      <h1>Teacher panel</h1>
      <p class="tp-status" data-el="status">Waiting for the game window...</p>
    </header>
    <div class="tp-row">
      <label>Level
        <select data-el="level">${levels.map((l, i) => `<option value="${i}">${i + 1}. ${esc(l.name)}</option>`).join('')}</select>
      </label>
      <button data-cmd="restart">Restart level</button>
      <button data-cmd="pause" data-el="pause">Pause</button>
    </div>
    <div class="tp-row">
      <button data-cmd="bonus">Award bonus gem (G)</button>
      <button data-set="timerEnabled" data-el="timerEnabled"></button>
      <button data-set="phraseHints" data-el="phraseHints"></button>
      <button data-set="hintCostsResource" data-el="hintCostsResource"></button>
      <button data-set="muted" data-el="muted"></button>
    </div>
    <p class="tp-stats" data-el="stats"></p>
    <div data-el="gates"></div>
    <label class="tp-notes">Notes for this level (errors you hear). Saved on this computer.
      <textarea data-el="notes" rows="5" placeholder="e.g. 'I go yesterday' -> went"></textarea>
    </label>
    <p class="tp-links">
      <a data-el="sheet" target="_blank" href="teacher-sheet.html">Printable teacher sheet</a>
      ${standalone ? '' : ' | <a target="_blank" href="?teacher=1">Open this panel in a second window</a>'}
    </p>`;

  const el = (name) => root.querySelector(`[data-el="${name}"]`);
  const LABELS = {
    timerEnabled: ['Timer: off', 'Timer: ON'],
    phraseHints: ['Phrase hints: off', 'Phrase hints: ON'],
    hintCostsResource: ['Hint cost: off', 'Hint cost: 1 resource'],
    muted: ['Sound: ON', 'Sound: off'],
  };
  let snap = null;
  let builtFor = '';
  let notesLevel = null;

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !snap || snap.offline) return;
    if (btn.dataset.set) send({ type: 'set', key: btn.dataset.set, value: !snap.settings[btn.dataset.set] });
    else if (btn.dataset.cmd === 'hint') send({ type: 'hint', gate: btn.dataset.gate, n: Number(btn.dataset.n) });
    else if (btn.dataset.cmd) send({ type: btn.dataset.cmd, gate: btn.dataset.gate });
    btn.blur(); // so Space / Enter in the game do not press the button again
  });
  el('level').addEventListener('change', (e) => { send({ type: 'level', index: Number(e.target.value) }); e.target.blur(); });
  el('notes').addEventListener('input', (e) => {
    try { localStorage.setItem(NOTES_KEY(notesLevel), e.target.value); } catch { /* storage off */ }
  });
  // Notes typed in the other window show up here too.
  window.addEventListener('storage', (e) => {
    if (e.key === NOTES_KEY(notesLevel) && document.activeElement !== el('notes')) el('notes').value = e.newValue || '';
  });

  function buildGates(level, count) {
    const playedWith = Math.max(2, Math.min(4, count || level.players));
    const resolved = resolveLevel(level, playedWith, config.resourceOrder);
    const nameOf = (id) => (config.players[Number(id.slice(1)) - 1] || {}).name || id;
    el('gates').innerHTML = resolved.gates.map((g) => {
      const s = gateSummary(g, config, nameOf);
      return `
      <section class="tp-gate" data-gate="${esc(g.id)}">
        <h2>Gate ${g.number} <small>${esc(g.type)}</small> <span class="tp-badge"></span></h2>
        <p class="tp-trade">${esc(s.trade)}</p>
        <p><em>${esc(s.who)}</em></p>
        <p class="tp-question">${esc(s.question)}</p>
        ${s.extra ? `<p>${esc(s.extra)}</p>` : ''}
        <p class="tp-code">Code: <strong>${esc(g.teacher.code)}</strong></p>
        <h3>Accepted answers</h3>
        <ul>${g.teacher.accepted.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
        <h3>Hint ladder <small>(students ask: "Can we have a hint, please?")</small></h3>
        <ol>${g.teacher.hints.map((h, i) => `<li><button data-cmd="hint" data-gate="${esc(g.id)}" data-n="${i + 1}">Reveal</button> ${esc(h)}</li>`).join('')}</ol>
        <div class="tp-row">
          <button data-cmd="force" data-gate="${esc(g.id)}">Force open (rescue card)</button>
          <button data-cmd="skip" data-gate="${esc(g.id)}">Skip (close the card)</button>
        </div>
      </section>`;
    }).join('') || '<p>This level has no gates.</p>';
  }

  function update(next) {
    snap = next;
    const level = levels[snap.levelIdx] || levels[0];
    const key = `${level.id}|${snap.playerCount}`;
    if (key !== builtFor) { builtFor = key; buildGates(level, snap.playerCount); }

    if (notesLevel !== level.id) {
      notesLevel = level.id;
      let saved = '';
      try { saved = localStorage.getItem(NOTES_KEY(level.id)) || ''; } catch { /* storage off */ }
      el('notes').value = saved;
    }
    el('level').value = String(snap.levelIdx);
    el('sheet').href = `teacher-sheet.html?level=${encodeURIComponent(level.id)}`;
    el('pause').textContent = snap.paused ? 'Resume' : 'Pause';
    for (const [name, labels] of Object.entries(LABELS)) el(name).textContent = labels[snap.settings[name] ? 1 : 0];

    const waiting = snap.activeGate ? ' - a gate is waiting for a code!' : '';
    el('status').textContent = snap.offline
      ? 'Waiting for the game window... Open the game in another window of this browser.'
      : `${SCREENS[snap.screen] || ''}: ${level.name}, ${snap.playerCount} player(s)${snap.paused ? ' - PAUSED' : ''}${waiting}`;
    el('status').classList.toggle('tp-alert', !!snap.activeGate);
    el('stats').textContent = snap.stats
      ? `Time ${fmtTime(snap.stats.time)} | Goal ${snap.goal.have}/${snap.goal.need} | Trades ${snap.stats.trades} | Hints ${snap.stats.hints} | Bonus gems ${snap.stats.bonus}`
      : 'Start a level to see the gates live. You can read the questions and codes below already.';

    root.querySelectorAll('.tp-gate').forEach((card) => {
      const id = card.dataset.gate;
      const g = snap.gates[id] || { status: 'locked', hints: 0 };
      const active = snap.activeGate === id;
      card.classList.toggle('tp-active', active);
      card.classList.toggle('tp-open', g.status === 'open');
      card.querySelector('.tp-badge').textContent = STATUS[g.status];
      card.querySelectorAll('[data-cmd="hint"]').forEach((b) => {
        const shown = Number(b.dataset.n) <= g.hints;
        b.disabled = !active || shown;
        b.textContent = shown ? 'Shown' : 'Reveal';
      });
      card.querySelector('[data-cmd="force"]').disabled = snap.screen !== 'play' || g.status === 'open';
      card.querySelector('[data-cmd="skip"]').disabled = !active;
    });
  }

  return { update };
}
