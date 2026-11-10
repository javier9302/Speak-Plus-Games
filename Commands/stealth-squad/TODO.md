# TODO — Stealth Squad

## Milestones
- [x] **M0** — Monorepo scaffold, CLAUDE.md, `npm run dev` runs client + server,
      phone opens the page over LAN and connects to a Colyseus room.
- [x] **M1** — One player moves on a test tilemap from a phone (tap-to-move + crawl).
- [x] **M2** — Lobby: room code + QR, up to 6 players, role selection, host
      spectator view; everyone sees each other move.
- [x] **M3** — Guards + patrol routes, server-side vision cones + alert meter,
      Scout-only cone rendering with turn timers, spotted → checkpoint restart.
- [x] **M4 part 1** — Skills as data + merge for 2–5 players, hiding in bushes,
      Scout ping, Tagger tie/carry/drop, Trapper burrow/cover, Sleeper darts,
      evidence detection.
- [x] **M4 part 2** — Trapper traps (glue / net / noise maker), Disguise (uniform +
      chat), Engineer (doors, fences, alarms) with new map tiles, host drags
      skills between players, disconnect mid-level → pause + redistribute.
- [x] **M5 Level 1** — Snow Outpost with briefing, role cards, objectives, exit,
      mission complete screen, level picker.
- [x] **M5 Level 2** — Bridge Checkpoint: guards on a bridge and river; steal the
      plans from the office (new "pick up item" objective), escape by truck zone.
- [x] **M5 Level 3** — Night Depot: searchlights, a patrolling dog, rescue a
      captured ally (NPC that follows the team).
- [x] **M6** — Polish (sounds, animations), metrics page, bot load test + resource
      report, Dockerfile for cloud deploy.

- [x] **Levels 4–5** — Harbor Yard (two jobs, boat) and Robot Factory (night
      finale: rescue + radio + chip, two searchlights, two dogs).

## Open questions (for the user)
- Hosting: Dockerfile works for any host; Fly.io recommended (docs/DEPLOY.md).
  The Docker image itself hasn't been built yet (no Docker on the dev Mac).

## Ideas / later
- Real art and sound files (textures.ts / sprites.ts / sound.ts are drop-in places).
- Playtest Harbor Yard and Robot Factory in class (Robot Factory may be too long).
- More levels (text grids in shared/src/levels, check with `npm run check-level`).
- Player "card" button in game to re-read role phrases.

- Tune `parSeconds` per level and the DIFFICULTY numbers after real classes.

## Notes
- Skills merge automatically in the lobby (`assignSkills`); host can move any
  skill (lobby or mid-game). Darts/traps are team pools per checkpoint.
- Objective kinds: fix (tile becomes X), item (pick up), rescue (friend follows).
- Checkpoint rule defaults to "all" (per-level `checkpointRule` flag).
- Tuning knobs live in shared `VISION`, `ABILITY`, GUARD_SPEED, SPOTTED_SECONDS.
- Never put cones or turn timers in synced state: cones are drawn only on
  Eyes-skill / host clients, timers go only to them via `intel`.
- Every level solvable with 2, 4 and 6 players.
