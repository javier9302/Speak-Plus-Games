# Scenario guide

How to write a scenario pack for Lantern Island. This page is enough to author a pack without reading the engine code. Read it with one example pack open: `data/scenarios/city` (Maple City, section 12: every newer feature), `data/scenarios/harbor` (the first example with every goal type) or the `tiny` pack at the end of this page (the smallest one that passes).

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
| `items` | its own items, with their pictures (section 3c) |
| `sprites` | its own pictures for objects, chosen with an object's `skin` (section 3c) |
| `strictClues` | `true`: `npm run check` fails when a clue is not needed to finish a mission (section 3b). Default: it only notes it |
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
| `facts` | numbers drawn anew every mission, for codes that clues must combine (section 3b) |
| `logic` | logic puzzles: houses, people, and rules that clues show (section 3b) |
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

Every object: `{ "id", "kind", "name", "x", "y", "clues"? }`, or `"slot"` instead of x and y (section 6). `"extra": ["look"]` lists clues that are just atmosphere, not needed (section 3b). One object per tile, on ground that does not block. `clues` is `{ "<ability>": "text" }`: only the player who uses that ability sees the text, on their own phone; they must say it to the team.

| Kind | What it does | Abilities | Fields |
|---|---|---|---|
| `barrier` | Anything that blocks the way until its `requires` are met: a door, turnstile, laser, vine wall or guard. Rules: an item, a code or word, an ability, players standing on plates. Then Open. | use, open, close, or the ability it asks for | `requires`: what opens it, one rule or a list (section 3c)<br>`finish`: `"open"` (default: somebody Opens it) or `"auto"` (it opens by itself) |
| `bell` | A bell. It can hold clues for Listen and Look. | its clues |  |
| `bottle` | A bottle with a message. It can hold clues for Look and Read. | its clues |  |
| `boulder` | A big rock. Push moves it to its "to" tile, and back. | push | `to`: where Push moves it: { "x": 1, "y": 2 } |
| `candidate` | One of several look-alike objects (pots). An "odd-one-out" goal names the right one; Use (or its "by" ability) chooses it. A wrong choice costs nothing. | its "by" ability | `by`: the ability that chooses it (default "use") |
| `chest` | A chest. Open it, then Pick up what it holds. Close shuts it again. | open, close, pickup | `holds`: the item inside (optional) |
| `exit` | A way to another map of the same pack. Walking onto it takes players to the exit named by "arrive" in the map named by "to"; they land next to it. | none (walk onto it) | `to`: the id of another map of this pack<br>`arrive`: the id of an exit in that map, where players arrive |
| `gap` | A broken bridge. Jump crosses it (only the jumper). Fix mends it for everybody, if it names the item it needs. A plate can let the others cross. | jump, fix | `needs`: the item that fixes it (optional; without it, it cannot be fixed) |
| `gate` | A gate. Locked: Use unlocks it with its key, or by typing its code (the digits are in clues). Then Open; Close shuts it. | use, open, close | `locked`: true: it starts locked<br>`key`: the item that unlocks it (default "key")<br>`code`: a code gate: a number of digits (2 to 6; the old way, clues give them as {d1}, {d2}...) or an object (section 3b) |
| `item` | An item lying on the ground. Pick up takes it. | pickup | `item`: the item (an id from the items list) |
| `lever` | A lever. A player uses it and its target (a timed door, a bridge or a gate) is open for a few seconds. Far from the door, so the team must call "Go!". | use (or its `by`) | `target`: the id of the timed door (or gap, or gate) it opens<br>`seconds`: how long it stays open, 3 to 60 (default 10)<br>`by`: the ability that pulls it (default `use`) |
| `machine` | A broken machine (a pump, a clock, a lamp). Fix it, with the item it names if it needs one; then it works. A "restore" goal counts the machines that work. | its "by" ability | `needs`: the item that fixes it (optional)<br>`by`: the ability that fixes it (default "fix") |
| `npc` | A character. Talk gives its "talk" clue; the teacher can answer as it, and a goal can ask for items to be brought to it. | talk | `lines`: sentences the teacher can send as this character (a list) |
| `pad` | A flat stone that lights up when pressed (default ability Push). A "sequence" goal asks for pads in an order the clues reveal. | its "by" ability | `by`: the ability that presses it (default "push") |
| `plate` | A flat stone. While a player stands on it, its target (a broken bridge or a gate) lets everybody else through. No ability needed. | none (stand on it) | `target`: the id of the gap or gate it holds open (leave it out for a plate that a barrier lists in `playersOn`) |
| `shell` | A shell. It can hold clues for Listen and Look. | its clues |  |
| `shop` | A shop. It sells one item at a price. Talk tells the price; Use buys one with the team's coins (a `shopping` mission). | talk, use | `sells`: the item it sells<br>`price`: its price in coins, 1 to 99<br>`stock`: how many it has, 1 to 20 (default: as many as you like) |
| `sign` | A sign. Its words are clues for Read. | its clues |  |
| `sluice` | A water gate. Broken: Fix it with the item it needs. Then Close: the tiles it floods fall dry. Open floods them again. | fix, close, open | `needs`: the item that fixes it<br>`floods`: the tiles under water while it is not closed: [{ "x": 1, "y": 2 }, ...] |
| `station` | A stone tablet with a challenge card. Its ability ("by", default Use) shows the card; the right answer solves it and its reward appears. | its "by" ability, pickup | `by`: the ability that opens the card (default "use")<br>`reward`: { "item": an item that appears when solved, "open": the id of a gate it opens }<br>`card`: the card it prefers: { "type", "level" } (a mission can choose another) |
| `timed-door` | A shut door. A lever opens it for a few seconds: one player pulls the lever and the others must run through in time. | none (a lever opens it) |  |
| `trader` | A trader. Talk, with the item it wants in your pocket, trades it for another item to Pick up. Without the item, Talk says what it wants. Chain them. | talk, pickup | `wants`: the item it wants<br>`gives`: the item it gives back<br>`says`: what it says when you come without the item (default: "I would like a <item>, please.")<br>`thanks`: what it says after the trade |
| `statue` | A statue. It can hold clues for Look and Read. | its clues |  |
| `stump` | A tree stump. It can hold clues for any ability. | its clues |  |

