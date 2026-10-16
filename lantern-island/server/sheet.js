// Data for the printable teacher sheets: one for a zone (before class), one for the mission
// that is running (with its real cards, codes and players). The page is public/teacher/sheet.html.
import { dealPreset } from './abilities.js';
import { fillText } from './things.js';
import { answerText } from './codes.js';
import { solve } from './solver.js';
import { KINDS } from './kinds/index.js';
import { goalOf } from './goals/index.js';

// What each kind of object asks of the team, in plain words (from its kind file).
const how = (o, itemName) => KINDS[o.kind].how(o, itemName);

export function createSheets({ zones, abilities, items, missions, rooms }) {
  const itemName = (id) => (items.byId[id]?.name || id).toLowerCase();
  const ability = (id) => abilities.byId[id]?.name || id;
  // Before class, a clue's placeholders say what they will become (they change every mission).
  const before = (text, zone) => text.replace(/\{d(\d)\}/g, (m, n) => `(number ${n} of the code)`)
    .replace(/\{code:([^:}]*):(\d)\}/g, (m, id, n) => `(piece ${n} of the code of the ${(zone.objects.find((o) => o.id === id)?.name || id).toLowerCase()})`)
    .replace(/\{code:([^:}]*)\}/g, (m, id) => `(the whole code of the ${(zone.objects.find((o) => o.id === id)?.name || id).toLowerCase()})`)
    .replace(/\{rule:([^.}]*)\.([^}]*)\}/g, (m, p, r) => zone.logic?.[p]?.rules?.[r]?.text ?? '?')
    .replace(/\{fact:([^}]*)\}/g, (m, id) => `(the number "${id}", new every mission)`)
    .replace(/\{where:([^}]*)\}/g, (m, id) => `(near where the ${(zone.objects.find((o) => o.id === id)?.name || id).toLowerCase()} is)`)
    .replace(/\{name:([^}]*)\}/g, (m, id) => zone.objects.find((o) => o.id === id)?.name || id)
    .replace(/\{(order|odd|deliveries)\}/g, (m, k) => `(${{ order: 'the order of this mission', odd: 'the odd one of this mission', deliveries: 'the deliveries of this mission' }[k]})`);
  const puzzles = (zone, room, only) => zone.objects.filter((o) => !KINDS[o.kind].card || !only || only.includes(o.id)).map((o) => ({
    name: o.name, kind: o.kind, how: how(o, itemName),
    clues: Object.entries(o.clues || {}).map(([a, text]) => ({ ability: ability(a), text: room ? fillText(text, room, items) : before(text, zone) })),
  }));

  return {
    // Before class: the whole zone.
    async zone(id) {
      const zone = zones[id];
      if (!zone) return null;
      const whole = missions.normalize({ title: 'whole zone', zone: id, goal: goalOf(zone.goal).wholeZone(zone.goal), stations: zone.objects.filter((o) => KINDS[o.kind].card).map((o) => ({ at: o.id })) });
      return {
        kind: 'zone', title: zone.name, goal: zone.goal?.story || '',
        puzzles: puzzles(zone, null),
        places: zone.places.map((p) => p.name), landmarks: zone.landmarks.map((l) => l.name),
        tables: [2, 3, 4, 5, 6].map((n) => ({ n, sets: dealPreset(abilities, n).map((s) => s.map(ability)) })),
        steps: solve(zone, whole, dealPreset(abilities, 3)).log,
        missions: (await missions.all()).filter((m) => m.zone === id).map((m) => ({ title: m.title, story: m.story, minutes: m.minutes, tablets: m.stations.map((s) => `${zone.objects.find((o) => o.id === s.at)?.name}: ${s.card ? 'card ' + s.card : s.filter.type || 'any card'}`) })),
      };
    },
    // During class: the mission that is running in a room.
    room(code) {
      const data = rooms.sheetData(code);
      if (!data) return null;
      const { room, stations } = data, m = room.mission, gate = room.things.find((t) => t.def.code);
      const roleOf = (p) => [...['seer', 'healer', 'slayer'].filter((r) => room.mon && room.roles[r] === p.id), ...Object.keys(room.helpers).filter((h) => room.helpers[h] === p.id).map((h) => `${h} helper`)];
      return {
        kind: 'mission', title: m.title, story: m.story, minutes: m.minutes, group: room.group.name, level: room.group.level, room: room.code,
        goal: goalOf(m.goal).sheet(m.goal, { itemName, name: (id) => room.things.find((t) => t.id === id)?.name.toLowerCase() || id }),
        gateCode: gate ? { name: gate.name, code: answerText(room.secrets.answers[gate.id]) } : null,
        codes: room.things.filter((t) => t.def.code).map((t) => ({ name: t.name, code: answerText(room.secrets.answers[t.id]) })),
        monster: room.mon ? room.mon.level : 'off',
        teacherRoles: ['seer', 'healer', 'slayer'].filter((r) => room.mon && room.roles[r] === 'teacher'),
        players: room.players.map((p) => ({ name: p.name, abilities: p.abilities.map(ability), roles: roleOf(p) })),
        stations,
        puzzles: puzzles(room.zone, room, m.stations.map((s) => s.at)),
        steps: solve(room.zone, m, room.players.map((p) => p.abilities)).log,
      };
    },
  };
}
