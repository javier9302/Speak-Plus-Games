// Teacher panel, Cards tab: the challenge card library. Create, edit, duplicate, delete, filter,
// preview exactly as a student sees it, record or upload sound, import and export CSV or JSON.
import { api, esc, upload } from '../shared/net.js';
import { cardHtml } from '../shared/cardview.js';

const $ = (s) => document.querySelector(s);
const TYPES = { choice: 'Choice (A/B/C)', typed: 'Typed answer', spelling: 'Spelling', code: 'Code card (teacher checks)', link: 'Link (video, article) through a helper', courier: 'Courier (a letter to deliver)' };
const ANSWERS = { choice: 'Choice (A/B/C)', typed: 'Typed answer', code: 'Teacher code' };
const AUTO = { choice: 'auto-checked', typed: 'auto-checked', spelling: 'auto-checked', code: 'teacher-only code' };
// How a card is answered: its own type, or for a link card the kind of answer it carries.
const mode = (c) => (c.type === 'link' ? c.answerType || 'choice' : c.type);
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const RECENT_MS = 14 * 24 * 3600 * 1000;

let cards = [];
let places = [];                    // named places of the zones, for couriers
let editing = null;                 // the card in the form (a copy), or null
let isNew = false;

const showError = (text) => { $('#error').textContent = text || ''; $('#error').hidden = !text; if (text) $('#error').scrollIntoView({ block: 'nearest' }); };
const run = async (fn) => { try { showError(''); await fn(); } catch (e) { showError(e.message); } };
const recent = (c) => c.lastUsed && Date.now() - Date.parse(c.lastUsed) < RECENT_MS;

async function load() {
  cards = await api('/cards');
  places = (await api('/missions')).zones.flatMap((z) => z.places);
  const levels = [...new Set([...LEVELS, ...cards.map((c) => c.level)])];
  const keep = (id, html) => { const v = $(id).value; $(id).innerHTML = html; $(id).value = v; if ($(id).selectedIndex < 0) $(id).selectedIndex = 0; };
  keep('#c-level', '<option value="">All levels</option>' + levels.map((l) => `<option>${esc(l)}</option>`).join(''));
  keep('#c-type', '<option value="">All types</option>' + Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''));
  keep('#c-tag', '<option value="">All tags</option>' + [...new Set(cards.flatMap((c) => c.tags))].sort().map((t) => `<option>${esc(t)}</option>`).join(''));
  renderList();
}

function filtered() {
  const q = $('#c-search').value.trim().toLowerCase(), level = $('#c-level').value, type = $('#c-type').value, tag = $('#c-tag').value, used = $('#c-used').value;
  return cards.filter((c) => (!level || c.level === level) && (!type || c.type === type) && (!tag || c.tags.includes(tag))
    && (!used || (used === 'recent') === !!recent(c))
    && (!q || JSON.stringify([c.id, c.prompt, c.tags, c.options, c.accepted, c.word, c.link]).toLowerCase().includes(q)));
}

function renderList() {
  const list = filtered();
  $('#c-count').textContent = `${list.length} of ${cards.length} cards`;
  $('#c-list').innerHTML = list.map((c) => `
    <article class="card-row ${editing && editing.id === c.id && !isNew ? 'sel' : ''}" data-id="${esc(c.id)}">
      <div class="meta"><span class="badge">${esc(c.level)}</span><span>${TYPES[c.type]}</span><span>${AUTO[mode(c)] || 'starts another card'}</span>${c.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}${c.media.audio ? '<span>♪ sound</span>' : ''}${c.media.image ? '<span>picture</span>' : ''}${recent(c) ? `<span>used ${new Date(c.lastUsed).toLocaleDateString()}</span>` : ''}</div>
      <div class="p">${esc(c.prompt)}</div>
      <div class="row">
        <button class="btn btn-small" type="button" data-act="edit">Edit and preview</button>
        <button class="btn btn-small" type="button" data-act="duplicate">Duplicate</button>
        <button class="btn btn-small btn-danger" type="button" data-act="delete">Delete</button>
      </div>
    </article>`).join('') || '<p class="muted">No cards match. Change the filters, or make a new card.</p>';
}
for (const id of ['#c-search', '#c-level', '#c-type', '#c-tag', '#c-used']) $(id).addEventListener('input', renderList);