Items (an object's `holds`, `needs`, `item`, a reward, a barrier's `item`): `lantern`, `key`, `plank`, `letter`, `crystal` (`data/items.json`), and the ones a pack adds with its own picture (section 3c). A player carries 4 at most.

A **station** (tablet) holds a challenge card. Its `card` is a preference; the mission decides (section 5). Its reward appears when the card is answered; somebody must Pick it up.

## 3b. Codes that cannot be guessed, and clues that need each other

A gate's `code` is a number (the old way: 2 to 6 digits, `{d1}`... in clues) or an object. The object form is the one to use: its answer is new every mission and belongs to that gate alone.

| `code` | The team must type |
|---|---|
| `{ "type": "digits", "length": 3 }` | 3 digits, 0 to 9 |
| `{ "type": "digits", "length": 2, "answer": "{sum:house,birds}" }` | a number worked out from `facts` (below) |
| `{ "type": "word", "word": "MOON" }` or `"words": ["MOON", "STAR"]` | a word, 3 to 8 letters (one of the list each mission); spelling counts, capitals do not |
| `{ "type": "symbols", "length": 4 }` | 4 pictures out of 8 (sun, moon, star, fish, tree, boat, bird, house): 4 096 ways |
| `"tries": 2`, `"lock": 45` | optional: wrong tries before the lock goes red (1 to 5), and for how many seconds (30 to 60) |

**The red lock.** After 2 wrong tries (a short try is not counted) the gate goes red for 45 seconds, makes a sound, and takes no code, not even the right one. It costs time and nothing else.

**Clues give the pieces.** In the text of a clue:

