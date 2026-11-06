/* Dress Up Buddy — base body, faces and hair.
   Body map (shared by all body types, so every clothing item fits all of them):
     head    circle (120, 92) r 60        ears (62, 100) and (178, 100)
     neck    x 110–130, y 140–172
     torso   x 86–154, y 166–262          arms (92,180)→(68,244) and mirror, hands r 11.5
     legs    x 104 and 136, y 256–328     feet ellipses (101, 338) and (139, 338) */
(function (D) {
  'use strict';

  D.SKIN = '#F9D9BF';
  D.HAIR = '#5D4037';
  D.UNDER = '#FFFFFF';
  D.BLUSH = '#F7A6B4';

  D.BODIES = [
    { id: 'boy', word: 'boy' },
    { id: 'girl', word: 'girl' },
    { id: 'neutral', word: 'kid' }
  ];

  D.drawBody = function (c) {
    const s = D.SKIN;
    let o = '';
    // legs and feet
    o += D.limb(c, 104, 256, 104, 328, 30, s) + D.limb(c, 136, 256, 136, 328, 30, s);
    o += D.ellipse(c, 101, 338, 16, 10, s) + D.ellipse(c, 139, 338, 16, 10, s);
    // arms and hands (behind the torso at the shoulder)
    o += D.limb(c, 92, 180, 68, 244, 26, s) + D.limb(c, 148, 180, 172, 244, 26, s);
    o += D.circle(c, 66, 250, 11.5, s) + D.circle(c, 174, 250, 11.5, s);
    // neck
    o += D.shape(c, 'M110,138 L130,138 L130,172 L110,172 Z', s);
    // underwear: shorts + undershirt
    o += D.shape(c, 'M86,244 L154,244 L156,270 Q140,276 124,270 L120,262 L116,270 Q100,276 84,270 Z', D.UNDER);
    o += D.shape(c, 'M88,184 C88,172 96,166 106,166 L112,166 Q120,176 128,166 L134,166 C144,166 152,172 152,184 L154,254 Q154,262 146,262 L94,262 Q86,262 86,254 Z', D.UNDER);
    // ears and head
    o += D.pair(D.circle(c, 62, 100, 13, s) + D.detail(c, 'M58,94 Q66,100 60,108', s, 3));
    o += D.circle(c, 120, 92, 60, s);
    return o;
  };

  /* ---------- faces ---------- */
  const EYE_L = 98, EYE_R = 142, EYE_Y = 102;
  const dotEyes = c => D.pair(`<ellipse cx="${EYE_L}" cy="${EYE_Y}" rx="7" ry="9" fill="${c.ol}"/><circle cx="${EYE_L + 2.5}" cy="${EYE_Y - 3.5}" r="2.6" fill="#FFFFFF"/>`);

  D.FACES = [
    { id: 'happy', word: 'happy',
      draw: c => dotEyes(c) + D.detail(c, 'M104,122 Q120,138 136,122', D.SKIN, 4.5) },
    { id: 'surprised', word: 'surprised',
      draw: c => D.pair(D.circle(c, EYE_L, EYE_Y, 10, '#FFFFFF') + `<circle cx="${EYE_L}" cy="${EYE_Y}" r="4.8" fill="${c.ol}"/>`) +
        D.ellipse(c, 120, 129, 7, 9, '#9C3B3B') },
    { id: 'silly', word: 'silly',
      draw: c => `<ellipse cx="${EYE_L}" cy="${EYE_Y}" rx="7" ry="9" fill="${c.ol}"/><circle cx="${EYE_L + 2.5}" cy="${EYE_Y - 3.5}" r="2.6" fill="#FFFFFF"/>` +
        D.detail(c, `M${EYE_R - 9},${EYE_Y + 2} Q${EYE_R},${EYE_Y - 8} ${EYE_R + 9},${EYE_Y + 2}`, D.SKIN, 4.5) +
        D.shape(c, 'M112,126 L128,126 L128,134 Q120,146 112,134 Z', '#F48FB1') +
        D.detail(c, 'M102,120 Q120,134 138,120', D.SKIN, 4.5) + D.detail(c, 'M120,128 L120,136', '#F48FB1', 2.5) },
    { id: 'cool', word: 'cool',
      draw: c => D.pair(`<path d="M${EYE_L - 8},${EYE_Y - 1} L${EYE_L + 8},${EYE_Y - 1} A8,8 0 0 1 ${EYE_L - 8},${EYE_Y - 1} Z" fill="${c.ol}"/>`) +
        D.pair(D.detail(c, `M${EYE_L - 10},${EYE_Y - 4} L${EYE_L + 10},${EYE_Y - 4}`, D.SKIN, 4)) +
        D.detail(c, 'M106,126 Q124,132 136,120', D.SKIN, 4.5) },
    { id: 'sleepy', word: 'sleepy',
      draw: c => D.pair(D.detail(c, `M${EYE_L - 9},${EYE_Y} Q${EYE_L},${EYE_Y + 7} ${EYE_L + 9},${EYE_Y}`, D.SKIN, 4.5)) +
        D.ellipse(c, 120, 127, 5, 5.5, '#9C3B3B') +
        D.detail(c, 'M166,34 L178,34 L166,46 L178,46 M184,18 L193,18 L184,27 L193,27', D.SKIN, 3.5) }
  ];

  /* features that come with the body type */
  D.bodyFace = function (c, body) {
    let o = '';
    if (!c.line) o += D.pair(`<ellipse cx="80" cy="121" rx="9" ry="5.5" fill="${D.BLUSH}" opacity=".8"/>`);
    if (body === 'boy') o += D.pair(D.detail(c, 'M89,84 Q98,79 107,84', D.SKIN, 4.5));
    if (body === 'girl') o += D.pair(D.detail(c, 'M90,97 L84,92 M92,93 L88,87', D.SKIN, 3));
    return o;
  };

  /* ---------- hair: back part (behind the body) and front part ---------- */
  D.HAIRS = [
    { id: 'short', word: 'short hair',
      front: (c, h) => D.shape(c, 'M58,104 C50,52 82,24 120,24 C158,24 190,52 182,104 C176,92 170,82 163,76 C150,86 132,82 120,70 C108,82 88,88 77,78 C70,86 62,96 58,104 Z', h) },
    { id: 'long', word: 'long hair',
      back: (c, h) => D.shape(c, 'M56,96 C50,44 88,22 120,22 C152,22 190,44 184,96 L190,196 Q186,206 174,204 L150,200 L148,170 L92,170 L90,200 L66,204 Q54,206 50,196 Z', h),
      front: (c, h) => D.shape(c, 'M60,106 C54,54 84,26 120,26 C156,26 186,54 180,106 C178,92 172,80 165,74 Q158,92 145,76 Q134,92 122,76 Q110,92 98,77 Q88,92 76,76 C68,84 62,94 60,106 Z', h) }
  ];

  D.find = (list, id) => list.find(x => x.id === id) || list[0];
})(window.DUB);
