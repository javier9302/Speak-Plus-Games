/* Dress Up Buddy — base body, faces and hair.
   Body map (shared by all body types, so every clothing item fits all of them):
     head    circle (120, 92) r 60        ears (62, 100) and (178, 100)
     neck    x 110–130, y 140–172
     torso   x 86–154, y 166–262          arms (92,180)→(68,244) and mirror, hands r 11.5
     legs    x 104 and 136, y 256–328     feet ellipses (101, 338) and (139, 338) */
(function (D) {
  'use strict';

  D.SKINS = [
    { id: 's1', hex: '#FCE3D0' }, { id: 's2', hex: '#F3C9A5' }, { id: 's3', hex: '#D9A07A' },
    { id: 's4', hex: '#A86E4B' }, { id: 's5', hex: '#6E452E' }
  ];
  D.HAIR_COLORS = [
    { id: 'black', hex: '#3B3536' }, { id: 'dark', hex: '#5D4037' }, { id: 'brown', hex: '#8D5A3B' },
    { id: 'blonde', hex: '#E8C15A' }, { id: 'ginger', hex: '#C1592B' }, { id: 'gray', hex: '#B9B4AE' }
  ];
  D.SKIN = '#F3C9A5'; // only used to pick detail-line colors on the face
  D.UNDER = '#FFFFFF';
  D.BLUSH = '#F7A6B4';

  D.BODIES = [
    { id: 'boy', word: 'boy' },
    { id: 'girl', word: 'girl' },
    { id: 'neutral', word: 'kid' }
  ];

  D.drawBody = function (c, s) {
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
        D.detail(c, 'M192,54 L204,54 L192,66 L204,66 M208,32 L217,32 L208,41 L217,41', D.SKIN, 3.5) }
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
  const part = (c, h) => D.shape(c, 'M60,104 C54,54 84,26 120,26 C156,26 186,54 180,104 C174,84 160,70 120,66 C80,70 66,84 60,104 Z', h) + D.detail(c, 'M120,30 L120,64', h, 3);
  const swoop = (c, h) => D.shape(c, 'M58,104 C50,52 82,24 120,24 C158,24 190,52 182,104 C176,92 170,82 163,76 C150,86 132,82 120,70 C108,82 88,88 77,78 C70,86 62,96 58,104 Z', h);
  const tie = (c, x, y) => D.circle(c, x, y, 7, '#F06292');

  D.HAIRS = [
    { id: 'short', word: 'short', front: swoop },
    { id: 'long', word: 'long',
      back: (c, h) => D.shape(c, 'M56,96 C50,44 88,22 120,22 C152,22 190,44 184,96 L190,196 Q186,206 174,204 L150,200 L148,170 L92,170 L90,200 L66,204 Q54,206 50,196 Z', h),
      front: (c, h) => D.shape(c, 'M60,106 C54,54 84,26 120,26 C156,26 186,54 180,106 C178,92 172,80 165,74 Q158,92 145,76 Q134,92 122,76 Q110,92 98,77 Q88,92 76,76 C68,84 62,94 60,106 Z', h) },
    { id: 'bob', word: 'bob',
      back: (c, h) => D.shape(c, 'M54,100 C48,44 88,22 120,22 C152,22 192,44 186,100 L188,142 Q172,152 156,142 L84,142 Q68,152 52,142 Z', h),
      front: (c, h) => D.shape(c, 'M60,104 C54,54 84,26 120,26 C156,26 186,54 180,104 C178,94 175,86 170,80 Q120,88 70,80 C65,86 62,94 60,104 Z', h) },
    { id: 'pigtails', word: 'pigtails',
      back: (c, h) => D.pair(D.shape(c, 'M60,82 C30,86 20,128 32,168 C38,184 54,178 50,160 C46,132 52,112 68,100 Z', h)),
      front: (c, h) => part(c, h) + tie(c, 60, 86) + tie(c, 180, 86) },
    { id: 'ponytail', word: 'ponytail',
      back: (c, h) => D.shape(c, 'M168,58 C204,66 212,120 200,164 C194,182 176,178 182,160 C190,128 184,100 162,84 Z', h) + tie(c, 172, 66),
      front: part },
    { id: 'bun', word: 'bun',
      back: (c, h) => D.circle(c, 120, 26, 17, h) + D.detail(c, 'M110,24 Q118,14 128,22 Q130,32 120,32', h, 3),
      front: part },
    { id: 'curly', word: 'curly',
      front: (c, h) => D.shape(c, 'M56,108 C40,98 42,76 54,68 C48,48 68,30 88,34 C96,18 120,14 133,26 C148,16 172,24 173,42 C192,46 198,68 187,80 C197,92 192,106 184,110 C178,98 170,90 160,86 C152,94 138,94 132,86 C124,96 108,96 102,86 C94,94 80,94 76,86 C68,92 60,100 56,108 Z', h) +
        D.detail(c, 'M76,56 Q84,48 92,56 M112,40 Q120,32 128,40 M148,56 Q156,48 164,56', h, 3) },
    { id: 'bowl', word: 'bowl',
      front: (c, h) => D.shape(c, 'M54,106 C46,50 82,22 120,22 C158,22 194,50 186,106 L175,106 Q172,90 166,84 Q120,90 74,84 Q68,90 65,106 Z', h) +
        D.detail(c, 'M98,32 Q90,56 92,82 M142,32 Q150,56 148,82', h, 3) },
    { id: 'buzz', word: 'buzz',
      front: (c, h) => D.shape(c, 'M62,92 C62,52 88,34 120,34 C152,34 178,52 178,92 C170,74 150,64 120,64 C90,64 70,74 62,92 Z', h) +
        [[90, 48], [104, 42], [120, 40], [136, 42], [150, 48], [78, 64], [162, 64], [112, 54], [128, 54], [96, 58], [144, 58]]
          .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="${c.on(h)}"/>`).join('') },
    { id: 'princess', word: 'princess',
      back: (c, h) => D.shape(c, 'M56,96 C50,44 88,22 120,22 C152,22 190,44 184,96 L188,212 L150,212 L148,170 L92,170 L90,212 L52,212 Z', h),
      front: (c, h) => D.pair(D.shape(c, 'M58,66 L77,66 L79,148 L59,148 Z', h)) +
        D.shape(c, 'M60,100 C54,52 84,26 120,26 C156,26 186,54 180,100 C178,92 175,86 170,82 L70,82 C65,86 62,92 60,100 Z', h) },
    { id: 'buns', word: 'buns',
      back: (c, h) => D.pair(D.circle(c, 78, 40, 19, h) + D.detail(c, 'M68,38 Q76,28 86,36 Q88,46 78,47', h, 3)),
      front: part },
    { id: 'sidetail', word: 'side tail',
      back: (c, h) => D.shape(c, 'M76,48 C40,54 28,104 38,152 C42,168 60,164 57,148 C53,118 58,90 78,70 Z', h),
      front: (c, h) => swoop(c, h) + tie(c, 70, 58) },
    { id: 'braids', word: 'braids',
      front: (c, h) => part(c, h) + D.pair(
        [114, 130, 146, 162, 178].map((y, i) => D.ellipse(c, i % 2 ? 62 : 58, y, 10, 9.5, h)).join('') +
        tie(c, 60, 192) + D.shape(c, 'M54,197 L66,197 L68,210 L52,210 Z', h)) },
    { id: 'spiky', word: 'spiky',
      front: (c, h) => D.shape(c, 'M58,104 C52,80 54,62 62,52 L54,32 L80,40 L84,16 L104,32 L120,10 L136,32 L156,16 L160,40 L186,32 L178,52 C186,62 188,80 182,104 C176,92 168,84 160,80 L150,88 L140,76 L128,86 L118,74 L108,86 L96,76 L86,88 L80,80 C70,86 62,94 58,104 Z', h) }
  ];

  D.find = (list, id) => list.find(x => x.id === id) || list[0];
})(window.DUB);
