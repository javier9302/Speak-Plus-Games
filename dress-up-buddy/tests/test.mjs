/* Dress Up Buddy checks (needs Node and Playwright with Chromium):
     node tests/test.mjs
   1. Every item lines up on every body type: the body parts it must cover are hidden.
   2. Sentences use a/an and no article for plural items.
   3. The print preview is outline only: black lines, white fills, black text. */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };

/* points on the 240 × 380 body map that each slot must cover */
const COVER = {
  top: [[120, 190], [92, 186], [148, 186], [96, 240], [144, 240], [120, 262]],
  outer: [[120, 200], [92, 186], [148, 186], [120, 262]],
  bottom: [[100, 268], [140, 268], [104, 284], [136, 284]],
  shoes: [[101, 340], [139, 340], [90, 338], [150, 338]],
  socks: [[104, 324], [136, 324], [101, 340], [139, 340]],
  head: [[120, 36]], glasses: [[98, 87], [142, 87], [120, 96]], scarf: [[120, 178], [137, 210]],
  gloves: [[66, 252], [174, 252]], bag: [[158, 290], [124, 218]]
};
/* long sleeves also cover the arm */
const SLEEVES = ['shirt', 'sweater', 'hoodie', 'jacket', 'coat'];
const ARMS = [[80, 212], [160, 212], [72, 232], [168, 232]];
/* areas where the white undershirt / shorts must never show */
const HIDE = { top: [90, 170, 150, 258], outer: [90, 170, 150, 258], bottom: [90, 248, 150, 266] };
/* where a coat may let the top show (open jacket front, neckline) */
const OPEN = { jacket: [113, 150, 127, 284], coat: [104, 150, 136, 166] };
/* points no clothing may cover (the face) */
const FACE = [[98, 110], [142, 110], [120, 124]];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1300 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + root + '/index.html');

/* ---- 1. fit ---- */
const fit = await page.evaluate(({ COVER, FACE, SLEEVES, ARMS, HIDE, OPEN }) => {
  const D = window.DUB, res = [];
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:480px;height:760px;z-index:99;background:#fff';
  document.body.appendChild(host);
  const hit = (x, y) => {
    const el = document.elementFromPoint(x * 2, y * 2);
    const g = el && el.closest('[data-layer]');
    return g ? g.dataset.layer : null;
  };
  const sameBody = new Set();
  for (const b of D.BODIES) {
    host.innerHTML = D.render({ body: b.id, hair: 'short', face: 'happy', wear: {} }, 'color');
    host.firstChild.style.cssText = 'width:480px;height:760px;display:block';
    const bb = host.querySelector('[data-layer=body]').getBBox();
    sameBody.add([bb.x, bb.y, bb.width, bb.height].map(Math.round).join(','));
    for (const it of D.ITEMS) {
      host.innerHTML = D.render({ body: b.id, hair: 'short', face: 'happy', wear: { [it.slot]: { id: it.id, color: it.color } } }, 'color');
      host.firstChild.style.cssText = 'width:480px;height:760px;display:block';
      for (const [x, y] of COVER[it.slot] || []) {
        const l = hit(x, y);
        if (l !== it.slot && !(it.slot === 'head' && l === 'hairFront')) res.push(`${it.id} on ${b.id}: (${x},${y}) shows ${l}`);
      }
      if (SLEEVES.includes(it.id)) for (const [x, y] of ARMS) {
        const l = hit(x, y);
        if (l !== it.slot) res.push(`${it.id} on ${b.id}: sleeve misses the arm at (${x},${y}), shows ${l}`);
      }
      const h = HIDE[it.slot];
      if (h) for (let x = h[0]; x <= h[2]; x += 4) for (let y = h[1]; y <= h[3]; y += 4) {
        const o = OPEN[it.id];
        if (o && x >= o[0] && x <= o[2] && y >= o[1] && y <= o[3]) continue; // open jacket on its own
        if (hit(x, y) === 'body') { res.push(`${it.id} on ${b.id}: undershirt shows at (${x},${y})`); break; }
      }
      if (it.slot !== 'glasses') for (const [x, y] of FACE) {
        const l = hit(x, y);
        if (l === it.slot) res.push(`${it.id} on ${b.id}: covers the face at (${x},${y})`);
      }
    }
  }
  /* every coat over every top (and dress): the top only shows where the coat is open */
  for (const b of D.BODIES) for (const o of D.ITEMS.filter(i => i.slot === 'outer')) {
    for (const t of D.ITEMS.filter(i => i.slot === 'top' || i.id === 'dress')) {
      host.innerHTML = D.render({ body: b.id, hair: 'short', face: 'happy', wear: { outer: { id: o.id, color: 'red' }, [t.slot]: { id: t.id, color: 'blue' } } }, 'color');
      host.firstChild.style.cssText = 'width:480px;height:760px;display:block';
      const open = OPEN[o.id];
      let bad = 0;
      for (let x = 30; x <= 210; x += 3) for (let y = 150; y <= (t.id === 'dress' ? 236 : 280); y += 3) {
        if (hit(x, y) === t.slot && !(x >= open[0] && x <= open[2] && y >= open[1] && y <= open[3])) { bad++; if (bad === 1) res.push(`${o.id} over ${t.id} on ${b.id}: ${t.id} shows at (${x},${y})`); }
      }
    }
  }
  for (const b of D.BODIES) for (const sh of D.ITEMS.filter(i => i.slot === 'shoes')) {
    host.innerHTML = D.render({ body: b.id, hair: 'short', face: 'happy', wear: { socks: { id: 'socks', color: 'red' }, shoes: { id: sh.id, color: 'blue' } } }, 'color');
    host.firstChild.style.cssText = 'width:480px;height:760px;display:block';
    for (let x = 80; x <= 160; x += 2) for (let y = 342; y <= 352; y += 2) {
      if (hit(x, y) === 'socks') { res.push(`${sh.id} on ${b.id}: sock shows under the shoe at (${x},${y})`); x = 999; break; }
    }
  }
  if (sameBody.size !== 1) res.push('body types have different skeletons: ' + [...sameBody].join(' | '));
  host.remove();
  return { res, items: D.ITEMS.length, bodies: D.BODIES.length };
}, { COVER, FACE, SLEEVES, ARMS, HIDE, OPEN });
fit.res.forEach(r => ok(false, r));
console.log(`fit: ${fit.items} items × ${fit.bodies} bodies checked`);