// ---------- the form ----------
const blank = () => ({ id: '', type: 'choice', level: $('#c-level').value || 'A2', tags: [], prompt: '', media: {}, options: { A: '', B: '', C: '' }, answer: 'A', accepted: [], allowTypos: false, word: '', describe: '', teacher: { code: String(Math.floor(1000 + Math.random() * 9000)), accepted: [] }, hints: [], explanation: '', points: 1,
  link: '', helper: 'reading', answerType: 'choice', meetAt: '', recipient: 'opener', then: { type: 'choice' } });
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

function openForm(card, fresh) {
  editing = { ...blank(), ...structuredClone(card) };
  editing.options = { A: '', B: '', C: '', ...(card.options || {}) };
  editing.teacher = { ...blank().teacher, ...(card.teacher || {}) };
  isNew = fresh;
  renderForm(); renderList();
}

function renderForm() {
  const c = editing, t = c.type, m = mode(c);
  const opt = (k) => `<label>${k}<input class="field" data-opt="${k}" value="${esc(c.options[k] || '')}"></label>`;
  $('#c-form').hidden = false;
  $('#c-form').innerHTML = `
    <h2>${isNew ? 'New card' : 'Edit card'}</h2>
    <div class="two">
      <label>Type <select class="field" name="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === t ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Level <input class="field" name="level" list="c-levels" value="${esc(c.level)}" maxlength="12"><datalist id="c-levels">${LEVELS.map((l) => `<option>${l}</option>`).join('')}</datalist></label>
    </div>
    <label>Question or task (what the student reads) <textarea name="prompt" maxlength="600" required>${esc(c.prompt)}</textarea></label>
    <label>Tags, separated by commas <input class="field" name="tags" value="${esc(c.tags.join(', '))}" placeholder="food, past, speaking"></label>

    ${t === 'link' ? `<fieldset><legend>The link</legend>
      <label>Address of the video, article or page (leave empty to send one live from Chat) <input class="field" name="link" value="${esc(c.link || '')}" placeholder="https://…" maxlength="500"></label>
      <label>It goes to the <select class="field" name="helper"><option value="reading" ${c.helper === 'reading' ? 'selected' : ''}>Reading Helper</option><option value="listening" ${c.helper === 'listening' ? 'selected' : ''}>Listening Helper</option></select></label>
      <label>The students answer with <select class="field" name="answerType">${Object.entries(ANSWERS).map(([k, v]) => `<option value="${k}" ${k === m ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <p class="muted small">The student at the tablet gets the question. The helper gets the link, locked. The student must ask the helper in English; then you press Unlock.</p></fieldset>` : ''}
    ${t === 'courier' ? `<fieldset><legend>The letter</legend>
      <label>They must meet at <select class="field" name="meetAt"><option value="">Anywhere</option>${places.map((p) => `<option value="${esc(p.id)}" ${c.meetAt === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label>The letter is for <select class="field" name="recipient"><option value="opener" ${c.recipient !== 'random' ? 'selected' : ''}>the student who opens the tablet</option><option value="random" ${c.recipient === 'random' ? 'selected' : ''}>a random student</option></select></label>
      <label>Inside the letter <select class="field" name="then">
        ${['choice', 'typed', 'spelling', 'code'].map((k) => `<option value="type:${k}" ${!c.then?.ref && (c.then?.type || 'choice') === k ? 'selected' : ''}>Any ${TYPES[k].toLowerCase()} card of the group's level</option>`).join('')}
        <optgroup label="One specific card">${cards.filter((x) => !['courier', 'link'].includes(x.type)).map((x) => `<option value="ref:${esc(x.id)}" ${c.then?.ref === x.id ? 'selected' : ''}>${esc(x.level)} · ${esc(x.prompt.slice(0, 50))}</option>`).join('')}</optgroup>
      </select></label>
      <p class="muted small">The player who has Give carries the letter. Both students get a message, and must talk to find each other. Only the receiver can answer the card inside.</p></fieldset>` : ''}
    ${m === 'choice' ? `<fieldset><legend>Options (leave one empty for fewer)</legend>${['A', 'B', 'C', 'D'].map(opt).join('')}
      <label>Correct answer <select class="field" name="answer">${['A', 'B', 'C', 'D'].map((k) => `<option ${k === c.answer ? 'selected' : ''}>${k}</option>`).join('')}</select></label></fieldset>` : ''}
    ${m === 'typed' ? `<fieldset><legend>Answers</legend>
      <label>Accepted answers, one per line <textarea name="accepted">${esc(c.accepted.join('\n'))}</textarea></label>
      <label class="check"><input type="checkbox" name="allowTypos" ${c.allowTypos ? 'checked' : ''}> Allow one small typo (answers of 5 letters or more)</label>
      <p class="muted small">Capitals, extra spaces and a final full stop never matter.</p></fieldset>` : ''}
    ${t === 'spelling' ? `<fieldset><legend>Spelling</legend>
      <label>The word to spell <input class="field" name="word" value="${esc(c.word || '')}" maxlength="60"></label>
      <label>A description shown with it (optional) <input class="field" name="describe" value="${esc(c.describe || '')}" maxlength="200"></label>
      <p class="muted small">The phone says the word with its own voice, unless you add a recording below.</p></fieldset>` : ''}
    ${m === 'code' ? `<fieldset><legend>Teacher check: students answer aloud, you say the code</legend>
      <label>Code (3 to 6 digits) <input class="field code" name="code" value="${esc(c.teacher.code)}" inputmode="numeric" maxlength="6"></label>
      <label>What to accept, one per line (only you see this) <textarea name="tAccepted">${esc(c.teacher.accepted.join('\n'))}</textarea></label></fieldset>` : ''}

    ${t === 'courier' ? '' : `<fieldset><legend>Sound and picture (optional)</legend>
      <label>Sound <input class="field" name="audio" value="${esc(c.media.audio || '')}" placeholder="Record, upload, or paste an address"></label>
      <div class="row">
        <button class="btn btn-small" type="button" data-rec>● Record</button>
        <button class="btn btn-small" type="button" data-upload="audio">Upload sound…</button>
        <span class="rec" id="rec-state" hidden>Recording… press Stop when done</span>
      </div>
      ${c.media.audio ? `<audio controls src="${esc(c.media.audio)}"></audio>` : ''}
      <label>Picture <input class="field" name="image" value="${esc(c.media.image || '')}" placeholder="Upload, or paste an address"></label>
      <div class="row"><button class="btn btn-small" type="button" data-upload="image">Upload picture…</button></div>
      ${t !== 'spelling' ? `<label>Or: words for the phone to say aloud <input class="field" name="tts" value="${esc(c.media.tts || '')}" maxlength="200"></label>` : ''}
    </fieldset>

    <fieldset><legend>Hints, from small to almost the answer (you release them one by one)</legend>
      ${[0, 1, 2].map((i) => `<label>Hint ${i + 1} <input class="field" data-hint="${i}" value="${esc(c.hints[i] || '')}" maxlength="300"></label>`).join('')}
    </fieldset>
    <label>Explanation shown after a correct answer (optional) <input class="field" name="explanation" value="${esc(c.explanation || '')}" maxlength="600"></label>`}
    <div class="two">
      <label>Card id <input class="field" name="id" value="${esc(c.id)}" ${isNew ? '' : 'readonly'} placeholder="made from the question" maxlength="64"></label>
      <label>Points <input class="field" name="points" type="number" min="1" max="10" value="${Number(c.points) || 1}"></label>
    </div>
    <div class="row">
      <button class="btn btn-primary" type="submit">Save card</button>
      <button class="btn" type="button" data-cancel>Close</button>
    </div>`;
  renderPreview();
}

// Reads the form back into `editing`.
function readForm() {
  const f = $('#c-form'), c = editing, v = (n) => f.elements[n]?.value ?? '';
  const lines = (n) => v(n).split('\n').map((x) => x.trim()).filter(Boolean);
  c.type = v('type'); c.level = v('level').trim() || 'A2'; c.prompt = v('prompt'); c.explanation = v('explanation'); c.points = Number(v('points')) || 1;
  c.tags = v('tags').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  c.hints = [...f.querySelectorAll('[data-hint]')].map((i) => i.value.trim()).filter(Boolean);
  c.media = {};
  for (const k of ['audio', 'image', 'tts']) if (v(k).trim()) c.media[k] = v(k).trim();
  if (f.elements.answer) { c.options = {}; f.querySelectorAll('[data-opt]').forEach((i) => { if (i.value.trim()) c.options[i.dataset.opt] = i.value.trim(); }); c.answer = v('answer'); }
  if (f.elements.accepted) { c.accepted = lines('accepted'); c.allowTypos = f.elements.allowTypos.checked; }
  if (f.elements.word) { c.word = v('word').trim(); c.describe = v('describe').trim(); }
  if (f.elements.code) c.teacher = { code: v('code').trim(), accepted: lines('tAccepted') };
  if (f.elements.link) { c.link = v('link').trim(); c.helper = v('helper'); c.answerType = v('answerType'); }
  if (f.elements.meetAt) { c.meetAt = v('meetAt'); c.recipient = v('recipient'); const [k, id] = v('then').split(':'); c.then = k === 'ref' ? { ref: id } : { type: id }; }
  if (isNew) c.id = slug(v('id')) || `${slug(c.prompt) || 'card'}-${Math.random().toString(36).slice(2, 6)}`;
  return c;
}

// The preview is built by the same code the phones use.
function renderPreview() {
  const c = editing, m = mode(c);
  $('#c-preview-box').hidden = false;
  if (c.type === 'courier') {
    const at = places.find((p) => p.id === c.meetAt);
    $('#c-preview').innerHTML = `<h3>Mail · from: Letter</h3><p>Bring this letter to Mika.${at ? ` Meet at ${esc(at.name)}.` : ''} Stand next to Mika and press Give.</p><h3>and on Mika's phone</h3><p>Mika, Ken is bringing you a letter. Ask where to meet!</p>`;
    $('#c-teacher-side').textContent = 'The card inside the letter opens on the receiver\'s phone when the letter is handed over.';
    return;
  }
  const view = { type: m, prompt: c.prompt || '(your question)', media: c.type === 'spelling' && !c.media.audio ? { ...c.media, tts: c.word } : c.media, options: c.options && Object.fromEntries(Object.entries(c.options).filter(([, x]) => x)), describe: c.type === 'spelling' ? c.describe : '', digits: (c.teacher?.code || '').length,
    note: c.type === 'link' ? `Ken is the ${c.helper === 'listening' ? 'Listening' : 'Reading'} Helper and has the link. Ask: "Can you ${c.helper === 'listening' ? 'listen to this' : 'read this'} with me, please?"` : '' };
  $('#c-preview').innerHTML = cardHtml(view, []);
  const answer = m === 'choice' ? `Answer: ${c.answer}` : m === 'code' ? `You say the code ${c.teacher.code} when the answer is good enough.` : `Accepted: ${(c.type === 'spelling' ? [c.word] : c.accepted).join(' / ')}${c.allowTypos ? ' (one typo allowed)' : ''}`;
  $('#c-teacher-side').textContent = `Only you see this. ${answer}`;
}

$('#c-form').addEventListener('input', (e) => {
  readForm();
  if (e.target.name === 'type' || e.target.name === 'answerType') renderForm(); else renderPreview();
});
$('#c-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    const c = readForm();
    const body = { ...c };
    // Send only the parts this kind of card uses (a link card is read by which answer part it has).
    const m = mode(c);
    if (m !== 'choice') { delete body.options; delete body.answer; }
    if (m !== 'code') delete body.teacher;
    if (m !== 'typed') delete body.accepted;
    if (c.type !== 'link') { delete body.link; delete body.helper; }
    if (c.type !== 'courier') { delete body.meetAt; delete body.recipient; delete body.then; }
    delete body.answerType;
    const saved = await api(`/cards/${encodeURIComponent(c.id)}`, { method: 'PUT', body });
    isNew = false; editing = null;
    await load();
    openForm(saved, false);
  });
});

