// Small shared helpers (no DOM, safe to use in tests).

// fmt("Only {who} can use {res}!", { who: "BLUE", res: "gold" })
export const fmt = (s, vars = {}) =>
  String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 75 -> "1:15"
export const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Join names naturally: ["RED", "BLUE", "GREEN"] -> "RED, BLUE and GREEN"
export const joinNames = (list) =>
  list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;

// Phrase hints for a gate. A gate may bring its own:
//   "phrases": { "receiver": ["..."], "giver": ["..."] }
// otherwise the general ones from config.json are filled in with the
// resource and amount of the gate's first trade.
export function gatePhrases(def, config) {
  if (def.phrases) return { receiver: def.phrases.receiver || [], giver: def.phrases.giver || [] };
  const t = def.transfers[0];
  const vars = { res: t.res, n: config.numbers[t.amount] || t.amount };
  return {
    receiver: config.phrases.receiver.map((s) => fmt(s, vars)),
    giver: config.phrases.giver.map((s) => fmt(s, vars)),
  };
}

// "three blue stars" for a describe-card option
export const describeOption = (opt, numbers) =>
  `${numbers[opt.count] || opt.count} ${opt.color} ${opt.shape}${opt.count > 1 ? 's' : ''}`;

// A gate in plain words, for the teacher panel and the printable sheet.
export function gateSummary(def, config, nameOf = (id) => id) {
  const trade = def.transfers
    .map((t) => `${nameOf(t.from)} gives ${t.amount} or more ${t.res} to ${nameOf(t.to)}`)
    .join('; ');
  const c = def.card;
  if (def.type === 'describe') {
    return {
      trade,
      who: `${nameOf(c.describer)} describes the secret card, ${nameOf(c.picker)} chooses`,
      question: `Secret card: number ${c.target + 1} (${describeOption(c.options[c.target], config.numbers)})`,
      extra: `Cards on screen: ${c.options.map((o, i) => `${i + 1}) ${describeOption(o, config.numbers)}`).join('  ')}`,
    };
  }
  return {
    trade,
    who: `${nameOf(c.asker)} asks, ${nameOf(c.answerer)} answers`,
    question: c.question || c.prompt,
    extra: [
      c.minSentences ? `At least ${c.minSentences} sentences.` : '',
      def.type === 'open' ? 'Open conversation: a longer answer earns a bonus gem.' : '',
    ].filter(Boolean).join(' '),
  };
}

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
