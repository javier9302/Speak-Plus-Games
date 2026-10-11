# Trade Gate

A cooperative pixel-art puzzle game for English conversation classes. 2 to 4 students share one screen. Nobody can finish alone: each player can **collect** one resource but not use it, and **use** another resource but not pick it up. To pass a resource on, players meet at a **Trade Gate**, answer a question out loud in English, and get a code from the teacher.

Everyone wins together. There are no scores per player.

## Run it

The game is plain HTML, CSS and JavaScript. Nothing to install or build.

```
cd trade-gate
python3 -m http.server
```

Then open <http://localhost:8000> in Chrome, Edge or Firefox.

Opening `index.html` by double-click does not work: browsers refuse to load the JSON data files from a `file://` page. The page tells you this if you try.

| Address | What it is |
| --- | --- |
| `http://localhost:8000` | The game |
| `http://localhost:8000/?teacher=1` | Teacher panel in its own window |
| `http://localhost:8000/teacher-sheet.html` | Printable teacher sheet, all levels |
| `http://localhost:8000/teacher-sheet.html?level=level-1` | Printable sheet for one level |
| `http://localhost:8000/?level=level-3&players=4` | Jump straight into a level for testing (P1 = WASD, P2 = arrows) |

## Controls

Players join in the lobby by pressing **A** (or their keyboard interact key). Colors are given in join order: red, blue, green, yellow. With 2 or more players, press **Start** or **Space** to go on.

| Action | Controller | Keyboard 1 | Keyboard 2 |
| --- | --- | --- | --- |
| Move | Left stick / d-pad | W A S D | Arrow keys |
| Interact: pick up, use, choose | A | E | Enter |
| Ask (ready to trade at a gate) | B | Q | Shift |
| Show my role card (hold) | X | R | . (period) |
| Phrase help (hold) | Y | F | / (slash) |
| Pause | Start | Esc or P | Esc or P |

Codes: type the digits on the keyboard (top row or number pad), or move the on-screen number pad with the stick / d-pad and press A. The code is checked as soon as the last digit is in.

**Controllers.** Up to 4 controllers, using the browser's standard layout (Xbox, PlayStation and Switch Pro pads work). Press any button once after plugging in so the browser sees the pad. If a controller disconnects during a level, the game pauses with a message; reconnect it, or press A on a spare controller to take over that player.

## How a level works

1. Collect your resource (walk onto it, press A).
2. Go to a Trade Gate with your partner. A small sign above the gate shows who gives what to whom. Both press **Ask**. Each giver must be holding at least the amount the gate asks for.
3. The gate card appears with the question. Students talk. The screen flashes **CALL THE TEACHER!**
4. The teacher listens, checks the answer on the sheet or panel, and says the code.
5. A student enters the code. The giver's resources move to the receiver.
6. The receiver puts them into the chest or the machine (press A next to it).
7. When the goal bar is full the exit door opens. Everyone stands on the exit pads.

Good to know:

- A gate stays **open** after its code is entered. Pressing Ask there again trades straight away, with no new question.
- Pickups come back after 20 seconds, so a level cannot get stuck.
- **Two-person switch:** two players stand on the two orange plates at the same time for 3 seconds. The screen counts down, so players count together.
- **Describe gates:** one player holds A to see the secret card while the partner looks away, then describes it. The partner picks the matching card. The code comes after the right card is chosen.

## The teacher

Press **T** in the game window to open the Teacher Panel beside the game. Better: open `?teacher=1` in a **second window** of the same browser (on your laptop screen, with the game on the TV). The two windows stay in step by themselves. Use a separate window, not a tab in the same window, because browsers put hidden tabs to sleep.

For every gate the panel shows the question, the accepted answers, the code and the hint ladder. The gate that is waiting for a code is outlined in red.

| Button | What it does |
| --- | --- |
| Reveal (hint 1, 2, 3) | Shows that hint on the students' gate card. Students should ask first: "Can we have a hint, please?" |
| Force open (rescue card) | Completes the trade without a code |
| Skip (close the card) | Closes the gate card without trading. Students can come back later |
| Award bonus gem | Adds a bonus gem for a great answer. Also the **G** key in the game window |
| Pause / Restart level / Level | As named. Picking a level starts it |
| Timer | Shows a soft countdown. Running out only shows "extra time"; nobody loses |
| Phrase hints | Shows or hides the "You can say:" phrases, for harder play |
| Hint cost | When on, each hint takes one resource from the giver at that gate |
| Sound | Mute. Also the **M** key in the game window |

The notes box is saved per level in this browser, for errors you hear and want to go over later.

**Printable sheet.** Open `teacher-sheet.html`, press Print. One page per level: roles, each gate's trade, question, accepted answers, code, and the hint ladder with tick boxes. It uses lines and bold text only, so it prints cleanly in black and white.

## Editing questions, codes and levels

