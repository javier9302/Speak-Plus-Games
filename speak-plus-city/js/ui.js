// Small DOM helpers shared by the board, teacher and editor pages.
import { TOKENS, LEVEL_NAMES, fill } from './state.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

// Replace an element's HTML only when it changed. If the teacher is typing in an
// input inside it, wait until they leave the input so nothing they type is lost.
export function patch(el, html) {
  if (!el) return;
  const a = document.activeElement;
  if (a && el.contains(a) && a.matches('input, textarea, select')) {
    el._later = html;
    if (!el._waiting) {
      el._waiting = true;
      el.addEventListener('focusout', () => {
        el._waiting = false;
        // Wait a moment: focus may move to another field inside the same element.
        setTimeout(() => { if (el._later != null) { const h = el._later; el._later = null; patch(el, h); } }, 0);
      }, { once: true });
    }
    return;
  }
  el._later = null;
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
}

export const tokenOf = p => TOKENS[p.token % TOKENS.length];
export function tokenHTML(p, cls = '') {
  const t = tokenOf(p);
  return `<span class="token ${cls}" style="--tc:${t.color}" aria-hidden="true">${t.icon}</span>`;
}
export const levelBadge = lv => `<span class="lvl lvl-${lv}">${LEVEL_NAMES[lv]}</span>`;

export function fmtClock(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// Variables for the "Say it!" texts: {name}, {price}, {owner}…
export function sayVars(s, pid, extra = {}) {
  const p = s.players[pid];
  const sq = extra.sq ?? p.pos;
  const q = s.squares[sq] || {};
  const pr = s.props[sq];
  const v = { player: p.name, name: q.name };
  if (q.price) v.price = '$' + q.price;
  if (pr && s.players[pr.owner]) v.owner = s.players[pr.owner].name;
  if (extra.amount != null) v.amount = '$' + extra.amount;
  if (extra.challenge) v.challenge = extra.challenge;
  return v;
}

// The "Say it!" box for one action, adapted to the player's level.
//   show: 'all' (frames + vocabulary), 'vocab' (vocabulary, frames on request) or 'none'
export function sayItHTML(entry, vars, show, { framesOpen = false, big = false } = {}) {
  if (!entry) return '';
  const frames = (entry.frames || []).map(f => `<li>${esc(fill(f, vars))}</li>`).join('');
  const vocab = (entry.vocab || []).map(w => `<span class="chip">${esc(w)}</span>`).join('');
  let body = '';
  if (show === 'all' || (show === 'vocab' && framesOpen)) body += frames ? `<ul class="frames">${frames}</ul>` : '';
  if (show !== 'none' && vocab) body += `<div class="chips">${vocab}</div>`;
  if (show === 'vocab' && !framesOpen && frames) body += `<button class="btn btn-ghost btn-small" data-ui="frames" type="button">Show sentence frames</button>`;
  if (show !== 'all' && entry.stretch) body += `<p class="stretch"><b>Challenge:</b> ${esc(fill(entry.stretch, vars))}</p>`;
  return `<div class="sayit${big ? ' sayit-big' : ''}"><div class="sayit-tag">Say it!</div><p class="sayit-task">${esc(fill(entry.task, vars))}</p>${body}</div>`;
}

export function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function readFile(file) {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => fail(r.error);
    r.readAsText(file);
  });
}

// Keyboard help overlay, opened with "?".
export function helpOverlay(title, rows) {
  let el = $('#help');
  if (!el) {
    el = document.createElement('div');
    el.id = 'help';
    el.className = 'modal-back';
    el.hidden = true;
    document.body.append(el);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) el.hidden = true; });
  }
  el.innerHTML = `<div class="modal" role="dialog" aria-label="${esc(title)}"><h2>${esc(title)}</h2>
    <table class="keys">${rows.map(([k, d]) => `<tr><td>${k.split(' ').map(x => `<kbd>${esc(x)}</kbd>`).join(' ')}</td><td>${esc(d)}</td></tr>`).join('')}</table>
    <div class="modal-actions"><button class="btn btn-primary" data-close type="button">Close</button></div></div>`;
  return {
    toggle() { el.hidden = !el.hidden; },
    close() { el.hidden = true; },
    get open() { return !el.hidden; }
  };
}

export const isTyping = e => e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
