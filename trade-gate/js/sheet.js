// Builds the printable teacher sheet from the same JSON files as the game.

import { loadAll, resolveLevel } from './levels.js';
import { assignRoles } from './roles.js';
import { gateSummary, escapeHtml as esc } from './util.js';

const only = new URLSearchParams(location.search).get('level');

loadAll().then(({ config, levels }) => {
  const nameOf = (id) => (config.players[Number(id.slice(1)) - 1] || {}).name || id;
  const shown = levels.filter((l) => !only || l.id === only);

  document.getElementById('picker').innerHTML =
    `Show: <a href="teacher-sheet.html">all levels</a>` +
    levels.map((l) => ` | <a href="teacher-sheet.html?level=${esc(l.id)}">${esc(l.name)}</a>`).join('');

  document.getElementById('sheet').innerHTML = shown.map((level) => {
    const n = level.players;
    const roles = assignRoles(n, config.resourceOrder);
    const resolved = resolveLevel(level, n, config.resourceOrder);
    const goal = Object.entries(resolved.goal)
      .map(([station, needs]) => `${station}: ${Object.entries(needs).map(([r, c]) => `${c} ${r}`).join(' + ')}`)
      .join('; ');

    return `
    <article class="level">
      <header>
        <h1>${esc(config.title)}: ${esc(level.name)}</h1>
        <p>${esc(level.description || '')} <strong>${n} players.</strong> Goal: <strong>${esc(goal)}</strong>, then everyone stands on the exit.</p>
      </header>

      <table class="roles">
        <tr><th>Player</th><th>Collects (cannot use)</th><th>Can use (cannot pick up)</th></tr>
        ${roles.map((r) => `<tr><td><strong>${esc(nameOf(r.id))}</strong> (${r.id})</td><td>${esc(r.collects)}</td><td>${esc(r.spends)}</td></tr>`).join('')}
      </table>

      ${resolved.gates.map((g) => {
        const s = gateSummary(g, config, nameOf);
        return `
        <section class="gate">
          <div class="gate-head">
            <h2>Gate ${g.number} <small>(${esc(g.type)})</small></h2>
            <p class="code">Code <strong>${esc(g.teacher.code)}</strong></p>
          </div>
          <p><strong>Trade:</strong> ${esc(s.trade)}</p>
          <p><strong>Who speaks:</strong> ${esc(s.who)}</p>
          <p class="question">${esc(s.question)}</p>
          ${s.extra ? `<p>${esc(s.extra)}</p>` : ''}
          <h3>Accepted answers</h3>
          <ul>${g.teacher.accepted.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
          <h3>Hint ladder <small>(students ask: "Can we have a hint, please?" Tick the hints you give.)</small></h3>
          <ol class="hints">${g.teacher.hints.map((h) => `<li><span class="box"></span>${esc(h)}</li>`).join('')}</ol>
        </section>`;
      }).join('')}

      <section class="notes">
        <h3>Notes: errors I heard</h3>
        <div class="lines"></div>
      </section>
    </article>`;
  }).join('') || '<p>No level with that id.</p>';
}).catch((err) => {
  document.getElementById('sheet').textContent = `Could not load the levels: ${err.message}. Open this page through the local server, not as a file.`;
});
