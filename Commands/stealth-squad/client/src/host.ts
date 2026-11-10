import type { Room } from "colyseus.js";
import QRCode from "qrcode";
import { DIFFICULTIES, DIFFICULTY, LEVELS, ROLES, ROLE_INFO, SUGGESTED_TEAMS, getDifficulty, getLevel } from "@stealth-squad/shared";
import { createHostRoom, playerJoinUrl, tryReconnect } from "./net";
import {
  SKILL_NAMES,
  briefingHtml,
  escapeHtml,
  resultHtml,
  onLobbyChange,
  playerRows,
  roleCss,
  showDisconnected,
  uiRoot,
  type PlayerRow,
} from "./ui";

/** Skills panel open during play (toggled from the top bar). */
let skillsOpen = false;

/**
 * Teacher's laptop / projector at /host: creates the room, shows code + QR,
 * lets the teacher assign roles and start; while playing, a slim top bar
 * over the full-map spectator view.
 */
export async function startHost(onJoined: (room: Room) => void) {
  document.body.classList.add("host");
  const ui = uiRoot();
  ui.innerHTML = `<div class="screen"><h1>STEALTH SQUAD</h1><p>Opening a room…</p></div>`;

  let room: Room;
  try {
    room = (await tryReconnect("host")) ?? (await createHostRoom());
  } catch (err) {
    ui.innerHTML = `
      <div class="screen"><h1>STEALTH SQUAD</h1>
        <p class="error">Could not open a room: ${escapeHtml((err as Error).message ?? String(err))}</p>
        <p class="muted">Is the server running (npm run dev)?</p></div>`;
    return;
  }
  onJoined(room);

  const joinUrl = await playerJoinUrl(room.state.code || room.roomId);
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, joinUrl, { margin: 1, width: 240 });

  // Delegated listeners: they survive re-renders of the dynamic parts.
  ui.addEventListener("change", (e) => {
    const sel = e.target as HTMLSelectElement;
    if (sel.dataset.player) room.send("assignRole", { sessionId: sel.dataset.player, role: sel.value });
    if (sel.dataset.skill) room.send("moveSkill", { skill: sel.dataset.skill, to: sel.value });
    if (sel.dataset.level !== undefined) room.send("setLevel", { id: sel.value });
    if (sel.dataset.difficulty !== undefined) room.send("setDifficulty", { id: sel.value });
  });
  ui.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action === "start") room.send("start");
    if (action === "begin") room.send("beginMission");
    if (action === "lobby") room.send("backToLobby");
    if (action === "pause") room.send("pause", { on: !room.state.paused });
    if (action === "restart") room.send("restartLevel");
    if (action === "skip") room.send("skipCheckpoint");
    if (action === "skills") {
      skillsOpen = !skillsOpen;
      render(room, joinUrl, qr);
    }
  });

  room.onLeave(() => showDisconnected("Lost connection to the game server."));
  onLobbyChange(room, () => render(room, joinUrl, qr));
}

