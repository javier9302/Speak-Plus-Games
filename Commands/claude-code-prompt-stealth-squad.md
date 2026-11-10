# Project brief for Claude Code: "Stealth Squad" (working title)

## What we're building
A cooperative, top-down **pixel-art stealth game** for my English conversation school (Speak Plus, Japan). Up to **6 students** play together, each on **their own phone** (mobile browser, no install). I run the server from my laptop in class (same Wi-Fi), and later it should be deployable to a cheap cloud host.

Gameplay is inspired by the early missions of the 1998 PC game *Commandos: Behind Enemy Lines*: small squad of specialists, guards with patrol routes and vision cones, sneak in, complete an objective, get everyone out. **All art, names, maps and story must be original** — no assets, names or text from Commandos.

The real goal is **communication**: each player sees or can do something the others can't, so students must talk to each other (in English, out loud in class) to succeed.

## Tone: not violent
- No blood, no killing. Guards are "tagged out": they get tied up / knocked dizzy (stars over head) and stay out of play, or fall asleep (Zzz).
- Cartoon, friendly style. Suitable for junior high students (age 14–15) up to adults over 50.

## Core rules
- If **any player is spotted** by a guard (or caught by a guard who wakes up / gets alerted), the **whole team restarts from the last checkpoint**. Show a short, friendly "Spotted! Back to checkpoint" screen with a 3-second countdown.
- Each level has **2–3 checkpoints**. A checkpoint activates when all living players reach it (or when one player reaches it — make this a level config flag; default: all players).
- Level ends when the objective is complete and **all players reach the exit zone**.
- Detection is not instant: a guard who sees a player fills an "alert meter" (~0.7 s standing, slower when crawling at the edge of the cone). Full meter = spotted.
- Players can **walk** or **crawl** (slower, smaller detection range).

## Hiding and handling tagged-out guards
- **Everyone** can hide in level hiding spots (bushes, barrels, haystacks, behind crates). A hidden player is invisible to guards as long as nobody walks into the hiding tile.
- **Burrow (Trapper skill):** the Trapper can bury himself/herself in **snow or sand** tiles and is invisible until he/she gets up. Can't move while buried; getting up takes ~1 s.
- **Tagged-out guards are evidence.** A tied-up or sleeping guard left where another guard can see him makes that guard **ring the alarm** (= team restarts from checkpoint).
  - A **sleeping** guard wakes up after 20 s. He must be **tied** by the Tagger before he can be moved safely.
  - **Carry/drag (Tagger skill):** the Tagger can pick up a tied guard and move him. While carrying, the Tagger walks slower and **cannot crawl**. Drop anywhere.
  - **Cover (Trapper skill):** the Trapper can **cover** a tied guard with snow, sand or leaves (2 s action). A covered guard is invisible to other guards. Dropping a guard into a hiding spot (bush, barrel) also hides him.
  - This creates a team action: one player moves the body, another covers it, and the Scout watches the cones and counts.
- Server keeps a list of all "evidence" (uncovered tagged-out guards) and checks it against every guard's vision cone each tick.

## The 6 roles (one per player; see "Fewer than 6 players" below)
1. **Scout (the Eyes)** — the ONLY player who sees guards' vision cones and a timer over each guard showing seconds until it turns / moves on. Has to call out "Wait… 3, 2, 1, go!" to the team. Can also ping a spot on the map that everyone sees.
2. **Trapper** — places traps (limited per checkpoint): sticky glue (guard stuck 8 s), net (guard captured permanently), noise maker (guard walks toward it). Can **burrow** in snow/sand and **cover** tied-up guards so nobody finds them.
3. **Tagger** — sneaks up behind a guard and ties him up (non-violent takedown). Must approach from behind/outside the cone. Ties up sleeping or netted guards and **carries/drags** them out of patrol routes.
4. **Sleeper** — sleep darts, limited ammo per checkpoint (e.g. 3). Guard sleeps for 20 s, then wakes up and becomes extra alert. Useful from a distance.
5. **Disguise** — wears a guard uniform. Can walk near guards and "chat" to make a guard face him (turning his back to the team) for a few seconds. Gets spotted if he stays too long or an officer-type guard sees him.
6. **Engineer** — opens locked doors, cuts fences, disables alarms/searchlights, and completes "build/disarm" objectives (e.g. switch off the radio tower).

## Fewer than 6 players: redistribute skills
Every skill must always be available to the team, so with 2–5 players the skills of the missing roles are **merged into the players who are there**.
- Skills are data, not hard-coded per role: a player has a list of skills, and the phone shows one button per skill (up to 3 buttons + crawl + ping).
- Default merge table (when a role is missing, its skills go to the listed role):

