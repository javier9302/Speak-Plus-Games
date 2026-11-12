// The hub page: one card per game in shared/registry.js (made from each game's game.json).
(() => {
const { $, esc, t, store } = Kit;
const GAMES = window.HUB_GAMES || [];
const L = o => (o && (o[Kit.lang] || o.en)) || '';
const nameOf = g => L((g.brandNames && g.brandNames[Kit.brand]) || g.name);
const FILE = location.protocol === 'file:';
const FKEY = 'hub-filters-v1';
const F = Object.assign({ size: '', age: '', level: '', time: '', skill: '', nodev: false }, store.get(FKEY, {}));

/* ---------- Filters ---------- */
const LEVELS = ['pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1'];
const AGES = { kids: [4, 10], teens: [11, 17], adults: [18, 99] };
const options = (sel, first, list) => { sel.innerHTML = `<option value="">${esc(first)}</option>` + list.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); };
options($('#f-age'), t('hub.anyAge'), Object.keys(AGES).map(k => [k, t('hub.' + k)]));
options($('#f-level'), t('hub.anyLevel'), LEVELS.map(l => [l, l]));
options($('#f-time'), t('hub.anyTime'), [10, 20, 45].map(n => [n, t('hub.upTo', { n })]));
const skills = [...new Set(GAMES.flatMap(g => g.skills))].sort();
options($('#f-skill'), t('hub.anySkill'), skills.map(s => [s, t('skill.' + s) === 'skill.' + s ? s : t('skill.' + s)]));
$('#f-size').value = F.size; $('#f-age').value = F.age; $('#f-level').value = F.level; $('#f-time').value = F.time; $('#f-skill').value = F.skill; $('#f-nodev').checked = F.nodev;

const matches = g => {
  const n = +F.size, a = AGES[F.age];
  if (n && (n < g.players.min || n > g.players.max)) return false;
  if (a && (g.ages[1] < a[0] || g.ages[0] > a[1])) return false;
  if (F.level && !g.levels.includes(F.level)) return false;
  if (F.time && g.minutes[0] > +F.time) return false;
  if (F.skill && !g.skills.includes(F.skill)) return false;
  if (F.nodev && g.devices.students !== 'none') return false;
  return true;
};

/* ---------- Cards ---------- */
function card(g) {
  const meta = [
    g.ages[1] >= 99 ? t('hub.agesN', { a: g.ages[0] }) : t('hub.agesRange', { a: g.ages[0], b: g.ages[1] }),
    g.levels[0] === g.levels[g.levels.length - 1] ? g.levels[0] : g.levels[0] + '–' + g.levels[g.levels.length - 1],
    t('hub.studentsN', { a: g.players.min, b: g.players.max }),
    t('hub.minutesN', { a: g.minutes[0], b: g.minutes[1] }),
    t('hub.dev.' + g.devices.students),
  ];
  const node = g.needs.server === 'node';
  const links = (g.links || []).map(l => `<a class="btn btn-ghost" href="${esc(l.href)}">${esc(L(l.label))}</a>`).join('');
  const actions = node
    ? `<p class="run">${esc(t('hub.start'))} <code>${esc(g.start)}</code></p>${g.docsHref ? `<a class="btn btn-ghost" href="${esc(g.docsHref)}">${esc(t('hub.guide'))}</a>` : ''}`
    : `<a class="btn btn-primary" href="${esc(g.href)}">${esc(t('hub.play'))}</a>${links}`;
  return `<article class="game-card" data-id="${esc(g.id)}">
    <div class="game-art" aria-hidden="true">${g.art.replace('<svg', '<svg class="art" preserveAspectRatio="xMidYMid slice"')}</div>
    <div class="game-body">
      <h2>${esc(nameOf(g))}${g.status === 'experimental' ? ` <span class="badge">${esc(t('hub.experimental'))}</span>` : ''}</h2>
      <p>${esc(L(g.summary))}</p>
      <div class="tags">${(L(g.tags) || []).map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>
      <div class="game-meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}</div>
      ${FILE && g.needs.server === 'static' ? `<p class="game-note">${t('hub.needsServer')}</p>` : ''}
      <div class="game-actions">${actions}</div>
    </div>
  </article>`;
}

function render() {
  const easy = GAMES.filter(g => g.needs.server !== 'node'), hard = GAMES.filter(g => g.needs.server === 'node');
  const shown = easy.filter(matches);
  $('#games').innerHTML = (shown.length ? shown.map(card).join('') : `<div class="empty">${esc(t('hub.none'))} <button class="chip-btn" type="button" id="f-reset">${esc(t('hub.reset'))}</button></div>`) +
    `<div class="soon"><b>${esc(t('hub.addYours'))}</b><span>${esc(t('hub.addText'))}</span><a href="CONTRIBUTING.md">${esc(t('hub.addLink'))} →</a></div>`;
  const shownHard = hard.filter(matches);
  $('#games-advanced').innerHTML = shownHard.map(card).join('');
  $('#advanced').hidden = !shownHard.length;
  $('#f-count').textContent = t('hub.shown', { n: shown.length + shownHard.length });
}
$('#filters').addEventListener('input', () => {
  Object.assign(F, { size: $('#f-size').value, age: $('#f-age').value, level: $('#f-level').value, time: $('#f-time').value, skill: $('#f-skill').value, nodev: $('#f-nodev').checked });
  store.set(FKEY, F); render();
});
document.addEventListener('click', e => {
  if (e.target.id !== 'f-reset') return;
  Object.assign(F, { size: '', age: '', level: '', time: '', skill: '', nodev: false }); store.set(FKEY, F);
  ['#f-size', '#f-age', '#f-level', '#f-time', '#f-skill'].forEach(s => { $(s).value = ''; }); $('#f-nodev').checked = false; render();
});
render();
})();
