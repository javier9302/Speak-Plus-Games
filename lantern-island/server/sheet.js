// Data for the printable teacher sheets: one for a zone (before class), one for the mission
// that is running (with its real cards, codes and players). The page is public/teacher/sheet.html.
import { dealPreset } from './abilities.js';
import { fillCode } from './things.js';
import { solve } from './solver.js';

// What each kind of object asks of the team, in plain words.
function how(o, itemName) {
  switch (o.kind) {
    case 'chest': return `Open, then Pick up${o.holds ? ` (inside: ${itemName(o.holds)})` : ''}.`;
    case 'gate': return o.code ? `Locked with a code of ${o.code} numbers. Use, type the code, then Open.` : o.locked ? `Locked. Use with the ${itemName(o.key || 'key')} in your pocket, then Open.` : 'Open. Close shuts it again.';
    case 'gap': return o.needs ? `Jump across, or Fix with the ${itemName(o.needs)}.` : 'Jump across. It cannot be fixed.';
    case 'plate': return 'No ability. While a player stands on it, everybody can cross the broken bridge.';
    case 'sluice': return `Broken. Fix with the ${itemName(o.needs)}, then Close: the sea goes down and the way is dry.`;
    case 'boulder': return 'Push rolls it aside.';
    case 'station': return `Use shows its challenge card.${o.reward?.item ? ` Solved: a ${itemName(o.reward.item)} appears. Pick up.` : ''}`;
    case 'item': return 'Pick up.';
    case 'npc': return 'Talk. The teacher can answer as this character from the panel.';
    default: return '';
  }
}

export function createSheets({ zones, abilities, items, missions, rooms }) {
  const itemName = (id) => (items.byId[id]?.name || id).toLowerCase();
  const ability = (id) => abilities.byId[id]?.name || id;
  const puzzles = (zone, code, only) => zone.objects.filter((o) => o.kind !== 'station' || !only || only.includes(o.id)).map((o) => ({
    name: o.name, kind: o.kind, how: how(o, itemName),
    clues: Object.entries(o.clues || {}).map(([a, text]) => ({ ability: ability(a), text: code ? fillCode(text, code) : text.replace(/\{d(\d)\}/g, (m, n) => `(number ${n} of the code)`) })),
  }));

  return {
    // Before class: the whole zone.
    async zone(id) {
      const zone = zones[id];
      if (!zone) return null;
      const whole = missions.normalize({ title: 'whole zone', zone: id, goal: { ...zone.goal, items: Object.fromEntries(Object.keys(zone.goal.items).map((k) => [k, 99])) }, stations: zone.objects.filter((o) => o.kind === 'station').map((o) => ({ at: o.id })) });
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
        goal: `${Object.values(m.goal.items)[0]} ${room.zone.goal?.label?.toLowerCase() || 'items'}${m.goal.deliver ? `, carried by one player to the ${room.things.find((t) => t.id === m.goal.deliver)?.name.toLowerCase()}` : ''}`,
        gateCode: gate ? { name: gate.name, code: room.gateCode.slice(0, gate.def.code) } : null,
        monster: room.mon ? room.mon.level : 'off',
        teacherRoles: ['seer', 'healer', 'slayer'].filter((r) => room.mon && room.roles[r] === 'teacher'),
        players: room.players.map((p) => ({ name: p.name, abilities: p.abilities.map(ability), roles: roleOf(p) })),
        stations,
        puzzles: puzzles(room.zone, room.gateCode, m.stations.map((s) => s.at)),
        steps: solve(room.zone, m, room.players.map((p) => p.abilities)).log,
      };
    },
  };
}
