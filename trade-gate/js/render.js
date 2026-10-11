// Everything that is drawn on the canvas.
//
// The game is laid out on a small "virtual" screen of 384 x 216 pixels
// (24 x 11 tiles of 16px, plus a bar above and below). That screen is scaled
// up by a whole number (x2, x3, x5 ...) so pixels stay sharp. Text uses the
// same coordinates but is drawn as real text, so it stays crisp when big.

import { TILE, goalProgress } from './world.js';
import { NEAR, KEYPAD, participants } from './trade.js';
import { assignRoles } from './roles.js';
import { DEVICE_LABELS } from './input.js';
import { fmt, fmtTime, dist, gatePhrases } from './util.js';
import { PAL } from './sprites.js';

export const VW = 384, VH = 216, MAP_Y = 24;
const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace';
const INK = PAL.k, WHITE = PAL.w, GOLD = PAL.y, DIM = PAL.g, GREEN = PAL.n;
// Color names a teacher can use for describe cards.
const SHAPE_COLORS = { red: '#e0485f', blue: '#41a6f6', green: '#38b764', yellow: '#ffcd75', purple: '#b57edc', orange: '#ef7d57', white: '#f4f4f4', pink: '#ff8fc7' };

export function createRenderer(canvas, stage, sprites) {
  const ctx = canvas.getContext('2d');
  let scale = 1;

  // Fit the canvas to its container with the biggest whole-number scale.
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    scale = Math.max(1, Math.floor(Math.min(w / VW, h / VH)));
    canvas.width = VW * scale;
    canvas.height = VH * scale;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- drawing helpers ----------
  const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  function panel(x, y, w, h, fill = INK, border = WHITE) {
    rect(x, y, w, h, border);
    rect(x + 1, y + 1, w - 2, h - 2, fill);
  }
  function setFont(size) { ctx.font = `bold ${size}px ${FONT}`; ctx.textBaseline = 'top'; }
  function text(str, x, y, size = 8, color = WHITE, align = 'left') {
    setFont(size);
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }
  // Text with a dark edge, for words drawn over the room.
  function outlined(str, x, y, size, color, align = 'center') {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) text(str, x + dx, y + dy, size, INK, align);
    text(str, x, y, size, color, align);
  }
  const widthOf = (str, size) => { setFont(size); return ctx.measureText(str).width; };
  function wrap(str, maxW, size) {
    setFont(size);
    const lines = [];
    let line = '';
    for (const word of String(str).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxW) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }
  // Draws wrapped text and returns the y just below it.
  function paragraph(str, x, y, maxW, size, color, maxLines = 9, align = 'left') {
    const lines = wrap(str, maxW, size).slice(0, maxLines);
    lines.forEach((l, i) => text(l, x, y + i * (size + 2), size, color, align));
    return y + lines.length * (size + 2);
  }
  const sprite = (img, x, y, s = 1) => ctx.drawImage(img, Math.round(x), Math.round(y), img.width * s, img.height * s);
  const icon = (res, x, y, s = 1) => sprites.icons[res] && sprite(sprites.icons[res], x, y, s);
  const blink = (t, speed = 3) => Math.floor(t * speed) % 2 === 0;

  // One shape of a describe card, centered on (cx, cy).
  function shapePath(shape, cx, cy, r) {
    ctx.beginPath();
    const poly = (pts) => { pts.forEach(([px, py], i) => (i ? ctx.lineTo(cx + px * r, cy + py * r) : ctx.moveTo(cx + px * r, cy + py * r))); ctx.closePath(); };
    if (shape === 'circle') ctx.arc(cx, cy, r, 0, Math.PI * 2);
    else if (shape === 'square') ctx.rect(cx - r * 0.9, cy - r * 0.9, r * 1.8, r * 1.8);
    else if (shape === 'triangle') poly([[0, -1], [1, 0.85], [-1, 0.85]]);
    else if (shape === 'diamond') poly([[0, -1.1], [0.8, 0], [0, 1.1], [-0.8, 0]]);
    else if (shape === 'heart') {
      ctx.moveTo(cx, cy + r);
      ctx.bezierCurveTo(cx - r * 1.6, cy - r * 0.1, cx - r * 0.7, cy - r * 1.3, cx, cy - r * 0.4);
      ctx.bezierCurveTo(cx + r * 0.7, cy - r * 1.3, cx + r * 1.6, cy - r * 0.1, cx, cy + r);
    } else { // star
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 0.45 : 1.1;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      poly(pts);
    }
  }
  function drawOption(opt, x, y, w, h) {
    const n = Math.max(1, opt.count || 1);
    const cols = n <= 3 ? n : Math.ceil(n / 2), rows = n <= 3 ? 1 : 2;
    const cell = Math.min(w / Math.max(cols, 3), h / rows); // same size for 1, 2 or 3 shapes
    const r = cell * 0.34;
    for (let i = 0; i < n; i++) {
      const cx = x + w / 2 + ((i % cols) - (cols - 1) / 2) * cell;
      const cy = y + h / 2 + (Math.floor(i / cols) - (rows - 1) / 2) * cell;
      shapePath(opt.shape, cx, cy, r);
      ctx.fillStyle = SHAPE_COLORS[opt.color] || opt.color || WHITE;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }

  // ---------- lobby ----------
  function drawLobby(game) {
    const T = game.text, cfg = game.config;
    text(cfg.title, VW / 2, 10, 24, GOLD, 'center');
    text(cfg.subtitle, VW / 2, 38, 9, WHITE, 'center');
    const n = game.players.length;
    const roles = n >= 2 ? assignRoles(n, cfg.resourceOrder) : assignRoles(2, cfg.resourceOrder);
    cfg.players.forEach((pc, i) => {
      const x = 8 + i * 93, y = 56, p = game.players[i];
      panel(x, y, 88, 112, p ? '#29314a' : INK, p ? pc.color : PAL.s);
      text(pc.name, x + 44, y + 5, 10, p ? pc.color : PAL.s, 'center');
      if (!p) {
        if (blink(game.clock, 2)) text(T.pressToJoin, x + 44, y + 46, 11, WHITE, 'center');
        text(T.toJoin, x + 44, y + 62, 8, DIM, 'center');
        return;
      }
      const bob = Math.round(Math.sin(game.clock * 4 + i) * 1.5);
      sprite(sprites.players[i][Math.floor(game.clock * 4) % 2], x + 28, y + 18 + bob, 2);
      const role = roles[i] || roles[0];
      text(T.get, x + 8, y + 62, 8, DIM);
      icon(role.collects, x + 30, y + 54, 2);
      text(role.collects, x + 57, y + 62, 7, WHITE);
      text(T.use, x + 8, y + 88, 8, DIM);
      icon(role.spends, x + 30, y + 80, 2);
      text(role.spends, x + 57, y + 88, 7, WHITE);
      text(DEVICE_LABELS[p.device] || '', x + 44, y + 104, 5, DIM, 'center');
    });
    text(T.joinKeys, VW / 2, 176, 7, DIM, 'center');
    if (n >= 2) { if (blink(game.clock, 2)) text(T.pressStart, VW / 2, 192, 11, GREEN, 'center'); }
    else text(T.needPlayers, VW / 2, 193, 9, WHITE, 'center');
  }

  // ---------- level select ----------
  function drawSelect(game) {
    const T = game.text;
    text(T.chooseLevel, VW / 2, 10, 16, GOLD, 'center');
    game.levels.forEach((level, i) => {
      const y = 38 + i * 48, on = i === game.selectIdx, info = game.levelInfo[i];
      panel(30, y, 324, 42, on ? '#29314a' : INK, on ? GOLD : PAL.s);
      if (on) text('>', 16, y + 12, 16, GOLD);
      text(`${i + 1}`, 42, y + 9, 20, on ? GOLD : PAL.s);
      text(level.name, 66, y + 6, 12, on ? WHITE : DIM);
      text(`${fmt(T.playersN, { n: level.players })}  -  ${level.description || ''}`, 66, y + 21, 6, DIM);
      if (info && info.note) text(info.note, 66, y + 31, 6, info.ok ? PAL.c : PAL.o);
    });
    text(T.selectHelp, VW / 2, 198, 7, DIM, 'center');
  }

  // ---------- the room ----------
  function drawWorld(game) {
    const w = game.world, tiles = sprites.tiles, t = game.clock;
    ctx.save();
    ctx.translate(0, MAP_Y);

    for (let ty = 0; ty < w.h; ty++) {
      for (let tx = 0; tx < w.w; tx++) {
        const c = w.tiles[ty][tx];
        sprite(c === '#' ? tiles.wall : tiles.floor, tx * TILE, ty * TILE);
      }
    }
    for (const e of w.exits) sprite(w.doorOpen && blink(t, 2) ? tiles.exitLit : tiles.exit, e.tx * TILE, e.ty * TILE);
    for (const d of w.doors) sprite(w.doorOpen ? tiles.doorOpen : tiles.doorShut, d.tx * TILE, d.ty * TILE);
    if (!w.barsOpen) for (const b of w.bars) sprite(tiles.bars, b.tx * TILE, b.ty * TILE);
    for (const pl of w.plates) sprite(pl.down || w.barsOpen ? tiles.plateDown : tiles.plate, pl.tx * TILE, pl.ty * TILE);

    // Gates: a ring on the floor shows where to stand.
    for (const g of w.gates) {
      ctx.beginPath();
      ctx.arc(g.x, g.y, NEAR - 2, 0, Math.PI * 2);
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = g.status === 'open' ? GREEN : GOLD;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      sprite(g.status === 'open' ? tiles.gateOpen : g.status === 'active' ? tiles.gateActive : tiles.gateLocked, g.x - 8, g.y - 8);
      outlined(String(g.def.number), g.x, g.y + 1, 7, WHITE);
    }

    for (const s of w.stations) {
      const full = Object.keys(s.needs).every((r) => s.have[r] >= s.needs[r]);
      const img = s.kind === 'chest' ? (full ? tiles.chestFull : tiles.chest) : (full ? tiles.machineOn : tiles.machine);
      sprite(img, s.x - 8, s.y - 8 + (full && s.kind === 'machine' && blink(t, 8) ? 1 : 0));
    }

    for (const k of w.pickups) {
      if (k.taken) continue;
      icon(k.res, k.x - 6, k.y - 6 + Math.round(Math.sin(t * 3 + k.x) * 1.5));
    }

    const order = [...game.players].sort((a, b) => a.y - b.y);
    for (const p of order) {
      const frame = p.moving ? Math.floor(p.walk * 8) % 2 : 0;
      sprite(sprites.players[p.index][frame], p.x - 8, p.y - 10);
      if (p.ready) {
        panel(p.x - 5, p.y - 23, 10, 12, WHITE, INK);
        text('?', p.x, p.y - 22, 9, INK, 'center');
      }
    }

    // Labels go on top of everything else in the room.
    for (const s of w.stations) {
      const list = Object.keys(s.needs);
      // The label sits above, or below when another station is right above.
      const stacked = w.stations.some((o) => o !== s && o.tx === s.tx && o.ty === s.ty - 1);
      const bw = list.length * 28 + 2, bx = Math.max(1, Math.min(VW - bw - 1, s.x - bw / 2)), by = stacked ? s.y + 9 : s.y - 24;
      panel(bx, by, bw, 15, INK, PAL.s);
      list.forEach((r, i) => {
        const done = s.have[r] >= s.needs[r];
        icon(r, bx + 2 + i * 28, by + 1);
        text(`${s.have[r]}/${s.needs[r]}`, bx + 15 + i * 28, by + 4, 7, done ? GREEN : WHITE);
      });
    }
    for (const g of w.gates) {
      const people = participants(g.def).map((id) => w.byId[id]).filter(Boolean);
      const someoneNear = game.players.some((p) => dist(p, g) <= NEAR);
      if (someoneNear && g.status !== 'active') {
        // Who gives what to whom at this gate.
        const tw = g.def.transfers.length * 40 + 2;
        const bx = Math.max(1, Math.min(VW - tw - 1, g.x - tw / 2)), by = Math.max(1, g.y - 34);
        panel(bx, by, tw, 15, INK, g.status === 'open' ? GREEN : GOLD);
        g.def.transfers.forEach((tr, i) => {
          const x = bx + 3 + i * 40, from = w.byId[tr.from], to = w.byId[tr.to];
          rect(x, by + 4, 7, 7, from ? from.color : DIM);
          icon(tr.res, x + 8, by + 1);
          text('>', x + 21, by + 3, 8, WHITE);
          rect(x + 28, by + 4, 7, 7, to ? to.color : DIM);
        });
      } else {
        // Small dots: who is needed here (filled = ready).
        const x0 = g.x - (people.length * 7 - 1) / 2;
        people.forEach((p, i) => {
          rect(x0 + i * 7 - 1, g.y - 17, 7, 7, INK);
          rect(x0 + i * 7, g.y - 16, 5, 5, p.color);
          if (p.ready !== g.def.id) rect(x0 + i * 7 + 1, g.y - 15, 3, 3, INK);
        });
      }
    }

    if (w.plates.length && !w.barsOpen) {
      const down = w.plates.filter((pl) => pl.down);
      if (w.switchT > 0) {
        const cx = w.plates.reduce((a, pl) => a + pl.x, 0) / w.plates.length;
        const left = Math.ceil(w.settings.switchHoldSeconds - w.switchT);
        outlined(String(left), cx, w.plates[0].y - 34, 22, GOLD);
      } else if (down.length === 1) {
        outlined(game.text.holdTogether, Math.max(90, Math.min(VW - 90, down[0].x)), down[0].y - 24, 7, GOLD);
      }
    }

    for (const f of w.floats) {
      ctx.globalAlpha = Math.min(1, f.t * 2);
      const half = widthOf(f.text, 7) / 2 + 2;
      outlined(f.text, Math.max(half, Math.min(VW - half, f.x)), Math.max(0, f.y), 7, f.color);
      ctx.globalAlpha = 1;
    }
    if (w.doorOpen && blink(t, 2)) outlined(game.text.exitOpen, VW / 2, 3, 9, GREEN);
    ctx.restore();
  }

  // ---------- HUD: inventories on top, goal / gates / timer below ----------
  function drawHud(game) {
    const w = game.world, T = game.text;
    game.players.forEach((p, i) => {
      const x = i * 96;
      panel(x, 0, 96, 24, '#29314a', p.color);
      sprite(sprites.players[p.index][0], x + 3, 4);
      [[T.get, p.collects, x + 21], [T.use, p.spends, x + 58]].forEach(([label, res, cx]) => {
        text(label, cx, 2, 5, DIM);
        icon(res, cx, 9);
        text(String(p.inv[res]), cx + 15, 9, 11, p.inv[res] > 0 ? WHITE : PAL.s);
      });
    });

    const y = 200;
    rect(0, y, VW, 16, INK);
    const goal = goalProgress(w);
    text(T.goal, 4, y + 4, 8, GOLD);
    panel(32, y + 3, 82, 10, '#29314a', WHITE);
    if (goal.need) rect(33, y + 4, Math.round((80 * goal.have) / goal.need), 8, w.doorOpen ? GREEN : GOLD);
    text(`${goal.have}/${goal.need}`, 118, y + 4, 8, WHITE);

    text(T.gates, 152, y + 4, 8, GOLD);
    w.gates.forEach((g, i) => {
      const gx = 184 + i * 16;
      const color = g.status === 'open' ? GREEN : g.status === 'active' ? (blink(game.clock, 4) ? GOLD : PAL.o) : PAL.s;
      panel(gx, y + 2, 13, 12, INK, color);
      text(String(g.def.number), gx + 6.5, y + 4, 8, color, 'center');
    });

    if (w.stats.bonus > 0) text(`* ${w.stats.bonus}`, 250, y + 4, 8, PAL.c);
    if (game.settings.muted) text('MUTE', 288, y + 5, 6, PAL.s);

    if (game.settings.timerEnabled) {
      const left = game.settings.timerSeconds - w.stats.time;
      if (left >= 0) text(fmtTime(left), VW - 4, y + 3, 10, left < 30 ? PAL.o : WHITE, 'right');
      else text(`${T.extraTime} +${fmtTime(-left)}`, VW - 4, y + 4, 8, PAL.o, 'right');
    } else {
      text(fmtTime(w.stats.time), VW - 4, y + 4, 8, PAL.s, 'right');
    }
  }

  // ---------- Trade Gate card ----------
  function drawGate(game) {
    const w = game.world, g = w.activeGate, def = g.def, T = game.text, card = def.card;
    const name = (id) => (w.byId[id] ? w.byId[id].name : id);
    const color = (id) => (w.byId[id] ? w.byId[id].color : WHITE);
    rect(0, 0, VW, VH, 'rgba(10,12,24,0.9)');
    panel(5, 4, 374, 208, INK, GOLD);

    // Title, then who gives what to whom.
    text(fmt(T.gateTitle, { n: def.number }), 13, 9, 12, GOLD);
    let x = 13;
    for (const tr of def.transfers) {
      text(name(tr.from), x, 27, 7, color(tr.from)); x += widthOf(name(tr.from), 7) + 3;
      icon(tr.res, x, 23); x += 13;
      text(`x${tr.amount}`, x, 27, 7, WHITE); x += widthOf(`x${tr.amount}`, 7) + 4;
      text('>', x, 26, 8, WHITE); x += 8;
      text(name(tr.to), x, 27, 7, color(tr.to)); x += widthOf(name(tr.to), 7) + 14;
    }

    // Who speaks.
    const describe = def.type === 'describe';
    const first = describe ? card.describer : card.asker, second = describe ? card.picker : card.answerer;
    const firstText = fmt(describe ? T.describes : T.asks, { who: name(first) });
    text(firstText, 13, 41, 9, color(first));
    text('>', 13 + widthOf(firstText, 9) + 5, 41, 9, WHITE);
    text(fmt(describe ? T.chooses : T.answers, { who: name(second) }), 13 + widthOf(firstText, 9) + 16, 41, 9, color(second));

    const hintText = g.hints > 0 ? `${fmt(T.hint, { n: g.hints })}: ${def.teacher.hints[g.hints - 1]}` : '';

    // Describe gates start with choosing the card; the code comes after.
    if (describe && !g.pickOk) {
      if (g.peek) {
        if (blink(game.clock, 3)) text(fmt(T.lookAway, { b: name(card.picker) }), VW / 2, 60, 12, PAL.o, 'center');
        panel(132, 80, 120, 96, '#29314a', GOLD);
        drawOption(card.options[card.target], 138, 86, 108, 84);
        text(T.secret, VW / 2, 182, 10, GOLD, 'center');
        return;
      }
      let y = paragraph(fmt(T.describerLook, { a: name(card.describer) }), 13, 56, 358, 8, color(card.describer), 2);
      paragraph(fmt(T.pickerPick, { b: name(card.picker) }), 13, y + 1, 358, 8, color(card.picker), 2);
      const n = card.options.length, bw = Math.min(72, Math.floor((358 - (n - 1) * 8) / n));
      const x0 = (VW - (n * bw + (n - 1) * 8)) / 2;
      card.options.forEach((opt, i) => {
        const bx = x0 + i * (bw + 8), on = i === g.picked;
        if (on) rect(bx - 2, 96, bw + 4, 70, color(card.picker));
        panel(bx, 98, bw, 66, '#29314a', on ? WHITE : PAL.s);
        drawOption(opt, bx + 4, 102, bw - 8, 58);
        text(String(i + 1), bx + bw / 2, 168, 9, on ? WHITE : PAL.s, 'center');
      });
      if (g.pickMsg > 0) text(T.pickWrong, VW / 2, 182, 10, PAL.o, 'center');
      else if (hintText) paragraph(hintText, VW / 2, 182, 358, 8, GOLD, 2, 'center');
      else if (blink(game.clock, 2)) text(T.callTeacher, VW / 2, 186, 9, PAL.s, 'center');
      return;
    }

    // Left side: the question.
    let y = 57;
    if (describe) {
      text(T.pickRight, 13, y, 12, GREEN);
      panel(13, y + 18, 74, 60, '#29314a', GREEN);
      drawOption(card.options[card.target], 17, y + 22, 66, 52);
      y += 82;
    } else {
      y = paragraph(card.question || card.prompt, 13, y, 230, 12, WHITE, 5) + 3;
      if (card.minSentences) { text(fmt(T.minSentences, { n: card.minSentences }), 13, y, 7, DIM); y += 10; }
      if (def.type === 'open') { text(T.openBonus, 13, y, 7, PAL.c); y += 10; }
    }
    if (hintText) {
      const lines = wrap(hintText, 222, 7).slice(0, 2);
      panel(11, y + 1, 232, lines.length * 9 + 5, '#29314a', GOLD);
      lines.forEach((l, i) => text(l, 15, y + 4 + i * 9, 7, GOLD));
    }

    // Phrase hints for each side (the teacher can switch these off).
    if (game.settings.phraseHints) {
      const ph = gatePhrases(def, game.config), tr = def.transfers[0];
      text(T.youSay, 13, 161, 6, DIM);
      let py = paragraph(ph.receiver[0] || '', 13, 170, 112, 7, color(tr.to), 2);
      paragraph(ph.receiver[1] || '', 13, py + 2, 112, 7, color(tr.to), 2);
      py = paragraph(ph.giver[0] || '', 131, 170, 112, 7, color(tr.from), 2);
      paragraph(ph.giver[1] || '', 131, py + 2, 112, 7, color(tr.from), 2);
    }

    // Right side: call the teacher, type the code.
    const cx = 312 + (g.shake > 0 ? Math.round(Math.sin(g.shake * 70) * 3) : 0);
    const flash = blink(game.clock, 3);
    panel(252, 38, 120, 30, flash ? GOLD : INK, GOLD);
    const [l1, l2] = wrap(T.callTeacher, 112, 10);
    text(l1 || '', 312, l2 ? 42 : 48, 10, flash ? INK : GOLD, 'center');
    if (l2) text(l2, 312, 54, 10, flash ? INK : GOLD, 'center');
    text(g.shake > 0 ? T.wrongCode : T.enterCode, 312, 73, 7, g.shake > 0 ? PAL.o : DIM, 'center');

    const len = def.teacher.code.length, boxW = 20, x1 = cx - (len * (boxW + 3) - 3) / 2;
    for (let i = 0; i < len; i++) {
      panel(x1 + i * (boxW + 3), 83, boxW, 22, '#29314a', g.shake > 0 ? PAL.o : WHITE);
      if (g.entry[i]) text(g.entry[i], x1 + i * (boxW + 3) + boxW / 2, 86, 16, WHITE, 'center');
    }
    KEYPAD.forEach((row, ry) => row.forEach((key, rx) => {
      const kx = 268 + rx * 30, ky = 112 + ry * 23, on = g.cursor.x === rx && g.cursor.y === ry;
      panel(kx, ky, 27, 20, on ? GOLD : '#29314a', on ? WHITE : PAL.s);
      text(key === '<' ? 'DEL' : key === 'C' ? 'CLR' : key, kx + 13.5, ky + (key.length > 0 && /\d/.test(key) ? 3 : 6), /\d/.test(key) ? 13 : 7, on ? INK : WHITE, 'center');
    }));
  }

  // ---------- role cards (hold X) ----------
  function drawRoleCard(game, p) {
    const T = game.text, n = game.players.length;
    const x = p.index % 2 ? 196 : 8, y = p.index < 2 ? 26 : 120;
    const giveTo = game.players.find((q) => q.spends === p.collects);
    const getFrom = game.players.find((q) => q.collects === p.spends);
    panel(x - 1, y - 1, 182, 94, INK, INK);
    panel(x, y, 180, 92, '#29314a', p.color);
    sprite(sprites.players[p.index][0], x + 5, y + 6, 2);
    text(p.name, x + 20, y + 42, 8, p.color, 'center');
    [[T.iGet, p.collects, y + 5], [T.iUse, p.spends, y + 33]].forEach(([label, res, ry]) => {
      text(label, x + 44, ry + 8, 9, DIM);
      icon(res, x + 82, ry, 2);
      text(res, x + 110, ry + 3, 9, WHITE);
      text(`x ${p.inv[res]}`, x + 110, ry + 14, 9, GOLD);
    });
    if (n >= 2 && giveTo) text(fmt(T.giveTo, { res: p.collects, who: giveTo.name }), x + 6, y + 66, 7, giveTo.color);
    if (n >= 2 && getFrom) text(fmt(T.getFrom, { res: p.spends, who: getFrom.name }), x + 6, y + 78, 7, getFrom.color);
  }

  // ---------- phrase help (hold Y) ----------
  function drawPhrases(game, p) {
    const w = game.world, T = game.text;
    let gate = w.activeGate;
    if (!gate) {
      const mine = w.gates.filter((g) => participants(g.def).includes(p.id));
      gate = (mine.length ? mine : w.gates).slice().sort((a, b) => dist(a, p) - dist(b, p))[0];
    }
    panel(20, 30, 344, 164, INK, p.color);
    text(T.youSay, 30, 38, 10, GOLD);
    let y = 54;
    const ph = gate ? gatePhrases(gate.def, game.config) : { receiver: [], giver: [] };
    const tr = gate && gate.def.transfers[0];
    const colorOf = (id) => (w.byId[id] ? w.byId[id].color : WHITE);
    for (const s of ph.receiver) y = paragraph(s, 30, y, 324, 10, colorOf(tr.to), 2) + 3;
    for (const s of ph.giver) y = paragraph(s, 30, y, 324, 10, colorOf(tr.from), 2) + 3;
    for (const s of game.config.phrases.general) { if (y < 180) y = paragraph(s, 30, y, 324, 9, DIM, 1) + 3; }
  }

  function drawPlay(game) {
    drawWorld(game);
    drawHud(game);
    if (game.world.activeGate) drawGate(game);
    game.players.forEach((p) => { if (p.showRole) drawRoleCard(game, p); });
    const asker = game.settings.phraseHints && game.players.find((p) => p.showPhrases);
    if (asker) drawPhrases(game, asker);
  }

  // ---------- win ----------
  function drawWin(game) {
    const T = game.text, s = game.world.stats;
    text(T.winTitle, VW / 2, 16, 20, blink(game.clock, 2) ? GOLD : GREEN, 'center');
    const n = game.players.length;
    panel(VW / 2 - n * 22 - 6, 40, n * 44 + 12, 50, PAL.f, PAL.s);
    game.players.forEach((p, i) => {
      const jump = Math.round(Math.abs(Math.sin(game.clock * 5 + i * 0.8)) * 6);
      sprite(sprites.players[p.index][Math.floor(game.clock * 6 + i) % 2], VW / 2 - n * 22 + i * 44 + 6, 54 - jump, 2);
    });
    panel(92, 96, 200, 84, '#29314a', WHITE);
    [[T.statTime, fmtTime(s.time)], [T.statTrades, s.trades], [T.statHints, s.hints], [T.statBonus, s.bonus]].forEach(([label, value], i) => {
      text(label, 104, 104 + i * 18, 11, DIM);
      text(String(value), 280, 104 + i * 18, 11, i === 3 ? PAL.c : WHITE, 'right');
    });
    if (blink(game.clock, 2)) text(T.winNext, VW / 2, 192, 10, WHITE, 'center');
  }

  function drawPause(game) {
    const T = game.text;
    rect(0, 0, VW, VH, 'rgba(10,12,24,0.8)');
    panel(42, 60, 300, 96, INK, GOLD);
    text(T.paused, VW / 2, 70, 20, GOLD, 'center');
    if (game.lost && game.lost.length) {
      paragraph(fmt(T.disconnected, { who: game.lost.map((p) => p.name).join(', ') }), VW / 2, 98, 280, 8, PAL.o, 4, 'center');
    } else {
      if (game.pauseMsg) text(game.pauseMsg, VW / 2, 98, 8, GREEN, 'center');
      text(T.resume, VW / 2, 114, 9, WHITE, 'center');
      paragraph(T.controls, VW / 2, 132, 290, 6, DIM, 2, 'center');
    }
  }

  function draw(game) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    rect(0, 0, VW, VH, INK);
    if (game.screen === 'lobby') drawLobby(game);
    else if (game.screen === 'select') drawSelect(game);
    else if (game.screen === 'play') drawPlay(game);
    else if (game.screen === 'win') drawWin(game);
    if (game.paused) drawPause(game);
  }

  return { draw, resize };
}
