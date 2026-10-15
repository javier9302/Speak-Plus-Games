// Goal types: what a team must do to finish a mission, one file per type (server/goals/<type>.js).
// The game (rooms.js) and the solver (solver.js) both use these files. To add a type, add a file here:
// it is found by itself. A mission names its type in "goal": { "type": "<type>", ... } (default "collect").
//
// A goal file exports default {
//   type      its name, the same as the file name
//   about     one sentence for the scenario guide
//   fields    { field: what it means } the goal fields it reads (for the guide)
//   label     the default label on the screens ("Lanterns")
//   normalize(raw, c)   the clean goal (its own fields only), from the mission's "goal". c: { zone, items, stations,
//                       base (the map's goal, for defaults), fail(text), objectsOf(want) }. Report mistakes with c.fail.
//   wholeZone(raw)      for npm run check: the goal that asks for everything the map offers (default: the same goal)
//   describe(goal)      a few words for reports ("3 lanterns")
//   start(room, goal)   its state when the mission starts (kept in room.goalState)
//   progress(room, goal)  { have, need, ready?, bringTo?, done } for the screens and the scoreboard; done ends the mission
//   afterAct(room, p, t, ability, ctx)   a player used an ability on thing t: { npc: { name, text, good }, say, changed }
//   tick(room, dt, ctx)  20 times a second; returns true if something on the map changed
//   solver(s)           { step(), done(), why(problems) } run inside the solver (see solver.js for what s offers)
//   sheet(goal, ctx)    one sentence for the teacher's sheet
// }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
export const GOALS = {};
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js') && n !== 'index.js' && !n.startsWith('_')).sort()) {
  const g = (await import(pathToFileURL(path.join(dir, f)).href)).default;
  if (!g || g.type !== f.slice(0, -3)) throw new Error(`server/goals/${f}: it must export default { type: "${f.slice(0, -3)}", ... }`);
  GOALS[g.type] = { about: '', fields: {}, label: 'Goal', wholeZone: (raw) => raw, start: () => ({}), sheet: () => '', describe: () => g.type, ...g };
}
export const goalOf = (goal) => GOALS[goal?.type || 'collect'];
