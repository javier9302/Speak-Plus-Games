/* Dress Up Buddy — clothes, layer order and rendering.
   Each item is drawn on the shared 240 × 380 body map (see art/body.js), in its own layer.
   `box` is the viewBox used for the item's icon. */
(function (D) {
  'use strict';

  /* Back to front. One item per slot. */
  D.LAYERS = ['hairBack', 'body', 'face', 'socks', 'bottom', 'shoes', 'top', 'outer',
    'gloves', 'scarf', 'bag', 'hairFront', 'glasses', 'head'];

  /* Order used in sentences: top of the body to the bottom. */
  D.SAY_ORDER = ['head', 'glasses', 'scarf', 'outer', 'top', 'bottom', 'gloves', 'bag', 'socks', 'shoes'];

  D.CATS = [
    { id: 'tops', word: 'tops' },
    { id: 'outer', word: 'coats' },
    { id: 'bottoms', word: 'bottoms' },
    { id: 'feet', word: 'feet' },
    { id: 'acc', word: 'more' }
  ];

  const tshirtSleeve = 'M104,165 L86,167 C76,176 70,188 63,201 C72,210 87,215 99,213 L106,190 Z';

  D.ITEMS = [
    { id: 'tshirt', word: 'T-shirt', cat: 'tops', slot: 'top', color: 'red', box: '52 150 136 130',
      draw: (c, h) => D.pair(D.shape(c, tshirtSleeve, h) + D.detail(c, 'M68,194 C77,202 88,206 98,205', h)) +
        D.shape(c, 'M80,184 C80,170 90,162 104,162 L110,162 Q120,174 130,162 L136,162 C150,162 160,170 160,184 L162,264 Q162,272 154,272 L86,272 Q78,272 78,264 Z', h) +
        D.detail(c, 'M105,163 Q120,182 135,163', h) },
    { id: 'pants', word: 'pants', plural: true, cat: 'bottoms', slot: 'bottom', color: 'blue', box: '64 236 112 104',
      draw: (c, h) => D.shape(c, 'M84,244 L156,244 L160,328 Q160,332 156,332 L126,332 Q122,332 122,328 L120,278 L118,328 Q118,332 114,332 L84,332 Q80,332 80,328 Z', h) +
        D.detail(c, 'M83,257 L157,257 M120,257 L120,276', h) },
    { id: 'shoes', word: 'shoes', plural: true, cat: 'feet', slot: 'shoes', color: 'brown', box: '76 316 88 42',
      draw: (c, h) => D.pair(D.shape(c, 'M84,342 C84,328 93,325 104,325 C114,325 119,330 119,338 L119,344 Q119,350 114,350 L89,350 Q84,350 84,344 Z', h) +
        D.detail(c, 'M86,342 L117,342 M99,330 L107,333', h)) }
  ];

  D.item = id => D.ITEMS.find(i => i.id === id);

  /* ---------- words ---------- */
  D.article = word => (/^[aeiou]/i.test(word) ? 'an' : 'a');
  /* "a red T-shirt" / "blue pants" */
  D.phrase = function (item, color) {
    const words = color + ' ' + item.word;
    return item.plural ? words : D.article(words) + ' ' + words;
  };
  D.list = function (parts) {
    if (parts.length < 2) return parts.join('');
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  };
  D.worn = function (ch) {
    const wear = ch.wear || {};
    return D.SAY_ORDER.filter(s => wear[s] && D.item(wear[s].id))
      .map(s => ({ slot: s, item: D.item(wear[s].id), color: wear[s].color }));
  };
  D.sentence = function (ch) {
    const parts = D.worn(ch).map(w => D.phrase(w.item, w.color));
    return parts.length ? "I'm wearing " + D.list(parts) + '.' : "Let's get dressed!";
  };

  /* ---------- rendering ---------- */
  D.layers = function (ch, mode) {
    const c = D.ctx(mode);
    const hair = D.find(D.HAIRS, ch.hair);
    const face = D.find(D.FACES, ch.face);
    const hc = D.HAIR;
    const L = {
      hairBack: hair.back ? hair.back(c, hc) : '',
      body: D.drawBody(c),
      face: face.draw(c) + D.bodyFace(c, ch.body),
      hairFront: hair.front ? hair.front(c, hc) : ''
    };
    const wear = ch.wear || {};
    for (const slot in wear) {
      const it = D.item(wear[slot].id);
      if (it) L[slot] = it.draw(c, D.hex(wear[slot].color));
    }
    return L;
  };

  D.render = function (ch, mode, opts) {
    opts = opts || {};
    const L = D.layers(ch, mode);
    const only = opts.only;
    const body = D.LAYERS.filter(k => L[k] && (!only || only.includes(k)))
      .map(k => `<g data-layer="${k}">${L[k]}</g>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${opts.box || D.VIEW}" class="${opts.cls || ''}" aria-hidden="true">${body}</svg>`;
  };

  /* icon of one item on its own */
  D.icon = function (id, color, mode) {
    const it = D.item(id);
    const c = D.ctx(mode);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${it.box}" aria-hidden="true">${it.draw(c, D.hex(color || it.color))}</svg>`;
  };
})(window.DUB);
