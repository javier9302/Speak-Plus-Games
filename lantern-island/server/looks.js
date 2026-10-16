// How a person looks, for picture clues. A Look clue can show a small picture instead of words: the Look player must
// describe it in English, and another player finds the matching person among look-alikes (kinds "npc" and "candidate"
// take a "look"). The picture is drawn from parts, so there are hundreds of different people.
//
//   "look": { "hat": "red", "hair": "black", "glasses": true, "beard": false, "shirt": "green" }
//     hat    none | red blue green yellow purple          hair   none | black brown blond grey red
//     shirt  red blue green yellow orange purple pink white    glasses, beard: true or false
export const HATS = ['red', 'blue', 'green', 'yellow', 'purple'];
export const HAIRS = ['black', 'brown', 'blond', 'grey', 'red'];
export const SHIRTS = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'white'];
const FIELDS = ['hat', 'hair', 'glasses', 'beard', 'shirt'];

// Everything wrong with one look (an empty list if it is fine).
export function lookProblems(look) {
  if (!look || typeof look !== 'object' || Array.isArray(look)) return ['"look" is { "hat": "red", "hair": "black", "glasses": true, "shirt": "green" }'];
  const out = [];
  for (const k of Object.keys(look)) if (!FIELDS.includes(k)) out.push(`"look" has an unknown field "${k}". Fields: ${FIELDS.join(', ')}`);
  const one = (key, list, extra = []) => { if (look[key] !== undefined && ![...list, ...extra].includes(look[key])) out.push(`"look" ${key} is "${look[key]}"; choose one of ${[...extra, ...list].join(', ')}`); };
  one('hat', HATS, ['none']); one('hair', HAIRS, ['none']); one('shirt', SHIRTS);
  if (look.shirt === undefined) out.push('"look" needs a "shirt" colour');
  for (const k of ['glasses', 'beard']) if (look[k] !== undefined && typeof look[k] !== 'boolean') out.push(`"look" ${k} is true or false`);
  return out;
}
// The same person, however the fields were written.
export const lookKey = (look) => JSON.stringify([look.hat || 'none', look.hair || 'none', !!look.glasses, !!look.beard, look.shirt]);
// In words, for the teacher's sheet: "a person with a red hat, black hair, glasses and a green shirt".
export function describeLook(look) {
  const parts = [];
  if (look.hat && look.hat !== 'none') parts.push(`a ${look.hat} hat`); else parts.push('no hat');
  if (look.hair && look.hair !== 'none') parts.push(`${look.hair} hair`); else parts.push('no hair');
  if (look.glasses) parts.push('glasses');
  if (look.beard) parts.push('a beard');
  parts.push(`a ${look.shirt} shirt`);
  return `a person with ${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
