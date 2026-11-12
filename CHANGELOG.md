# Changelog

## 2026-11 — first public version

**Open to every teacher**
- Neutral look by default; the Speak Plus brand is an option (`shared/config.js` or `?brand=speakplus`).
- English and Spanish interface for the hub, Word Drop, City Run and Hot Seat.
- Code under MIT, content under CC BY 4.0, fonts under OFL. Contributor guide, templates and CI.
- The hub is made from each game's `game.json`, with filters by class size, age, level, time, skill
  and student devices.

**Any subject, any language**
- Content packs in `packs/`: Spanish, Japanese and English word lists, irregular verbs, capitals,
  science (English and Spanish), times tables, an English and a Spanish town, quiz questions.
- Every word game: ready-made lists, open and save files, and share links that carry the list.
- Saved classes shared by all games, with "Make teams".

**Works on poor Wi-Fi**
- Fonts are self-hosted: no page loads anything from other sites.
- After the first visit the hub and the static games open with no connection (service worker).

**Games**
- New: **Hot Seat**, a describing game where the whole team talks every turn. It is also the template for new games.
- Word Drop: answers (`perro = dog`) shown on a miss and at the end; a speaking task per game (say it,
  make a sentence, describe it, ask a question); lives "Off" so nobody is knocked out; team members on
  the turn card; "Not played" words listed at the end; longer prompts wrap; bigger scoreboard;
  "End game" no longer names a winner.
- City Run: places, useful phrases and quiz questions are editable and come in packs; answers can
  include accents, ñ, digits and spaces, and match without accents; tablets get a text box for
  spelling (it used to get stuck on Hard); the teacher can open a door for +5 s; useful phrases stay
  on screen; waiting teams get a listening task; "Not English" follows the class language.
- Speak Plus City is "Talk City" under the neutral brand.
- Stealth Squad: `/colyseus` and `/metrics` need `ADMIN_PASSWORD` away from the server's own computer.
