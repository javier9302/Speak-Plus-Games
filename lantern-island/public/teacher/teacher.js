// Teacher panel. This file: the tabs, and the Groups tab (create, settings, notes, export, import, duplicate, reset).
// The Live game tab is live.js; the Cards tab is library.js.
import { api, esc } from '../shared/net.js';
import './live.js';
import './library.js';

const $ = (s) => document.querySelector(s);
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const MONSTERS = ['off', 'gentle', 'normal', 'hard'];
let groups = [];

// ---------- tabs ----------
const TABS = ['live', 'cards', 'groups'];
function showTab(name) {
  if (!TABS.includes(name)) name = 'live';
  for (const t of TABS) $(`#tab-${t}`).hidden = t !== name;
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  try { sessionStorage.setItem('li-tab', name); } catch { /* private mode */ }
  document.dispatchEvent(new CustomEvent('tab', { detail: name }));
}
document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) showTab(b.dataset.tab); });

function showError(text) { $('#error').textContent = text || ''; $('#error').hidden = !text; }
async function run(fn) { try { showError(''); await fn(); } catch (e) { showError(e.message); } }

const options = (list, value) => [...new Set([...list, value])].map((v) => `<option${v === value ? ' selected' : ''}>${esc(v)}</option>`).join('');

function render() {
  $('#empty').hidden = groups.length > 0;
  $('#groups').innerHTML = groups.map((g) => `
    <article class="panel group" data-id="${esc(g.id)}">
      <div class="row"><h2 class="grow">${esc(g.name)}</h2><span class="saved" data-saved hidden>Saved</span></div>
      <div class="stats muted small">
        <span>${g.island.sessions} sessions</span><span>${g.island.stars} stars</span>
        <span>${g.island.missionsDone.length} missions done</span><span>${g.island.landmarks.length} landmarks restored</span>
        <span>${g.nicknames.length ? 'Students: ' + esc(g.nicknames.join(', ')) : 'No students yet'}</span>
      </div>
      <div class="row">
        <label>Level <select class="field" data-set="level">${options(LEVELS, g.settings.level)}</select></label>
        <label>Monster <select class="field" data-set="monster">${options(MONSTERS, g.settings.monster)}</select></label>
      </div>
      <label>Notes (errors you heard, what to review)
        <textarea data-notes>${esc(g.notes)}</textarea>
      </label>
      <div class="row">
        <button class="btn btn-small" data-act="rename" type="button">Rename</button>
        <button class="btn btn-small" data-act="export" type="button">Export save</button>
        <button class="btn btn-small" data-act="duplicate" type="button">Duplicate group</button>
        <span class="grow"></span>
        <button class="btn btn-small btn-danger" data-act="reset" type="button">Reset island</button>
        <button class="btn btn-small btn-danger" data-act="delete" type="button">Delete group</button>
      </div>
    </article>`).join('');
}

const load = () => run(async () => { groups = await api('/groups'); render(); });

function flashSaved(card) {
  const el = card.querySelector('[data-saved]');
  el.hidden = false;
  clearTimeout(el.timer);
  el.timer = setTimeout(() => { el.hidden = true; }, 1500);
}

function download(name, data) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const actions = {
  async rename(g) {
    const name = (prompt('New name for this group:', g.name) || '').trim();
    if (name && name !== g.name) { await api(`/groups/${g.id}`, { method: 'PATCH', body: { name } }); await load(); }
  },
  async export(g) {
    const day = new Date().toISOString().slice(0, 10);
    download(`${g.name.replace(/[^\w-]+/g, '_')}-${day}.json`, await api(`/groups/${g.id}/export`));
  },
  async duplicate(g) { await api(`/groups/${g.id}/duplicate`, { method: 'POST' }); await load(); },
  async reset(g) {
    if (!confirm(`Reset the island of "${g.name}"?\n\nAll restored landmarks, completed missions, stars and the session count go back to zero. Notes and settings stay. This cannot be undone. Export a save first if you are not sure.`)) return;
    await api(`/groups/${g.id}/reset`, { method: 'POST' }); await load();
  },
  async delete(g) {
    if (!confirm(`Delete the group "${g.name}" and its island?\n\nThis cannot be undone.`)) return;
    await api(`/groups/${g.id}`, { method: 'DELETE' }); await load();
  },
};

const groupOf = (el) => { const card = el.closest('.group'); return [groups.find((g) => g.id === card.dataset.id), card]; };

$('#groups').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b) run(() => actions[b.dataset.act](groupOf(b)[0]));
});
$('#groups').addEventListener('change', (e) => {
  const [g, card] = groupOf(e.target);
  run(async () => {
    let body;
    if (e.target.dataset.set) body = { settings: { [e.target.dataset.set]: e.target.value } };
    else if (e.target.matches('[data-notes]')) body = { notes: e.target.value };
    else return;
    Object.assign(g, await api(`/groups/${g.id}`, { method: 'PATCH', body }));
    flashSaved(card);
  });
});

$('#new-group').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#new-name').value.trim();
  if (!name) return $('#new-name').focus();
  run(async () => { await api('/groups', { method: 'POST', body: { name } }); $('#new-name').value = ''; await load(); });
});

$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  run(async () => {
    let data;
    try { data = JSON.parse(await file.text()); } catch { throw new Error('This is not a valid JSON file.'); }
    try { await api('/groups/import', { method: 'POST', body: data }); }
    catch (err) {
      if (err.status !== 409) throw err;
      // The same group is already on this computer.
      const replace = confirm(`"${data.group?.name}" is already on this computer.\n\nOK: replace it with the file.\nCancel: keep both (the file is added as a copy).`);
      await api(`/groups/import?mode=${replace ? 'replace' : 'copy'}`, { method: 'POST', body: data });
    }
    await load();
  });
});

load();

// Stars and sessions change while a game runs: read the groups again when the tab opens.
document.addEventListener('tab', (e) => { if (e.detail === 'groups') load(); });

// Open on the live game when a room code came with the link, else on the last tab used.
showTab(new URLSearchParams(location.search).get('room') || new URLSearchParams(location.search).get('match') ? 'live' : sessionStorage.getItem('li-tab') || 'groups');