| Players | Roles and merged skills |
|---|---|
| 6 | Scout · Trapper · Tagger · Sleeper · Disguise · Engineer |
| 5 | Scout · Trapper + Engineer · Tagger · Sleeper · Disguise |
| 4 | Scout · Trapper + Engineer · Tagger + Sleeper · Disguise |
| 3 | Scout + Disguise · Trapper + Engineer · Tagger + Sleeper |
| 2 | Scout + Disguise + Sleeper · Trapper + Tagger + Engineer |

- In the lobby the host screen shows the suggested distribution, and the teacher can drag skills between players before starting.
- Limited items (darts, traps) keep the **same team total** no matter how many players there are.
- If a player disconnects mid-level, the game pauses and offers to redistribute that player's skills.
- Every level must be solvable with 2, 4 and 6 players.

Key design point: **abilities and information are individual**. Only the Scout's client renders vision cones and timers. Don't send the cones to other clients at all.

## Levels (first 3, original but inspired by early Commandos missions)
1. **Snow Outpost (tutorial)** — few guards, simple loops. Objective: switch off the radio antenna, reach the boat. Teaches walk/crawl, cones, one role each.
2. **Bridge Checkpoint** — guards on a bridge and a river. Objective: steal the plans from the office and escape by truck zone.
3. **Night Depot** — searchlights, a dog that patrols, more guards. Objective: rescue a captured ally (NPC that follows the team).

Each level opens with a **mission briefing in simple English** (A2 level) and role cards showing 3 useful phrases (e.g. "Wait!", "Go now!", "Crawl here", "Guard on the left").

## Screens / clients
- **Phone client (players)**: landscape, touch only. Tap to move (with pathfinding) or virtual joystick (pick one, recommend tap-to-move). Buttons: crawl toggle, role ability, ping. Camera follows the player. Must run smoothly on mid-range Android/iPhone.
- **Host screen (teacher, laptop/projector)**: lobby with **room code + QR code**, players joining, role selection, start/restart level, full-map spectator view with cones visible, and a pause button.
- **Lobby**: students enter a nickname and pick a role; host can reassign roles.

## Tech stack (please use this unless you have a strong reason, and tell me first)
- **TypeScript** everywhere, monorepo (`client/`, `server/`, `shared/`).
- **Client**: Phaser 3 + Vite.
- **Server**: Node.js + **Colyseus** (authoritative server, rooms, state sync). Server owns guard AI, vision/detection, abilities and checkpoints; clients only send inputs.
- **Maps**: Tiled (JSON tilemaps) with object layers for patrol paths, checkpoints, exits, objectives, hiding spots.
- **Art**: start with simple placeholder pixel art (16×16 tiles, generated or free CC0 packs such as Kenney). Keep art swappable.
- Server tick ~20 Hz, client interpolation. Vision cones computed server-side with raycasts against walls.
- Run locally with one command (`npm run dev`), phones connect via `http://<laptop-ip>:<port>`. Add a Dockerfile later for cloud deploy.
- I know HTML/CSS/JS well; keep code readable and commented where it's not obvious.

## Resources and performance (we need to measure)
- Target: 1 room, 6 players + host, on a normal laptop. Later maybe 2–3 rooms at once on a small cloud VM (1 vCPU, 1 GB RAM).
- Add a simple `/metrics` page or log: players connected, tick duration (avg/max), memory use, bytes sent per second per client.
- Build a **bot load test** (6 fake clients moving randomly) to check CPU, RAM and bandwidth. Report the numbers.
- Keep network messages small (Colyseus delta state, no sending of cones to non-Scout players).

## How to work (token/cost budget matters)
- Work in **milestones**. After each milestone: stop, give me a short summary (what works, how to test it on my phone, known issues) and wait for my OK before continuing.
- Create and maintain a `CLAUDE.md` with the architecture, commands and conventions so future sessions don't need to re-read everything.
- Prefer small, focused edits over rewriting whole files. Don't generate large assets as code.
- Ask me before adding new dependencies or changing the stack.
- Keep a `TODO.md` with the remaining milestones and open questions.

### Milestones
- **M0** – Monorepo scaffold, `CLAUDE.md`, `npm run dev` runs client + server, phone can open the page over LAN.
- **M1** – One player moves on a test tilemap from a phone (tap-to-move + crawl).
- **M2** – Lobby with room code/QR, up to 6 players, role selection, host screen spectator view. Everyone sees each other moving.
- **M3** – Guards with patrol routes, server-side vision cones and alert meter, Scout-only cone rendering with turn timers, spotted → restart from checkpoint, checkpoints.
- **M4** – All 6 role abilities, hiding spots, burrow, carry + cover for tagged-out guards, evidence detection by guards, and skill redistribution for 2–5 players.
- **M5** – Level 1 (Snow Outpost) complete with briefing and role cards. Then Level 2 and 3.
- **M6** – Polish (sounds, simple animations), metrics page, bot load test with a resource report, Dockerfile.

Start with **M0** now. Before writing code, give me a short plan of the folder structure and confirm the stack.
