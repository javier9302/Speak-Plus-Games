// Object kinds: everything one kind of map object does, one file per kind (server/kinds/<kind>.js).
// The game (things.js) and the solver (solver.js) both read these files, so a kind always behaves the
// same in both. To add a kind, add a file here: it is found by itself. Then run npm test and npm run check.
//
// A kind file exports default {
//   kind      its name, the same as the file name (a zone object says "kind": "<name>")
//   about     one sentence for the scenario guide and the teacher's sheet
//   fields    { field: what it means } the zone-object fields this kind reads (for the guide)
//   check(o, v)         problems with a zone object: v.item(id, field), v.ability(id, field), v.problem(text)
//   start(def)          its state when a mission starts: { st, holds? } (holds = the item it holds)
//   solid(t)            true if nobody can walk through it now (default: always)
//   holdable            true if a plate can hold it open while somebody stands on the plate (or a lever, for a while)
//   consumes(def)       the items it uses up, one per use: ['plank'] (the shopping goal counts them to know how many to buy)
//   opens(t) / opensWith(t)   for the solver: the id of the holdable thing this one opens for the other players, and the ability that does it (a lever)
//   settle(t, s)        for the solver: it settles by itself once players are in place (plates); returns a log line or null
//   pass(t, i, s)       for the solver: can player i walk through it? (default: not solid, or held open)
//   floods(t)           tiles it floods now, which nobody can walk on
//   view(t)             extra fields every screen may see (never clue text or answers)
//   hidesHolds(t)       true if screens must not see what it holds yet
//   hidden(t)           true if it is gone from the map
//   force(t)            the teacher's rescue button: one step forward; returns a word for what happened, or null
//   passed(t)           the design rules: has the team got past this obstacle?
//   cleared(t)          competitive mode: counts as an obstacle solved (once per mission)
//   how(o, itemName)    what it asks of the team, in plain words (the teacher's sheet)
//   card / character    true for a tablet that holds a challenge card / for a character the teacher plays
//   tick(t, ctx)        runs 20 times a second in a mission; returns true if it changed something
//   art       its pictures, if public/shared/pixel.js does not draw this kind: { pal: { letter: '#rrggbb' },
//             states: { <st>: [16 rows of 16 letters], default: [...] } }. "." is clear and "k" the dark outline.
//             The state's picture is used, or "default". Sent to every screen with the map.
//   returned(t)         an item a leaving player carried came back to it
//   markUsed(t, s)      for the solver: abilities used just by being able to walk somewhere (a jump)
//   stuck(t, s)         for the solver's report: extra reasons the team is stuck at it
//   rules(t, things)    for npm run check: a design problem with it, or null
//   actions: [ what abilities do to it. The first action whose ability matches and whose `when` is true runs.
//     { ability     the ability id, or (t) => id
//       when(t)     it can be done now
//       do(t, ctx)  the change (ctx.byId(id) finds another object)
//       say(t, ctx) what the player reads afterwards (ctx.itemName(id))
//       gives       true: the player picks up what it holds (do() then empties it)
//       needs       { item: (t) => id, keep?: true } the player must carry the item (it is used up unless keep)
//                   { code: true } the player types its code (a keypad on the phone; digits are {d1}... in clues)
//                   { card: true } the player answers its challenge card first (do() runs on the right answer)
//       missing(t, ctx)  what the player reads when the needed item is not in their pocket
//       guard(t, ctx)    a reason it cannot be done right now (somebody is in the way), or null
//       run(t, ctx)      a special effect done by the game itself (the jump); the solver ignores the action
//       solver      false: the solver never does it (it only undoes progress, like Close on a chest)
//       progress(t) for the solver, when it is a step forward (default: when)
//       explain     false: the solver's report does not mention it
//       log(t)      the solver's step, after "<Ability>: " (default: "the <name>") } ]
// }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
export const KINDS = {};
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js') && n !== 'index.js' && !n.startsWith('_')).sort()) {
  const k = (await import(pathToFileURL(path.join(dir, f)).href)).default;
  if (!k || k.kind !== f.slice(0, -3)) throw new Error(`server/kinds/${f}: it must export default { kind: "${f.slice(0, -3)}", ... }`);
  for (const problem of artProblems(k.art)) throw new Error(`server/kinds/${f}, art: ${problem}`);
  KINDS[k.kind] = {
    start: () => ({ st: 'x' }), solid: () => true, how: () => '', about: '', fields: {},
    ...k,
    actions: (k.actions || []).map((a) => ({ solver: true, explain: true, ...a, solver: a.run ? false : a.solver !== false })),
  };
}

// The pictures of the kinds that bring their own (for the screens).
export const KIND_ART = Object.fromEntries(Object.values(KINDS).filter((k) => k.art).map((k) => [k.kind, k.art]));
export const kindOf = (t) => KINDS[t.kind];

function artProblems(art) {
  if (!art) return [];
  const out = [];
  if (!art.states?.default) out.push('needs states.default (the picture used when its state has none)');
  for (const [st, rows] of Object.entries(art.states || {})) {
    if (!Array.isArray(rows) || rows.length !== 16 || rows.some((r) => typeof r !== 'string' || r.length !== 16)) { out.push(`state "${st}" must be 16 rows of 16 letters`); continue; }
    for (const ch of new Set(rows.join(''))) if (ch !== '.' && ch !== 'k' && !art.pal?.[ch]) out.push(`state "${st}" uses "${ch}", which is not in pal`);
  }
  return out;
}
export const abilityOf = (act, t) => (typeof act.ability === 'function' ? act.ability(t) : act.ability);
// The action `ability` does on `t` right now, or null.
export const actionFor = (t, ability) => kindOf(t).actions.find((a) => abilityOf(a, t) === ability && a.when(t)) || null;
// The solver's next step on `t`, or null.
export const progressOf = (t) => kindOf(t).actions.find((a) => a.solver && (a.progress || a.when)(t)) || null;
