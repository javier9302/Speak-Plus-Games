// Draws the 48-square board around the edge of a 13×13 grid.
// Used big on the projector (board.html) and small on the teacher page.
//
// Square 0 (Start) is the bottom-right corner. Play goes clockwise like the
// classic game: left along the bottom, up the left side, right along the top,
// down the right side.

import { ownerOf, isMortgaged, priceOf, rentOf, marketMult } from './state.js';
import { esc, tokenOf } from './ui.js';

// Grid row/column (1–13) of a square.
export function cellPos(i) {
  if (i <= 12) return { row: 13, col: 13 - i, side: 'bottom' };
  if (i <= 24) return { row: 13 - (i - 12), col: 1, side: 'left' };
  if (i <= 36) return { row: 1, col: 1 + (i - 24), side: 'top' };
  return { row: 1 + (i - 36), col: 13, side: 'right' };
}

const isCorner = i => i % 12 === 0;
const TYPE_LABEL = { chance: 'Chance', mystery: 'Mystery', bank: 'Bank', blackmarket: 'Black Market' };

// Build the cells. Call again only when the squares themselves change (new game).
export function buildBoard(el, s, { mini = false } = {}) {
  const groups = Object.fromEntries(s.groups.map(g => [g.id, g]));
  const cells = s.squares.map((q, i) => {
    const { row, col, side } = cellPos(i);
    const g = groups[q.group];
    const cls = ['cell', `side-${side}`, `t-${q.type}`, isCorner(i) ? 'corner' : ''].join(' ');
    const band = g ? `<span class="band" style="--gc:${g.color}"></span>` : '';
    const inner = mini
      ? `<span class="c-emoji">${esc(q.emoji || '')}</span>`
      : `<span class="c-emoji">${esc(q.emoji || '')}</span><span class="c-name">${esc(q.name)}</span><span class="c-price"></span>`;
    return `<div class="${cls}" data-sq="${i}" style="grid-row:${row};grid-column:${col}" title="${esc(q.name)}">${band}${inner}<span class="c-owner"></span></div>`;
  }).join('');
  el.classList.toggle('mini', mini);
  el._html = null;          // ui.patch() must not think the old HTML is still there
  el.innerHTML = `${cells}<div class="center" id="${mini ? 'mini-center' : 'center'}"></div><div class="tokens"></div>`;
  el._sig = boardSig(s);
}

export const boardSig = s => s.squares.map(q => q.name + q.type + (q.group || '')).join('|');

// Update ownership, prices and tokens. `positions` (optional) overrides where
// tokens are drawn, so the board can animate them square by square.
// `hideOwners` (phone mode): a sold property shows a plain "sold" mark, not who owns it.
export function updateBoard(el, s, { positions, highlight, hideOwners = false } = {}) {
  if (el._sig !== boardSig(s)) buildBoard(el, s, { mini: el.classList.contains('mini') });
  const mini = el.classList.contains('mini');
  for (const cell of el.querySelectorAll('.cell')) {
    const i = Number(cell.dataset.sq);
    const q = s.squares[i];
    const owner = ownerOf(s, i);
    const ownerEl = cell.querySelector('.c-owner');
    if (owner != null && s.players[owner]) {
      const t = tokenOf(s.players[owner]);
      ownerEl.style.setProperty('--oc', hideOwners ? '#8A90A6' : t.color);
      ownerEl.textContent = mini || hideOwners ? '' : t.icon;
      cell.classList.add('owned');
    } else {
      ownerEl.textContent = '';
      cell.classList.remove('owned');
    }
    cell.classList.toggle('sold', owner != null && hideOwners);
    cell.classList.toggle('mortgaged', isMortgaged(s, i) && !hideOwners);
    cell.classList.toggle('market', q.type === 'property' && marketMult(s, q.group) !== 1);
    cell.classList.toggle('here', highlight === i);
    cell.classList.toggle('auctioned', !!(s.auction && s.auction.sq === i));
    const price = cell.querySelector('.c-price');
    if (price) {
      let txt = '';
      if (q.type === 'property') txt = owner != null ? (hideOwners ? 'sold' : isMortgaged(s, i) ? 'mortgaged' : `rent $${rentOf(s, i)}`) : `$${priceOf(s, i)}`;
      else if (q.type === 'bank') txt = q.bank === 'tax' ? `pay $${q.amount}` : q.bank === 'bonus' ? `+$${q.amount}` : 'loans';
      else if (TYPE_LABEL[q.type] && q.name !== TYPE_LABEL[q.type]) txt = TYPE_LABEL[q.type];
      if (price.textContent !== txt) price.textContent = txt;
    }
  }
  drawTokens(el, s, positions);
}

function drawTokens(el, s, positions) {
  const layer = el.querySelector('.tokens');
  // Group players by the square they're drawn on, to spread several tokens on one square.
  const at = {};
  s.players.forEach((p, pid) => {
    const pos = positions && positions[pid] != null ? positions[pid] : p.pos;
    (at[pos] = at[pos] || []).push(pid);
  });
  const W = el.clientWidth || 1;
  const H = el.clientHeight || 1;
  const keep = new Set();
  for (const [pos, pids] of Object.entries(at)) {
    const cell = el.querySelector(`.cell[data-sq="${pos}"]`);
    if (!cell) continue;
    const cx = cell.offsetLeft + cell.offsetWidth / 2;
    const cy = cell.offsetTop + cell.offsetHeight / 2;
    const n = pids.length;
    const step = Math.min(cell.offsetWidth, cell.offsetHeight) * (n > 2 ? 0.28 : 0.32);
    pids.forEach((pid, k) => {
      // 1 token in the middle; more in a small ring
      const ang = (k / n) * Math.PI * 2 - Math.PI / 2;
      const dx = n > 1 ? Math.cos(ang) * step * 0.8 : 0;
      const dy = n > 1 ? Math.sin(ang) * step * 0.8 : 0;
      let tok = layer.querySelector(`[data-pid="${pid}"]`);
      const p = s.players[pid];
      const t = tokenOf(p);
      if (!tok) {
        tok = document.createElement('div');
        tok.className = 'ptoken';
        tok.dataset.pid = pid;
        layer.append(tok);
      }
      if (tok.textContent !== t.icon) tok.textContent = t.icon;
      tok.style.setProperty('--tc', t.color);
      tok.style.left = ((cx + dx) / W * 100) + '%';
      tok.style.top = ((cy + dy) / H * 100) + '%';
      tok.classList.toggle('active', !!(s.turn && s.turn.pid === pid && s.phase === 'play'));
      tok.title = p.name;
      keep.add(String(pid));
    });
  }
  for (const tok of layer.querySelectorAll('.ptoken')) if (!keep.has(tok.dataset.pid)) tok.remove();
}

// One hop of a token animation (adds a bounce class for the CSS).
export function hop(el, pid) {
  const tok = el.querySelector(`.ptoken[data-pid="${pid}"]`);
  if (!tok) return;
  tok.classList.remove('hop');
  void tok.offsetWidth;
  tok.classList.add('hop');
}