| Placeholder | Becomes |
|---|---|
| `{code:<gate id>:<n>}` | the n-th digit, letter or picture name of that gate's answer (counting from 1) |
| `{code:<gate id>}` | all of it (a clue that gives everything: use it for easy gates) |
| `{fact:<id>}` | the value of a fact |
| `{rule:<puzzle>.<rule>}` | the sentence of a rule of a logic puzzle |

Every piece must be in some clue (`npm run check` says which is missing). Spread the pieces over different abilities, so players must put them together.

**Facts and formulas.** On the map: `"facts": { "house": { "range": [5, 9] }, "birds": { "pick": [3, 5, 7] } }`. Each mission draws one value for each. A clue says "The red house is number {fact:house}." Another says "There are {fact:birds} birds on the sign." The code `"answer": "{sum:house,birds}"` is their sum. Formulas: `{fact:x}`, `{sum:a,b}`, `{diff:a,b}` (a minus b), `{times:a,b}`; other characters stay as written, so `"{fact:house}{fact:birds}"` joins the two numbers. The check makes sure the answer always has the right number of digits, whatever the facts are. A formula is only for `answer`, never in a clue: no single clue may give the answer.

**Logic puzzles.** "The doctor is not in the blue house. The baker is next to the blue house..." No clue gives the answer; only all of them together do. On the map:

```json
"logic": { "street": {
  "positions": ["red", "blue", "green", "yellow"],
  "items": ["doctor", "baker", "teacher", "pilot"],
  "rules": {
    "r1": { "if": ["left", "doctor", "teacher"], "text": "The doctor lives to the left of the teacher." },
    "r2": { "if": ["not", "baker", "green"], "text": "The baker does not live in the green house." },
    "r3": { "if": ["next", "baker", "pilot"], "text": "The baker lives next to the pilot." },
    "r4": { "if": ["next", "baker", "blue"], "text": "The baker lives next to the blue house." }
  } } }
```

The houses are numbered 1, 2, 3... from the left; 3 to 5 houses and the same number of `items`. A rule's `if` is `[kind, a, b]`, where a and b are an item, a house colour or a house number:

| Kind | Means |
|---|---|
| `at` | a is in the same house as b ("The baker lives in the red house.") |
| `not` | a is not in the same house as b |
| `next` | a is in a house next to b's |
| `left` | a is somewhere left of b |

The gate asks for house numbers: `"code": { "type": "digits", "length": 2, "answer": "{pos:street.doctor}{pos:street.baker}" }` is the doctor's house number and the baker's (here 3 and 1: the code is 31). Clues show the rules: `"read": "Tom says: {rule:street.r1}"`. Each rule goes in a different clue, ideally for different abilities, so the team must share them. The check proves that the rules give exactly one answer, and that **no rule can be left out**; it names the one that is not needed. The arrangement is the same every mission (the houses do not shuffle), so use a new puzzle for each map.

**Every clue must be needed.** `npm run check` takes each clue away, one at a time, and tries the mission again. A clue that can go without changing the result is "not needed": a note, or a FAIL when the pack has `"strictClues": true` (new packs should). Fix it by making the clue part of a puzzle, or by deleting it. Atmosphere on purpose (a shell that says "Waves.")? List its ability in the object's `extra`: `"extra": ["listen"]`. Do not make players hunt for clues they do not need: design the puzzle so that every clue is a piece they must have.

## 3c. Make anything: items, pictures and barriers

Nothing here needs code. Write JSON, run `npm run check -- <pack>`.

**Items with their own picture.** In `pack.json`:

```json
"items": [{ "id": "id-card", "name": "ID card", "art": ["................", "...16 rows of 16 letters..."], "pal": { "a": "#ffffff", "b": "#1f2f5c" } }]
```

The picture is 16 rows of 16 letters: `.` is clear, `k` the dark outline, any other letter a colour from `pal`. The id works in every object of that pack (`holds`, `item`, `requires`...) and must not be used by another item or pack. The five base items are written the same way in `data/items.json`.

