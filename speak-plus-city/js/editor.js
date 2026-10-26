// Content editor: change the game texts without touching code.
// "Save" keeps the changes in this browser (the teacher window uses them);
// "Download content.json" makes a file to replace data/content.json, so the
// changes go with the folder to another computer or to the school website.

import { loadContent, loadDefaultContent, saveCustomContent, clearCustomContent, validateContent } from './content.js';
import { $, esc, download, readFile } from './ui.js';

const LEVEL_OPTS = ['beginner', 'intermediate', 'advanced', 'all'];
const TYPES = ['start', 'property', 'chance', 'mystery', 'bank', 'blackmarket', 'jail', 'festival', 'gotojail'];
const CORNERS = { 0: 'start', 12: 'jail', 24: 'festival', 36: 'gotojail' };

// One entry per tab. Columns: [key, label, kind, extra]. kind: str | long | num | bool | list (comma) | lines | select | color
const SECTIONS = {
  squares: {
    title: 'Board squares', fixed: true,
    help: 'The 48 squares, starting at Start and going clockwise. Corners can\'t change type. Vocabulary: separate words with commas. A changed board is used from the next new game.',
    cols: [['type', 'Type', 'select', TYPES], ['emoji', 'Icon', 'str'], ['name', 'Name', 'str'], ['group', 'Colour group', 'group'], ['price', 'Price', 'num'], ['rent', 'Rent', 'num'],
      ['bank', 'Bank type', 'select', ['', 'tax', 'bonus', 'loan']], ['amount', 'Bank $', 'num'], ['vocab', 'Vocabulary', 'list'], ['topic', 'Speaking topic', 'long']]
  },
  groups: {
    title: 'Colour groups', help: 'Districts of the city. Owning all the properties of a group doubles their rent. Don\'t change the id of a group that squares use.',
    cols: [['id', 'Id', 'str'], ['name', 'Name', 'str'], ['color', 'Colour', 'color']], blank: () => ({ id: 'new', name: 'New group', color: '#888888' })
  },
  chance: {
    title: 'Chance cards', help: 'The card shown matches the player\'s level ("all" = any level). Reward: money when they do it (negative = pay). If not done: money when they fail. Town fund: payments go to the town fund.',
    cols: [['level', 'Level', 'select', LEVEL_OPTS], ['text', 'Card text', 'long'], ['reward', 'Reward', 'num'], ['fail', 'If not done', 'num'], ['fund', 'Town fund', 'bool'], ['note', 'Note for the teacher', 'str']],
    blank: () => ({ level: 'beginner', text: '', reward: 100, fail: 0 })
  },
  mystery: {
    title: 'Mystery challenges', help: 'Types: picture (describe the emoji picture), talk (speak for some seconds), truths (two truths and a lie), taboo (explain the word without the forbidden words), roleplay.',
    cols: [['type', 'Type', 'select', ['picture', 'talk', 'truths', 'taboo', 'roleplay']], ['level', 'Level', 'select', LEVEL_OPTS], ['text', 'Instructions', 'long'], ['picture', 'Picture (emoji)', 'str'],
      ['word', 'Taboo word', 'str'], ['taboo', 'Forbidden words', 'list'], ['reward', 'Reward', 'num']],
    blank: () => ({ type: 'talk', level: 'all', text: '', reward: 100 })
  },
  missions: { title: 'Secret missions', help: 'Each player gets one at the start. Write goals the teacher can check at the end.', cols: [['text', 'Mission', 'long']], blank: () => ({ text: '' }) },
  rules: { title: 'Rules of the round', help: 'A new one is shown every round.', plain: true, cols: [['', 'Rule', 'long']], blank: () => '' },
  blackMarket: {
    title: 'Black Market', help: 'Rare items sold to the best pitch. Value counts for the final ranking.',
    cols: [['emoji', 'Icon', 'str'], ['name', 'Name', 'str'], ['price', 'Price', 'num'], ['value', 'Value', 'num']], blank: () => ({ emoji: '🎁', name: '', price: 300, value: 500 })
  },
  jailChallenges: {
    title: 'Coffee Break', help: 'What a player must say to leave the Coffee Break corner.',
    cols: [['level', 'Level', 'select', LEVEL_OPTS], ['text', 'Challenge', 'long']], blank: () => ({ level: 'all', text: '' })
  },
  sayIt: { title: '"Say it!" and hints', help: 'What the board shows for each action. Beginners see the frames and the vocabulary; intermediate see the vocabulary; advanced see the challenge. The teacher\'s hint bank uses the same texts. Placeholders: {name} {price} {amount} {owner} {challenge}.' }
};

