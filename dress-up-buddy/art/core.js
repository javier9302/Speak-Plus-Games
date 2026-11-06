/* Dress Up Buddy — shared drawing helpers.
   Every piece of art is drawn on the same 240 × 380 canvas, so all layers line up.
   Two modes: 'color' (screen) and 'line' (print: white fills, black lines only). */
window.DUB = window.DUB || {};
(function (D) {
  'use strict';

  D.VIEW = '0 0 240 380';

  D.COLORS = [
    { id: 'red', hex: '#E53935' },
    { id: 'blue', hex: '#1E88E5' },
    { id: 'yellow', hex: '#FDD835' },
    { id: 'green', hex: '#43A047' },
    { id: 'orange', hex: '#FB8C00' },
    { id: 'purple', hex: '#8E24AA' },
    { id: 'pink', hex: '#F48FB1' },
    { id: 'black', hex: '#3A3A3A' },
    { id: 'white', hex: '#FFFFFF' },
    { id: 'brown', hex: '#8D6E63' }
  ];
  D.hex = function (id) {
    const c = D.COLORS.find(x => x.id === id);
    return c ? c.hex : id;
  };

  /* Drawing context. c.fill() turns every color into white in line mode. */
  D.ctx = function (mode) {
    const line = mode === 'line';
    const ol = line ? '#000000' : '#2B2B2B';
    return {
      line,
      ol,
      sw: line ? 6 : 5,
      fill: hex => (line ? '#FFFFFF' : hex),
      /* lines drawn on top of a filled shape (seams, pockets): visible on black too */
      on: hex => (line ? '#000000' : (hex === '#3A3A3A' ? '#9A9A9A' : ol))
    };
  };

  D.shape = function (c, d, hex) {
    return `<path d="${d}" fill="${c.fill(hex)}" stroke="${c.ol}" stroke-width="${c.sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
  };
  D.circle = function (c, x, y, r, hex) {
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c.fill(hex)}" stroke="${c.ol}" stroke-width="${c.sw}"/>`;
  };
  D.ellipse = function (c, x, y, rx, ry, hex) {
    return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c.fill(hex)}" stroke="${c.ol}" stroke-width="${c.sw}"/>`;
  };
  /* thin detail line on top of a shape of color hex */
  D.detail = function (c, d, hex, w) {
    return `<path d="${d}" fill="none" stroke="${c.on(hex)}" stroke-width="${w || 3.5}" stroke-linecap="round" stroke-linejoin="round"/>`;
  };
  /* black pupils, dots: solid ink in both modes */
  D.ink = function (c, d) {
    return `<path d="${d}" fill="${c.ol}" stroke="none"/>`;
  };
  /* a rounded limb: thick outline line + thinner fill line on top */
  D.limb = function (c, x1, y1, x2, y2, w, hex) {
    const l = (sw, col) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`;
    return l(w, c.ol) + l(w - 2 * c.sw, c.fill(hex));
  };
  /* left/right symmetry around the body's center line (x = 120) */
  D.mirror = function (inner) {
    return `<g transform="matrix(-1 0 0 1 240 0)">${inner}</g>`;
  };
  D.pair = function (inner) {
    return inner + D.mirror(inner);
  };
})(window.DUB);
