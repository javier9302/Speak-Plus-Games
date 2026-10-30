# Speak Plus City

A Monopoly-style board game whose real goal is to **make students speak English**. Every move is a sentence: students buy, ask for rent, trade, bid in auctions and negotiate with the bank, and the bank (the teacher) approves each action. 2–6 players, mixed levels, 1–2 hour sessions.

Plain HTML, CSS and JavaScript (ES modules), no database, no login, no build. Two ways to play:

- **Board only**: everything on the projector, the teacher's laptop runs the bank. Needs just a simple web server.
- **With phones** (optional): students scan a QR code; each phone shows only that student's money, properties, mission and turn buttons, and the projector hides them. Needs the small game server in `server/` (Node.js), on the laptop or online.

## Run it

The two windows talk to each other with `BroadcastChannel`, which needs both pages on the same address, so the game needs a web server:

| Where | How | Phones? |
| --- | --- | --- |
| Online | The `speak-plus-city` service in `render.yaml` (see `lantern-island/docs/RENDER.md`). Open `https://<its address>/teacher.html`. | ✅ any connection: mobile data, home or school Wi-Fi |
| Mac | Double-click **start.command** (the first time: right-click → Open). | ✅ with Node.js, same Wi-Fi or hotspot |
| Windows | Double-click **start.bat**. | ✅ with Node.js, same Wi-Fi or hotspot |
| Any (Node.js) | `npm install` once, then `npm start` in this folder; open <http://localhost:8080/teacher.html> | ✅ same Wi-Fi or hotspot |
| Any (Python) | `python3 -m http.server 8080` in this folder, or serve the hub folder | ❌ board only |

The start scripts use the Node.js game server when Node.js is installed (and install its two packages the first time), otherwise Python. Keep the black window open while you play.

On your own laptop, phones must reach the laptop: the same Wi-Fi or your hotspot. Online they use any connection.

Opening the HTML files by double-click (`file://`) does not work; the pages say so.

## Setting up the classroom

1. Open **teacher.html** on your laptop screen. You are the bank.
2. Press **Open board window**, drag that window to the projector or TV, and press **F** for full screen.
3. Add the players (name, token, level) and press **Start the game**.

Use the **same browser** for both windows. The game saves itself in the browser after every action, so a refresh or a crash loses nothing (only the Undo history). Refreshing either window is always safe.

| Page | What it is |
| --- | --- |
| `index.html` | Start page with links |
| `teacher.html` | Bank, approvals, events, hints, log, settings (laptop) |
| `board.html` | The board, tokens, dice, prompts, cards (projector) |
| `editor.html` | Content editor: change texts each month without code |

## How a turn works

1. **Roll**: the student clicks *Roll the dice* on the board (or presses Space). With real dice, type the total on the teacher page (e.g. `7` Enter, or `3 4` Enter).
2. The token moves square by square. The board shows the square, its vocabulary and topic, and a **Say it!** box with the sentence to say.
3. The student presses a button (*Buy*, *Draw a card*, *Talk to the bank*…) and **says it**. The teacher page shows the request: **Approve**, **Approve + bonus** (excellent sentence), **Try again**, or the "no" button (Cancel / Waive rent / Not done / No deal / Miss the turn).
4. **End turn**. It stays locked until the square is dealt with (buy or pass, card done…).

### Squares

| Square | What happens |
| --- | --- |
| Property (30) | Buy it by asking the bank in a full sentence, or **Pass** → auction. Owned by someone else → see **Rent** below. A full colour group doubles the rent. |
| Chance (5) | A speaking card for the player's level. Success → reward; failure → the card's "if not done" amount. |
| Mystery (4) | A challenge: describe a picture, speak for 30 seconds, two truths and a lie, explain a word without saying it, role play. |
| Bank (4) | Tax Office / Luxury Tax (pay, or persuade for a discount: type the new amount before approving), City Hall (bonus), City Bank (loan offer). |
| Black Market (1) | Opens the Black Market: a rare item sold to the best pitch. |
| Start | Salary for passing it. |
| Coffee Break | Jail. On their next turn the player speaks their way out (Approve) or misses the turn. |
| Town Festival | Optional talk about a festival, for a reward. |
| Go to Coffee Break | Straight to the Coffee Break corner. |

