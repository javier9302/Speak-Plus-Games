# Lantern Island

A cooperative pixel-art adventure for English conversation classes. Students join from their phones by scanning a QR code and walk their own characters around a shared island shown on the classroom screen. Everyone wins together.

**Built so far: stages 1 to 3 of 8.** Server, host screen with QR code and lobby, phone join, characters moving in real time, groups with saves, the 12 abilities shared among the players, private clues, and now items, doors and challenge tablets that pull cards (choice, typed, spelling, and code cards checked by the teacher). The teacher's full live panel, chat, the monster and missions come in the next stages.

## Run it on the teacher's laptop

You need [Node.js](https://nodejs.org) 18 or newer. The first time only:

```
cd lantern-island
npm install
```

Every time:

```
npm start
```

The window prints three things: the host screen address, the address phones use, and the teacher PIN.

1. Open **http://localhost:3000/host/** on the laptop and put it on the TV or projector.
2. Choose a group (or type a name and press **Create**). Each group is one class and keeps its own island.
3. Students scan the QR code, type a name, and appear in the player list. 2 to 6 players.
4. Press **Start**. Students walk with the joystick on their phone.

Stop the server with `Ctrl+C`. If port 3000 is busy, run `PORT=3001 npm start`.


### Try it without phones

In the lobby, click **Open a test player window** once per player. Each window is its own player; move with the arrow keys or WASD (click the window first). You can also open `http://localhost:3000/phone/?room=CODE&p=1`, `&p=2`, and so on. The `p` number is what keeps the windows apart, because windows of one browser share their storage.

To test reconnecting: reload a test player window, or close it and open the same address again. The player comes back as the same character in the same place.

### When phones cannot connect

Laptop and phones must be on the same network.

- **"No network found" on the host screen:** the laptop has no Wi-Fi. Connect it; the QR code updates by itself within a few seconds.
- **The page never loads on the phones:** many school, office and guest Wi-Fi networks stop devices from talking to each other ("client isolation"). The fix is a phone hotspot: turn on the hotspot on one phone, connect the laptop and the other phones to it, and wait for the new QR code. The game uses almost no mobile data, because everything stays between the devices.
- **Still nothing:** the laptop's firewall may be asking whether Node may accept connections. Allow it. On macOS: System Settings → Network → Firewall.
- **No camera or QR reader:** type the address shown under the QR code, then the room code.

### Phones

Portrait only. The page does not zoom or scroll, keeps the screen on where the browser allows it, and reconnects by itself: if a phone locks or loses Wi-Fi, the character waits (shown as "away" in the lobby and faded on the map) and the student gets it back on return. The ✕ next to a name in the lobby removes a player.

### Characters

On the join screen, students tap **Your character** to choose who they play: the Islander (the original character in their player colour), one of the original characters (Fox, Robo, Frog, Penguin), and, on the teacher's own computer only, the classroom fan-art characters (see below). While waiting for the teacher they can change with **Change character**; during a mission the choice is locked. Two students may pick the same character: names on the map, in each player's colour, tell them apart, and the picker shows who already has which. The big screen's lobby shows each player's character. The phone remembers the last choice.

The original drawings are in `public/shared/heroes.js` (16×16, one letter per pixel, with notes at the top of the file). To add a character, copy an entry, give it a new `id` and run `npm test`, which checks every drawing.

**Fan art, for classroom use only.** 16 famous characters (Pikachu, the Dragon Quest Slime, Jibanyan, Tanjiro, Nezuko, Zenitsu, Doraemon, Totoro, Kirby, Mario, Goku, Luffy, Naruto, Hello Kitty, Anpanman, Sailor Moon) live in `public/shared/heroes-local.js`. They belong to their owners (Nintendo, The Pokémon Company, Square Enix, Level-5, Shueisha, Sanrio, Studio Ghibli and others), so that file is **never uploaded**: it is listed in `.gitignore`, it is not in the GitHub repository, and online (hosted mode) the server refuses to send it or to accept those characters. Keep your copy of the file in `public/shared/` on the computer you teach with; when it's there and the game runs on that computer (`npm start`), students can choose them. Without the file, the game simply offers the original characters. Never publish the file or use these characters in advertising.

## Abilities and clues

When the game starts, the 12 abilities are shared out so that nobody can do everything:

| Players | Abilities each |
| --- | --- |
| 2 | 6 and 6 |
| 3 | 4, 4, 4 |
| 4 | 3, 3, 3, 3 |
| 5 | 3, 3, 2, 2, 2 |
| 6 | 2 each |

- Each phone opens a **role card**: what you can do, and what each teammate can do. **My role** shows it again.
- On the phone, your abilities are bright buttons. The others are grey; tapping a grey one says who to ask ("Ken can Listen. Ask!").
- Walk up to an object and the phone names it and says what it needs: "Old sign: You can Read it", or "??? needs Read: ask Ken". The button to press glows.
- A clue appears **only on the phone of the player who used the ability**. That player has to tell the team. **Clues** on the phone lists what that player has found so far.
- The big screen shows only that an ability was used (its icon pops up over the character) and a count, "Clues found: 3 of 9". It never shows clue text.

On the host screen, **Reshuffle** gives the abilities to different players, and **Random mix** switches between the preset sets and a random share-out. If a player joins late or is removed, the abilities are shared out again by themselves, and every phone shows its new role card.

**Editing.** The sets are in `data/abilities.json` (`assignments`, one list per player for each player count), with the names and short descriptions of the abilities and the rules for the random mix. Objects and their clue texts are in `data/scenarios/beach/zones/beach.json` under `objects`. Restart the server after editing these; if an object has a mistake, the server says which one and does not start.

### Testing abilities and clues on one computer

1. Start a game with three or more test player windows. Each opens its role card; press OK.
2. In the window of the player who has **Read**, walk right along the path to the first sign. The prompt says "You can Read it" and the Read button glows. Press it: the clue card opens in that window only.
3. Walk another player to the same sign: the prompt says "??? needs Read: ask …" and the button is grey.
4. The stone statue (west) answers to Look and to Read with different texts. The big shell (south beach) needs Listen.
5. Press **Reshuffle** on the host screen: every window shows a new role card.

## Items, doors and challenge tablets

The beach now has a small adventure: **collect three lanterns**. The host screen shows "Lanterns: 1 of 3" and "Goal complete!" at the end. Every step needs two players.

| Thing | What the abilities do |
| --- | --- |
| Big rock | **Push** rolls it aside (and back). |
| Chest | **Open** shows what is inside, then **Pick up** takes it. **Close** shuts it. |
| Gate | Locked: **Use** with the key in your pocket unlocks it. Then **Open** and **Close**. |
| Broken bridge | **Jump** takes one player across. **Fix** with the plank repairs it for everybody. |
| Stone tablet | **Use** opens its challenge card. When it is solved, a reward appears on it; **Pick up** takes it. |
| Item on the ground | **Pick up**. |
| A teammate next to you | **Give** hands over the item selected in your item bar. |
| Sign, statue, shell, bottle, the keeper | Clues, as before: **Look**, **Read**, **Listen**, **Talk**. |

- A player carries up to 4 items. They show in the bar under the map on the phone; tap one to choose what Give hands over.
- Nothing can be lost or destroyed. If a player is removed from the game, what they carried goes back to where it was found.
- On the beach: the key is in the chest behind the big rock in the north. The plank comes from the spelling tablet. The fourth tablet is on the small island, behind the gate and the broken bridge.

### Challenge cards

Each tablet takes one card when the game starts, chosen for the group's level (set on the teacher panel). If no card has that level, a card of another level is used.

| Type | How it is checked |
| --- | --- |
| Choice | The student taps A, B or C. |
| Typed | Compared with the accepted answers. Capitals, spaces and a final full stop do not matter. A card can allow one small typo (`allowTypos`). |
| Spelling | The phone says the word (**Play the word**); the student types it. No typos allowed. |
| Code | Speaking. The phone says CALL THE TEACHER. You listen, and say the code if the answer is good enough. |

The card appears **only on the phone of the player who used the tablet**, with "Read it to your team!". Wrong answers never lock anything; the team just tries again.

**All the questions are in one file: `data/questions.json`** (about 160, A1 to C1, every type). To add one, copy a line of the same type, paste it under it and change the words:

```json
{"type": "spelling", "level": "A2", "tags": ["spelling"], "word": "island", "describe": "Land with water all around it.", "hints": ["Lantern Island is one!", "It has six letters and an S you do not hear.", "i-s-l-a-..."]},
{"type": "choice", "level": "A1", "tags": ["food"], "prompt": "Which one is a drink?", "options": {"A": "Bread", "B": "Milk", "C": "Rice"}, "answer": "B", "hints": ["You drink it from a glass.", "It is white.", "Cows give it."]},
{"type": "typed", "level": "A2", "tags": ["seasons"], "prompt": "Which season comes after summer?", "accepted": ["autumn", "fall"], "allowTypos": true, "hints": ["Leaves fall from the trees.", "Americans say 'fall'.", "a-u-t-u-..."]},
```

- Every line ends with a comma except the last one before `]`. Lines that are only text in quotes are section titles.
- `id` is optional; a spelling card needs no `prompt` (it says "Listen and spell the word."). Up to 3 hints, from a small help to almost the answer.
- Changes apply the next time you press **Start**, without restarting the server. Run `npm run check`: it names any question with a mistake (a missing comma, an answer that is not one of the options) and counts the questions of each type and level, so you see where more are needed.
- The more questions a level has, the less they repeat: a tablet draws from the half of the matching questions used least recently.

The Cards tab of the teacher panel shows these questions too (marked "in data/questions.json") but cannot change them; **Duplicate** makes an editable copy. Cards made in the Cards tab, or imported there from CSV or JSON, are saved apart (`data/cards/`, one file each, or Supabase).

### The teacher's view of a running game

Open the **Teacher panel** from the host lobby (or `/teacher/` and type the room code under **Live game**). It lists every tablet with its question, the answer, and for code cards the **code**, what to accept, and three hints to give if students ask in English. A code card that students have opened gets a red frame and "Call the teacher". Keep this screen where students cannot see it.

### Testing stage 3 on one computer

Use **two** test player windows: the first player gets Look, Read, Talk, Listen, Pick up, Give, and the second gets Open, Close, Jump, Push, Use, Fix. Open the teacher panel in another tab to see the answers.

1. Player 2: walk to the purple tablet west of the start and press **Use**. Answer the card. A lantern appears on the tablet.
2. Player 1: walk there and **Pick up** the lantern. The host screen shows "Lanterns: 1 of 3".
3. Both go north to the big rock. Player 2: **Push**, then **Open** the chest. Player 1: **Pick up** the key, stand next to player 2 and **Give**.
4. At the gate on the bridge, player 2: **Use** (unlocks), **Open**.
5. Player 2 solves the spelling tablet (south-east of the start) for the plank; player 1 picks it up and gives it; player 2 uses **Fix** on the broken bridge. Or player 2 simply **Jumps** over.
6. On the small island, player 2 opens the last tablet: the teacher panel shows the code.

## Competitive mode: teams

Up to 4 teams play the same island at the same time, each in its own room, and race each other. Everything else works as in the cooperative game, inside each team.

**Running a match**
1. On the host screen, under **Compete**, choose the number of teams and press **Create teams**. The big screen now shows one card per team: name, QR code and join code. Choose the group (it sets the level and the monster).
2. Each team scans its own QR code, or types its code. Up to 6 players per room; the 7th is refused.
3. Press **Start the match** (host screen), or **Start all** (teacher panel). Every room with players starts the same quick mission. A room with only 1 player blocks the start; an empty room is left out.
4. The big screen shows only the scoreboard. It never shows a team's map, because everybody can see it.
5. The teacher panel (the **Teacher panel** button on the host screen) has a **Teams** table: players, status, score, progress, charge, effect, and per-team buttons: **+5 speaking**, add or take any points, **Watch** (the map, tablets, monster and chat below switch to that team), **Pause**, **End**, **Start**. Above it: **Start all**, **Pause all**, **Resume all**, **End all**, **Back to lobby**, and **Sabotage** on/off.
6. The first room to reach the final objective is 1st, the next 2nd, and so on. The others keep playing until they finish or you press **End all**.

**The room model.** A match (`server/match.js`) is a list of ordinary rooms (`server/rooms.js`), one per team. Each room has all of its own state, as before: map objects, doors, items, clues, gate code, monster, stuns and heals, roles, abilities, the teacher's queue. Messages go only to the sockets in that room, so an event in one room cannot reach another. The match only reads each room's counters to score it, and sets one field (`room.effect`) on a sabotage target, after the checks. The `ws` library has no channels, so the rooms are the channels: every room keeps its own set of sockets. A phone that reconnects sends its token and gets back the same room, character and abilities.

**Scoring** (points in `server/compete-config.js`): a new clue, a tablet's card answered, an obstacle cleared (locked gate unlocked, bridge fixed, sluice fixed, rock pushed aside, once each), the monster chased away, finishing (1st to 4th), and the teacher's buttons. A score never goes below 0. The scoreboard holds only each team's name, score, progress (clues found of all clues, goal items of the goal) and finishing place.

**Sabotage: fog.** Every 3 new clues give a team a charge (it keeps at most 1). A **Send fog** button then appears on its phones; with more than one other team, the player picks the target. The target's phones show "Team Dolphin sent you fog!" over the map, with a countdown; they can still walk and use abilities. The server keeps the end time: the fog ends after 20 seconds on the server's clock (it waits while that room is paused), and a phone that reconnects under fog sees the time left. Rules: one effect per room at a time, a room cannot be hit again for 30 seconds after an effect ends, a team cannot target itself, a finished team cannot send or receive. The server ignores requests from a team without a charge, a phone claiming to be another team, or an unknown target. The teacher can cancel an effect, or switch sabotage off (that also stops running effects).

To add an effect (for example "slow"): add it to `EFFECTS` in `server/sabotage.js` (what it does in the game when it starts and ends), its seconds in `compete-config.js`, and how phones show it in `EFFECT_VIEWS` in `public/phone/phone.js`.

**Config** (`server/compete-config.js`): `maxRooms` (4), `roomSize` (6, also the limit of the cooperative game), `teamNames`, `points`, and `sabotage`: `enabled`, `cluesPerCharge` (3), `maxCharges` (1), `cooldownSeconds` (30), `effects.fog.seconds` (20). Tests override any of them with `createApp({ compete: { ... } })`.

**Messages** (also listed at the top of `server/rooms.js`):

| From → to | Message |
| --- | --- |
| host → server | `match:create {teams}`, `match:teams {teams}`, `match:group {id}`, `host {match, matchKey}` (a reloaded host screen) |
| host or teacher → server | `match:start {n?}`, `match:pause {on, n?}`, `match:end {n?}`, `match:lobby`, `match:kick {n, id}` (`n` = one team; without it, all) |
| teacher → server | `teacher {match}` (follow a match), `score:adjust {n, delta}`, `sabotage:cancel {n?}`, `sabotage:toggle {on}` |
| phone → server | `join {room}` (the team's room code, as before), `sabotage:send {target, effect?}` |
| server → everyone in the match | `score:update {phase, board: [{n, team, score, progress, place}]}` |
| server → host screen, teacher panel | `match {...}`: teams, join codes, players; the teacher's copy adds charges and effects. Never positions or objects. |
| server → one room's phones | `roster.team` (team name, charge, effect with its time left), `sabotage:start {id, from, left}`, `sabotage:end {id, why}` |
| server → the sender's phone | `sabotage:sent {id, target}` |

A match is not saved to the group's island (no stars, landmarks or sessions). The cooperative game is unchanged and can run on the same server at the same time.

## Scenario packs

All the adventures are data, one folder per pack in `data/scenarios/`: `beach`, `forest` (opens after 2 restored landmarks) and `harbor` (Moonlight Harbor, opens after 4: the example pack that uses every feature). A pack holds its maps, missions, its own challenge cards, tiles and themes.

- **Writing a pack:** follow `docs/SCENARIO_GUIDE.md`. It covers every field, the object kinds and goal types, the design rules, and ends with a complete small pack to copy.
- **Checking it:** `npm run check -- <pack>` lists every mistake in plain English, with the file and a suggestion for typos, and proves every mission can be finished with 2 to 6 players (and every shuffled run of it).
- **Editing while the game runs:** the server reloads pack files by itself. The next mission uses them; running missions keep theirs. A file with a mistake keeps the last good version and shows the problem on the teacher panel.
- **Variety:** missions can change their map (rename, new clue texts, move, add or remove objects), choose a theme (night, winter, rain, festival...), a goal type (collect, restore machines, press stones in order, find the odd one out, deliveries in order, escort a character) and a time limit. Objects in slots, shuffles and random goal parts make every run different.
- Pack missions and cards appear in the teacher panel but are edited in their files only. The teacher's own templates and cards work as before.

## The teacher panel and the PIN

**http://localhost:3000/teacher/** manages groups: level, monster setting, notes, and the save buttons below.

On the laptop that runs the server, the host screen and the teacher panel open without a PIN. On any other device (a tablet in your hand, for example) they ask for the **teacher PIN** printed when the server starts. It changes on every start unless you set your own: `TEACHER_PIN=4321 npm start`.

## Saves and backups

Each group is one file in `data/groups/`. It holds the group name, level, monster setting, notes, the island (restored landmarks, completed missions, stars, sessions played) and the nicknames used. No other student data is stored.

| Button | What it does |
| --- | --- |
| Export save | Downloads the group as a JSON file. Keep these as backups. |
| Import save… | Loads such a file. If the group is already there, you choose: replace it, or keep both. |
| Duplicate group | A copy with the same island, settings and notes. |
| Reset island | Landmarks, missions, stars and sessions back to zero. Notes and settings stay. Asks first. |
| Delete group | Removes the group and its island. Asks first. |

To move a class to another computer: Export on the old one, Import on the new one.

## Hosted mode (optional)

The same code runs on a server on the internet, so phones can use mobile data instead of the school Wi-Fi.

```
PUBLIC_URL=https://island.example.com TEACHER_PIN=4321 PORT=8080 npm start
```

- `PUBLIC_URL` switches hosted mode on. The QR code points to it.
- Put the server behind a proxy that provides HTTPS and passes WebSockets through. The pages then use `wss://` by themselves.
- In hosted mode the host screen and teacher panel **always** ask for the PIN. Set `TEACHER_PIN`, or read the random one in the server log.
- `DATA_DIR` sets where saves go (default `./data`). Use a folder that survives restarts, or `STORAGE=supabase`.
- The fan-art characters are **off** in hosted mode: `/shared/heroes-local.js` is never served (even if the file were there) and the server refuses their ids. The original characters in `heroes.js` are always available. `FAN_ART=on` or `off` overrides the default (on when running locally).
- On Render, `PUBLIC_URL` can be left out: Render's `RENDER_EXTERNAL_URL` is used.

**Render + Supabase, step by step:** see [docs/RENDER.md](docs/RENDER.md). The blueprint is `render.yaml` at the root of the repository.

## Checking that everything works

```
npm test
```

Runs two simulations. `test/sim.js` starts the server on a spare port and plays a simulated class against it: pages, group saves, joining, moving, walls and water, reconnecting, a full room, the ability tables for 2 to 6 players, who may use what, that clue text reaches one phone only, reshuffling, answer checking, a full play-through of the beach with two players (rock, chest, key, gate, bridge, all four card types, the lantern goal), that answers and codes reach the teacher only, and the PIN in hosted mode. `test/compete.js` then plays a match with 24 phones in 4 rooms: rooms fill to 6 and refuse the 7th, solving obstacles in one room leaves the other three exactly as they were, the scoreboard holds only names, scores and progress, the host screen never gets a map, and fog reaches only its target, ends after 20 seconds on the server's clock, survives a reconnect, and follows the cooldown and one-at-a-time rules. Run it alone with `node test/compete.js`.

## Files

```
server/index.js          start-up
server/config.js         settings from the environment
server/http.js           the pages and the groups API
server/content.js        loads the scenario packs (data/scenarios)
server/validate.js       checks pack files and says what is wrong, in plain English
server/overrides.js      a mission's changes to its map (rename, texts, lines, move, remove, add, slots, shuffle)
server/run.js            one run of a mission from a seed: slots, shuffles, the goal's random parts
server/tiles.js          tiles (what blocks the way; packs can add their own) and themes (how a map looks)
server/atlas.js          maps of a pack linked by exits, joined into one big map (exits become teleports)
data/themes.json         the built-in themes: day, sunset, night, winter, autumn, rain, festival
server/rooms.js          rooms, lobby, game loop, the message list
server/match.js          competitive mode: teams, scores, sabotage
server/compete-config.js competitive mode: every number and team name
server/sabotage.js       the sabotage effects (fog)
server/world.js          the map, objects, what blocks the way, movement speed
server/abilities.js      sharing out the 12 abilities
server/things.js         runs the object rules in the game (what an ability does to the nearest object)
server/kinds/            one file per kind of object: its states, actions, checks (read by the game and the solver)
server/goals/            one file per goal type: what finishes a mission (read by the game and the solver)
server/cards.js          challenge cards: choosing one, checking answers
server/groups.js         groups and their saves
server/net.js            finding the laptop's address
server/storage/          storage adapters (file now, Supabase later)
public/host/             the big screen
public/phone/            the students' controller
public/teacher/          the teacher panel
public/shared/pixel.js   all pixel art, drawn in code (tiles, characters, objects, ability icons)
public/shared/render.js  drawing the map and characters
data/scenarios/       scenario packs, one folder each: pack.json, zones/ (maps, objects, clues), missions/, cards/
data/abilities.json      the abilities and who gets which
data/items.json          the items, and how many a player can carry
data/questions.json      the question bank: every challenge card, in one list to copy and paste into
data/cards/              cards made in the teacher panel's Cards tab, one file per card
data/groups/             saves (made when you create a group)
test/sim.js              the simulated class
test/compete.js          the simulated match (4 rooms, 24 phones)
test/content.js          scenario packs: loading, and the mistakes npm run check finds
test/goals.js            every goal type on a test map: solved, and played in a real room
```

Things you may want to change: walking speed is `SPEED` in `server/world.js`; how much of the map a phone sees is `DEFAULT_VIEW` in `server/rooms.js`; player colours are `PLAYER_COLORS` in `public/shared/pixel.js`. The map can be edited in `data/scenarios/beach/zones/beach.json`: keep every row the same length and keep six `p` start tiles (the `legend` in the file lists the characters).