// Recording and uploading. The file goes to the server; the card keeps its address.
let recorder = null;
async function setMedia(kind, blob) {
  const url = await upload(blob);
  readForm();
  editing.media[kind] = url;
  renderForm();
}
function pickFile(accept) {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.onchange = () => resolve(input.files[0]);
    input.click();
  });
}
$('#c-form').addEventListener('click', (e) => {
  if (e.target.closest('[data-cancel]')) { editing = null; $('#c-form').hidden = true; $('#c-preview-box').hidden = true; renderList(); return; }
  const up = e.target.closest('[data-upload]'), rec = e.target.closest('[data-rec]');
  if (up) run(async () => { const file = await pickFile(up.dataset.upload === 'audio' ? 'audio/*' : 'image/*'); if (file) await setMedia(up.dataset.upload, file); });
  if (rec) run(async () => {
    if (recorder) return recorder.stop();
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('This browser cannot record here. Recording works on the computer that runs the game (localhost) or on an https address. You can still upload a sound file.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (ev) => chunks.push(ev.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = (recorder.mimeType || 'audio/webm').split(';')[0];
      recorder = null;
      run(() => setMedia('audio', new Blob(chunks, { type })));
    };
    recorder.start();
    rec.textContent = '■ Stop';
    $('#rec-state').hidden = false;
  });
});