function render(room: Room, joinUrl: string, qr: HTMLCanvasElement) {
  const ui = uiRoot();
  const players = playerRows(room);
  const code = escapeHtml(room.state.code || room.roomId);

  if (room.state.phase === "briefing") {
    // Big text for the projector: the class reads the mission together.
    ui.className = "";
    ui.innerHTML = `
      <div class="screen host-briefing">
        ${briefingHtml(room.state.levelId, room.state.difficulty)}
        <p class="muted">Students: read your role card on your phone.</p>
        <p><button data-action="begin">Start mission</button>
           <button class="secondary" data-action="lobby">Back to lobby</button></p>
      </div>`;
    return;
  }

  if (room.state.phase === "won") {
    ui.className = "";
    ui.innerHTML = `
      <div class="screen won">
        <h1>MISSION COMPLETE!</h1>
        <p class="big">${escapeHtml(getLevel(room.state.levelId).name)} — well done, team!</p>
        ${resultHtml(room)}
        <p>${players.map((p) => `<span class="chip" style="--role-color:${roleCss(p.role)}">${escapeHtml(p.nickname)}</span>`).join(" ")}</p>
        <p><button data-action="start">Play again</button>
           <button class="secondary" data-action="lobby">Back to lobby</button></p>
      </div>`;
    return;
  }

  if (room.state.phase !== "lobby") {
    // Whoever holds the Scout's Eyes skill (it can be merged into another role).
    const scout = players.some((p) => p.connected && p.skills.includes("eyes"));
    ui.className = "bar";
    ui.innerHTML = `
      <div class="bar-inner">
        <span class="code">${code}</span>
        <span class="muted">${players.length} player${players.length === 1 ? "" : "s"} ·
          ${getDifficulty(room.state.difficulty).name} · checkpoint ${room.state.checkpoint} ·
          spotted ${room.state.spottedCount}${getDifficulty(room.state.difficulty).maxSpotted ? `/${getDifficulty(room.state.difficulty).maxSpotted}` : ""}
          ${scout ? "" : `· <span class="warn">nobody online has Eyes — no one sees the cones</span>`}</span>
        ${room.state.pauseReason ? `<span class="warn">⚠ ${escapeHtml(room.state.pauseReason)}</span>` : ""}
        <span class="bar-buttons">
          <button data-action="pause">${room.state.paused ? "Resume" : "Pause"}</button>
          <button class="secondary" data-action="skills">Skills ${skillsOpen ? "▴" : "▾"}</button>
          <button class="secondary" data-action="restart">Restart level</button>
          <button class="secondary" data-action="skip">Next checkpoint</button>
          <button class="secondary" data-action="lobby">Back to lobby</button>
        </span>
      </div>
      ${skillsOpen || room.state.pauseReason ? `<div class="skills-panel">${skillsTable(players)}</div>` : ""}`;
    return;
  }

  ui.className = "";
  ui.innerHTML = `
    <div class="screen host-grid">
      <div>
        <h1>STEALTH SQUAD</h1>
        <p class="muted">Join on your phone:</p>
        <div class="code-big">${code}</div>
        <div class="qr" id="qr-slot"></div>
        <p class="url">${escapeHtml(joinUrl)}</p>
      </div>
      <div>
        <h2>Level</h2>
        <select data-level>
          ${LEVELS.map((l) => `<option value="${l.id}" ${l.id === room.state.levelId ? "selected" : ""}>${escapeHtml(l.name)}</option>`).join("")}
        </select>
        <h2>Difficulty</h2>
        <select data-difficulty>
          ${DIFFICULTIES.map((d) => `<option value="${d}" ${d === room.state.difficulty ? "selected" : ""}>${DIFFICULTY[d].name}</option>`).join("")}
        </select>
        <p class="muted">${escapeHtml(getDifficulty(room.state.difficulty).blurb)}</p>
        <h2>Players (${players.length}/6)</h2>
        ${players.length ? "" : `<p class="muted">Nobody yet — scan the QR code or open the link.</p>`}
        <ul class="players">
          ${players.map((p) => `
            <li style="--role-color:${roleCss(p.role)}">
              <span class="dot"></span>
              <span class="name">${escapeHtml(p.nickname)}</span>
              ${p.connected ? "" : `<span class="offline">offline</span>`}
              <select data-player="${p.id}">
                <option value="">— no role —</option>
                ${ROLES.map((r) => `<option value="${r}" ${p.role === r ? "selected" : ""}>${ROLE_INFO[r].name}</option>`).join("")}
              </select>
            </li>`).join("")}
        </ul>
        ${suggestion(players.map((p) => p.role))}
        ${players.length ? `<h2>Skills</h2>${skillsTable(players)}` : ""}
        <p><button data-action="start" ${players.length ? "" : "disabled"}>Start level</button></p>
      </div>
    </div>`;
  ui.querySelector("#qr-slot")!.appendChild(qr);
}

/**
 * Who has which skill; each skill has a menu to give it to someone else
 * (e.g. a student who left, or to balance the team).
 */
function skillsTable(players: PlayerRow[]): string {
  const options = (holder: string) =>
    players
      .map((p) => `<option value="${p.id}" ${p.id === holder ? "selected" : ""}>${escapeHtml(p.nickname)}${p.connected ? "" : " (offline)"}</option>`)
      .join("");
  return `<ul class="players skills">
    ${players.map((p) => `
      <li style="--role-color:${roleCss(p.role)}">
        <span class="dot"></span>
        <span class="name">${escapeHtml(p.nickname)}${p.connected ? "" : ` <span class="offline">offline</span>`}</span>
        <span class="chips">
          ${p.skills.map((s) => `
            <label class="chip">${SKILL_NAMES[s] ?? s}
              <select data-skill="${s}" title="Give to…">${options(p.id)}</select>
            </label>`).join("") || `<span class="muted">no skills</span>`}
        </span>
      </li>`).join("")}
  </ul>`;
}

/** The merge-table row for this many players, and which suggested roles nobody has picked. */
function suggestion(picked: string[]): string {
  const team = SUGGESTED_TEAMS[picked.length];
  if (!team) return "";
  const needed = team.map((t) => t[0]);
  const missing = needed.filter((r) => !picked.includes(r));
  const extra = picked.filter((r) => r && !needed.includes(r as never));
  const line = team
    .map((t) => `<b style="color:${roleCss(t[0])}">${ROLE_INFO[t[0]].name}</b>${t.slice(1).map((r) => ` + ${ROLE_INFO[r].name}`).join("")}`)
    .join(" · ");
  const status =
    missing.length === 0 && extra.length === 0
      ? `<span class="ok">✓ Team looks good.</span>`
      : `<span class="warn">Suggested roles not picked: ${missing.map((r) => ROLE_INFO[r].name).join(", ") || "—"}.</span>`;
  return `<div class="suggest"><p>Suggested for ${picked.length}: ${line}</p><p>${status}</p>
    <p class="muted">Skills of roles nobody picks are merged in automatically when you press Start.</p></div>`;
}
