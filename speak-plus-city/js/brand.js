// Brand for the Speak Plus City pages (this folder is self-contained, so it doesn't use ../shared/kit.js).
// Neutral by default ("Talk City", no school logo). ?brand=speakplus in the address switches to the
// Speak Plus logo, colours and name, and is remembered in this browser (same key as the hub).
(function () {
  var KEY = 'hub-brand-v1', brand = 'neutral';
  try {
    var q = new URLSearchParams(location.search).get('brand');
    if (q === 'speakplus' || q === 'neutral') localStorage.setItem(KEY, JSON.stringify(q));
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved === 'speakplus' || saved === 'neutral') brand = saved;
  } catch (e) { /* storage blocked: neutral */ }
  var name = brand === 'speakplus' ? 'Speak Plus City' : 'Talk City';
  document.documentElement.dataset.brand = brand;
  window.SPC_BRAND = brand; window.SPC_NAME = name;
  var PLUS = 'speak<svg viewBox="0 0 40 40" aria-hidden="true"><g transform="rotate(12 20 20)"><line x1="20" y1="6" x2="20" y2="34" stroke="#E8483B" stroke-width="8.5" stroke-linecap="round"/><line x1="6" y1="20" x2="34" y2="20" stroke="#E8483B" stroke-width="8.5" stroke-linecap="round"/></g></svg>';
  var BUBBLE = '<svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true"><path d="M8 6h24a6 6 0 0 1 6 6v13a6 6 0 0 1-6 6H18l-8 7v-7H8a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z" fill="var(--accent)"/><circle cx="13" cy="18.5" r="2.6" fill="#fff"/><circle cx="20" cy="18.5" r="2.6" fill="#fff"/><circle cx="27" cy="18.5" r="2.6" fill="#fff"/></svg><span>talk<b>city</b></span>';
  function ready() {
    document.title = document.title.replace(/Speak Plus City|Talk City/g, name);
    document.querySelectorAll('.logo').forEach(function (el) { el.innerHTML = brand === 'speakplus' ? PLUS : BUBBLE; el.classList.toggle('logo-neutral', brand !== 'speakplus'); });
    document.querySelectorAll('.logo-jp').forEach(function (el) { el.hidden = brand !== 'speakplus'; });
    document.querySelectorAll('[data-game-name]').forEach(function (el) { el.textContent = name; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