Everything a teacher would change is in the `data` folder. Edit with any text editor, save, and reload the page.

- `data/config.json`: player names and colors, default settings, phrase hints, and every word shown on screen.
- `data/levels/level-1.json` (and 2, 3): one file per level. To add a level, copy a file, give it a new `id`, and add that id to `"levels"` in `config.json`.

### A gate

```json
{
  "id": "g1",
  "type": "question",
  "from": "P1", "to": "P2", "give": { "gold": 3 },
  "card": { "asker": "P2", "answerer": "P1", "question": "What did you do yesterday?", "minSentences": 2 },
  "teacher": {
    "code": "4821",
    "accepted": ["Two full sentences in the past tense."],
    "hints": ["Small clue", "Bigger clue", "Almost the answer"]
  }
}
```

- `type` is `question`, `open` (use `"prompt"` instead of `"question"`; a long answer can earn a bonus gem) or `describe`.
- A `describe` card looks like this. `target` counts from 0. Shapes: `circle`, `square`, `triangle`, `star`, `heart`, `diamond`. Colors: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `white`.
  ```json
  "card": { "describer": "P4", "picker": "P1", "target": 0,
            "options": [ { "shape": "star", "color": "blue", "count": 3 }, { "shape": "star", "color": "red", "count": 3 } ] }
  ```
- A gate can trade between three players. Replace `from` / `to` / `give` with:
  ```json
  "transfers": [ { "from": "P2", "to": "P3", "give": { "wood": 2 } },
                 { "from": "P3", "to": "P1", "give": { "gems": 2 } } ]
  ```
- `give` is the least the giver must hold to start the gate. When the code is entered, everything the giver holds of that resource moves.
- Codes are 3 to 6 digits and must be different for every gate.
- A gate can have its own phrase hints: `"phrases": { "receiver": ["..."], "giver": ["..."] }`.

### The map

Each row is a string, one character per tile. Keep every row the same length (the built-in levels are 24 wide and 11 tall, which fills the screen).

| Character | Meaning |
| --- | --- |
| `#` `.` | Wall, floor |
| `p` | Player start. Put 4 in every map |
| `o` `w` `d` `k` | Gold, wood, gems, gears |
| `1` to `9` | Trade Gate: `1` is the first gate in the list, `2` the second |
| `C` `M` | Chest and machine. What they need is in `"goal"` |
| `S` `B` | Switch plate (use two) and the bars it opens |
| `X` `E` | Exit door and exit pads |

```json
"goal": { "chest": { "gold": 2, "gems": 2 }, "machine": { "wood": 2 } }
```

### Roles and player counts

| Player | Collects | Can use |
| --- | --- | --- |
| P1 red | gold | gears |
| P2 blue | wood | gold |
| P3 green | gems | wood |
| P4 yellow | gears | gems |

With 3 players the circle is gold, wood, gems. With 2 it is gold and wood. A trade only makes sense from the player who collects a resource to the player who uses it.

`"players"` says how many players a level was written for.

- **Fewer players:** the level adapts by itself. Extra players and resources fold onto the smaller circle (with 2 players, P3 becomes P1 and gems become gold), and gates left with nothing to trade disappear.
- **More players:** the level plays as written if its trades still fit the bigger circle; the extra players have no trades of their own. Level 1 with 3 or 4 players is like this. If the trades do not fit, add a variant. Level 2 does this for 4 players:
  ```json
  "variants": { "4": { "gates": { "g2": { "transfers": [ ... ], "card": { "asker": "P4" } } } } }
  ```
  A variant can replace `map`, `goal` and `gates` for that player count.

If a level file has a mistake, the level select screen says the level is not ready, and the browser console (F12) lists what is wrong.

## Checking your changes

```
node tests/run.mjs
```

This needs Node.js, and is optional. It checks the role circle, that every level is valid and can be won with 2, 3 and 4 players, and the trade rules.

## Files

```
index.html            the game page
teacher-sheet.html    the printable sheet
css/                  style.css (page, teacher panel), sheet.css (print)
data/                 config.json and levels/
js/main.js            start-up, game loop, screens
js/input.js           keyboard and controllers
js/roles.js           who collects and uses what
js/levels.js          loading, adapting to player count, checking levels
js/world.js           the room: moving, collecting, using, switches, exit
js/trade.js           Trade Gates: asking, code entry, transfers, hints
js/render.js          all drawing        js/sprites.js   pixel art, drawn in code
js/teacher.js         teacher panel      js/sync.js      keeps the two windows in step
js/audio.js           sound effects      js/sheet.js     builds the printable sheet
tests/run.mjs         logic tests
```

**Embedding in a website.** The game fits itself into the `#stage` element, at the largest whole-number scale. Put the folder on any static web host and use an `<iframe src=".../index.html">`, or give `#stage` a fixed size in `css/style.css`.