let draft = null;       // the content being edited
let saved = '';         // JSON of the last saved/loaded version, to show unsaved changes
let custom = false;
let tab = 'squares';

const clone = o => JSON.parse(JSON.stringify(o));

function getAt(path) { return path.reduce((o, k) => (o == null ? o : o[k]), draft); }
function setAt(path, value) {
  const last = path[path.length - 1];
  const parent = getAt(path.slice(0, -1));
  if (value === undefined || value === '' && typeof parent[last] !== 'string' && !Array.isArray(parent)) delete parent[last];
  else parent[last] = value;
}

function field(path, kind, value, extra) {
  const p = esc(JSON.stringify(path));
  const v = value ?? '';
  switch (kind) {
    case 'num': return `<input type="number" data-path="${p}" data-kind="num" value="${esc(v)}">`;
    case 'bool': return `<input type="checkbox" data-path="${p}" data-kind="bool" ${v ? 'checked' : ''}>`;
    case 'color': return `<input type="color" data-path="${p}" data-kind="str" value="${esc(v || '#888888')}">`;
    case 'list': return `<input type="text" data-path="${p}" data-kind="list" value="${esc((v || []).join(', '))}">`;
    case 'lines': return `<textarea data-path="${p}" data-kind="lines" rows="3">${esc((v || []).join('\n'))}</textarea>`;
    case 'long': return `<textarea data-path="${p}" data-kind="str" rows="2">${esc(v)}</textarea>`;
    case 'select': return `<select data-path="${p}" data-kind="str" ${extra.disabled ? 'disabled' : ''}>${extra.list.map(o => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o || '—')}</option>`).join('')}</select>`;
    case 'group': return `<select data-path="${p}" data-kind="str"><option value="">—</option>${draft.groups.map(g => `<option value="${esc(g.id)}" ${g.id === v ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>`;
    default: return `<input type="text" data-path="${p}" data-kind="str" value="${esc(v)}">`;
  }
}

function tableHTML(key) {
  const sec = SECTIONS[key];
  const list = draft[key] || [];
  const head = `<tr>${key === 'squares' ? '<th>#</th>' : ''}${sec.cols.map(c => `<th>${esc(c[1])}</th>`).join('')}${sec.fixed ? '' : '<th></th>'}</tr>`;
  const rows = list.map((item, i) => {
    const cells = sec.cols.map(([k, , kind, opts]) => {
      const path = sec.plain ? [key, i] : [key, i, k];
      const value = sec.plain ? item : item[k];
      // Only show the fields that matter for this square type.
      if (key === 'squares') {
        const t = item.type;
        if (['group', 'price', 'rent', 'vocab', 'topic'].includes(k) && t !== 'property') return '<td class="na"></td>';
        if (['bank', 'amount'].includes(k) && t !== 'bank') return '<td class="na"></td>';
      }
      return `<td class="c-${k || 'text'}">${field(path, kind, value, { list: opts, disabled: key === 'squares' && k === 'type' && CORNERS[i] })}</td>`;
    }).join('');
    const tools = sec.fixed ? '' : `<td class="tools"><button class="icon-btn" data-row="up" data-i="${i}" type="button" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button><button class="icon-btn" data-row="down" data-i="${i}" type="button" aria-label="Move down" ${i === list.length - 1 ? 'disabled' : ''}>↓</button><button class="icon-btn" data-row="del" data-i="${i}" type="button" aria-label="Delete">✕</button></td>`;
    return `<tr>${key === 'squares' ? `<td class="idx">${i}</td>` : ''}${cells}${tools}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="ed-table ed-${key}"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
    ${sec.fixed ? '' : `<button class="btn btn-ghost" data-row="add" type="button">+ Add</button> <span class="hint">${list.length} items</span>`}`;
}

function sayItHTML() {
  return Object.entries(draft.sayIt || {}).map(([k, e]) => `<section class="say-sec"><h3>${esc(e.label || k)} <code>${esc(k)}</code></h3>
    <div class="say-grid">
      <label>Button label${field(['sayIt', k, 'label'], 'str', e.label)}</label>
      <label>Task (everyone)${field(['sayIt', k, 'task'], 'long', e.task)}</label>
      <label>Challenge (intermediate, advanced)${field(['sayIt', k, 'stretch'], 'long', e.stretch)}</label>
      <label>Sentence frames — one per line${field(['sayIt', k, 'frames'], 'lines', e.frames)}</label>
      <label>Vocabulary — separate with commas${field(['sayIt', k, 'vocab'], 'list', e.vocab)}</label>
      <label>Example answers — one per line${field(['sayIt', k, 'examples'], 'lines', e.examples)}</label>
    </div></section>`).join('');
}

function render() {
  const nav = Object.entries(SECTIONS).map(([k, s]) => `<button type="button" data-tab="${k}" aria-selected="${k === tab}">${esc(s.title)}</button>`).join('');
  $('#ed-tabs').innerHTML = nav;
  const sec = SECTIONS[tab];
  $('#ed-body').innerHTML = `<p class="hint">${esc(sec.help)}</p>${tab === 'sayIt' ? sayItHTML() : tableHTML(tab)}`;
  status();
}

function status() {
  const errs = validateContent(draft);
  const dirty = JSON.stringify(draft) !== saved;
  $('#ed-status').innerHTML = `${custom ? 'Using <b>your saved content</b>.' : 'Using the <b>default content</b> (data/content.json).'} ${dirty ? '<b class="dirty">Unsaved changes.</b>' : ''}`;
  $('#ed-errors').innerHTML = errs.length ? `<b>Fix these before saving:</b><ul>${errs.slice(0, 12).map(e => `<li>${esc(e)}</li>`).join('')}</ul>${errs.length > 12 ? `<p>…and ${errs.length - 12} more.</p>` : ''}` : '';
  $('#ed-errors').hidden = !errs.length;
  $('#ed-save').disabled = !!errs.length || !dirty;
}

function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3000);
}

