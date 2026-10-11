# Lantern Island

A cooperative pixel-art adventure for English conversation classes. Students join from their phones by scanning a QR code and walk their own characters around a shared island shown on the classroom screen. Everyone wins together.

**All eight stages of the plan are built.** Phones as controllers, the 12 abilities shared among the players, private clues, two zones (the beach and a forest), challenge cards, nine missions, the teacher's Game Master panel with a card library and mission builder, teacher chat with links, helpers, courier letters, the hidden monster, islands that grow with every mission, a solver that proves missions can be finished (`npm run check`), printable teacher sheets, sound effects, and optional storage in Supabase.

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
4. Press **Start a quick mission**, or open the **Teacher panel** and choose a mission there. Students walk with the joystick on their phone.

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

### Sound

Short sound effects (an ability used, a right or wrong answer, mail, a stun, the monster's shot, mission complete) are made by the browser; there are no sound files. Each device has its own switch: **Sound: on/off** on the host screen, and at the bottom of the role card on a phone. Browsers only play sound after the first tap or click on the page.

### Phones

Portrait only. The page does not zoom or scroll, keeps the screen on where the browser allows it, and reconnects by itself: if a phone locks or loses Wi-Fi, the character waits (shown as "away" in the lobby and faded on the map) and the student gets it back on return. The ✕ next to a name in the lobby removes a player.

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

In the teacher panel, **Reshuffle abilities** gives the abilities to different players, and **Random mix** switches between the preset sets and a random share-out. If a player joins late or is removed, the abilities are shared out again by themselves, and every phone shows its new role card.

**Editing.** The sets are in `data/abilities.json` (`assignments`, one list per player for each player count), with the names and short descriptions of the abilities and the rules for the random mix. Objects and their clue texts are in `data/zones/beach.json` under `objects`. Restart the server after editing these; if an object has a mistake, the server says which one and does not start.

### Testing abilities and clues on one computer

1. Start a game with three or more test player windows. Each opens its role card; press OK.
2. In the window of the player who has **Read**, walk right along the path to the first sign. The prompt says "You can Read it" and the Read button glows. Press it: the clue card opens in that window only.
3. Walk another player to the same sign: the prompt says "??? needs Read: ask …" and the button is grey.
4. The stone statue (west) answers to Look and to Read with different texts. The big shell (south beach) needs Listen.
5. Press **Reshuffle abilities** in the teacher panel: every window shows a new role card.

## The beach

The first zone. The goal of every mission here: **find three lanterns, and one player carries all three to the lighthouse keeper**. Every step needs at least two players, and every one of the 12 abilities is needed somewhere.

| Thing | What the abilities do |
| --- | --- |
| Big rock | **Push** rolls it aside (and back). |
| Chest | **Open** shows what is inside, then **Pick up** takes it. **Close** shuts it. |
| Bridge gate | Locked: **Use** with the key in your pocket unlocks it. Then **Open** and **Close**. |
| Garden gate | Locked with a code of three numbers. **Use** opens a keypad; then **Open**. The three numbers are in three clues: **Read** the old sign, **Look** at the stone fisherman, **Listen** to the big shell. The code is new in every mission. |
| Broken bridge | **Jump** takes one player across. It cannot be fixed. |
| Flat stone | No ability. While a player stands on it, everybody can walk over the broken bridge. It is on the far side, so the jumper lets the others follow. |
| Water gate | Broken: **Fix** with the plank. Then **Close** makes the sea go down, and the way to the sandbank is dry. |
| Stone tablet | **Use** opens its challenge card. When it is solved, a reward appears on it; **Pick up** takes it. |
| A teammate next to you | **Give** hands over the item selected in your item bar. **Pick up** takes an item back from a teammate, so nothing handed to the wrong person is ever stuck. |
| Lighthouse keeper | **Talk**. With all three lanterns in your own pockets, this completes the mission. |
| Signs, statue, shells, bottle | Clues: **Look**, **Read**, **Listen**. |

How it fits together:

- The **key** is in the chest behind the big rock in the north. It opens the bridge gate.
- The **garden** (a ring of trees with a code gate) holds the Garden tablet, which gives the **plank**.
- The plank fixes the **water gate**; closing it opens the way to the Sandbank tablet in the south.
- The **small island** is behind the bridge gate and the broken bridge. The keeper and the Island tablet are there.
- Lanterns come from the West, Beach, Sandbank and Island tablets. A mission uses some of the five tablets.

A player carries up to 4 items. Nothing can be lost or destroyed. If a player is removed from the game, what they carried goes back to where it was found.

### A second zone: Whisper Forest

A river cuts the forest in two. The goal: find three **crystals** and carry them to the forest ranger. The puzzles use the same kinds of things in a different order: the rope bridge to jump (with a flat stone on the far side), a yard gate with a code whose numbers are on both sides of the river, an old dam to fix and close, and a cabin gate that needs the key.

The forest **opens for a group when it has restored two landmarks**. The host's result screen announces it. Quick missions then choose between the zones the group has opened. In the mission builder you can start any mission at any time; a zone the group has not opened yet is marked.

To add a zone, put a file in `data/zones/` (copy `forest.json` as a model), add missions for it in the teacher panel or in `data/missions/`, and run `npm run check`.

### The island grows

Each group has its own island. It starts in ruins. Every completed mission restores one landmark, for ever. On the beach: the lighthouse, the boat dock, the flower garden, the post office, the windmill, the fountain, the market stall, the campfire. In the forest: the ranger's cabin, the old well, the forest mill, the wild flowers, the camp, the honey stall. A mission restores the landmark it names; if that one is already standing (or the mission names none, like a quick mission), the next ruin in the list is restored.

- The host lobby shows the group's island and "3 of 8 landmarks restored".
- When a mission is completed, the new landmark blinks on the map behind the result.
- Landmarks are saved with the group, and travel with its export file. **Reset island** in the Groups tab puts everything back in ruins.

Landmarks never change where players can walk, so the puzzles are the same for a new class and an old one.

### Challenge cards

Each tablet takes one card when the game starts, chosen for the group's level (set on the teacher panel). If no card has that level, a card of another level is used.

| Type | How it is checked |
| --- | --- |
| Choice | The student taps A, B or C. |
| Typed | Compared with the accepted answers. Capitals, spaces and a final full stop do not matter. A card can allow one small typo (`allowTypos`). |
| Spelling | The phone says the word (**Play the word**); the student types it. No typos allowed. |
| Code | Speaking. The phone says CALL THE TEACHER. You listen, and say the code if the answer is good enough. |
| Link | A web page or video that reaches the students through a helper. Answered as a choice, a typed answer or a code. |
| Courier | A letter one player must hand to another at a named place. The receiver then answers the card inside. |

The card appears **only on the phone of the player who used the tablet**, with "Read it to your team!". Wrong answers never lock anything; the team just tries again.

Cards live in the card library: see **Cards** under the teacher panel below.

### Playing through the beach on one computer

Use **two** test player windows: the first player gets Look, Read, Talk, Listen, Pick up, Give, and the second gets Open, Close, Jump, Push, Use, Fix. Open the teacher panel in another tab, start the mission **Light the lighthouse**, and set the monster to Off for a first try. The panel shows the garden gate's code and every answer.

1. **West tablet** (purple, west of the start). Player 2: **Use**, answer. Player 1: **Pick up** the lantern.
2. **The code.** Player 1: **Read** the old sign on the path, **Look** at the stone fisherman in the west, **Listen** to the big shell on the south beach. Each gives one number.
3. **The garden** (ring of trees south-east of the start). Player 2: **Use** on the garden gate, type the three numbers, then **Open**. Inside, **Use** the Garden tablet. Player 1: **Pick up** the plank and **Give** it to player 2.
4. **The water gate** (south-west beach). Player 2: **Fix**, then **Close**. The sea goes down. Both walk south to the sandbank; player 2 solves the Sandbank tablet, player 1 picks up the second lantern.
5. **The key.** North: player 2 **Push** the rock and **Open** the chest; player 1 **Pick up** the key and **Give** it.
6. **The bridge.** Player 2: **Use** the key on the bridge gate, **Open**, **Jump** the broken bridge, and stand on the flat stone. Player 1 walks across.
7. **The small island.** Player 2 solves the Island tablet (a code card: the code is in the panel). Player 1 picks up the third lantern and **Talks** to the keeper. Mission complete, and the lighthouse stands.

Teleport in the teacher panel saves a lot of walking while you test.

## Missions

A mission is a goal of about 25 minutes on the island. A class can play two or three in a lesson, one after another.

- **Start a quick mission** on the host screen makes one on the spot: every tablet, with card types drawn from what the library has at the group's level (link cards are left out, because they need you at the panel).
- In the teacher panel, **Start a mission** lets you choose: pick a template, tick the tablets to use, and for each one choose a card type (with optional tags), or one specific card. Set the minutes and the monster (the group's setting, or one for this mission) and press **Start this mission**.
- **Save as a new template…** keeps the mission as you built it, for other classes. **Delete template** removes one.
- The host screen shows the mission name, the goal ("Lanterns: 1 of 3") and a clock. The clock turns yellow after the target time; nothing else happens.
- The mission ends when the team reaches the goal, or when you press **End mission**. The host screen then shows what was restored, the stars, and the team's numbers: time, challenges solved, clues found, abilities used, hints used. There is never a ranking of players.
- **Stars**: one for completing the mission, one for finishing within the target time, one for using at most one hint. Stars, the completed mission and the restored landmark are saved to the group.
- **A mission that cannot be finished does not start.** Before starting, and before any reshuffle, the server checks with the solver (see "Checking that everything works"). If you build a mission that has a dead end, for example the Sandbank tablet without the Garden tablet that gives the plank, the panel tells you what is in the way. If a mission can be finished but leaves a player with no ability the team needs, you get a note.

The nine templates (six for the beach, three for the forest) are files in `data/missions/` (created on the first start from `data/seed-missions.json`). You can edit them or add your own there; each lists its tablets and the kind of card for each.

## Chat, helpers, links and letters

Students are in the same room, so there is no chat between them: they talk. The only chat is from you to them.

### Chat

In the teacher panel, **Chat and helpers** sends a text, a link, a sound or a picture to everyone, to one student, to a helper, or to a random student. On the phone it arrives under **Mail**.

- Links open in a new tab. Only `http://` and `https://` addresses are accepted.
- Tick **Shareable** and the student gets a Share button that is **locked**. Their phone says: "You have a message you can share. Someone may ask for your help."
- Each sent message stays listed in the panel with **Unlock sharing for** (one student, or anyone), **Lock**, **Send it to** (straight to a student) and **Remove** (takes it off every phone).

### Helpers

Choose a **Listening Helper** and a **Reading Helper** at any moment (or "Choose at random"). The role shows on that student's role card and next to their name in the panel. The idea:

1. You send a video, article or sound to the helper, shareable.
2. The student who needs it has to ask out loud: "Can you read this with me, please?" / "Can you listen to this with me, please?"
3. When you hear a good request, press **Unlock sharing for** that student. The helper presses **Share with …**, and both can work on it together.

### Link cards

A link card puts that flow on a tablet. The student who opens the tablet gets the question and a note: "Ken is the Reading Helper and has the link. Ask: …". The link goes to the helper's Mail, locked. In the panel, the tablet shows one button: **Unlock sharing for** the student who opened it. If nobody has that helper role yet, another student is made the helper on the spot.

A link card can be answered with a choice, a typed answer or a teacher code. If the card has no address, send your own link from Chat when the tablet is opened; the panel reminds you.

### Courier letters

A courier card is a letter. When a student opens the tablet:

- The player who has **Give** gets a letter in their pocket and a message: "Bring this letter to Mika. Meet at the old bridge. Stand next to Mika and press Give."
- The receiver gets: "Mika, Yui is bringing you a letter. Ask where to meet!"
- They have to talk to find each other, using the place names written on the map (the old bridge, the stone fisherman, the big rock, the meadow, the south beach, the small island).
- Give only works when the two stand together **at the named place**. Then the card inside the letter opens on the receiver's phone, and only the receiver can answer it (they can reopen it from Mail).

In the panel the tablet shows who carries, who receives and where, with **Send the letter to this student instead** and **Deliver it now**. If abilities are reshuffled or a player leaves, the letter moves to whoever has Give, so it can never get stuck.

On a courier card you choose the meeting place, whether the letter is for the student who opens the tablet or a random one, and what is inside (a kind of card, or one specific card).

### Testing chat, links and letters on one computer

Use **three** test player windows (first: Look, Read, Talk, Listen; second: Pick up, Give, Open, Close; third: Jump, Push, Use, Fix) and the teacher panel.

1. In the panel, start the mission **Letters and links**.
2. Send "Hello" to everyone from Chat: each window shows a number on **Mail**.
3. Player 3: **Use** on the South tablet (the link card). Read the note. In the panel, press **Unlock sharing for …** on that tablet; in the helper's window open Mail and press **Share with …**; player 3 now has the link in Mail.
4. Player 3: **Use** on the West tablet (a courier). Player 2 has a letter. Use **Teleport** to bring players 2 and 3 to the old bridge, next to each other. Player 2: tap the letter in the item bar, press **Give**. The card opens for player 3.

## The hidden monster

The monster is a team clock, not a punishment. It is there to make students warn each other and coordinate. **Nobody loses, and nothing it does touches the saved island.**

### Three special roles

| Role | What it does |
| --- | --- |
| **Seer** | The only phone that shows the monster, and the only one that gets the warning before a shot. The Seer has to call it out: "It's behind you!" |
| **Healer** | Stands next to a stunned teammate and presses **Heal**. |
| **Slayer** | Goes near the monster and presses **Slay**. The Slayer cannot see it, so the Seer has to guide them. The power needs 6 seconds to charge again. |

With three or more players the roles go to three different students. With two, one student is Seer and Healer and the other is Slayer. Each phone shows three role buttons under the item bar: your own are bright; the others are grey, and tapping one says who to ask. The roles are also on the role card.

Roles move on by one player with every new mission. In the teacher panel you can give any role to any student, **Rotate roles now**, or let them rotate by themselves every 3, 5 or 8 minutes. You can also take a role yourself ("Me (the teacher)"): as Healer, stunned students have to ask you in English and you press **Heal** next to their name; as Slayer, you get a **Strike it** button.

### What the monster does

Its **anger** goes from 0 to 100. Only you see the meter. Everybody notices its mood as a faint warm tint over the island.

- Anger grows with time, twice as fast when nobody has used an ability for 30 seconds, and with every wrong answer.
- It drops when the team finds a clue, solves a tablet, or the Slayer hits the monster.

| Anger | The monster |
| --- | --- |
| below 35 | **wanders** slowly |
| 35 to 70 | **chases** the nearest player. Its touch stuns |
| above 70 | **shoots**: it stops, takes aim along a whole row or column, and fires a few seconds later. Only the Seer sees the warning ("It's shooting sideways!" / "It's shooting up and down!") and the line. Everybody on that line when it fires is stunned |

A stunned player cannot move or use anything until the Healer comes, or the stun runs out. On Normal and Hard, a shot can also knock an item out of a player's hands: if the Healer arrives before the stun ends, the item is saved; if not, it goes back to where it was found. Items are never lost.

After enough hits from the Slayer the monster leaves for a while, and comes back later.

### Difficulty

Each group has its own setting (Groups tab, or live in the panel): **Off**, **Gentle**, **Normal**, **Hard**.

| | Gentle | Normal | Hard |
| --- | --- | --- | --- |
| Stun | 5 s | 8 s | 11 s |
| Warning before a shot | 4 s | 3 s | 2.2 s |
| Time between shots | 14 s | 10 s | 7 s |
| Anger per minute | 6 | 9 | 13 |
| Hits to chase it away | 2 | 3 | 4 |
| Away for | 90 s | 70 s | 50 s |
| Comes back | calm | a little angry | angry |
| A shot can make a player drop an item | never | sometimes | often |

All of these numbers are in `data/monster.json`. Restart the server after editing it.

### Your controls

In the teacher panel, **The monster** shows the anger meter, what it is doing and how many hits it still needs. Your map always shows where it is and where it is aiming.

- **Freeze / Unfreeze**, **Calm it down** (25 less anger), **Bring it in**, **Send it away**.
- **Difficulty**, **It does** (what its anger says, or wander only, chase, shoot), **Speed**.
- The three role lists, **Rotate roles now**, and automatic rotation.
- Changing the difficulty here lasts for this class session. The group's saved setting is in the Groups tab.

### Testing the monster on one computer

Use three test player windows and the teacher panel. Set the group's monster to Normal in the Groups tab, then start a mission.

1. Each window's role card says which role it has. Find the Seer's window: it shows a purple monster somewhere on the map (walk around, or look at your panel map).
2. In the panel choose **It does: chase**. Let it touch a player: that window shows "Stunned!". Walk the Healer next to them and press **Heal**.
3. Choose **It does: shoot**. The Seer's window shows the red warning and a red line; a moment later everybody on that line is stunned.
4. Press **Freeze**, walk the Slayer next to the monster (use the panel map), and press **Slay** three times, waiting for the charge in between.

## The teacher panel

Open it with the **Teacher panel** button on the host lobby (it then already watches your room), or go to **http://localhost:3000/teacher/** and type the room code. Use it on the laptop next to the TV, or on a tablet in your hand. Keep it where students cannot see it: it shows answers and codes.

### Live game

| Part | What you do there |
| --- | --- |
| Map | See everybody, with the names of the objects. |
| Challenge tablets | Each tablet's question and answer. For code cards: the **code**, what to accept, and a red "Call the teacher" frame when students have opened it. **Release hint 1, 2, 3** puts the next hint on the students' card (they should ask in English first). **Solve it for them** is the rescue button. |
| Talking to a character | When a student uses Talk on the lighthouse keeper, a red box appears. Answer as the keeper: press one of the prepared lines or type your own; it shows on that student's phone only. You can also give an item, approve ("Well done!"), or close the talk. |
| Players | Abilities and items of each player. Give or take an item, **Teleport** (press it, then click the map), rename, remove. |
| Rescue | Open or close the gate and the chest, fix the bridge, move the rock. |
| Game | Pause and resume, reshuffle abilities, random mix, add a team star, reset the zone, end the mission, back to the lobby. |
| Settings | Change the level (tablets nobody has opened yet get new cards), how much of the map a phone sees, phrase help on phones, object names on the host screen, the timer. **A hint costs 30 seconds**: each hint you release adds 30 seconds to the mission clock, which can cost the star for speed. |
| Chat and helpers | See "Chat, helpers, links and letters" above. |
| The monster | See "The hidden monster" above. |
| Session notes | Errors you hear and things to review. Saved with the group as you type. |

On the phones, **Say** opens phrase help: sentences for the situation, such as "Ken, can you open the bridge gate, please?".

### Cards

The library of challenge cards. Nothing about the questions is fixed in the game: every card is yours to edit.

- **Filter** by level, type, tag, used or not in the last 14 days, or search the text.
- **New card**, **Edit and preview**, **Duplicate**, **Delete**. The preview next to the form is drawn by the same code as the phones, so it is exactly what a student sees. Under it, a line for you shows the answer.
- **Sound and picture**: any card can have a picture and a sound. **Record** uses the microphone; **Upload** takes a file (mp3, m4a, wav, ogg, webm; png, jpg, gif, webp; up to 8 MB). Recording works in the browser on the computer that runs the game, or on an https address; on a tablet over plain Wi-Fi, use Upload.
- A choice or typed card with a sound is a listening question. A spelling card says its word with the phone's own voice unless you record it.
- **Export CSV / JSON** saves the cards currently listed. **Import** reads the same formats; a card whose id already exists is replaced, and cards with a mistake are skipped and listed with the reason.

CSV columns: `id, type, level, tags, prompt, optionA, optionB, optionC, optionD, answer, accepted, allowTypos, word, describe, code, teacherAccepted, hint1, hint2, hint3, explanation, points, audio, image, tts, link, helper, meetAt, recipient, then`. Put several tags or accepted answers in one cell separated by `|`. `type` is `choice`, `typed`, `spelling`, `code`, `link` or `courier`. For a link card, fill in the options, or the accepted answers, or the code: that decides how it is answered. For a courier, `then` is a card type or a card id. Export a few cards first to get a file with the right headings.

Cards are saved as files in `data/cards/` (created from `data/seed-cards.json`, 43 samples from A1 to C1; when a new version of the game brings new samples, they are added once, and samples you deleted do not come back); sounds and pictures go to `data/media/`. Changes apply to the next mission you start.

### Printable sheets

Two buttons under the tablets in the Live game tab. Both print in black and white: outlines, lines and bold text only, no filled areas.

- **Print this mission's sheet**: the mission that is running, with its real cards. Who can do what, each tablet's question, answer, code, what to accept and the hint ladder with tick boxes, the garden gate's code, every puzzle and clue, one way through with the current players, and lines for notes. Print it again if you reshuffle.
- **Print the zone sheet**: for preparing. Every puzzle and clue of the beach, the place names, the landmarks, who gets which abilities for 2 to 6 players, one way through the whole zone, and the missions.

### Groups

Level, monster setting, notes, and the save buttons described under "Saves and backups".

### The PIN

On the laptop that runs the server, the host screen and the teacher panel open without a PIN. On any other device (a tablet in your hand, for example) they ask for the **teacher PIN** printed when the server starts. It changes on every start unless you set your own: `TEACHER_PIN=4321 npm start`.

### Testing the teacher panel on one computer

1. Host screen in one tab, two test player windows, and the teacher panel in another tab (button on the host lobby).
2. In the panel: **Start this mission**. The four tablets appear with their answers.
3. Player 2 opens a tablet with **Use**. In the panel press **Release hint 1**: the hint appears on the card.
4. Player 1 walks to the keeper on the small island (or use **Teleport**) and presses **Talk**. Answer from the red box.
5. Try **Pause**, **Give** an item, **Open the bridge gate**, then **End mission** and look at the host screen.
6. **Cards** tab: make a card, look at the preview, save it. Back in **Live game**, choose it for a tablet under "One specific card" and start the mission.

## Saves and backups

Each group is one file in `data/groups/`. It holds the group name, level, monster setting, notes, the island (restored landmarks, completed missions, stars, sessions played) and the nicknames used. No other student data is stored.

To back up everything, copy the whole `data` folder: groups, cards, missions and media.

| Button | What it does |
| --- | --- |
| Export save | Downloads the group as a JSON file. Keep these as backups. |
| Import save… | Loads such a file. If the group is already there, you choose: replace it, or keep both. |
| Duplicate group | A copy with the same island, settings and notes. |
| Reset island | Landmarks, missions, stars and sessions back to zero. Notes and settings stay. Asks first. |
| Delete group | Removes the group and its island. Asks first. |

To move a class to another computer: Export on the old one, Import on the new one.

## Supabase (optional)

By default everything is saved as files in the `data` folder on the laptop, and that is all most teachers need. Supabase is for when you want the saves online: several teachers or computers sharing the same groups and cards, or a hosted server whose disk does not survive restarts.

Only saves go to Supabase (groups and their islands, cards, missions, sounds and pictures). Live play always runs through the game server.

### Setting it up

1. Create a free account and a project at [supabase.com](https://supabase.com).
2. In the project, open **SQL Editor**, paste the whole file `supabase/schema.sql`, and press **Run**. It creates four tables (`li_groups`, `li_cards`, `li_missions`, `li_meta`) and a private file bucket (`li-media`). Running it again is harmless.
3. In the project's API settings, copy the **project URL** and the **service key** (shown as "service_role" or as a secret key, depending on the dashboard version). Not the public "anon" key.
4. Start the game with them:

```
STORAGE=supabase SUPABASE_URL=https://abcd.supabase.co SUPABASE_SERVICE_KEY=your-key npm start
```

The start-up text ends with "Saves: Supabase (…)". If something is wrong, the server stops and says what: a wrong key, missing tables (run the schema), or no answer.

**The service key is a master key for that project.** It is read by the server only and is never sent to a browser. Do not paste it into a web page, a chat, or a file that you share. The tables have Row Level Security switched on with no policies, so the public key can read and write nothing.

### Moving your saves

```
SUPABASE_URL=… SUPABASE_SERVICE_KEY=… npm run copy-to-supabase     # files in ./data  ->  Supabase
SUPABASE_URL=… SUPABASE_SERVICE_KEY=… npm run copy-to-files        # Supabase  ->  files in ./data
```

Both copy groups, cards, missions, sounds and pictures. Records with the same id are replaced at the destination; nothing is deleted anywhere.

### Limits of the free plan, and backups

Supabase's free plan has limits. At the time of writing they were about **500 MB of database, 1 GB of file storage, and 2 active projects**; check their pricing page for the current numbers. This game uses very little: a group is a few kilobytes, and only recorded sounds take real space.

More important for a school: **a free project is paused after about 7 days without use**, for example over a holiday. A paused project does not answer, and the game then says "Supabase did not answer… press Restore project". To bring it back, open the Supabase dashboard, choose the project and press **Restore**; it takes a minute or two, and the data is kept. After a long pause Supabase may only offer a backup to download instead, so:

- keep **Export save** files of your groups (Groups tab), and now and then run `npm run copy-to-files` to have everything on the laptop;
- if Supabase is unavailable on the day, start the game without the three settings: it runs from the files in `data`, and you can copy back later.

## Hosted mode (optional)

The same code runs on a server on the internet, so phones can use mobile data instead of the school Wi-Fi.

```
PUBLIC_URL=https://island.example.com TEACHER_PIN=4321 PORT=8080 npm start
```

- `PUBLIC_URL` switches hosted mode on. The QR code points to it.
- Put the server behind a proxy that provides HTTPS and passes WebSockets through. The pages then use `wss://` by themselves.
- In hosted mode the host screen and teacher panel **always** ask for the PIN. Set `TEACHER_PIN`, or read the random one in the server log.
- `DATA_DIR` sets where saves go (default `./data`). Use a folder that survives restarts, or use Supabase (above) if the host has no lasting disk.

## Checking that everything works

Two commands. Neither needs the game to be running.

```
npm run check
```

The **solver**. For every zone and every mission, with 2 to 6 players, it plays the puzzles the way a perfect team would and checks the design rules:

- the mission can be finished, and no item the team needs is out of reach;
- every player has at least one ability the team cannot do without;
- the whole zone needs every one of the 12 abilities;
- every obstacle needs abilities from at least two different players (handshake rule);
- whoever jumps a gap can let the others follow (pressure-plate rule).

It prints a report, with the shortest way through the zone, and ends with an error if anything is wrong. **Run it after editing a zone, a mission or the ability tables.** It reads the missions in `data/missions/`, so it checks the ones you will actually play.

The same solver runs inside the game: a mission with a dead end does not start, and abilities are never reshuffled into a share-out that cannot finish the mission. This is also why "Random mix" keeps Pick up and Give with the same player: otherwise items could never be handed over.

```
npm test
```

Starts the server on a spare port and plays a simulated class against it (269 checks): pages, saves, joining, moving, reconnecting, abilities, private clues, cards and uploads, a full play-through of the beach with two players, mission results and landmarks saved to the group, every live control of the teacher panel, chat and sharing locks, helpers, link cards, courier letters, the monster and its roles, both zones and how the forest opens, mission templates, the solver, both storage adapters (Supabase against a stand-in server that behaves like its REST interface), and the PIN in hosted mode.

## Files

```
server/index.js          start-up
server/config.js         settings from the environment
server/http.js           the pages and the groups API
server/rooms.js          rooms, lobby, missions, game loop, the message list
server/teacher.js        the teacher panel's live commands
server/chat.js           teacher chat, helpers, link cards, courier letters
server/seed.js           copies sample cards and missions in
server/monster.js        the hidden monster, and the Seer, Healer and Slayer roles
server/solver.js         proves a mission can be finished; the design rules
server/check.js          npm run check
server/sheet.js          data for the printable sheets
server/missions.js       mission templates and the quick mission
server/world.js          the map, objects, what blocks the way, movement speed
server/abilities.js      sharing out the 12 abilities
server/things.js         objects on the map and what each ability does to them
server/cards.js          challenge cards: choosing one, checking answers
server/groups.js         groups and their saves
server/net.js            finding the laptop's address
server/storage/          storage adapters: file.js (default) and supabase.js
server/copy.js           copies everything between the two storages
supabase/schema.sql      the tables and bucket for Supabase
public/host/             the big screen
public/phone/            the students' controller
public/teacher/          the teacher panel (teacher.js: tabs and groups, live.js, library.js) and sheet.html, the printable sheet
public/shared/pixel.js   all pixel art, drawn in code (tiles, characters, objects, ability icons)
public/shared/render.js  drawing the map and characters
public/shared/cardview.js  how a card looks to a student (phone and preview)
public/shared/audio.js   sound effects and the mute switch
data/zones/beach.json    the map, one character per tile, and its objects, places, landmarks and clues
data/zones/forest.json   the second zone
data/abilities.json      the abilities and who gets which
data/items.json          the items, and how many a player can carry
data/monster.json        the monster's speeds, timings and anger rules per difficulty
data/seed-cards.json     the sample cards (copied to data/cards/ on the first start)
data/cards/              the card library, one file per card
data/seed-missions.json  the mission templates (copied to data/missions/ on the first start)
data/missions/ media/    mission templates; uploaded sounds and pictures
data/groups/             saves (made when you create a group)
test/sim.js              the simulated class
test/fake-supabase.js    a stand-in for Supabase, for the tests
```

Things you may want to change: walking speed is `SPEED` in `server/world.js`; how much of the map a phone sees at the start is `DEFAULT_SETTINGS` in `server/rooms.js` (and live in the teacher panel); player colours are `PLAYER_COLORS` in `public/shared/pixel.js`. The map can be edited in `data/zones/beach.json`: keep every row the same length and keep six `p` start tiles (the `legend` in the file lists the characters). The same file has the objects, the place names and the landmarks. After any change there, run `npm run check`.
