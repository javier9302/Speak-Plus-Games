# CLAUDE.md — Stealth Squad

Guidance for future Claude Code sessions. Read this first so you don't have to
re-read the whole codebase.

## What this is
A cooperative, top-down **pixel-art stealth game** for an English conversation
school (Speak Plus, Japan). Up to 6 students each play on their own phone
(mobile browser, no install); a teacher runs the host screen on a laptop.
Genre is inspired by early-mission *Commandos*-style squad stealth, but **all
art, names, maps and story are original** — never copy assets, names, levels or
text from any existing game.

The point is **communication**: each player has information or abilities the
others lack, so students must talk (in English, out loud) to win.

Non-violent: no blood, no killing. Guards are "tagged out" (tied up, dizzy,
asleep). Cartoon, friendly, suitable for ages 14 to 50+.

## Stack
- **TypeScript** everywhere. npm workspaces monorepo: `shared/`, `server/`, `client/`.
- **Client**: Phaser 3 + Vite. Landscape, touch-only.
- **Server**: Node + **Colyseus** (authoritative). Server owns guard AI, vision
  cones, detection, abilities, checkpoints. Clients send inputs only.
- **Shared**: plain TS types/constants, no runtime deps (no Phaser/Colyseus).
- Maps: **text grids** in TS (user chose this over Tiled at M5) — one file per
  level in shared/src/levels/. Art: 16×16 tiles; characters 16×19 (sprites.ts).
- Server tick ~20 Hz; client interpolation. Vision cones are server-side raycasts.

## Layout
```
shared/   @stealth-squad/shared — types & constants (messages, speeds, phases),
          roles.ts (Role, ROLE_INFO, SUGGESTED_TEAMS merge table),
          skills.ts (Skill ids, ROLE_SKILLS, ABILITY tuning, assignSkills merge),
          map.ts (GridMap, Tile enum incl. door/fence/panel, FIXES, cloneMap,
          hand-written test map), path.ts (A*),
          vision.ts (VISION tuning, raycast, detectionRate, coneOutline),
          level.ts (LevelDef: map, briefing, objectives, exit, guards,
          checkpoints, rule, parSeconds; testLevel),
          difficulty.ts (DIFFICULTY easy/normal/hard table, missionStars),
          levels/ (snowOutpost.ts,
          bridgeCheckpoint.ts, nightDepot.ts, harborYard.ts, robotFactory.ts,
          index.ts = LEVELS + getLevel)
server/   @stealth-squad/server — Colyseus server, /health, /info, /colyseus,
          /metrics (page) + /metrics.json (metrics.ts), static web page in production
          rooms/GameRoom.ts (room logic + tick), rooms/schema.ts (synced state),
          rooms/abilities.ts (use-skill handling, hiding, carry, timed actions),
          sim/GuardSim.ts (patrol + turning), tools/checkLevel.ts
client/   @stealth-squad/client — Phaser + Vite
          src/main.ts (route: /host vs phone; starts Phaser once in a room),
          src/net.ts (create/join/reconnect, join URL), src/session.ts (shared room),
          src/lobby.ts (phone join form + role picker), src/host.ts (teacher screen),
          src/ui.ts + ui.css (DOM overlay helpers/styles),
          src/GameScene.ts (world, tap-to-move, interpolation, camera),
          src/GuardLayer.ts (guards for all; cones + timers for Scout/host),
          src/HudScene.ts (unzoomed overlay: status, crawl + skill buttons,
          banner, toast, aim hint),
          src/textures.ts (tiles, items, vehicles generated at boot),
          src/sprites.ts (characters as text-grid spritesheets: people per
          role, cardboard robot costume, guard robots steel/gold/eye-off,
          robot dog; 3 facings × 3 frames, left = flipX),
          src/sound.ts (Web Audio beeps, no files; mute stored in localStorage)
```

## Rooms & lobby (M2)
- Teacher opens `http://localhost:5173/host` → `create("game", {host:true})`.
  Room id = 4-letter code (no I/O). Phones can't create rooms.
- Phones open the QR link `/?room=CODE` → `joinById(code, {nickname})`.
  Max 6 players + 1 host (host is not in `state.players`).
