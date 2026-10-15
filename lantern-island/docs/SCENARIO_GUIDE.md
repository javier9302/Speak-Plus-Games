# Scenario guide

How to write a scenario pack for Lantern Island. This page is enough to author a pack without reading the engine code. Read it with one example pack open: `data/scenarios/tiny` (the example at the end of this page) or `data/scenarios/harbor` (every feature).

**The loop:** write JSON files in `data/scenarios/<pack>/`, then run `npm run check -- <pack>`. The check gives every mistake in plain English with its file. A running server reloads the files by itself; the next mission uses them.

## 1. A pack

```
data/scenarios/<pack>/
  pack.json          the pack
  zones/<id>.json    maps (one or more)
  missions/<id>.json quests (optional, the teacher can also start a quick mission)
  cards/<id>.json    challenge cards for this pack only (optional)
```

Ids: small letters, numbers and dashes. A file's name is its `id`. Map, mission, card and landmark ids must be unique across all packs; object ids must be unique in a pack.

`pack.json`:

| Field | Meaning |
|---|---|
| `id` | the folder name |
| `name` | what teachers see |
| `order` | packs are listed in this order (the first pack's first map is where new groups start) |
| `story` | a sentence for teachers |
| `unlock` | `{ "landmarks": N }`: the pack opens for a group once it has restored N landmarks (all packs together) |
| `theme` | the default theme of its maps (section 7) |
| `tiles` | its own tiles (section 7) |
| `themes` | its own themes (section 7) |

## 2. A map (`zones/<id>.json`)

| Field | Meaning |
|---|---|
| `id`, `name` | the map's id (= file name) and the name players see |
| `rows` | the map, one text line per row, one letter per tile; all lines the same width; any size |
| `objects` | things on the map (section 3) |
| `goal` | the default goal of its missions (section 5). Not needed on a map without player starts |
| `places` | named spots: `{ "id", "name", "x", "y" }` (students say where to meet; escort goals go to one; `{where:...}` uses them) |
| `landmarks` | what missions restore: `{ "id", "name", "art", "x", "y", "w", "h", "solid" }`. Drawn as a ruin until a mission restores it, then for ever. `art`: lighthouse, dock, flower-garden, post-office, windmill, fountain, market, campfire (anything else: a flag) |
| `theme` | how it looks (section 7) |
| `slots`, `shuffle` | what changes from run to run (section 6) |
| `legend`, `...Help` | notes for authors; ignored |

x and y count tiles from the top left, starting at 0. Base tiles:

| Tile | Name | Blocks |
|---|---|---|
| `~` | water | yes |
| `,` | grass | |
| `.` | sand | |
| `#` | path | |
| `=` | bridge | |
| `T` | tree | yes |
| `R` | rock | yes |
| `p` | player start (drawn as grass) | |

A map players start on needs 6 or more `p`. A map with no `p` is reached through an exit (section 8).

## 3. Objects

Every object: `{ "id", "kind", "name", "x", "y", "clues"? }`, or `"slot"` instead of x and y (section 6). One object per tile, on ground that does not block. `clues` is `{ "<ability>": "text" }`: only the player who uses that ability sees the text, on their own phone; they must say it to the team.

| Kind | What it does | Abilities | Fields |
|---|---|---|---|
| `bell` | A bell. It can hold clues for Listen and Look. | its clues |  |
| `bottle` | A bottle with a message. It can hold clues for Look and Read. | its clues |  |
| `boulder` | A big rock. Push moves it to its "to" tile, and back. | push | `to`: where Push moves it: { "x": 1, "y": 2 } |
| `candidate` | One of several look-alike objects (pots). An "odd-one-out" goal names the right one; Use (or its "by" ability) chooses it. A wrong choice costs nothing. | its "by" ability | `by`: the ability that chooses it (default "use") |
| `chest` | A chest. Open it, then Pick up what it holds. Close shuts it again. | open, close, pickup | `holds`: the item inside (optional) |
| `exit` | A way to another map of the same pack. Walking onto it takes players to the exit named by "arrive" in the map named by "to"; they land next to it. | none (walk onto it) | `to`: the id of another map of this pack<br>`arrive`: the id of an exit in that map, where players arrive |
| `gap` | A broken bridge. Jump crosses it (only the jumper). Fix mends it for everybody, if it names the item it needs. A plate can let the others cross. | jump, fix | `needs`: the item that fixes it (optional; without it, it cannot be fixed) |
| `gate` | A gate. Locked: Use unlocks it with its key, or by typing its code (the digits are in clues). Then Open; Close shuts it. | use, open, close | `locked`: true: it starts locked<br>`key`: the item that unlocks it (default "key")<br>`code`: a code gate: how many digits (2 to 6); clue texts give them as {d1}, {d2}... |
| `item` | An item lying on the ground. Pick up takes it. | pickup | `item`: the item (an id from the items list) |
| `machine` | A broken machine (a pump, a clock, a lamp). Fix it, with the item it names if it needs one; then it works. A "restore" goal counts the machines that work. | its "by" ability | `needs`: the item that fixes it (optional)<br>`by`: the ability that fixes it (default "fix") |
| `npc` | A character. Talk gives its "talk" clue; the teacher can answer as it, and a goal can ask for items to be brought to it. | talk | `lines`: sentences the teacher can send as this character (a list) |
| `pad` | A flat stone that lights up when pressed (default ability Push). A "sequence" goal asks for pads in an order the clues reveal. | its "by" ability | `by`: the ability that presses it (default "push") |
| `plate` | A flat stone. While a player stands on it, its target (a broken bridge or a gate) lets everybody else through. No ability needed. | none (stand on it) | `target`: the id of the gap or gate it holds open |
| `shell` | A shell. It can hold clues for Listen and Look. | its clues |  |
| `sign` | A sign. Its words are clues for Read. | its clues |  |
| `sluice` | A water gate. Broken: Fix it with the item it needs. Then Close: the tiles it floods fall dry. Open floods them again. | fix, close, open | `needs`: the item that fixes it<br>`floods`: the tiles under water while it is not closed: [{ "x": 1, "y": 2 }, ...] |
| `station` | A stone tablet with a challenge card. Its ability ("by", default Use) shows the card; the right answer solves it and its reward appears. | its "by" ability, pickup | `by`: the ability that opens the card (default "use")<br>`reward`: { "item": an item that appears when solved, "open": the id of a gate it opens }<br>`card`: the card it prefers: { "type", "level" } (a mission can choose another) |
| `statue` | A statue. It can hold clues for Look and Read. | its clues |  |
| `stump` | A tree stump. It can hold clues for any ability. | its clues |  |

Items (an object's `holds`, `needs`, `item`, a reward): `lantern`, `key`, `plank`, `letter`, `crystal` (`data/items.json`; a player carries 4 at most). New items need a picture in code, so packs use these.

A **station** (tablet) holds a challenge card. Its `card` is a preference; the mission decides (section 5). Its reward appears when the card is answered; somebody must Pick it up.

## 4. Abilities, and the design rules

The 12 abilities: `look`, `read`, `talk`, `listen`, `pickup`, `give`, `open`, `close`, `jump`, `push`, `use`, `fix`. The game shares them among the players (`data/abilities.json`):

| Players | Each player gets |
|---|---|
| 2 | look read talk listen pickup give · open close jump push use fix |
| 3 | look read talk listen · pickup give open close · jump push use fix |
| 4 | look read talk · listen pickup give · open close jump · push use fix |
| 5 | look read talk · listen pickup give · open close · jump push · use fix |
| 6 | look read · talk listen · pickup give · open close · jump push · use fix |

`npm run check` enforces three rules, for 2 to 6 players:

1. **Every mission can be finished**, and so can every run of it (section 6).
2. **Every player is needed** in every mission: each of the six pairs above (look/read, talk/listen, pickup/give, open/close, jump/push, use/fix) must hold an ability the mission cannot be finished without.
3. **The whole map** (every tablet at once) needs all 12 abilities, **every obstacle** (chest, gate, sluice, tablet, machine) needs abilities of two different players, and every broken bridge without `needs` has a plate.

What makes an ability needed:

| Ability | Needed when |
|---|---|
| look, read, listen | a code gate's digits are only in clues for that ability (`{d1}` in a Read clue...), and the goal is behind the gate |
| talk | the goal is to bring items to a character, or a character must be escorted, or delivered to |
| pickup, give | items must be carried (give: a player who did not pick them up must bring them) |
| open | a chest or a gate is in the way |
| close | a sluice must be closed to dry a path |
| jump | a broken bridge (gap) is in the way |
| push | a boulder is in the way |
| use | a tablet, a key on a gate, a code gate |
| fix | a sluice, a gap or a machine that needs an item |

**Recipe that passes:** put the goal behind a chain, as the beach and the example below do. A boulder hides a chest with the key; the key opens a gate; a gap with a plate leads to the character; a code gate (digits in a Read, a Look and a Listen clue) guards a tablet that gives a plank; the plank fixes a sluice that dries the way to another tablet. A chest in the open breaks rule 3 (one player can Open and Pick up): put it behind a boulder, or use a loose `item` instead.

The solver does things the moment it can. If two things need the same item (a sluice and a machine both need a plank), give the map two.

## 5. Missions (`missions/<id>.json`)

| Field | Meaning |
|---|---|
| `id`, `title`, `story` | the file name; what teachers and players see |
| `zone` | the map it starts on (one with player starts; default: the pack's first map) |
| `minutes` | target time (a star if faster) |
| `timeLimit` | minutes; when time is up the mission ends, not finished |
| `stations` | the tablets it uses: `{ "at": "<tablet id>", "filter": { "type", "level", "tags" } }` or `{ "at", "card": "<card id>" }`. Card types: choice, typed, spelling, code (the teacher checks), link, courier. `level`: `group` (default, the group's level) or A1 to C1. `tags`: cards with one of these tags |
| `goal` | what finishes it (below); the map's goal fills in what is missing |
| `goal.restore` | the landmark it restores (default: the next one still in ruins) |
| `monster` | off, gentle, normal, hard, or group-setting (default) |
| `theme` | how its maps look (section 7) |
| `seed` | a fixed run (section 6) |
| overrides | `rename`, `texts`, `lines`, `move`, `remove`, `add`, `slots`, `shuffle` (below) |

Goal types (`"goal": { "type": "<type>", ... }`, default `collect`):

| Type | What the team does | Fields |
|---|---|---|
| `collect` | Collect a number of one item. With "deliver", one player must then carry them all to a character and Talk. | `items`: { "<item>": how many }<br>`deliver`: the id of a character (kind "npc") to bring them to (optional) |
| `deliver-order` | Bring items to characters in order: "order": [{ "to": a character, "item": an item }, ...]. Talk to the character while carrying the item. Clues should say the order. | `order`: the deliveries in order: [{ "to": the id of a character, "item": an item id }]<br>`shuffle`: true: a new order every run (clues give it with {deliveries}) |
| `escort` | A character follows the player who talks to it, to a named place ("to"). It cannot jump or swim: fix bridges or hold plates for it. | `npc`: the id of the character<br>`to`: the id of a named place (from "places") where it wants to go |
| `odd-one-out` | Several look-alike objects (kind "candidate"); clues point to the right one ("answer"). Choosing it finishes the mission. A wrong choice costs nothing. | `answer`: the id of the right candidate, or "random": a different one every run (clues name it with {odd}) |
| `restore` | Make machines work again: Fix them (some need an item). Counts the machines named in "machines", or all of the map's. | `machines`: the ids of the machines that count (default: every machine of the map)<br>`count`: how many must work (default: all of them) |
| `sequence` | Press pads in the right order ("order": their ids). Clues must reveal the order. A wrong pad makes them all go dark; the team starts again. | `order`: the ids of the pads, in the order to press them (2 or more)<br>`shuffle`: true: a new order every run (clues give it with {order}) |

Every goal also takes `label` (the word on the screens) and `restore`. Machines count for `restore` with kind `machine`; pads for `sequence` with kind `pad`; look-alikes for `odd-one-out` with kind `candidate`.

**Overrides** change the mission's start map for this mission only (the map file stays as it is). The changed map is checked like a map file.

| Override | Example |
|---|---|
| `rename` | `{ "keeper": "Night keeper" }` |
| `texts` | `{ "old-sign": { "read": "New text" , "look": null } }` (null removes that clue) |
| `lines` | `{ "keeper": ["Hello!", "Thank you!"] }` (what the teacher can send as the character) |
| `move` | `{ "bottle": { "x": 34, "y": 8 } }` |
| `remove` | `["small-shell"]` |
| `add` | `[{ "id": "note", "kind": "sign", "name": "Note", "x": 21, "y": 12, "clues": { "read": "..." } }]` |
| `slots`, `shuffle` | added to the map's (section 6) |

Overrides only change the map the mission starts on, not maps reached through exits.

## 6. Replayability: a different run every time

Each mission start picks a random **seed**. From it the server builds the run: objects in slots stand on a different tile, shuffles swap things, and goals with random parts change. It solves that exact run for the team and tries another seed if it cannot be finished. Seed 0 is the layout as written. `"seed": 7` in a mission always plays run 7.

| Tool | How |
|---|---|
| Slots | map: `"slots": { "north": [[3, 4], [8, 2], [12, 6]] }`; object: `"slot": "north"` instead of x and y. Each object of a slot gets its own tile. Not for boulders, sluices or exits |
| Shuffles | map or mission: `"shuffle": [{ "objects": ["chest-a", "chest-b"], "field": "holds" }]`. Fields: `holds`, `reward`, `item`, `clues`, `name` |
| Random goals | `sequence` and `deliver-order`: `"shuffle": true`; `odd-one-out`: `"answer": "random"` |

**Clue placeholders**, filled in for each run:

| Placeholder | Becomes |
|---|---|
| `{d1}` ... `{d6}` | the digits of this mission's code (code gates; the code is new every mission) |
| `{where:<id>}` | "near <the named place closest to that object>" |
| `{name:<id>}` | that object's name |
| `{order}` | a `sequence` goal's order ("the Moon stone, then the Sun stone, ...") |
| `{odd}` | an `odd-one-out` goal's answer |
| `{deliveries}` | a `deliver-order` goal's order |

A map's clues may only use `{order}`, `{odd}` or `{deliveries}` if every mission of that map has the goal that fills it in. Otherwise add that clue in the mission (`add` or `texts`).

## 7. Tiles and themes

A theme changes how a map looks, never where players can walk. Choose it with `theme` on the map, the mission (wins) or the pack (default). Built-in themes (`data/themes.json`): `day`, `sunset`, `night`, `winter`, `autumn`, `rain`, `festival`.

A pack's own theme, in `pack.json` `themes`:

```json
"themes": { "sea-fog": { "name": "Sea fog", "tint": "rgba(205, 214, 224, 0.42)", "weather": "none", "palette": { "#3b82d6": "#7f9cb8" } } }
```

`palette` swaps colours of the ground (grass `#6abe45` `#4f9e37`, sand `#f0dca0` `#dcc380`, path `#c8a56a`, water `#3b82d6` `#7fb6f0`, leaves `#2f7d32` `#49a548`). `tint` is laid over everything. `weather`: `none`, `snow`, `rain`, `fireflies`, `leaves`, `confetti`. `art` draws a tile differently: `{ "T": { "art": [16 rows], "pal": {...}, "base": "," } }`.

A pack's own tiles, in `pack.json` `tiles` (one new letter each; these do decide where players walk):

```json
"tiles": { "*": { "name": "stack of crates", "solid": true, "base": ",", "art": ["16 rows of 16 letters"], "pal": { "w": "#a9713c" } } }
```

`solid`: blocks. `base`: a tile drawn underneath. Either `color` (+ `speckle`: a few dots in these colours) or `art` + `pal` (a 16x16 picture: `.` clear, `k` dark outline, other letters from `pal`).

## 8. Several maps: exits

A pack can have several maps. An `exit` object leads to another map of the pack: `{ "kind": "exit", "to": "<map id>", "arrive": "<id of an exit on that map>" }`. Walking onto it takes the player there; they land next to that exit. Usually each side has an exit pointing at the other.

The maps that exits link to a mission's start map are joined into one big map for that mission: every map's objects, tablets and machines count, and the solver walks through exits. A map without player starts needs no goal; it must be reachable through exits from a map with starts. The big screen shows the map with most players. A character that follows a player (escort) comes through exits too.

## 9. Cards

A pack can bring its own challenge cards in `cards/<id>.json`, used only by its own missions. Give them a tag and ask for it in a station's filter (`"filter": { "tags": ["harbor"] }`). Same format as the teacher's card library (Cards tab, or `data/cards/`):

```json
{ "id": "harbor-ch-1", "type": "choice", "level": "A1", "tags": ["harbor"], "prompt": "What do you use to catch fish?", "options": { "A": "A net", "B": "A spoon", "C": "A book" }, "answer": "A", "hints": ["Fishers throw it into the sea.", "It has many small holes.", "It starts with N."] }
```

Other types: `typed` (`accepted`: answers, `allowTypos`), `spelling` (`word`), `code` (the teacher checks the spoken answer and gives a code), `link`, `courier`. Up to 3 `hints`.

## 10. Rules every pack keeps

- English for everything players read: short sentences for A1 to B1 learners. Clues tell players to talk ("Tell your team", "Ask...").
- Clue text only ever goes to the phone of the player who used the ability, and answers and codes only to the teacher panel. So never put an answer in an object's `name` (every screen shows names).
- No game over: wrong answers, wrong stones and wrong jars only cost time.
- The big screen never shows a team's map in competitive mode (automatic).
- Picture letters: 16 rows of 16. Colours as `#rrggbb`.

## 11. Checklist

1. Make the folder and `pack.json`.
2. Draw the map (`rows`), with 6 `p`. Place objects, places, landmarks.
3. Add missions (or rely on the map's `goal` for quick missions).
4. `npm run check -- <pack>`: fix every FAIL. It names the file, the object and the reason, and suggests names for typos.
5. Start the server (`npm start`) and play a mission on the host screen with test players (the lobby's "Open a test player window").

## 12. A full example

The `tiny` pack: one map, one mission, every rule passing. Copy it to start a new pack (change the ids). `test/content.js` checks that this example passes `npm run check`.

```json scenarios/tiny/pack.json
{
  "id": "tiny",
  "name": "Tiny Island",
  "order": 9,
  "theme": "day"
}
```

```json scenarios/tiny/zones/tiny.json
{
  "id": "tiny",
  "name": "Tiny Island",
  "goal": {"label": "Lanterns", "items": {"lantern": 3}, "deliver": "keeper", "story": "Bring three lanterns to the keeper."},
  "rows": [
    "~~~~~~~~~~~~~~~~~~~~~~~~",
    "~~~~~~~...~~~~~~~~~~~~~~",
    "~~~~~~~~.~~~~~~~~~~~~~~~",
    "~~~~~~~........~~~~~~~~~",
    "~~~,,,T,,,,,,,.~~~.....~",
    "~~~,,,T,,,,,,,.~~~.....~",
    "~~.T,TT,,,,,,,.===.....~",
    "~~.,,,,,,ppp,,.~~~.....~",
    "~~.,,,,,,ppp,,.~~~.....~",
    "~~.,,,,,,,,,,,.~~~.....~",
    "~~.............~~~~~~~~~",
    "~~~~~.~~~~~~~~~~~~~~~~~~",
    "~~~.....~~~~~~~~~~~~~~~~",
    "~~~~~~~~~~~~~~~~~~~~~~~~"
  ],
  "places": [
    {"id": "garden", "name": "the garden", "x": 4, "y": 5},
    {"id": "islet", "name": "the islet", "x": 20, "y": 7}
  ],
  "landmarks": [
    {"id": "tiny-light", "name": "the little lighthouse", "art": "lighthouse", "x": 22, "y": 4, "w": 1, "h": 2, "solid": true}
  ],
  "slots": {"sign-spot": [[10, 5], [12, 6], [9, 9]]},
  "objects": [
    {"id": "board", "kind": "sign", "name": "Notice board", "slot": "sign-spot", "clues": {"read": "The garden gate has a code. The first number is {d1}."}},
    {"id": "stone-cat", "kind": "statue", "name": "Stone cat", "x": 12, "y": 8, "clues": {"look": "A number on the cat's collar: {d2}. It is the second number."}},
    {"id": "shell", "kind": "shell", "name": "Shell", "x": 13, "y": 10, "clues": {"listen": "A whisper: \"The last number is {d3}.\""}},
    {"id": "keeper", "kind": "npc", "name": "Keeper", "x": 20, "y": 5, "clues": {"talk": "\"Bring me three lanterns, all from one pair of hands, please.\""}},
    {"id": "rock", "kind": "boulder", "name": "Big rock", "x": 8, "y": 2, "to": {"x": 9, "y": 3}},
    {"id": "chest", "kind": "chest", "name": "Chest", "x": 8, "y": 1, "holds": "key"},
    {"id": "bridge-gate", "kind": "gate", "name": "Bridge gate", "x": 15, "y": 6, "locked": true, "key": "key"},
    {"id": "gap", "kind": "gap", "name": "Broken bridge", "x": 16, "y": 6},
    {"id": "plate", "kind": "plate", "name": "Flat stone", "x": 17, "y": 6, "target": "gap"},
    {"id": "garden-gate", "kind": "gate", "name": "Garden gate", "x": 4, "y": 6, "locked": true, "code": 3},
    {"id": "water-gate", "kind": "sluice", "name": "Water gate", "x": 8, "y": 10, "needs": "plank", "floods": [{"x": 5, "y": 11}]},
    {"id": "tablet-a", "kind": "station", "name": "Meadow tablet", "x": 12, "y": 4, "reward": {"item": "lantern"}},
    {"id": "tablet-b", "kind": "station", "name": "Islet tablet", "x": 21, "y": 8, "reward": {"item": "lantern"}},
    {"id": "tablet-c", "kind": "station", "name": "Garden tablet", "x": 4, "y": 4, "reward": {"item": "plank"}},
    {"id": "tablet-d", "kind": "station", "name": "Sandbar tablet", "x": 4, "y": 12, "reward": {"item": "lantern"}}
  ]
}
```

```json scenarios/tiny/missions/tiny-lights.json
{
  "id": "tiny-lights",
  "title": "Tiny lights",
  "story": "The keeper needs three lanterns before night.",
  "zone": "tiny",
  "minutes": 20,
  "goal": {"items": {"lantern": 3}, "restore": "tiny-light"},
  "stations": [
    {"at": "tablet-a", "filter": {"type": "choice"}},
    {"at": "tablet-b", "filter": {"type": "typed"}},
    {"at": "tablet-c", "filter": {"type": "spelling"}},
    {"at": "tablet-d", "filter": {"type": "code"}}
  ]
}
```

Map legend: `p` the six starts (centre), `T` the trees and water around the garden (top left, opened by the code gate at 4,6), the rock and chest in the nook (top), the bridge with its gate, gap and plate to the islet (right), the sluice drying the path at 5,11 to the sandbar (bottom).
