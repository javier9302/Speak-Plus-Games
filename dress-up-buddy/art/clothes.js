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

  /* shared shapes */
  const TOP = 'M80,184 C80,170 90,162 104,162 L110,162 Q120,174 130,162 L136,162 C150,162 160,170 160,184 L162,264 Q162,272 154,272 L86,272 Q78,272 78,264 Z';
  const SHORT_SLEEVE = 'M104,165 L86,167 C76,176 70,188 63,201 C72,210 87,215 99,213 L106,190 Z';
  const LONG_SLEEVE = 'M106,166 L88,167 C78,176 64,206 54,230 Q53,237 60,240 L81,247 Q87,248 89,243 L104,196 Z';
  const COAT_SLEEVE = 'M110,162 L84,162 C68,172 56,202 47,228 Q45,238 55,242 L84,253 Q92,254 94,247 L110,196 Z';
  const PANTS = 'M84,244 L156,244 L160,328 Q160,332 156,332 L126,332 Q122,332 122,328 L120,278 L118,328 Q118,332 114,332 L84,332 Q80,332 80,328 Z';
  const SHOE = 'M84,342 C84,328 93,325 104,325 C114,325 119,330 119,338 L119,344 Q119,350 114,350 L89,350 Q84,350 84,344 Z';
  const longSleeves = (c, h, cuff) => D.pair(D.shape(c, LONG_SLEEVE, h) + D.detail(c, 'M58,224 L88,235' + (cuff || ''), h));
  const buttons = (c, x, ys) => ys.map(y => `<circle cx="${x}" cy="${y}" r="3.2" fill="${c.ol}"/>`).join('');

  D.ITEMS = [
    /* ---- tops ---- */
    { id: 'tshirt', word: 'T-shirt', cat: 'tops', slot: 'top', color: 'red', box: '52 150 136 130',
      draw: (c, h) => D.pair(D.shape(c, SHORT_SLEEVE, h) + D.detail(c, 'M68,194 C77,202 88,206 98,205', h)) +
        D.shape(c, TOP, h) + D.detail(c, 'M105,163 Q120,182 135,163', h) },
    { id: 'shirt', word: 'shirt', cat: 'tops', slot: 'top', color: 'white', box: '46 150 148 130',
      draw: (c, h) => longSleeves(c, h) + D.shape(c, TOP, h) +
        D.detail(c, 'M120,176 L120,270 M94,198 L110,198 L110,212 Q102,216 94,212 Z', h) + buttons(c, 120, [192, 214, 236, 256]) +
        D.pair(D.shape(c, 'M110,160 L120,176 L102,184 L98,164 Z', h)) },
    { id: 'sweater', word: 'sweater', cat: 'tops', slot: 'top', color: 'green', box: '46 150 148 130',
      draw: (c, h) => longSleeves(c, h, ' M62,232 L60,238 M70,235 L68,241 M78,238 L76,244') + D.shape(c, TOP, h) +
        D.detail(c, 'M102,163 Q120,186 138,163 M80,258 L160,258 M90,258 L90,270 M105,258 L105,270 M120,258 L120,270 M135,258 L135,270 M150,258 L150,270', h) +
        D.detail(c, 'M82,212 L92,202 L102,212 L112,202 L122,212 L132,202 L142,212 L152,202 L158,208', h) },
    { id: 'hoodie', word: 'hoodie', cat: 'tops', slot: 'top', color: 'purple', box: '46 146 148 134',
      draw: (c, h) => longSleeves(c, h) + D.shape(c, TOP, h) +
        D.shape(c, 'M90,170 Q120,148 150,170 Q144,192 120,190 Q96,192 90,170 Z', h) +
        D.detail(c, 'M112,186 L110,210 M128,186 L130,210 M96,232 L144,232 L152,262 L88,262 Z', h) +
        `<circle cx="110" cy="213" r="3.4" fill="${c.ol}"/><circle cx="130" cy="213" r="3.4" fill="${c.ol}"/>` },

    /* ---- coats ---- */
    { id: 'jacket', word: 'jacket', cat: 'outer', slot: 'outer', color: 'blue', box: '40 148 160 142',
      draw: (c, h) => D.pair(D.shape(c, COAT_SLEEVE, h) + D.detail(c, 'M52,222 L87,236', h) +
        D.shape(c, 'M104,160 L113,160 L120,200 L120,282 L82,282 Q74,282 74,274 L76,182 C76,168 90,160 104,160 Z', h) +
        D.detail(c, 'M113,160 L104,188 L119,202 M86,248 L106,248', h)) },
    { id: 'coat', word: 'coat', cat: 'outer', slot: 'outer', color: 'brown', box: '40 146 160 172',
      draw: (c, h) => D.pair(D.shape(c, COAT_SLEEVE, h) + D.detail(c, 'M52,222 L87,236', h)) +
        D.shape(c, 'M74,180 C74,166 88,158 104,158 L136,158 C152,158 166,166 166,180 L170,304 Q170,312 162,312 L78,312 Q70,312 70,304 Z', h) +
        D.pair(D.shape(c, 'M104,156 L120,178 L100,190 L92,162 Z', h)) +
        D.detail(c, 'M120,180 L120,312 M84,272 L102,272 M138,272 L156,272', h) + buttons(c, 128, [200, 228, 256, 284]) },

    /* ---- bottoms ---- */
    { id: 'pants', word: 'pants', plural: true, cat: 'bottoms', slot: 'bottom', color: 'blue', box: '64 236 112 104',
      draw: (c, h) => D.shape(c, PANTS, h) + D.detail(c, 'M83,257 L157,257 M120,257 L120,276', h) },
    { id: 'jeans', word: 'jeans', plural: true, cat: 'bottoms', slot: 'bottom', color: 'blue', box: '64 236 112 104',
      draw: (c, h) => D.shape(c, PANTS, h) +
        D.detail(c, 'M83,257 L157,257 M120,257 L120,278 M88,258 Q100,264 104,258 M152,258 Q140,264 136,258 M81,320 L118,320 M122,320 L159,320', h) +
        D.detail(c, 'M100,282 L100,316 M140,282 L140,316', h, 2.5) },
    { id: 'shorts', word: 'shorts', plural: true, cat: 'bottoms', slot: 'bottom', color: 'green', box: '64 236 112 66',
      draw: (c, h) => D.shape(c, 'M84,244 L156,244 L160,292 Q160,296 156,296 L126,296 Q122,296 122,292 L120,276 L118,292 Q118,296 114,296 L84,296 Q80,296 80,292 Z', h) +
        D.detail(c, 'M83,257 L157,257 M120,257 L120,276', h) },
    { id: 'skirt', word: 'skirt', cat: 'bottoms', slot: 'bottom', color: 'pink', box: '60 236 120 80',
      draw: (c, h) => D.shape(c, 'M86,244 L154,244 L172,302 Q120,316 68,302 Z', h) +
        D.detail(c, 'M84,256 L156,256 M100,258 L92,306 M120,258 L120,309 M140,258 L148,306', h) },
    { id: 'dress', word: 'dress', cat: 'bottoms', slot: 'bottom', color: 'yellow', box: '56 150 128 172',
      draw: (c, h) => D.pair(D.shape(c, 'M104,165 L86,167 C78,174 74,182 70,192 C78,200 90,202 100,198 L104,182 Z', h)) +
        D.shape(c, 'M80,184 C80,170 90,162 104,162 L110,162 Q120,174 130,162 L136,162 C150,162 160,170 160,184 L158,236 L176,308 Q120,322 64,308 L82,236 Z', h) +
        D.detail(c, 'M82,236 L158,236 M105,163 Q120,182 135,163 M100,240 L92,312 M140,240 L148,312', h) +
        D.shape(c, 'M120,236 L106,228 L106,244 Z M120,236 L134,228 L134,244 Z', h) },

    /* ---- feet ---- */
    { id: 'socks', word: 'socks', plural: true, cat: 'feet', slot: 'socks', color: 'white', box: '76 290 88 66',
      draw: (c, h) => D.pair(D.shape(c, 'M89,296 L119,296 L119,340 Q119,349 110,349 L92,349 Q83,349 83,341 Q83,333 89,330 Z', h) +
        D.detail(c, 'M89,306 L119,306 M89,312 L119,312', h)) },
    { id: 'shoes', word: 'shoes', plural: true, cat: 'feet', slot: 'shoes', color: 'brown', box: '76 316 88 42',
      draw: (c, h) => D.pair(D.shape(c, SHOE, h) + D.detail(c, 'M86,342 L117,342 M99,330 L107,333', h)) },
    { id: 'sneakers', word: 'sneakers', plural: true, cat: 'feet', slot: 'shoes', color: 'red', box: '76 314 88 44',
      draw: (c, h) => D.pair(D.shape(c, 'M84,342 C84,326 94,320 104,321 C114,322 120,330 120,338 L120,342 Z', h) +
        D.shape(c, 'M82,341 L121,341 L121,347 Q121,352 116,352 L87,352 Q82,352 82,347 Z', '#FFFFFF') +
        D.detail(c, 'M100,325 L108,331 M100,331 L108,325 M88,336 Q100,332 116,338', h, 3)) },
    { id: 'boots', word: 'boots', plural: true, cat: 'feet', slot: 'shoes', color: 'black', box: '72 288 96 68',
      draw: (c, h) => D.pair(D.shape(c, 'M79,294 L120,294 L120,344 Q120,350 114,350 L88,350 Q82,350 82,344 L82,338 Q79,334 79,328 Z', h) +
        D.detail(c, 'M79,304 L120,304 M83,342 L119,342', h)) },

    /* ---- accessories ---- */
    { id: 'hat', word: 'hat', cat: 'acc', slot: 'head', color: 'yellow', box: '34 14 172 72',
      draw: (c, h) => D.shape(c, 'M74,62 C74,18 166,18 166,62 Z', h) + D.detail(c, 'M76,50 Q120,42 164,50', h, 6) +
        D.shape(c, 'M40,64 Q120,44 200,64 Q208,74 194,78 Q120,64 46,78 Q32,74 40,64 Z', h) },
    { id: 'cap', word: 'cap', cat: 'acc', slot: 'head', color: 'blue', box: '44 12 152 82',
      draw: (c, h) => D.shape(c, 'M64,76 C60,32 90,20 120,20 C150,20 180,32 176,76 Q120,64 64,76 Z', h) +
        D.detail(c, 'M120,22 L120,66 M120,22 Q96,30 92,70 M120,22 Q144,30 148,70', h, 3) +
        D.shape(c, 'M60,74 Q120,60 180,74 Q198,82 190,90 Q120,76 50,90 Q42,82 60,74 Z', h) +
        D.circle(c, 120, 20, 4.5, h) },
    { id: 'glasses', word: 'glasses', plural: true, cat: 'acc', slot: 'glasses', color: 'black', box: '56 76 128 52',
      draw: (c, h) => {
        const ring = (sw, col) => `<g fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"><circle cx="98" cy="102" r="15"/><circle cx="142" cy="102" r="15"/><path d="M113,100 Q120,93 127,100 M83,99 L64,95 M157,99 L176,95"/></g>`;
        return ring(9, c.ol) + ring(4, c.fill(h));
      } },
    { id: 'scarf', word: 'scarf', cat: 'acc', slot: 'scarf', color: 'red', box: '76 146 88 92',
      draw: (c, h) => D.shape(c, 'M128,180 L144,180 L148,226 L130,228 Z', h) + D.detail(c, 'M134,228 L134,234 M140,227 L141,233 M146,226 L147,232 M129,196 L145,194 M130,208 L146,206', h, 3) +
        D.shape(c, 'M92,158 Q120,176 148,158 Q158,168 152,182 Q120,198 88,182 Q82,168 92,158 Z', h) +
        D.detail(c, 'M100,176 L100,186 M120,182 L120,192 M140,176 L140,186', h, 3) },
    { id: 'gloves', word: 'gloves', plural: true, cat: 'acc', slot: 'gloves', color: 'orange', box: '42 222 156 52',
      draw: (c, h) => D.pair(D.shape(c, 'M54,240 Q52,264 66,266 Q80,265 79,247 L77,236 L57,232 Z', h) +
        D.shape(c, 'M76,244 Q88,242 85,253 Q83,258 77,256', h) + D.detail(c, 'M55,241 L78,245', h, 3)) },
    { id: 'bag', word: 'bag', cat: 'acc', slot: 'bag', color: 'orange', box: '84 160 104 144',
      draw: (c, h) => D.limb(c, 96, 172, 152, 264, 11, h) +
        D.shape(c, 'M136,262 L178,262 L180,296 Q180,302 174,302 L142,302 Q136,302 136,296 Z', h) +
        D.shape(c, 'M136,262 L178,262 L177,280 Q158,288 137,280 Z', h) +
        D.circle(c, 157, 283, 4, h) }
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
    const hc = (D.HAIR_COLORS.find(x => x.id === ch.hairColor) || D.HAIR_COLORS[1]).hex;
    const skin = (D.SKINS.find(x => x.id === ch.skin) || D.SKINS[1]).hex;
    const L = {
      hairBack: hair.back ? hair.back(c, hc) : '',
      body: D.drawBody(c, skin),
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
