// School branding is off by default: the Speak Plus logo shows only with ?brand=speakplus in the
// address (remembered in this browser, same setting as the games hub). Loaded by the host and teacher pages.
(function () {
  var KEY = 'hub-brand-v1', brand = 'neutral';
  try {
    var q = new URLSearchParams(location.search).get('brand');
    if (q === 'speakplus' || q === 'neutral') localStorage.setItem(KEY, JSON.stringify(q));
    if (JSON.parse(localStorage.getItem(KEY) || 'null') === 'speakplus') brand = 'speakplus';
  } catch (e) { /* storage blocked: no logo */ }
  document.documentElement.dataset.brand = brand;
})();