### Rent: the owner must ask

Landing on someone else's property costs nothing by itself. The **owner** has to notice and ask: *"Excuse me, Ken! You're on my Ramen Corner. Please pay me $20 rent."* They can ask until the **next player rolls the dice**; after that, the visitor got away with it.

- Board only: the teacher page shows a **Rent can be asked for** box (who, where, how much). When the owner asks out loud, press **… asked → collect the rent**, then approve as usual.
- With phones: the owner presses **Ask for rent** next to the property on their phone (My city tab). Phones never say when rent is due, and in phone mode the board doesn't show who owns what, so students have to watch and remember.

Settings → *Rent and phones* → *Rent: The visitor pays when landing* brings back the classic rule (a **Pay rent** button that must be used before ending the turn).

### Levels

| Level | On their turn the board shows |
| --- | --- |
| Beginner | Sentence frames + key vocabulary |
| Intermediate | Key vocabulary; a button shows the frames on request; a challenge line |
| Advanced | Only the task and a challenge line |

Change a player's level any time on their card. Settings → *Hints on the board, per level* changes what each level sees.

### Talking anywhere, any time

- **Trade** (board button or `T`; with phones, the Deal tab): pick the two players, the properties and money on each side. The board shows frames for lower levels. The deal waits for the teacher's **Confirm**. The teacher can also build a deal in the Bank tab.
- **Ask the bank** (board button or `B`; with phones, the Bank tab): loan, mortgage or discount. The request appears on the teacher page; set the terms with the Bank tab (loan amount and how much they pay back) or the Properties tab (mortgage).
- **Auctions**: the board shows the property, a countdown and the highest bid. Students shout bids; the teacher presses +10 / +50 / +100 or types an amount. A late bid adds a few seconds. The teacher can auction any property at any time from the Properties tab (a player's property: the seller gets the money).

## Playing with phones (optional)

1. Start the game with the game server (online, the start scripts with Node.js, or `npm start`).
2. On the teacher setup screen tick **Play with phones (QR code)**. A room code and QR code appear on the teacher page and big on the board.
3. Students scan the QR code (or open the address and type the code) and type their name. Each phone becomes a player row on the setup screen; choose levels and tokens, then **Start the game**.

On a phone, four tabs:

| Tab | What's there |
| --- | --- |
| 🎲 Play | Whose turn it is. On your turn: the square, the "Say it!" box for your level, and your buttons (Roll, Buy, Pass, Draw a card, End turn…). Requests waiting for the bank, deals offered to you (**It's a deal!** / **No, thanks**), auctions, the Black Market, the rule of the round, hints the teacher sends you. |
| 🏠 My city | Your secret mission (tap to show), your properties with their rent, and **Ask for rent**. |
| 🤝 Deal | Offer a deal: choose a player, what you give (your properties, money) and what you want (any property someone has bought — you don't know who owns it, so ask!). The other player answers on their phone, then the teacher confirms. |
| 🏦 Bank | Ask for a loan, a mortgage or a discount: practise the sentence, press **Call the bank**, then say it to the teacher. |

What stays private: each phone shows only its own money, properties and mission. The board hides money, debts, property dots and missions, and shows a grey ✓ on sold properties instead of the owner (tick *show who owns each property on the board* in Settings to show owners). The teacher page sees everything, as always. Results at the end are public.

- Students without a phone can still play from the board buttons; the teacher page does the rest.
- A phone that closes or reloads comes back as the same player. A phone that joins late picks a free player. The **Phones** tab lists every phone: change which player it plays, or remove it.
- Dice from phones are always random. With real dice, type the total on the teacher page as usual.
- Auction bids are still shouted and entered by the teacher.

## The teacher page

- **Turn column**: whose turn, the dice box, the request waiting for approval, the player's buttons (press them for the student), auctions, trades, the Black Market, requests, turn control (end, skip, move the token ±1, *Use this square* after a manual move, choose whose turn) and a small board.
- **Player cards**: money (+/− quick buttons and custom amounts), level, ⭐ gold star, English rule button, "Rule broken" fine, repay debt, the secret mission (hidden until you press *show*), properties, and a **notes box** for errors and good sentences.
- **Tabs**: Bank (transfer, loans, repay, trade builder) · Properties (owner of every property, mortgage, auction) · Events (market, Black Market, rule of the round, town fund, a card for any player, announcement, end) · Hints · Log · Settings · Game (timer, save/load, new game).
- **Undo** (Ctrl+Z) goes back one action at a time.

### Hints

Hints tab → choose the player (or everyone) → click any sentence frame, vocabulary list or example answer, or type your own. It pops up big on the projector and closes itself after a few seconds (Settings), or with *Close the hint*.

### Surprise elements (each can be switched off in Settings)

1. **Mystery squares** — see above.
2. **Market boom / crash** — Events tab: doubles or halves prices and rents everywhere or in one district, for some rounds. Big announcement on the board.
3. **Secret missions** — each player gets one at the start. Players peek on the board (🔒 next to their name, or `M` on their turn: "everyone else look away"); the teacher can show them on the laptop. At the end, tick missions done and correct guesses for bonuses.
4. **Black Market** — a rare item for 2 minutes (Settings); the teacher chooses the best pitch and the price. Items count for the final worth.
5. **Rule of the round** — a new rule every round (e.g. "No yes or no"). "Rule broken" on a player's card fines them.
6. **Town fund** — taxes, some cards and fines go into a shared fund. When it reaches the target, everyone gets the Town Festival bonus.
7. **Gold stars** — ⭐ on a player's card (or `S` for the current player): bonus + star animation. Most stars are shown at the end.

**English-only rule** (Settings): Off · Rewards only (default: "✓ English turn" gives a bonus) · Fines ("✗ Japanese" fines the player).

### Timer and end of game

Set the game length when you start (45/60/90/120 min or none); the board shows it. Pause, add or remove time in the Game tab. Optional per-turn timer in Settings. In the **last 10 minutes** all rewards are doubled (can be switched off).

When the time is up (or you press *End the game*), the teacher page asks which missions were done and who guessed a mission correctly. **Show the results** puts the ranking on the board: money + property values (mortgaged at half) + Black Market items − debts + mission bonuses, the secret missions, the most gold stars, and confetti.

### Save, load and feedback

- **Save game** downloads a `.json` file; **Load game** continues it next week on any computer (the timer starts paused; press Resume).
- **Log** tab → *Export log + notes (.md)*: every purchase, trade, auction, card and money change, plus your notes per player, for feedback after class.

## Keyboard shortcuts

Press `?` on either page.

| Board | | Teacher | |
| --- | --- | --- | --- |
| Space | Roll | 2–12 Enter | Move by real dice (or `3 4`) |
| Enter | Main button | Space | Random roll |
| ← → | Move the token one square | A / B | Approve / Approve + bonus |
| T | Trade | R / D | Try again / Deny |
| B | Ask the bank | N / Shift+N | End turn / Skip turn |
| M | Peek at your mission | ← → | Move the token one square |
| F | Full screen | S | Gold star (current player) |
| Esc | Close a panel | Ctrl+Z | Undo |

## Changing the content

All texts are in **data/content.json**: the 48 squares (names, prices, rents, colour groups, vocabulary, topics), Chance cards, Mystery challenges, missions, rules of the round, Black Market items, Coffee Break challenges, and the "Say it!" prompts and hint bank, with Beginner / Intermediate / Advanced versions where relevant.

The easy way is **editor.html**:

- **Save (use in games)** keeps your version in this browser. The teacher window uses it after a reload. Cards, missions, rules and prompts change straight away; a changed board is used from the next new game (a running game keeps its board).
- **Download content.json** gives you a file. Replace `data/content.json` with it to make it the default everywhere (another computer, the school website).
- **Import a file** loads a `content.json` to edit. **Reset to default** forgets your saved version.

The editor checks the content before saving (48 squares, corners in place, every property has a colour group, price and rent…).

Rules for the board: exactly 48 squares; square 0 is Start, 12 Coffee Break, 24 Town Festival, 36 Go to Coffee Break. Placeholders in prompts: `{name}` `{price}` `{amount}` `{owner}` `{challenge}`; anything else in braces shows as a blank `___`.

## For developers

```
speak-plus-city/
├── index.html, board.html, teacher.html, editor.html, phone.html
├── start.command, start.bat      one-click local server (Node.js game server, or Python)
├── server/index.js               game server for phone mode: serves the pages, rooms with QR codes, passes messages
├── css/  city.css (brand + shared) · board.css (board, also used small on the teacher page) · teacher.css · editor.css · phone.css
├── data/content.json             all editable content
├── js/
│   ├── state.js         game model and rules: apply(state, action, ctx) → new state. Pure, no DOM; runs in Node
│   ├── sync.js          BroadcastChannel messages + localStorage save
│   ├── content.js       load / validate / save custom content
│   ├── render-board.js  the 48-square board and tokens
│   ├── board.js         projector page: rendering, animations, player input
│   ├── teacher.js       teacher page: owns the state, applies actions, undo, save/load
│   ├── views.js         what each phone may see: phoneView(state, pid), lobbyView. Pure; runs in Node
│   ├── phones.js        teacher page ↔ game server connection (phone mode)
│   ├── phone.js         phone page
│   ├── editor.js        content editor
│   └── ui.js            small DOM helpers, "Say it!" box, help overlay
└── tests/  run.mjs (rules and phone views) · server.mjs (the game server)   npm test runs both
```

- The teacher window is the single source of truth. The board sends `{t:'act', action}`; the teacher applies it with `apply()` (board actions are limited to `BOARD_ACTIONS`), saves to localStorage (`sp-city-state-v1`) and sends the whole state back (`{t:'state'}`, without the log and notes). The board also sends `hello`/`ping` so each side knows the other is open.
- One-off animations (dice, moves, announcements, stars…) are `state.fx` entries with growing ids; the board plays the ones it hasn't seen.
- The board layout is copied into the game at setup (`state.squares`), so a saved game keeps its board.
- Teacher settings are remembered for the next game in `sp-city-settings-v1`; custom content in `sp-city-content-v1`.
- **Rent** (`settings.rentRule`, default `'ask'`): landing on someone else's property sets `state.rentDue = {sq, from, to}`; the next `roll` clears it. `claimRent` (owner) turns it into a pending `rent` with `claim: true`, which the teacher approves like any other.
- **Phone mode**: the server (`server/index.js`) knows nothing about the game. The teacher page opens a room (`host`), gets each phone's button presses (`act`, with the phone's token) and sends each phone its own view (`send`). `state.seats` maps phone tokens to players; a phone action goes through `apply()` with `from: 'phone'`, and `checkPhone` makes it act as its own player only (turn actions only on its turn; `PHONE_TURN_ACTIONS`, `PHONE_ANYTIME`). Views come from `js/views.js` and never contain other players' money, properties, missions, or who owns a property. Deals from phones start as `status: 'offered'` until the other phone answers (`tradeAnswer`).
- The board learns the room code and QR code from the teacher (`net` in the `state` message) and hides private information when `settings.phones` is on.