- State: `code`, `phase` ("lobby" | "playing"), `hostConnected`, `players`
  (nickname, role, slot, connected, x, y, crawling, moving).
- Lobby UI is plain DOM (`#ui` overlay) over the Phaser canvas; it re-renders
  only when a small signature changes (`onLobbyChange`), not on every patch.
- Roles: `pickRole` (free roles only), host `assignRole` (swaps). Host sends
  `start` (spawns in join order) and `backToLobby`.
- Reconnect: tokens in sessionStorage; server holds a dropped phone's slot
  RECONNECT_SECONDS (host: HOST_RECONNECT_SECONDS, then room closes).
- Host QR uses the LAN IP from server `GET /info` when opened via localhost;
  `VITE_PUBLIC_URL` overrides for cloud.

## Guards, detection, checkpoints (M3)
- Guards: `GuardSim` walks A* legs between stops (loop / pingpong), waits at
  stops turning through `look` angles; single-stop guards turn forever.
  Synced per guard: x, y, angle, alert (0–100). Guard freezes while its meter fills.
- Detection (`detectionRate`, same code client & server): touch range any
  direction; else cone ±35°, range 6 (crawl 3.5), wall line-of-sight; closer
  = faster; crawling = half speed. Meter full → phase "spotted", 3 s
  countdown, then everyone + guards reset to the current checkpoint.
- **Info split**: guard position/facing are public (sprites show facing),
  and so is the "?/!" alert mark. Cone shapes are computed only on the
  Scout/host client; turn timers arrive only via the targeted `intel`
  message (Scout role + host). Never put cones or timers in synced state.
- Checkpoints: level rule "all" (default) or "one" connected player inside the
  zone. Host bar: Pause/Resume, Restart level, Next checkpoint, Back to lobby.

## Abilities (M4 part 1)
- Skills are data (`Skill` in shared/skills.ts). `assignSkills` runs at level
  start: own role's skills + skills of unpicked roles merged per the brief's
  table (fallback: player with fewest skills). Synced as `Player.skills`.
