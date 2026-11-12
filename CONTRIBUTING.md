# Contributing

Thank you for helping. This hub is used live in classrooms, so the bar is simple: a teacher must
be able to start your game mid-class in about a minute, and students must spend the game talking
(or listening, reading, writing), not just clicking.

*Resumen en español al final.*

## Ways to help

- **A content pack**: a word list, a City Run town, quiz questions. One JSON file in `packs/`. No code.
- **A translation**: add a language to `shared/strings.js` and each game's `strings.js`.
- **A new game**: a folder with an `index.html`, a `game.json` and a `card.svg`.
- **A bug report or a classroom report**: open an issue. "I tried it with 28 thirteen-year-olds and
  the scoreboard was too small" is exactly the kind of report we want.

## Rules every game follows

1. **Static and offline.** Plain HTML, CSS and JavaScript, no build step, no framework. It opens from
   a file (`file://`) or from GitHub Pages, and it requests nothing from other sites: no CDNs, no
   Google Fonts, no analytics. Fonts come from `shared/fonts/`. `node tools/check.mjs` enforces this.
2. **No student devices** unless the game is about them. A game that needs phones or a server goes
   in the "advanced" section (`needs.server: "node"`), like Lantern Island.
3. **Readable from the back of the room.** The play screen uses `clamp()` sizes; the main text is at
   least about 4% of the screen height. Buttons are at least 44 px.
4. **Mouse, touch and keyboard.** Every action has a button; keys are shortcuts, not the only way.
5. **All text in `strings.js`**, in English and Spanish, through `Kit.t('key')`. Content (words,
   questions, places) is not UI text: it comes from packs or from what the teacher types.
6. **Your own art.** Draw in SVG or code, or use openly licensed material and say where it comes
   from. Never characters from films, anime, comics or games, not even as pixel art.
7. **No personal data.** Settings stay in `localStorage` through `Kit.store`. Nothing about students
   leaves the browser.
8. **The neutral brand.** Use the colour tokens from `shared/styles.css` (`--fg`, `--primary`,
   `--accent`…), never a school's colours or logo directly. Put `<div data-logo></div>` where the
   logo goes, and `kit.js` fills it.

## Make a game in six steps

1. Copy `hot-seat/` to a new folder with a lowercase, dashed name, for example `my-game/`.
   Hot Seat is small on purpose and shows the whole pattern: settings, content box, saved classes,
   turn cards, pause, results, English and Spanish.
2. Change `index.html`, the game script and the CSS. Keep the four shared `<script>` tags at the top.
3. Rename every string key prefix (`hs.` → `mg.`) in `strings.js` and write both languages.
4. Edit `game.json` (see the next section) and draw `card.svg`.
5. Run:
   ```
   node tools/build.mjs     # updates shared/registry.js and shared/precache.js
   node tools/check.mjs     # must say "All checks passed."
   ```
6. Open `index.html`, find your card, and play it. Then try it on a projector or a tablet if you can.

## game.json

```json
{
  "$schema": "../tools/game.schema.json",
  "id": "my-game",
  "order": 80,
  "status": "experimental",
  "name": { "en": "My Game", "es": "Mi juego" },
  "summary": { "en": "One or two sentences: what students do.", "es": "…" },
  "entry": "index.html",
  "ages": [8, 99],
  "levels": ["A1", "A2", "B1"],
  "players": { "min": 2, "max": 40, "grouping": "teams" },
  "skills": ["speaking", "vocabulary"],
  "minutes": [5, 15],
  "setupMinutes": 1,
  "devices": { "teacher": ["laptop", "tablet"], "students": "none" },
  "needs": { "server": "none", "keyboard": false },
  "offline": true,
  "uiLanguages": ["en", "es"],
  "contentTypes": ["word-list"],
  "tags": { "en": ["Speaking", "Teams"], "es": ["Hablar", "Equipos"] },
  "authors": ["Your name"],
  "license": "MIT"
}
```

- `levels`: CEFR levels (`pre-A1` to `C2`). For non-language subjects, the language level needed.
- `players.grouping`: `individual`, `pairs`, `teams` or `co-op`.
- `devices.students`: `none`, `shared` (one device per child or group), `optional` or `required`.
- `needs.server`: `none` (opens from a file), `static` (needs a web address, like Trade Gate) or
  `node` (needs a Node.js server; add `"start": "cd my-game && npm install && npm start"`).
