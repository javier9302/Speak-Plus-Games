import type { Room } from "colyseus.js";
import { ROLES, ROLE_INFO, SUGGESTED_TEAMS } from "@stealth-squad/shared";
import { forget, joinAsPlayer, tryReconnect } from "./net";
import {
  briefingHtml,
  escapeHtml,
  resultHtml,
  onLobbyChange,
  playerRows,
  roleCardHtml,
  roleCss,
  roleName,
  showDisconnected,
  uiRoot,
} from "./ui";

const NICK_KEY = "ss-nickname";

/** Phone flow: join form → lobby (pick a role) → game (overlay hidden). */
export async function startPlayer(onJoined: (room: Room) => void) {
  const room = await tryReconnect("player");
  if (room) enterLobby(room, onJoined);
  else showJoinForm(onJoined);
}

function showJoinForm(onJoined: (room: Room) => void, error = "") {
  const ui = uiRoot();
  ui.className = "";
  const code = new URLSearchParams(location.search).get("room") ?? "";
  let nick = "";
  try {
    nick = localStorage.getItem(NICK_KEY) ?? "";
  } catch {}

  ui.innerHTML = `
    <div class="screen">
      <h1>STEALTH SQUAD</h1>
      <form class="join-form">
        <label>Room code
          <input class="code" name="code" maxlength="4" autocomplete="off" autocapitalize="characters"
                 value="${escapeHtml(code)}" required />
        </label>
        <label>Your name
          <input name="nick" maxlength="12" autocomplete="nickname" value="${escapeHtml(nick)}" required />
        </label>
        <button type="submit">Join</button>
        <p class="error">${escapeHtml(error)}</p>
      </form>
      <p class="muted">Teacher? <a href="/host" style="color:var(--accent)">Open the host screen</a></p>
    </div>`;

  const form = ui.querySelector("form")!;
  // Focus whichever field still needs filling (the QR link pre-fills the code).
  (form.elements.namedItem(code ? "nick" : "code") as HTMLInputElement).focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const code = String(data.get("code")).trim().toUpperCase();
    const nick = String(data.get("nick")).trim();
    const button = form.querySelector("button")!;
    button.disabled = true;
    button.textContent = "Joining…";
    try {
      localStorage.setItem(NICK_KEY, nick);
    } catch {}
    try {
      enterLobby(await joinAsPlayer(code, nick), onJoined);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      showJoinForm(
        onJoined,
        /not found|no rooms/i.test(msg)
          ? "No room with that code. Check the big screen."
          : /locked|full/i.test(msg)
            ? "This room is full (6 players)."
            : msg,
      );
    }
  });
}

function enterLobby(room: Room, onJoined: (room: Room) => void) {
  onJoined(room);
  const ui = uiRoot();

  // Role cards: one delegated listener; tapping your own role gives it back.
  ui.addEventListener("click", (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-role]");
    if (!card || card.classList.contains("taken")) return;
    const mine = room.state.players.get(room.sessionId)?.role;
    room.send("pickRole", { role: card.dataset.role === mine ? "" : card.dataset.role });
  });

  room.onLeave((code) => {
    // 1000 = we left on purpose; 4000 = room closed (host gone).
    if (code === 4000) forget("player");
    showDisconnected(code === 4000 ? "The teacher closed the room." : "Connection lost.");
  });

  onLobbyChange(room, () => render(room));
}

function render(room: Room) {
  const ui = uiRoot();
  const phase = room.state.phase;
  const me = room.state.players.get(room.sessionId);

  if (phase === "briefing") {
    ui.className = "";
    ui.innerHTML = `
      <div class="screen two-col">
        <div>${briefingHtml(room.state.levelId, room.state.difficulty)}</div>
        <div>${roleCardHtml(me?.role ?? "", me ? [...me.skills] : [])}
          <p class="muted">Waiting for the teacher to start the mission…</p></div>
      </div>`;
    return;
  }
  if (phase === "won") {
    ui.className = "";
    ui.innerHTML = `
      <div class="screen won">
        <h1>MISSION COMPLETE!</h1>
        <p class="big">Great teamwork, ${escapeHtml(me?.nickname ?? "")}!</p>
        ${resultHtml(room)}
        <p class="muted">Wait for the teacher.</p>
      </div>`;
    return;
  }
  if (phase !== "lobby") {
    ui.className = "hidden";
    return;
  }
  ui.className = "";

  const players = playerRows(room);
  const holders = new Map(players.filter((p) => p.role).map((p) => [p.role, p]));
  const team = SUGGESTED_TEAMS[players.length] ?? [];

  ui.innerHTML = `
    <div class="screen">
      <h1>ROOM ${escapeHtml(room.state.code)}</h1>
      <p>Hi, <b>${escapeHtml(me?.nickname ?? "")}</b>! Pick a role. Talk to your team!</p>
      <p class="muted">With ${players.length} player${players.length === 1 ? "" : "s"}:
        ${team.map((t) => t.map((r) => ROLE_INFO[r].name).join(" + ")).join(" · ")}</p>
      <div class="roles">
        ${ROLES.map((r) => {
          const holder = holders.get(r);
          const cls = holder?.id === room.sessionId ? "mine" : holder ? "taken" : "";
          return `
            <button class="role ${cls}" data-role="${r}" style="--role-color:${roleCss(r)}">
              <b>${ROLE_INFO[r].name}</b>${ROLE_INFO[r].blurb}
              <small>${holder ? (cls === "mine" ? "You ✓" : escapeHtml(holder.nickname)) : "Free"}</small>
            </button>`;
        }).join("")}
      </div>
      <h2>Team</h2>
      <ul class="players">
        ${players.map((p) => `
          <li style="--role-color:${roleCss(p.role)}">
            <span class="dot"></span>
            <span class="name">${escapeHtml(p.nickname)}${p.id === room.sessionId ? " (you)" : ""}</span>
            <span>${roleName(p.role)}</span>
            ${p.connected ? "" : `<span class="offline">offline</span>`}
          </li>`).join("")}
      </ul>
      <p class="muted">${room.state.hostConnected ? "Waiting for the teacher to start…" : "Waiting for the teacher's screen…"}</p>
    </div>`;
}
