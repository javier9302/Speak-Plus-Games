// Challenge cards: loading them, choosing one for a station, and checking answers.
// Cards are data (storage collection "cards"). Samples come from data/seed-cards.json.
//
// Types
//   choice    tap A, B or C                              auto-checked
//   typed     type the answer                            auto-checked against "accepted"
//   spelling  hear a word, type it                       auto-checked
//   code      answer aloud, the teacher says a code      teacher-checked
//   link      a web page or video comes through a Helper; the answer part is a choice,
//             a typed answer or a teacher code, whichever the card has
//   courier   a letter that one player must hand to another at a named place; the
//             receiver then gets another card ("then")
import { seed } from './seed.js';

export const CARD_TYPES = ['choice', 'typed', 'spelling', 'code', 'link', 'courier'];
export const HELPERS = ['listening', 'reading'];

const text = (v, max = 600) => String(v ?? '').trim().slice(0, max);
const texts = (v, n, max) => (Array.isArray(v) ? v.map((x) => text(x, max)).filter(Boolean).slice(0, n) : []);
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const WEB = /^https?:\/\/[^\s"'<>]+$/i;                    // links: http and https only
const MEDIA = /^(https?:\/\/|\/)[^\s"'<>]*$/i;             // sound and pictures: also our own /media/ files

// How a card is answered: its own type, or for a link card the kind of answer it carries.
export const mode = (card) => (card.type === 'link' ? card.answerType : card.type);

// Checks a card. Returns { card } (clean and ready to play) or { error } saying what is missing.
export function validateCard(raw) {
  const bad = (why) => ({ error: why });
  if (!raw || !ID.test(raw.id || '')) return bad('needs an id (small letters, numbers, dashes)');
  if (!CARD_TYPES.includes(raw.type)) return bad(`unknown type "${raw.type}"`);
  const card = {
    id: raw.id, type: raw.type, level: text(raw.level, 12) || 'A2', tags: texts(raw.tags, 12, 30),
    prompt: text(raw.prompt), hints: texts(raw.hints, 3, 300), explanation: text(raw.explanation), points: Number(raw.points) || 1,
    media: {},
  };
  for (const k of ['tts', 'audio', 'image']) if (raw.media?.[k]) card.media[k] = text(raw.media[k], 300);
  for (const k of ['audio', 'image']) if (card.media[k] && !MEDIA.test(card.media[k])) return bad(`the ${k} address must start with http://, https:// or /`);
  if (!card.prompt) return bad('needs a prompt');

  // The answer parts. A link card may carry any one of them.
  const choice = () => {
    card.options = Object.fromEntries(Object.entries(raw.options || {}).map(([k, v]) => [text(k, 2).toUpperCase(), text(v, 200)]).filter(([k, v]) => k && v));
    card.answer = text(raw.answer, 2).toUpperCase();
    return Object.keys(card.options).length >= 2 && card.options[card.answer] ? null : 'needs options and an answer that is one of them';
  };
  const typed = () => {
    card.accepted = texts(raw.accepted, 20, 100);
    card.allowTypos = !!raw.allowTypos;
    return card.accepted.length ? null : 'needs accepted answers';
  };
  const code = () => {
    const t = raw.teacher || {};
    card.teacher = { code: text(t.code, 6), accepted: texts(t.accepted, 10, 300), hints: texts(t.hints, 3, 300) };
    if (!/^\d{3,6}$/.test(card.teacher.code)) return 'needs a teacher code of 3 to 6 digits';
    if (!card.hints.length) card.hints = card.teacher.hints;
    return null;
  };

  let why = null;
  if (card.type === 'choice') why = choice();
  else if (card.type === 'typed') why = typed();
  else if (card.type === 'code') why = code();
  else if (card.type === 'spelling') {
    card.word = text(raw.word || raw.accepted?.[0], 60);
    card.describe = text(raw.describe, 200);
    if (!card.word) return bad('needs a word');
    card.accepted = [card.word];
    card.allowTypos = false;
    if (!card.media.audio) card.media.tts = card.media.tts || card.word;   // the phone says the word
  } else if (card.type === 'link') {
    card.link = text(raw.link, 500);
    if (card.link && !WEB.test(card.link)) return bad('the link must start with http:// or https://');
    card.helper = HELPERS.includes(raw.helper) ? raw.helper : 'reading';
    card.answerType = Object.keys(raw.options || {}).length ? 'choice' : raw.teacher?.code ? 'code' : 'typed';
    why = { choice, typed, code }[card.answerType]();
    if (why) why = `the question about the link ${why} (options, accepted answers, or a teacher code)`;
  } else if (card.type === 'courier') {
    card.meetAt = text(raw.meetAt, 40);
    card.recipient = raw.recipient === 'random' ? 'random' : 'opener';
    const then = raw.then || {};
    if (then.ref && !ID.test(then.ref)) return bad('"then" must name a card id');
    if (then.type && (!CARD_TYPES.includes(then.type) || ['courier', 'link'].includes(then.type))) return bad('"then" must be a choice, typed, spelling or code card');
    card.then = then.ref ? { ref: then.ref } : { type: then.type || 'choice' };
  }
  if (why) return bad(why);
  if (raw.lastUsed) card.lastUsed = text(raw.lastUsed, 30);
  return { card };
}

// The same, for cards read from disk: a broken one is skipped with a warning.
export function normalizeCard(raw) {
  const r = validateCard(raw);
  if (r.error) console.warn(`Card "${raw?.id}" skipped: ${r.error}`);
  return r.card || null;
}

export function createCards(storage, contentDir) {
  return {
    // Read fresh at every mission start, so edits apply to the next mission.
    async all() {
      return (await seed(storage, contentDir, 'cards', 'seed-cards.json')).map(normalizeCard).filter(Boolean);
    },
    // Saves one card (new or changed). Throws with the reason if it is not valid.
    async put(raw) {
      const r = validateCard(raw);
      if (r.error) throw Object.assign(new Error(`Card "${raw?.id || '?'}": ${r.error}.`), { status: 400 });
      await storage.put('cards', r.card.id, r.card);
      return r.card;
    },
    // Saves many (import). Returns what was saved and what was skipped, with reasons.
    async putMany(list) {
      const saved = [], skipped = [];
      for (const raw of Array.isArray(list) ? list.slice(0, 2000) : []) {
        const r = validateCard(raw);
        if (r.error) skipped.push({ id: String(raw?.id || '?'), why: r.error });
        else { await storage.put('cards', r.card.id, r.card); saved.push(r.card.id); }
      }
      return { saved, skipped };
    },
    async remove(id) { await storage.remove('cards', id); },
    // Remembers when cards were played, for the "used recently" filter.
    async touch(list) {
      const now = new Date().toISOString();
      for (const c of list) await storage.put('cards', c.id, { ...c, lastUsed: now });
    },
  };
}

// filter = { type, level, tags, id }. level "group" means the group's level. If nothing fits
// the level, any level of that type will do: a station never stays empty when cards exist.
export function pickCard(all, filter = {}, groupLevel, used = new Set()) {
  if (filter.id) return all.find((c) => c.id === filter.id) || null;
  const level = filter.level === 'group' || !filter.level ? groupLevel : filter.level;
  const fits = (c) => (filter.type ? c.type === filter.type : true) && (!filter.only || filter.only.includes(c.type)) && (!filter.tags?.length || filter.tags.some((t) => c.tags.includes(t)));
  const pools = [
    all.filter((c) => fits(c) && c.level === level && !used.has(c.id)),
    all.filter((c) => fits(c) && !used.has(c.id)),
    all.filter(fits),
  ];
  let pool = pools.find((p) => p.length) || [];
  if (!pool.length) return null;
  // Prefer cards this class has not seen lately: draw from the less recently used half.
  if (pool.length > 3) pool = [...pool].sort((a, b) => (a.lastUsed || '').localeCompare(b.lastUsed || '')).slice(0, Math.ceil(pool.length / 2));
  return pool[Math.floor(Math.random() * pool.length)];
}

// The card a courier's letter opens: the one it names, or one of the kind it asks for.
export function innerCard(all, courier, groupLevel, used) {
  const named = courier.then.ref && all.find((c) => c.id === courier.then.ref && !['courier', 'link'].includes(c.type));
  return named || pickCard(all, { type: courier.then.type || 'choice' }, groupLevel, used) || pickCard(all, { only: ['choice', 'typed', 'spelling'] }, groupLevel, used);
}

// What the phone gets: the question, never the answer.
export function publicCard(card) {
  const m = mode(card);
  return {
    id: card.id, type: m, prompt: card.prompt, media: card.media,
    options: m === 'choice' ? card.options : undefined,
    describe: card.type === 'spelling' ? card.describe : undefined,
    digits: m === 'code' ? card.teacher.code.length : undefined,
  };
}

// What the teacher gets: everything needed to judge and help.
export function teacherCard(card) {
  const m = mode(card);
  const answer = m === 'choice' ? `${card.answer}: ${card.options[card.answer]}` : m === 'code' ? null : (card.accepted || []).join(' / ');
  return { id: card.id, type: card.type, mode: m, level: card.level, prompt: card.prompt, answer, code: card.teacher?.code, accepted: card.teacher?.accepted || [], hints: card.hints, explanation: card.explanation, link: card.link, helper: card.helper };
}

const tidy = (s) => String(s ?? '').toLowerCase().normalize('NFKC').replace(/[\s　]+/g, ' ').replace(/^[\s"'“”‘’]+|[\s"'“”‘’.!?。]+$/g, '').replace(/[’‘]/g, "'");

function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

// Not case-sensitive, spaces and final punctuation trimmed. "allowTypos": one wrong, missing or
// extra letter in answers of 5 letters or more. (Never two: "expensive" is two letters from "inexpensive".)
export function checkAnswer(card, value) {
  const m = mode(card);
  if (m === 'choice') return text(value, 2).toUpperCase() === card.answer;
  if (m === 'code') return String(value ?? '').replace(/\D/g, '') === card.teacher.code;
  if (m === 'courier') return false;
  const given = tidy(value);
  if (!given) return false;
  return card.accepted.some((a) => {
    const want = tidy(a);
    if (given === want) return true;
    if (!card.allowTypos || want.length < 5) return false;
    return distance(given, want) <= 1;
  });
}
