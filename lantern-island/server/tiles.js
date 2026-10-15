// Tiles (the letters of a map's rows) and themes (how a map looks).
//
// Tiles are part of the game: they decide where players can walk. The base tiles are below; a pack can add
// its own in pack.json, "tiles": { "<letter>": { "name", "solid", "base"?, "color"?, "speckle"?, "art"?, "pal"? } }.
//   solid    true: nobody can walk on it
//   base     a tile drawn underneath first (for example "," grass under a bush)
//   color    the fill colour; speckle: a few dots in these colours; art + pal: a 16x16 picture as letters
//
// Themes only change the look, never where players can walk, so the solver does not care about them.
// Built-in themes are in data/themes.json; a pack can add its own in pack.json, "themes": { "<name>": {...} }.
//   palette  { "#old": "#new" } colours of the ground replaced (see public/shared/pixel.js drawTile)
//   tint     a colour laid over the whole picture, for example "rgba(10, 20, 60, 0.45)" for night
//   weather  none | snow | rain | fireflies | leaves | confetti
//   art      { "<letter>": { "art": [16 rows], "pal": { ... } } } a different picture for a tile
// A map chooses its theme with "theme"; a mission can choose another; the pack's "theme" is the default.
import { didYouMean } from './words.js';

export const BASE_TILES = {
  '~': { name: 'water', solid: true },
  ',': { name: 'grass', solid: false },
  '.': { name: 'sand', solid: false },
  '#': { name: 'path', solid: false },
  '=': { name: 'bridge', solid: false },
  'T': { name: 'tree', solid: true },
  'R': { name: 'rock', solid: true },
  'p': { name: 'player start (drawn as grass)', solid: false },
};
export const WEATHER = ['none', 'snow', 'rain', 'fireflies', 'leaves', 'confetti'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const TILE_FIELDS = ['name', 'solid', 'base', 'color', 'speckle', 'art', 'pal'];
const THEME_FIELDS = ['name', 'palette', 'tint', 'weather', 'art'];

// The tiles of a map: the base tiles and the pack's.
export const tileSet = (extra = {}) => ({ ...BASE_TILES, ...extra });
export const solidSet = (tiles) => new Set(Object.entries(tiles).filter(([, t]) => t.solid).map(([ch]) => ch));
// The tiles that screens must draw from data (the base tiles are drawn in code).
export const customTiles = (tiles) => Object.fromEntries(Object.entries(tiles).filter(([ch]) => !BASE_TILES[ch]));

function artProblems(art, pal, where, out) {
  if (!Array.isArray(art) || art.length !== 16 || art.some((r) => typeof r !== 'string' || r.length !== 16)) { out.push(`${where}: "art" must be 16 rows of 16 letters`); return; }
  for (const ch of new Set(art.join(''))) if (ch !== '.' && ch !== 'k' && !HEX.test(pal?.[ch] || '')) out.push(`${where}: the art uses "${ch}", which needs a colour in "pal" (like "#a0c070")`);
}
const fields = (rec, allowed, where, out) => { for (const k of Object.keys(rec || {})) if (!allowed.includes(k) && !k.endsWith('Help')) out.push(`${where}: unknown field "${k}".${didYouMean(k, allowed)}`); };

// Everything wrong with a pack's "tiles".
export function tileProblems(tiles) {
  const out = [];
  if (tiles === undefined) return out;
  if (!tiles || typeof tiles !== 'object' || Array.isArray(tiles)) return ['"tiles" is { "<letter>": { "name", "solid", ... } }'];
  for (const [ch, t] of Object.entries(tiles)) {
    const where = `tile "${ch}"`;
    if ([...ch].length !== 1) { out.push(`${where}: a tile is one letter or sign`); continue; }
    if (BASE_TILES[ch]) { out.push(`${where}: this letter is a base tile (${BASE_TILES[ch].name}). Use another letter.`); continue; }
    fields(t, TILE_FIELDS, where, out);
    if (typeof t?.name !== 'string' || !t.name) out.push(`${where}: needs a "name"`);
    if (typeof t?.solid !== 'boolean') out.push(`${where}: "solid" is true (nobody can walk on it) or false`);
    if (t?.base !== undefined && !BASE_TILES[t.base] && !tiles[t.base]) out.push(`${where}: "base" is "${t.base}", which is not a tile`);
    if (t?.color !== undefined && !HEX.test(t.color)) out.push(`${where}: "color" is a colour like "#6abe45"`);
    if (t?.speckle !== undefined && !(Array.isArray(t.speckle) && t.speckle.every((c) => HEX.test(c)))) out.push(`${where}: "speckle" is a list of colours like ["#4f9e37"]`);
    if (t?.art !== undefined) artProblems(t.art, t.pal, where, out);
    if (t?.color === undefined && t?.art === undefined) out.push(`${where}: needs a "color" or an "art" picture`);
  }
  return out;
}

// Everything wrong with one theme. `tiles`: the letters it may draw differently.
export function themeProblems(name, theme, tiles) {
  const out = [], where = `theme "${name}"`;
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) return [`${where}: a theme is { "palette", "tint", "weather", "art" }`];
  fields(theme, THEME_FIELDS, where, out);
  if (theme.palette !== undefined) for (const [from, to] of Object.entries(theme.palette || {})) if (!HEX.test(from) || !HEX.test(to)) out.push(`${where}: "palette" maps colours to colours, like { "#6abe45": "#e8eef5" }`);
  if (theme.tint !== undefined && typeof theme.tint !== 'string') out.push(`${where}: "tint" is a colour, like "rgba(10, 20, 60, 0.45)"`);
  if (theme.weather !== undefined && !WEATHER.includes(theme.weather)) out.push(`${where}: "weather" must be one of ${WEATHER.join(', ')}.${didYouMean(theme.weather, WEATHER)}`);
  for (const [ch, a] of Object.entries(theme.art || {})) {
    if (!tiles[ch]) out.push(`${where}: "art" for "${ch}", which is not a tile`);
    else artProblems(a?.art, a?.pal, `${where}, art "${ch}"`, out);
  }
  return out;
}
