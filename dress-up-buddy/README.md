# Dress Up Buddy

A dress-up app for young English learners (topic: "What we wear"). Each kid makes a character on a tablet or laptop, puts clothes on, and hears the English words ("T-shirt. I'm wearing a red T-shirt."). Then the teacher prints each character as a black-and-white coloring page.

- Plain HTML, CSS and JavaScript. No build, no server, no tracking. The only outside request is Google Fonts (Fredoka).
- All pictures are SVG drawn in code (`art/`). Every item is its own layer on the same body, so any mix fits.
- Characters are saved in this browser (localStorage, key `sp-dressup-v1`). If the browser blocks saving, the app still works until the page is closed.
- Speech uses the browser's own English voice (Web Speech API). On iPad, turn off silent mode to hear it.

## What's inside

- **Home:** "New" makes a character; the gallery shows saved characters (tap one to keep dressing it). "Print all" prints them all, one per page. "Teacher" opens the teacher tools.
- **Make:** name (English or Japanese, optional), then picture tabs:
  - body (boy, girl, kid) + 5 skin tones · hair (14 styles: short, long, bob, pigtails, ponytail, bun, curly, bowl, buzz, princess (hime cut), buns, side tail, braids, spiky) + 6 hair colors · face (happy, surprised, silly, cool, sleepy). Choosing these is silent.
  - tops (T-shirt, shirt, sweater, hoodie) · coats (jacket, coat) · bottoms (pants, jeans, shorts, skirt, dress) · feet (socks, shoes, sneakers, boots) · more (hat, cap, scarf, gloves, glasses, bag).
  - One item per slot. Socks and shoes are separate slots; hat and cap share the head (only one at a time); the other accessories can all be worn together.
  - Tap an item: it goes on, the word appears big and is spoken with a sentence ("Sweater. I'm wearing a green sweater."). Tap it again to take it off. Pick one of 10 colors; the color name is spoken.
  - **Random** dresses the character. **Talk** shows and reads the whole outfit: "I'm wearing a yellow hat, a red coat, blue jeans and black boots."
- **Teacher:**
  - **Listen and dress:** the app says "Put on a yellow hat!" (the speaker button repeats it, the arrow skips). When the kid does it, a big star and a happy sound (made with Web Audio). It uses a new buddy that is not saved.
  - **Words on buttons:** off = icons only, for listening practice.
  - Delete one character (tap Delete, then "Sure?") or all.

## Files

| File | What it does |
|------|--------------|
| `index.html` | The screens: home (gallery), make, print preview |
| `style.css` | Screen layout and the A4 print page (`@media print`) |
| `app.js` | Saving, tabs, speech, Random, Talk, printing, teacher tools, Listen and dress |
| `art/core.js` | Colors and drawing helpers (color mode / outline mode) |
| `art/body.js` | Body, skin tones, faces, hair styles and colors |
| `art/clothes.js` | Clothes, layer order, sentences, rendering |
| `tests/sheet.html` | Fit check: every item on every body, in color and outline |
| `tests/test.mjs` | Automatic checks (fit, a/an, outline-only print) |

Layer order, back to front: back hair, body, face, socks, bottoms, shoes, tops, coats, gloves, scarf, bag, front hair, glasses, hat/cap.

## Run it on your computer

Open `dress-up-buddy/index.html` in Chrome, Edge or Safari (double-click it). Nothing to install.

## Publish it with GitHub Pages (free)

1. Push this repository to GitHub (the `main` branch).
2. On GitHub, open the repository and go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose **Branch: main** and folder **/ (root)**, then press **Save**.
5. Wait 1–2 minutes. The page shows your address, for example
   `https://<your-user>.github.io/Speak-Plus-Games/`.
   Dress Up Buddy is at `https://<your-user>.github.io/Speak-Plus-Games/dress-up-buddy/`
   (it is also on the games menu).

The empty `.nojekyll` file at the root of the repository tells GitHub Pages to serve the files as they are.

Each tablet keeps its own saved characters (they are not shared between devices).

## Printing

Press **Print** (one character) or **Print all** on the home screen (one page each). The preview shows A4 portrait pages: "My name is ___", the character in outline only, "I'm wearing ___." and 3 dotted handwriting lines. **Word list** adds small outline pictures of the clothes with the word under each. In the print dialog, choose A4 and turn off "Headers and footers" if your browser shows them.

## Checks

```bash
node dress-up-buddy/tests/test.mjs
```

Needs Node and Playwright (`npm i -D playwright && npx playwright install chromium`). It checks that each item covers the right body parts on all 3 body types without covering the face, that sentences use "a/an" (and no article for pants, shoes…), and that the print page has only black lines, white fills and black text. To look with your own eyes, open `tests/sheet.html`.