**Pictures for objects.** In `pack.json`: `"sprites": { "shop-door": { "pal": { "a": "#9db4e0" }, "states": { "default": [16 rows], "open": [16 rows] } } }`. Then any object of the pack can wear it: `"skin": "shop-door"`. The object is drawn with the picture of its state (`locked`, `closed`, `open` for a gate or a barrier; `broken`, `fixed` for a gap...) or `default` if it has none. So a gate in a city looks like a shop door and a gap in a jungle like a rope bridge, with the same rules.

**Barriers.** A `barrier` blocks the way until its `requires` are all met. `requires` is one rule or a list; a rule has exactly one of:

| Rule | A player... |
|---|---|
| `{ "item": "id-card" }` | has the item and Uses it on the barrier. The item stays in the pocket; add `"consume": true` to use it up |
| `{ "word": "MOON" }` or `{ "code": { "type": "symbols", "length": 4 } }` | types the code (section 3b: words, digits, pictures, the red lock). Clues use `{code:<barrier id>:<n>}`. One code per barrier |
| `{ "ability": "fix" }` | with that ability does it (Fix the vine wall, Push the crate...) |
| `{ "playersOn": ["plate-a", "plate-b"] }` | 2 to 4 players stand on all these plates at the same time. The plates are `plate` objects without a `target`. Once it has happened, it stays done |

Item, code and ability rules are done in the order of the list. Plates can be done at any time. When every rule is met, the barrier unlocks and somebody must **Open** it (`"finish": "auto"` opens it by itself). Example: a shop door that needs the ID card, then the code, then Open:

```json
{ "id": "shop-door", "kind": "barrier", "name": "Shop door", "x": 14, "y": 6, "skin": "shop-door",
  "requires": [{ "item": "id-card" }, { "word": "OPEN" }] }
```

The design rules apply as always: a barrier must need abilities of two different players (here Use and Open), and a `playersOn` rule needs that many players on the team, so combine it with other rules for 2-player games to pass. The check says which rule is missing.

## 3d. Timed doors, trades and shopping

Three ways to make the team talk, all written in JSON.

**A timed door.** A `timed-door` is shut. A `lever` opens it for `seconds` (3 to 60). Put the lever **far from the door**: one player pulls it and calls "Go!", the others run through before it shuts. The lever's player cannot also be at the door, so a team of one can never pass (the check knows). The clock stops when the teacher pauses. A lever can also open a `gap` or a `gate`.

```json
{ "id": "iron-door", "kind": "timed-door", "name": "Iron door", "x": 14, "y": 6 },
{ "id": "lever-1", "kind": "lever", "name": "Lever", "x": 2, "y": 10, "target": "iron-door", "seconds": 8 }
```