/* ---- 2. sentences ---- */
const words = await page.evaluate(() => {
  const D = window.DUB;
  return D.ITEMS.map(it => ({ plural: !!it.plural, word: it.word, red: D.phrase(it, 'red'), orange: D.phrase(it, 'orange') }));
});
for (const w of words) {
  if (w.plural) ok(w.red === 'red ' + w.word && w.orange === 'orange ' + w.word, 'plural article: ' + w.red + ' / ' + w.orange);
  else ok(w.red === 'a red ' + w.word && w.orange === 'an orange ' + w.word, 'article: ' + w.red + ' / ' + w.orange);
}
const sent = await page.evaluate(() => window.DUB.sentence({ wear: { top: { id: 'tshirt', color: 'red' }, bottom: { id: 'pants', color: 'blue' }, shoes: { id: 'shoes', color: 'black' } } }));
ok(sent === "I'm wearing a red T-shirt, blue pants and black shoes.", 'sentence: ' + sent);
console.log('sentences:', sent);

/* ---- 3. print is outline only ---- */
await page.evaluate(() => {
  const D = window.DUB, wear = {};
  for (const it of D.ITEMS) if (!wear[it.slot]) wear[it.slot] = { id: it.id, color: 'green' };
  const list = D.BODIES.map(b => ({ name: 'Test', body: b.id, hair: 'long', face: 'happy', wear }));
  window.DUB.app.openPrint(list, 'home');
});
await page.emulateMedia({ media: 'print' });
const bad = await page.evaluate(() => {
  const out = [];
  const okPaint = v => v === 'none' || v === 'rgb(0, 0, 0)' || v === 'rgb(255, 255, 255)';
  const okBg = v => v === 'rgba(0, 0, 0, 0)' || v === 'rgb(255, 255, 255)';
  const visible = el => el.getClientRects().length > 0;
  document.querySelectorAll('.page, .page *').forEach(el => {
    const cs = getComputedStyle(el);
    if (el instanceof SVGElement && !(el instanceof SVGSVGElement) && el.tagName !== 'g') {
      if (!okPaint(cs.fill)) out.push(el.tagName + ' fill ' + cs.fill);
      if (!okPaint(cs.stroke)) out.push(el.tagName + ' stroke ' + cs.stroke);
      if (cs.opacity !== '1') out.push(el.tagName + ' opacity ' + cs.opacity);
    } else if (!(el instanceof SVGElement)) {
      if (cs.color !== 'rgb(0, 0, 0)') out.push(el.className + ' color ' + cs.color);
      if (!okBg(cs.backgroundColor)) out.push(el.className + ' background ' + cs.backgroundColor);
      if (cs.backgroundImage !== 'none') out.push(el.className + ' background-image');
    }
  });
  if (document.querySelectorAll('.page img').length) out.push('images in print');
  const ui = [...document.querySelectorAll('button, input')].filter(visible);
  if (ui.length) out.push(ui.length + ' buttons visible in print');
  return out;
});
[...new Set(bad)].forEach(b => ok(false, 'print: ' + b));
const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true });
const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
ok(pages === 3, `print all: expected 3 pages, got ${pages}`);
console.log(`print: outline only checked, ${pages} pages`);

errors.forEach(e => ok(false, 'page error: ' + e));
await browser.close();
console.log(fails ? `${fails} problem(s)` : 'All checks passed.');
process.exit(fails ? 1 : 0);
