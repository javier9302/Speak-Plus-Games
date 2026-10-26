// Content loading. The default texts are in data/content.json. The content
// editor (editor.html) can save a changed copy in this browser; that copy wins
// until the teacher resets it.

export const CONTENT_KEY = 'sp-city-content-v1';
const SQUARE_TYPES = ['start', 'property', 'chance', 'mystery', 'bank', 'blackmarket', 'jail', 'festival', 'gotojail'];
const CORNERS = { 0: 'start', 12: 'jail', 24: 'festival', 36: 'gotojail' };
const LEVELS = ['beginner', 'intermediate', 'advanced', 'all'];

export async function loadDefaultContent() {
  const res = await fetch(new URL('../data/content.json', import.meta.url), { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load data/content.json');
  return res.json();
}

// The content in use: the editor's saved copy if there is a valid one, else the file.
export async function loadContent() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONTENT_KEY) || 'null');
    if (saved && !validateContent(saved).length) return { content: saved, custom: true };
  } catch { /* ignore a broken saved copy */ }
  return { content: await loadDefaultContent(), custom: false };
}

export function saveCustomContent(c) { localStorage.setItem(CONTENT_KEY, JSON.stringify(c)); }
export function clearCustomContent() { localStorage.removeItem(CONTENT_KEY); }

// Returns a list of problems (empty = fine). Used by the editor and the tests.
export function validateContent(c) {
  const errs = [];
  if (!c || typeof c !== 'object') return ['The file is not a content object.'];
  const groups = Array.isArray(c.groups) ? c.groups : [];
  const gids = new Set(groups.map(g => g.id));
  if (!groups.length) errs.push('There are no colour groups.');
  if (!Array.isArray(c.squares) || c.squares.length !== 48) errs.push(`There must be exactly 48 squares (now ${Array.isArray(c.squares) ? c.squares.length : 0}).`);
  (c.squares || []).forEach((q, i) => {
    const where = `Square ${i} (${q.name || 'no name'})`;
    if (!SQUARE_TYPES.includes(q.type)) errs.push(`${where}: unknown type "${q.type}".`);
    if (!q.name) errs.push(`${where}: needs a name.`);
    if (CORNERS[i] && q.type !== CORNERS[i]) errs.push(`${where}: this corner must be "${CORNERS[i]}".`);
    if (!CORNERS[i] && Object.values(CORNERS).includes(q.type)) errs.push(`${where}: "${q.type}" can only be a corner.`);
    if (q.type === 'property') {
      if (!gids.has(q.group)) errs.push(`${where}: unknown colour group "${q.group}".`);
      if (!(q.price > 0) || !(q.rent >= 0)) errs.push(`${where}: needs a price and a rent.`);
    }
    if (q.type === 'bank' && !['tax', 'bonus', 'loan'].includes(q.bank)) errs.push(`${where}: bank type must be tax, bonus or loan.`);
  });
  for (const [key, min] of [['chance', 1], ['mystery', 1], ['missions', 1], ['rules', 1], ['blackMarket', 1], ['jailChallenges', 1]]) {
    if (!Array.isArray(c[key]) || c[key].length < min) errs.push(`"${key}" needs at least ${min} item.`);
  }
  for (const key of ['chance', 'mystery', 'jailChallenges']) {
    (c[key] || []).forEach((x, i) => {
      if (!x.text) errs.push(`${key} ${i + 1}: needs a text.`);
      if (x.level && !LEVELS.includes(x.level)) errs.push(`${key} ${i + 1}: unknown level "${x.level}".`);
    });
  }
  if (!c.sayIt || typeof c.sayIt !== 'object') errs.push('"sayIt" (prompts and hints) is missing.');
  return errs;
}