- One contextual button per non-passive skill (HUD). `use {skill, x?, y?}`;
  aimed skills (ping, dart) = press button, then tap map. Server validates
  everything and replies with `hint` toasts; client labels are only hints.
  - eyes (passive, Scout): cones + timers. ping: broadcast marker.
  - tag: Tie (asleep guard, or awake guard from outside his cone) → Pick up
    (tied) → Drop (bush tile = auto-covered). Carrying: 0.6× speed, no crawl.
  - dig: Burrow on snow (invisible, can't move; tap/“Get up” = 1 s) or Cover
    a tied guard (2 s, any move cancels).
  - dart: team pool `state.darts` (3 per checkpoint), range 7, needs LOS;
    guard sleeps 20 s then wakes `woke` (range ×1.3, fill ×1.5).
- Hiding: standing on a bush tile → `hidden` → only touch range detects.
- Evidence: an active guard that sees an uncovered asleep/tied guard → instant
  spotted ("A guard found a tied-up guard!"). Guard.status:
  patrol | asleep | tied | carried; Guard.covered.
- **M4 part 2:**
  - trap (aimed; client cycles Glue → Net → Noise → cancel, sends `kind`):
    glue/net placed ≤2 tiles from you as `state.traps`; a patrolling guard
    stepping on one → `stuck` 8 s (still sees) / `netted` (out, evidence,
    tieable). Noise: thrown ≤6 tiles with LOS; guards within 8 tiles
    `investigate` (walk over, look 3 s, walk back). Team pools per checkpoint:
    glue 2, nets 1, noise 2.
  - disguise: Uniform (1 s) / Chat (guard within 1.6 faces you 4 s) /
    Uniform off. Ordinary guards seeing a disguised player raise
    `Player.suspicion` (100 = 5 s watched → spotted); officers
    (`GuardDef.officer`, gold) detect normally.
  - fix: Open door / Cut fence / Switch off panel (FIXES table). Room map is
    a clone; changes synced as `state.tiles` (index → Tile), client applies
    them with putTileAt. They survive checkpoint restarts; Restart level resets.
  - Skills recomputed in the lobby on every roster/role change; host
    `moveSkill` overrides persist into the level. Disconnect mid-level →
    paused + `pauseReason`; auto-resume on reconnect; if they time out their
    skills go to the connected player with fewest skills.
- Testing tip: `new GameRoom()` + `onCreate({host:true})` + `startLevel()` +
  `tick(50)` works in a tsx script without a server (used for evidence tests).

## Levels & mission flow (M5)
- A level = text grid (`parseMap`, legend in map.ts:
  `# . , b * ~ S D F P R = B T Y H X K ^`) + guards + checkpoints (6 spawns
  each) + objectives + exit rect + A2 briefing lines. Objectives:
  `kind: "fix"` (tile must become `doneTile`, e.g. Radio → RadioOff) or
  `kind: "item"` (first player to step on x,y takes it → `Player.item`).
  `kind: "rescue"` (an `Ally` waits at x,y; a player within 1.5 tiles frees
  them; they follow the rescuer — path every 0.4 s — and must reach the exit).
  Fixed tiles persist through restarts; an item taken / friend freed since
  the current checkpoint goes back if the team is spotted.
- Level 3 extras: `night` (client dark overlay), `searchlights` (spot sweeps
  from→to, `searchlightSpot`; anyone not hidden/burrowed in the spot for
  0.5 s → spotted; off when its `panel` tile is PanelOff), dogs
  (`GuardDef.dog`: ×1.6 speed, half sight range, smell 2.5 tiles in any
  direction incl. bushes + disguise, no chat, no evidence alarm).
  Register in levels/index.ts. Always run `npm run check-level`.
- Phases: lobby (host picks level: `setLevel`) → `start` → briefing (phones:
  briefing + role card with SKILL_HELP + ROLE_PHRASES; host: big text) →
  `beginMission` → playing ⇄ spotted → won (all objectives + every connected
  player in exit). Synced: levelId, objectivesDone, spottedCount, missionSeconds.
- Client rebuilds tilemap/guards/camera when `state.levelId` changes.
- Server `loadLevel` mutates the same map object / guards array in place so
  World and GuardSims stay wired.

## Movement (M1)
- Client sends `moveTo {tx,ty}` (tile) on tap; server nudges off walls
  (`nearestWalkable`), runs A* (`findPath`, 8-dir, no corner cutting), replies
  `path {ok,tx,ty}`, and moves the player along waypoints each tick.
- `crawl {on}` toggles speed (WALK_SPEED / CRAWL_SPEED, tiles/s in shared).
- Client renders every player from synced state and smooths toward it.
- Client connects to `:2567` in dev, to the page's own host:port in a
  production build (`import.meta.env.PROD`); `VITE_SERVER_URL` overrides.
- Colyseus is pinned to **0.16** (core, ws-transport, monitor, client 0.16.22).
  Don't let `npm audit fix` / installs bump it to 0.18 — that breaks the client.

## Commands
- `npm install` — once, at repo root (installs all workspaces).
- `npm run dev` — runs server (:2567) and client (:5173) together.
- `npm run typecheck` — runs `tsc --noEmit` on shared, server and client.
- `npm run build` — web page (client/dist) + server bundle (server/dist/index.mjs, esbuild).
- `npm start` — production: one port serves game + web page (NODE_ENV=production).
- `npm run loadtest -- --rooms 3 --seconds 60` — bots + resource report (server must run).
- Docker / hosting / load-test numbers: docs/DEPLOY.md.
- `npm run check-level` — simulate guards; fails if a guard can see a
  checkpoint spawn or a stop/checkpoint is unreachable. Run after level edits.

## Connecting a phone (LAN)
1. Laptop and phone on the same Wi-Fi.
2. `npm run dev`; the server console prints `LAN (for phones): ws://<ip>:2567`.
3. On the phone open `http://<same-ip>:5173`. The client derives the server URL
   from the page host automatically (`client/src/net.ts`). Override with
   `VITE_SERVER_URL` for cloud deploys.
- Colyseus dev dashboard: `http://localhost:2567/colyseus` (open on this computer; other devices and cloud hosts need `ADMIN_PASSWORD`, see docs/DEPLOY.md).

## Key design rules (don't break these)
- **Abilities and information are individual.** Only the Scout's client renders
  vision cones and guard timers — never send cones to other clients.
- Skills are **data, not hard-coded per role**: a player holds a list of skills.
  With <6 players, missing roles' skills merge into present players (see brief).
  Every level must be solvable with 2, 4 and 6 players.
- Limited items (darts, traps) keep the **same team total** regardless of count.
- Spotted (alert meter full, or a guard sees uncovered "evidence") → whole team
  restarts from the last checkpoint.

## How to work
- Work in **milestones** (see TODO.md). After each: stop, summarize (what works,
  how to test on phone, known issues), and wait for the user's OK.
- Prefer small, focused edits over whole-file rewrites. Don't generate large
  assets as code. Ask before adding dependencies or changing the stack.
- Keep this file and TODO.md current.

## Status
- **M0 done**: monorepo scaffold, `npm run dev` runs both, phone can open the
  page over LAN and see a live Colyseus connection + ping.
- **M1 done**: tap-to-move with server pathfinding + crawl toggle on a test
  map; camera follows you; other players visible.
- **M2 done**: host screen (/host) with code + QR, phone join form, role
  picking/assigning, start / back to lobby, spectator full-map view,
  reconnect after screen lock.
- **M3 done**: 3 patrolling guards on the test level, alert meter, Scout/host
  cones + timers, spotted → checkpoint restart, 2 checkpoints, host pause etc.
- **M4 part 1 done**: skills as data + merging, hide in bushes, ping, tie,
  carry/drop, cover, burrow, sleep darts, evidence alarm.
- **M4 part 2 done**: traps (glue/net/noise), disguise + chat + officers,
  engineer doors/fences/panels, host skill moves, disconnect pause.
- **M5 Level 1 done**: Snow Outpost (4 guards incl. officer, radio objective,
  boat exit, 3 checkpoints), level picker, briefing + role cards, objectives
  HUD, mission complete screen.
- **M5 Level 2 done**: Bridge Checkpoint (river + one bridge, 5 guards incl.
  officer in the office, steal-the-plans item objective, truck exit).
- **M5 Level 3 done**: Night Depot (night, 2 searchlights + switch box, dog,
  officer at the cell, rescue friend who follows, truck exit). M5 complete.
- **M6 done**: sounds + mute, shake/flash/pop effects, /metrics page,
  bot load test (tools/loadtest.ts), production bundle + Dockerfile.
  All milestones complete.
- **Art pass (characters)**: guards are robots (steel; officers gold; dog =
  robot dog), players are people with a 4-facing walk. Robots face 4 ways
  plus a small "scan" light at their exact angle (public facing info, not the
  cone). Knocked-out robots lie down, eye off. Disguise = cardboard robot
  costume with the wearer's colour as eye light. Player-facing text says
  robot / boss robot / robot dog / "it", "switched off" (not asleep),
  "Costume" (not Uniform); code identifiers still say guard / officer.
- **Difficulty + stars**: host picks Easy / Normal / Hard in the lobby
  (`setDifficulty`, synced `state.difficulty`, shared `DIFFICULTY`). Normal =
  levels as designed. Knobs: sightFactor (server detection + client cones),
  fillFactor, team pools, freeSeconds (Hard: tied/netted robots free
  themselves after 40 s, not while carried, walk back to the route; the Scout
  gets the countdown via `intel`), waitJitter (Hard: random stop waits),
  maxSpotted (Hard: 5th spot → `startLevel`, time + count reset). Hard
  sightFactor must stay 1: some spawns are just outside normal sight —
  check-level tests the largest sightFactor of any difficulty.
  End screen: 3 stars (finished · spotted ≤ STAR_MAX_SPOTTED · under the
  level's `parSeconds`). Par times (6/8/10/11/15 min) are guesses: tune after class.
- **Levels 4–5**: Harbor Yard (day; two jobs: take the map from the
  warehouse past a boss robot + switch off the radio; a dog; boat exit) and
  Robot Factory (night finale; rescue + radio + control chip; two
  searchlights with separate switch boxes, one inside the hall; two dogs, two
  boss robots, 8 robots; truck exit). Both pass check-level; not playtested.