document.addEventListener('input', e => {
  const el = e.target;
  if (!el.dataset.path) return;
  const path = JSON.parse(el.dataset.path);
  const kind = el.dataset.kind;
  let v;
  if (kind === 'num') v = el.value === '' ? undefined : Number(el.value);
  else if (kind === 'bool') v = el.checked || undefined;
  else if (kind === 'list') v = el.value.split(/[,、]/).map(x => x.trim()).filter(Boolean);
  else if (kind === 'lines') v = el.value.split('\n').map(x => x.trim()).filter(Boolean);
  else v = el.value;
  setAt(path, v);
  // Changing a square's type changes which fields it has.
  if (path[0] === 'squares' && path[2] === 'type') render(); else status();
});
document.addEventListener('change', e => { if (e.target.dataset.path && e.target.type === 'checkbox') e.target.dispatchEvent(new Event('input', { bubbles: true })); });

document.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tab) { tab = b.dataset.tab; render(); return; }
  if (b.dataset.row) {
    const list = draft[tab];
    const i = Number(b.dataset.i);
    if (b.dataset.row === 'add') list.push(SECTIONS[tab].blank());
    else if (b.dataset.row === 'del') { if (!confirm('Delete this item?')) return; list.splice(i, 1); }
    else if (b.dataset.row === 'up') [list[i - 1], list[i]] = [list[i], list[i - 1]];
    else if (b.dataset.row === 'down') [list[i + 1], list[i]] = [list[i], list[i + 1]];
    render();
    if (b.dataset.row === 'add') $('#ed-body tbody tr:last-child textarea, #ed-body tbody tr:last-child input')?.focus();
    return;
  }
  switch (b.id) {
    case 'ed-save':
      saveCustomContent(draft);
      saved = JSON.stringify(draft);
      custom = true;
      status();
      toast('Saved. Reload the teacher window to use it.');
      break;
    case 'ed-download': download('content.json', JSON.stringify(draft, null, 2)); break;
    case 'ed-import': $('#ed-file').click(); break;
    case 'ed-reset':
      if (!confirm('Go back to the default content (data/content.json)? Your saved changes in this browser will be removed.')) return;
      clearCustomContent();
      draft = await loadDefaultContent();
      saved = JSON.stringify(draft);
      custom = false;
      render();
      toast('Back to the default content.');
      break;
  }
});

$('#ed-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const c = JSON.parse(await readFile(f));
    const errs = validateContent(c);
    draft = c;
    render();
    toast(errs.length ? 'Imported, but it has problems: see the list.' : 'Imported. Press Save to use it.', errs.length ? 'bad' : '');
  } catch { toast('That file is not valid JSON.', 'bad'); }
});

addEventListener('beforeunload', e => { if (draft && JSON.stringify(draft) !== saved) { e.preventDefault(); e.returnValue = ''; } });

(async () => {
  try {
    const r = await loadContent();
    draft = clone(r.content);
    delete draft.__custom;
    custom = r.custom;
    saved = JSON.stringify(draft);
    render();
  } catch (err) {
    $('#ed-body').innerHTML = `<p class="error">Could not load the content: ${esc(err.message)}. Start the game with the start script (see README).</p>`;
  }
})();
