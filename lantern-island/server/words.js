// Help for people who write content: suggest the name they probably meant.

// ' Did you mean "x"?' when `word` is close to one of `options`, else ''.
export function didYouMean(word, options) {
  const w = String(word ?? '').toLowerCase();
  let best = [], bestD = Infinity;
  for (const o of options) {
    const d = distance(w, String(o).toLowerCase());
    if (d < bestD) { best = [o]; bestD = d; } else if (d === bestD) best.push(o);
  }
  if (!best.length || bestD === 0 || bestD > Math.max(2, Math.floor(w.length / 3))) return '';
  return ` Did you mean ${best.slice(0, 3).map((o) => `"${o}"`).join(' or ')}?`;
}
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return row[b.length];
}