- `links`: extra buttons on the card, like `[{ "label": { "en": "Teacher sheet" }, "href": "sheet.html" }]`.
- The full schema is `tools/game.schema.json`; editors such as VS Code use it to suggest fields.

## card.svg

`viewBox="0 0 320 190"`, under 12 kB, no scripts and no external images. Colour it with these
classes so it follows the brand and dark mode: `f-fg f-muted f-surface f-field f-primary
f-primary-fg f-accent f-sky f-line f-good f-block f-block-fg f-white f-yellow` for fills,
`s-fg s-muted s-surface s-field s-line s-accent s-sky s-road` for strokes, plus `nofill`, `round`,
`dash`, `t-mid` (centred bold text) and `fall` (the falling animation). See `word-drop/card.svg`.

## Content packs

One file per pack in `packs/`, named after its `id`. Three types:

```json
{ "id": "es-en-food", "type": "word-list", "title": "Food: Spanish → English",
  "language": "en", "promptLanguage": "es", "subject": "English", "levels": ["A1"], "ages": [7, 99],
  "author": "Your name", "license": "CC-BY-4.0",
  "items": [ { "prompt": "manzana", "answer": "apple" }, { "prompt": "pan", "answer": "bread" } ] }
```

- `word-list`: `items` of `{prompt, answer}` (answer can be empty). Used by Word Drop and Hot Seat.
- `questions`: `items` of `{prompt, answer}` where `prompt` is the question. Used by City Run's Quiz doors.
- `places`: exactly the 12 buildings of a City Run town, `items` of `{icon, name, clue, code}`,
  plus `phrases` (the useful language shown during the game). See `packs/ciudad-es.json`.
- `language` is the language students speak or write. Teachers can also make a pack inside a
  game (**Save to file**) and send it to you.

Run `node tools/build.mjs` and `node tools/check.mjs` after adding a pack.

## Pull requests and review

1. Fork, make a branch, commit, and open a pull request. Fill in the template's checklist.
2. CI runs `node tools/check.mjs` and every game's own tests. It must be green.
3. The maintainer reads the code, plays the game, and checks the classroom points: setup time,
   readability from the back, how much students talk, groups of 2 and of 30.
4. New games are merged with `"status": "experimental"` and show a **New** label. After they have
   been used in a real class and any problems are fixed, they become `"stable"`.
5. Small fixes and packs are usually merged within a week. Please keep one game or one pack per
   pull request.

By contributing you agree that code is published under MIT and content under CC BY 4.0
(see [LICENSE-CONTENT.md](LICENSE-CONTENT.md)), and that you have the right to publish it.

Be kind and specific in issues and reviews. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Running the other tests

| Folder | Command |
|---|---|
| everything static | `node tools/check.mjs` |
| `trade-gate/` | `node trade-gate/tests/run.mjs` |
| `dress-up-buddy/` | `node dress-up-buddy/tests/test.mjs` |
| `speak-plus-city/` | `npm ci && npm test` (inside the folder) |
| `lantern-island/` | `npm ci && npm run check && npm test` (inside the folder; the tests take about 7 minutes) |
| `Commands/stealth-squad/` | `npm ci && npm run typecheck && npm run check-level` (inside the folder) |

---

## Resumen en español

- **Paquetes de contenido** (lo más fácil): un archivo JSON en `packs/` con una lista de palabras,
  un pueblo para Carrera en la ciudad o preguntas. Copia uno de los que hay, cambia el `id`, el
  título y los `items`, y ejecuta `node tools/build.mjs` y `node tools/check.mjs`. También puedes
  crear la lista dentro del juego, pulsar **Guardar en archivo** y abrir un issue con el archivo.
- **Traducciones**: añade el idioma en `shared/strings.js` y en cada `strings.js`.
- **Juegos nuevos**: copia la carpeta `hot-seat/`, cambia el juego, escribe `game.json` y
  `card.svg`, ejecuta las dos órdenes de arriba y abre un pull request.
- Reglas: sin servidor ni compilación, nada cargado desde otros sitios, textos grandes para leer
  desde el fondo del aula, botones de al menos 44 px, todo el texto en inglés y español, dibujos
  propios (nunca personajes de películas, anime o videojuegos) y ningún dato de estudiantes fuera
  del navegador.
- Los juegos nuevos entran como "Nuevo" (`experimental`) y pasan a `stable` después de probarlos
  en una clase real.
