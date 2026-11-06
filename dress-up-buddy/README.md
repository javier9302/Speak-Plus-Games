# Dress Up Buddy

A dress-up app for young English learners (topic: "What we wear"). Each kid makes a character on a tablet or laptop, puts clothes on, and hears the English words ("T-shirt. I'm wearing a red T-shirt."). Then the teacher prints each character as a black-and-white coloring page.

- Plain HTML, CSS and JavaScript. No build, no server, no tracking. The only outside request is Google Fonts (Fredoka).
- All pictures are SVG drawn in code (`art/`). Every item is its own layer on the same body, so any mix fits.
- Characters are saved in this browser (localStorage, key `sp-dressup-v1`). If the browser blocks saving, the app still works until the page is closed.
- Speech uses the browser's own English voice (Web Speech API). On iPad, turn off silent mode to hear it.

## Status

Step 1 of 3 is done: the base (3 body types, 2 hairstyles, 5 faces), 3 items (T-shirt, pants, shoes), colors, speech, Random, Talk, saving and printing (one character or all).
Still to come: the rest of the items, the Teacher button (delete, "Listen and dress", hide words).

## Files

| File | What it does |
|------|--------------|
| `index.html` | The screens: home (gallery), make, print preview |
| `style.css` | Screen layout and the A4 print page (`@media print`) |
| `app.js` | Saving, tabs, speech, Random, Talk, printing |
| `art/core.js` | Colors and drawing helpers (color mode / outline mode) |
| `art/body.js` | Body, faces, hair |
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

Press **Print** (one character) or **Print all** on the home screen (one page each). The preview shows A4 portrait pages: "Speak Plus", "My name is ___", the character in outline only, "I'm wearing ___." and 3 dotted handwriting lines. **Word list** adds small outline pictures of the clothes with the word under each. In the print dialog, choose A4 and turn off "Headers and footers" if your browser shows them.

## Checks

```bash
node dress-up-buddy/tests/test.mjs
```

Needs Node and Playwright (`npm i -D playwright && npx playwright install chromium`). It checks that each item covers the right body parts on all 3 body types without covering the face, that sentences use "a/an" (and no article for pants, shoes…), and that the print page has only black lines, white fills and black text. To look with your own eyes, open `tests/sheet.html`.
