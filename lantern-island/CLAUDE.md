# Lantern Island: notes for Claude

Lantern Island is an engine plus scenario packs. Most requests are content ("add a new scenario", "a mission where...", "make the forest snowy"); a few are engine work. Tell which one it is first.

## Content tasks (packs, maps, missions, cards, themes)

1. Read `docs/SCENARIO_GUIDE.md` (its last section is a complete small pack) and one real pack: `data/scenarios/harbor` (every feature) or `data/scenarios/beach`. Do not read the engine code for content work: the guide has every field, kind, goal type, tile, theme and rule.
2. Write only files in `data/scenarios/<pack>/` (and `data/themes.json` for a built-in theme). Never change engine code to make content work.
3. Run `npm run check -- <pack>` and fix every FAIL. It explains each problem in plain English, with the file. Most failures are design rules (every player needed for 2 to 6 players, every obstacle needs two players, the whole map needs all 12 abilities): the guide's section 4 has the recipe.
4. Run `npm test`. New pack missions change `test/solver-golden.json`: rewrite it with `node test/golden.js --write`, after checking that only the new missions were added.
5. Commit the pack.

A running server reloads pack files by itself; there is no build step.

## Engine tasks

- One file per object kind in `server/kinds/` and per goal type in `server/goals/`; their headers (`index.js`) document the format. The game and the solver both use them. A new kind or goal type is a new file there, plus its row in the guide (`npm test` fails if the guide does not mention it).
- Content loading and validation: `server/content.js`, `server/validate.js`; overrides `server/overrides.js`; runs and seeds `server/run.js`; tiles and themes `server/tiles.js`; several maps `server/atlas.js`.
- Codes, facts and which clues a gate needs: `server/codes.js` (digits, word and picture codes, formulas over `facts`, clue tokens). The red lock after wrong tries is in `rooms.js` (`onAnswer`). `npm run check` takes each clue away in turn ("every clue is needed"; a FAIL in packs with `strictClues`). Tests: `test/codes.js`.
- Items with their own pictures (`data/items.json`, a pack's `items`): `server/items.js`; pack `sprites` and an object's `skin`: `server/art.js`, drawn by `public/shared/pixel.js`. `server/kinds/barrier.js` is the generic blocker (`requires`: item, code/word, ability, playersOn): a new door, laser or wall is data, not code. Tests: `test/requires.js`.
- The solver (`server/solver.js`) must agree with the game. `test/solver-golden.json` holds its answers for every pack mission: a refactor must not change them.
- Keep the rules in the root `CLAUDE.md` and `README.md`: clue text only to the player who used the ability, answers and codes only to the teacher panel, the big screen never shows a team's map in competitive mode, 44 px buttons, English UI, Speak Plus colours only in the lobby and teacher panel.
- Tests: `npm test` (sim, compete, content, goals). The full run takes several minutes.