$('#c-new').addEventListener('click', () => openForm(blank(), true));
$('#c-list').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act, c = cards.find((x) => x.id === e.target.closest('[data-id]')?.dataset.id);
  if (!act || !c) return;
  if (act === 'edit') openForm(c, false);
  if (act === 'duplicate') openForm({ ...c, id: '', lastUsed: undefined }, true);
  if (act === 'delete' && confirm(`Delete this card?\n\n${c.prompt}`)) run(async () => { await api(`/cards/${encodeURIComponent(c.id)}`, { method: 'DELETE' }); if (editing?.id === c.id) { editing = null; $('#c-form').hidden = true; $('#c-preview-box').hidden = true; } await load(); });
});

// ---------- import and export ----------
// CSV columns. "accepted", "tags" and "teacherAccepted" hold several values separated by |.
const COLS = ['id', 'type', 'level', 'tags', 'prompt', 'optionA', 'optionB', 'optionC', 'optionD', 'answer', 'accepted', 'allowTypos', 'word', 'describe', 'code', 'teacherAccepted', 'hint1', 'hint2', 'hint3', 'explanation', 'points', 'audio', 'image', 'tts', 'link', 'helper', 'meetAt', 'recipient', 'then'];
const many = (s) => String(s || '').split('|').map((x) => x.trim()).filter(Boolean);