**A trading chain.** A `trader` wants one item and gives another: Talk with the item in your pocket makes the trade, then somebody Picks up what it gives. Without the item, Talk shows the player what the trader says (`says`, in the trader's own words; make it a request that students must repeat to the team). Chain them: A wants a letter and gives a key; B wants the key and gives a plank. Never give a trader a `talk` clue: it would replace this.

```json
{ "id": "tom", "kind": "trader", "name": "Old Tom", "x": 15, "y": 3, "wants": "letter", "gives": "key", "says": "I have a key. Do you have a letter for me?" }
```

**Shopping.** A mission with `"goal": { "type": "shopping", "list": { "bread": 2, "milk": 1 }, "coins": 9 }`. Each `shop` sells one item at a price; two shops can sell the same item for different prices, so the team must compare. A player with Talk hears the price (it also tells the coins left), a player with Use pays for one. The coins are shared and the screens show them. Rules the check follows: every item on the list is sold by some shop; the cheapest shops must be reachable; the team has enough coins if it always buys at the cheapest shop; it warns you when the coins are enough even at the dearest shops ("prices do not matter"). Do not also put the items you sell on the ground. Items for a shop need a picture: add them to the pack's `items` (section 3c).

```json
{ "id": "bakery", "kind": "shop", "name": "Bakery", "x": 4, "y": 2, "sells": "bread", "price": 3 },
{ "id": "market", "kind": "shop", "name": "Market", "x": 8, "y": 2, "sells": "bread", "price": 2 }
```

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
| `shopping` | Buy everything on a shopping list with the team's coins. Shops sell items at different prices; Talk tells the price, Use buys one. | `list`: `{ "bread": 2, "milk": 1 }`, up to 5 items and 8 things in all<br>`coins`: the coins the team has, 1 to 999 |

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
| `{d1}` ... `{d6}` | the digits of this mission's old numeric code (the code is new every mission) |
| `{code:<gate id>:<n>}`, `{code:<gate id>}` | a piece of a gate's code, or all of it (section 3b) |
| `{fact:<id>}` | a fact of the map (section 3b) |
| `{rule:<puzzle>.<rule>}` | the sentence of a logic rule (section 3b) |
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
5. For a code gate, check that no clue gives the whole answer and that each clue is a piece players must have (section 3b).
6. Start the server (`npm start`) and play a mission on the host screen with test players (the lobby's "Open a test player window").

## 12. A full example: Maple City

`data/scenarios/city` is a whole city, written only in JSON: two maps (the centre and Uptown, joined by a bus), three missions, seven items with pictures, four tiles, nine object skins, three cards. Open it next to this page. Where each idea is used:

| Idea | In the city |
|---|---|
| Own tiles (section 7) | `pack.json` `tiles`: road (solid), sidewalk, crosswalk and building (art). The start is a park (`,`) so the six `p` look right |
| Own items (3c) | `pack.json` `items`: bread, milk, ticket, umbrella, flower, wrench, parcel |
| Skins (3c) | `pack.json` `sprites`, worn by objects with `"skin"`: a traffic light (a `timed-door`), a crossing button (a `lever`), a market shutter, a flat door and a turnstile (all `barrier`), road works (a `gap`), a manhole (a `plate`), a water valve (a `sluice`) |
| Roads you cross only at the lights (3d) | The avenue is a solid road. Its crosswalk has a `timed-door` (the red light) and a `lever` (the button) |
| A code from facts (3b) | The market gate: `"requires": [{ "item": "key" }, { "code": { "type": "digits", "length": 2, "answer": "{sum:open,hours}" } }]`. A poster gives `{fact:open}`, a radio gives `{fact:hours}`: the code is the closing time |
| A logic puzzle (3b) | The flat door: `"answer": "{pos:street.doctor}{pos:street.baker}"`. Four clues for four abilities (Read, Look, Listen, Talk) each show one rule |
| A word code (3b) | The hotel door in Uptown: `{ "word": "HOTEL" }`, with its letters in three clues |
| Barriers (3c) | A ticket turnstile (`{ "item": "ticket" }`, kept in the pocket), the market shutter, the flat door, the hotel door |
| A bus stop (section 8) | An `exit` behind the turnstile; characters that follow come along |
| Traders (3d) | Mrs Green wants an umbrella and gives a flower; Mr Park wants the flower and gives a wrench |
| A burst pipe (section 3) | The water valve is a `sluice`: Fix it with the wrench, then Close it to dry the street |
| Shopping (3d) | Two shops sell bread (2 and 3 coins), one sells milk. 9 coins: the team must buy bread at the market |
| Missions | `saturday-shopping` (a `shopping` goal), `lost-parcel` (`collect` and `deliver` to the postman), `lost-tourist` (`escort` to a place in Uptown) |

The three design rules still hold, in a city: the locker with the key is behind a crate (so Push, Open and Pick up are all needed), the ditch needs Jump and a plate, and every mission needs something from each pair of abilities. `"strictClues": true` is on, so every clue in the city is a piece of a puzzle that some mission needs. The two `lever` buttons are close to their doors, so a single player can still cross; put a lever far away (and give it a short `seconds`) if the team must split up.

## 13. The smallest pack

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
