# Classroom Games

Free games for language and content classes, for a teacher with a laptop and a projector, a TV
or a tablet. Students talk; the teacher runs the screen. Any subject, any language, with an English
and Spanish interface. No sign-up, no tracking, and the hub works offline after the first visit.

*Versión en español: [README.es.md](README.es.md).*

## The games

| Game | What students do | Players | Student devices | Needs |
|---|---|---|---|---|
| **Word Drop** | Words fall; teams answer out loud (or make a sentence, describe it, ask a question) before they hit the floor | 1–8 teams | None | Nothing |
| **Hot Seat** | One student sits with their back to the screen; the team describes the word without saying it | 1–8 teams | None | Nothing |
| **City Run** | A navigator gives directions to a driver who can't see the map | Pairs or up to 4 teams | None | A keyboard, or the tablet's keyboard on Hard |
| **Trade Gate** | Co-op pixel puzzle: players must trade, and each trade needs an answer spoken out loud | 2–4 | None | Keyboards or game controllers; a web address, not a file |
| **Talk City** (*Speak Plus City* under the Speak Plus brand) | A Monopoly-style board game where every move is a sentence; the teacher is the bank | 2–6, mixed levels | Optional phones | A web address, not a file; Node.js for phones |
| **Dress Up Buddy** | Young learners dress a character, hear the clothes words, then print it to colour | 1 per device | Tablet per child or group | Nothing |
| **Lantern Island** (advanced) | Co-op adventure; each phone has abilities the others need | 2–6 per team, up to 4 teams | A phone each | Node.js server |
| **Stealth Squad** (advanced) | Co-op stealth with roles; sneak past robots together | 2–6 | A phone each | Node.js server and a build |

## Start in a minute

- **Online**: open the hub's GitHub Pages address. After the first visit it also works with no
  connection (it installs like an app in Chrome and Edge).
- **From a download**: download the ZIP, unzip it and double-click `index.html`. Word Drop, Hot
  Seat, City Run and Dress Up Buddy work straight from the file. Trade Gate and Talk City need a
  web address: run `python3 -m http.server` in the folder and open <http://localhost:8000>.
- **Lantern Island and Stealth Squad** need Node.js. See `lantern-island/README.md` and
  `Commands/stealth-squad/docs/DEPLOY.md`. `render.yaml` puts them online for free.

## For teachers

- **Your own content.** Every word game takes a list you type or paste: one item per line, with
  the answer after `=` (`perro = dog`, `7 × 8 = 56`, `heart = pumps blood`). Lists separated by
  commas also work. **Ready-made lists…** loads a pack from `packs/`; **Save to file** and
  **Open file** keep your lists; **Copy share link** gives a link that opens the game with your
  list already loaded (nothing is uploaded: the list travels inside the link).
- **Classes.** Write teams as `Team A: Aiko, Ken, Mio`, one per line, and the members show on each
  turn card. **Save as class** remembers the list on this computer for every game; **Make teams**
  shuffles the names into 2–6 teams.
- **Language.** The language menu at the top switches the interface between English and Spanish.
  The content can be in any language: City Run's "Not English" button becomes "Not Spanish" (or
  any language you choose) when you load a Spanish town.
- **Readable from the back.** Words, scores and the clock scale with the screen. Use the full-screen
  button on a projector.
- **Your data stays in the browser.** Settings, saved classes and lists are kept in this browser
  only (`localStorage`). Nothing is sent anywhere.

## Branding

The hub is neutral by default. A school can set its own look in `shared/config.js`. The Speak
Plus brand (logo, colours and the name *Speak Plus City*) is the `speakplus` preset: set
`brand: 'speakplus'` there, or open any page once with `?brand=speakplus` and the browser
remembers it. The Speak Plus names and logo are not part of the open licence; see
[TRADEMARKS.md](TRADEMARKS.md).

## How it is built

- Plain HTML, CSS and JavaScript. No framework and no build step for the static games.
- `shared/kit.js`: the small shared toolkit (brand, English/Spanish strings, saved classes, content
  packs, sound, full screen, offline). `shared/styles.css`: colours for both brands, light and dark.
- Each game is a folder with its own `index.html`, a `game.json` manifest and a `card.svg`. The hub
  is made from the manifests: `node tools/build.mjs` writes `shared/registry.js`.
- `packs/*.json`: content packs (word lists, City Run towns, quiz questions), CC BY 4.0.
- `sw.js`: keeps the hub and the static games for offline use (`shared/precache.js` lists the files).
- `node tools/check.mjs` checks manifests, packs, generated files, that no static game loads
  anything from another site, and that every string exists in English and Spanish. CI runs it on
  every pull request, together with each game's own tests.

## Contributing

New games, content packs and translations are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md):
copy `hot-seat/` as a template, write a `game.json`, run `node tools/build.mjs` and
`node tools/check.mjs`, and open a pull request. The maintainer tries every new game in a real
class before it loses its "New" label.

## Licence

Code: [MIT](LICENSE). Content (word lists, places, questions, cards, missions): CC BY 4.0.
Fonts: SIL Open Font License. Details in [LICENSE-CONTENT.md](LICENSE-CONTENT.md).