function toRow(c) {
  return { id: c.id, type: c.type, level: c.level, tags: c.tags.join('|'), prompt: c.prompt,
    optionA: c.options?.A, optionB: c.options?.B, optionC: c.options?.C, optionD: c.options?.D, answer: mode(c) === 'choice' ? c.answer : '',
    accepted: mode(c) === 'typed' ? c.accepted.join('|') : '', link: c.link, helper: c.type === 'link' ? c.helper : '', meetAt: c.meetAt, recipient: c.type === 'courier' ? c.recipient : '', then: c.then ? c.then.ref || c.then.type : '', allowTypos: c.allowTypos ? 'yes' : '', word: c.word, describe: c.describe,
    code: c.teacher?.code, teacherAccepted: c.teacher?.accepted.join('|'), hint1: c.hints[0], hint2: c.hints[1], hint3: c.hints[2],
    explanation: c.explanation, points: c.points, audio: c.media.audio, image: c.media.image, tts: c.type === 'spelling' ? '' : c.media.tts };
}
function fromRow(r, n) {
  const options = {};
  for (const k of ['A', 'B', 'C', 'D']) if (r[`option${k}`]) options[k] = r[`option${k}`];
  const media = {};
  for (const k of ['audio', 'image', 'tts']) if (r[k]) media[k] = r[k];
  return { id: slug(r.id || '') || `${slug(r.prompt || '') || 'card'}-${n}`, type: (r.type || '').toLowerCase().trim(), level: r.level, tags: many(r.tags), prompt: r.prompt, options, answer: r.answer,
    accepted: many(r.accepted), allowTypos: /^(yes|true|1|x)$/i.test(r.allowTypos || ''), word: r.word, describe: r.describe,
    link: r.link, helper: r.helper, meetAt: r.meetAt, recipient: r.recipient, then: ['choice', 'typed', 'spelling', 'code'].includes(r.then) ? { type: r.then } : r.then ? { ref: r.then } : undefined,
    teacher: r.code ? { code: r.code, accepted: many(r.teacherAccepted) } : undefined, hints: [r.hint1, r.hint2, r.hint3].filter(Boolean), explanation: r.explanation, points: r.points, media };
}
const csvCell = (v) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (list) => [COLS.join(','), ...list.map((c) => { const r = toRow(c); return COLS.map((k) => csvCell(r[k])).join(','); })].join('\r\n');

