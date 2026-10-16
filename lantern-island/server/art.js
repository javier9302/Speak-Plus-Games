// Pictures in data: 16 rows of 16 letters. "." is clear, "k" the dark outline, any other letter a colour from "pal".
// Used for items (data/items.json, a pack's "items"), a pack's "sprites" and a kind's own art.
const HEX = /^#[0-9a-fA-F]{6}$/;

// Everything wrong with one picture: `rows` and the `pal` that colours it.
export function pictureProblems(rows, pal, where) {
  if (!Array.isArray(rows) || rows.length !== 16 || rows.some((r) => typeof r !== 'string' || r.length !== 16)) return [`${where}: the picture must be 16 rows of 16 letters`];
  const out = [];
  for (const [k, c] of Object.entries(pal || {})) if (!HEX.test(c)) out.push(`${where}: the colour "${k}" is "${c}"; use a colour like "#a0c070"`);
  for (const ch of new Set(rows.join(''))) if (ch !== '.' && ch !== 'k' && !HEX.test(pal?.[ch] || '')) out.push(`${where}: the picture uses "${ch}", which needs a colour in "pal"`);
  return out;
}

// A sprite is { pal, states: { default: rows, <state>: rows } }: a picture for each state an object can be in.
export function spriteProblems(id, sprite) {
  const where = `sprite "${id}"`;
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) return [`${where}: the id uses small letters, numbers and dashes`];
  if (!sprite || typeof sprite !== 'object' || !sprite.states || typeof sprite.states !== 'object') return [`${where}: needs "pal" and "states": { "default": [16 rows], "open": [16 rows] }`];
  if (!sprite.states.default) return [`${where}: needs states.default, the picture used when its state has none`];
  return Object.entries(sprite.states).flatMap(([st, rows]) => pictureProblems(rows, sprite.pal, `${where}, state "${st}"`));
}
