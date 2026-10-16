// The printable teacher sheet.  sheet.html?zone=beach  (before class)  or  sheet.html?room=ABCD  (the running mission)
import { api, esc } from '../shared/net.js';

const params = new URLSearchParams(location.search);
const main = document.querySelector('#sheet');
const list = (items) => `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
const TYPE = { choice: 'Choice', typed: 'Typed answer', spelling: 'Spelling', code: 'Code card (you check)', link: 'Link (through a helper)', courier: 'Courier (a letter)' };

const puzzles = (rows) => `<table><tr><th style="width:24%">Object</th><th style="width:38%">What the team does</th><th>Clues (only the player with that ability sees them)</th></tr>
  ${rows.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.how)}</td><td>${p.clues.map((c) => `<b>${esc(c.ability)}:</b> ${esc(c.text)}`).join('<br>')}</td></tr>`).join('')}</table>`;
const steps = (log, est) => `${est ? `<p class="small">Talk score ${est.talk} (clues and items that must pass between players). A perfect team: about ${est.fast} to ${est.slow} minutes; a real class takes several times longer.</p>` : ''}<ol class="small">${log.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;

function mission(d) {
  document.title = `${d.title} · teacher sheet`;
  return `
    <h1>${esc(d.title)}</h1>
    <p><b>${esc(d.group)}</b> · level ${esc(d.level)} · about ${d.minutes} minutes · room ${esc(d.room)} · monster: ${esc(d.monster)}</p>
    <p>${esc(d.story)}</p>
    <p><b>Goal:</b> ${esc(d.goal)}.</p>
    ${(d.codes || (d.gateCode ? [d.gateCode] : [])).map((c) => `<p><b>Code of the ${esc(c.name.toLowerCase())}:</b> <span class="code">${esc(c.code)}</span></p>`).join('')}
    ${d.teacherRoles.length ? `<p><b>You are the ${d.teacherRoles.join(' and the ')}.</b> Students must ask you in English.</p>` : ''}

    <h2>Who can do what</h2>
    <table><tr><th>Player</th><th>Abilities</th><th>Roles</th></tr>
      ${d.players.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${p.abilities.map(esc).join(', ')}</td><td>${p.roles.map(esc).join(', ')}</td></tr>`).join('')}</table>
    <p class="small">Abilities change if you reshuffle or if a player joins or leaves. Print again after that.</p>

    <h2>Challenge tablets</h2>
    ${d.stations.map((s) => { const c = s.card; return `<div class="box">
      <h3>${esc(s.name)} <span class="small">· ${TYPE[c.type]}${c.mode !== c.type ? ' → ' + TYPE[c.mode] : ''} · ${esc(c.level)}${s.reward ? ' · gives: ' + esc(s.reward) : ''}</span></h3>
      ${s.courier ? `<p class="small">A letter: the player with Give carries it to a teammate. They must meet at ${esc(s.courier)}. This question is inside.</p>` : ''}
      ${c.link ? `<p class="small">Link for the ${esc(c.helper)} helper: ${esc(c.link)}</p>` : ''}
      <p><b>${esc(c.prompt)}</b></p>
      ${c.answer ? `<p>Answer: <b>${esc(c.answer)}</b></p>` : ''}
      ${c.code ? `<p>Code: <span class="code">${esc(c.code)}</span></p>${c.accepted.length ? `<p class="small">Accept:</p>${list(c.accepted.map(esc))}` : ''}` : ''}
      ${c.hints.length ? `<p class="small">Hints, when they ask in English:</p>${list(c.hints.map((h) => `<span class="tick"></span>${esc(h)}`))}` : ''}
    </div>`; }).join('')}

    <h2 class="page">Puzzles on the island</h2>
    ${puzzles(d.puzzles)}

    <h2>One way through, with these players</h2>
    ${steps(d.steps, d.estimate)}

    <h2>Notes: errors heard, things to review</h2>
    <div class="lines"></div><div class="lines"></div><div class="lines"></div>`;
}

function zone(d) {
  document.title = `${d.title} · zone sheet`;
  return `
    <h1>${esc(d.title)}</h1>
    <p>${esc(d.goal)}</p>
    <p class="small">The code of the gate changes every mission. It is on the mission sheet and in the teacher panel.</p>

    <h2>Puzzles</h2>
    ${puzzles(d.puzzles)}

    <h2>Places students can name</h2>
    <p>${d.places.map(esc).join(' · ')}</p>
    <h2>Landmarks that missions restore, in order</h2>
    <p>${d.landmarks.map(esc).join(' · ')}</p>

    <h2 class="page">Who gets which abilities</h2>
    ${d.tables.map((t) => `<h3>${t.n} players</h3><table>${t.sets.map((s, i) => `<tr><th style="width:18%">Player ${i + 1}</th><td>${s.map(esc).join(', ')}</td></tr>`).join('')}</table>`).join('')}
    <p class="small">These are the preset sets. "Random mix" shares them differently, but always so that the mission can be finished.</p>

    <h2 class="page">One way through the whole zone (3 players)</h2>
    ${steps(d.steps, d.estimate)}

    <h2>Missions</h2>
    ${d.missions.map((m) => `<div class="box"><h3>${esc(m.title)} <span class="small">· about ${m.minutes} minutes</span></h3><p>${esc(m.story)}</p><p class="small">${m.tablets.map(esc).join(' · ')}</p></div>`).join('')}`;
}

try {
  const room = params.get('room');
  const d = await api(room ? `/sheet?room=${encodeURIComponent(room)}` : `/sheet?zone=${encodeURIComponent(params.get('zone') || 'beach')}`);
  document.querySelector('#which').textContent = d.kind === 'mission' ? 'The mission that is running now, with its real cards and codes.' : 'The whole zone, for preparing a class.';
  main.innerHTML = d.kind === 'mission' ? mission(d) : zone(d);
} catch (e) {
  main.innerHTML = `<p class="error">${esc(e.message)}</p>`;
}