// Reads CSV text (quotes, commas and line breaks inside quotes are handled) into objects keyed by the header row.
export function parseCsv(text) {
  const rows = [[]]; let cell = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { rows.at(-1).push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; rows.at(-1).push(cell); cell = ''; rows.push([]); }
    else cell += ch;
  }
  rows.at(-1).push(cell);
  const head = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
$('#c-export-csv').addEventListener('click', () => download(`cards-${stamp()}.csv`, '﻿' + toCsv(filtered()), 'text/csv'));
$('#c-export-json').addEventListener('click', () => download(`cards-${stamp()}.json`, JSON.stringify(filtered(), null, 2), 'application/json'));
$('#c-import').addEventListener('click', () => $('#c-import-file').click());
$('#c-import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  run(async () => {
    const text = await file.text();
    let list;
    if (/^\s*[\[{]/.test(text)) { try { const data = JSON.parse(text); list = Array.isArray(data) ? data : data.cards || [data]; } catch { throw new Error('This JSON file cannot be read.'); } }
    else list = parseCsv(text).map((r, i) => fromRow(r, i + 1));
    if (!list.length) throw new Error('No cards found in this file.');
    const res = await api('/cards/import', { method: 'POST', body: { cards: list } });
    $('#c-report').hidden = false;
    $('#c-report').textContent = `Imported ${res.saved.length} cards.` + (res.skipped.length ? ` Skipped ${res.skipped.length}: ` + res.skipped.map((s) => `${s.id} (${s.why})`).join('; ') : '') + ' Cards with an id that already exists were replaced.';
    await load();
  });
});

document.addEventListener('tab', (e) => { if (e.detail === 'cards') run(load); });
