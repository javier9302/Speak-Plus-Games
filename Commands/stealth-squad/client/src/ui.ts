import type { Room } from "colyseus.js";
import {
  ROLE_INFO,
  ROLE_PHRASES,
  SKILL_HELP,
  STAR_MAX_SPOTTED,
  getDifficulty,
  getLevel,
  isRole,
  missionStars,
  type Skill,
} from "@stealth-squad/shared";

export const uiRoot = () => document.getElementById("ui")!;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function roleName(role: string): string {
  return isRole(role) ? ROLE_INFO[role].name : "—";
}

/** CSS colour for a role, used as `--role-color` on cards and list dots. */
export function roleCss(role: string): string {
  return isRole(role) ? `#${ROLE_INFO[role].color.toString(16).padStart(6, "0")}` : "#666";
}

export interface PlayerRow {
  id: string;
  nickname: string;
  role: string;
  connected: boolean;
  slot: number;
  skills: string[];
}

/** Short names for skills in the host's skills table. */
export const SKILL_NAMES: Record<string, string> = {
  eyes: "Eyes (cones)",
  ping: "Ping",
  dig: "Burrow / Cover",
  tag: "Tie / Carry",
  dart: "Darts",
  trap: "Traps",
  disguise: "Disguise",
  fix: "Fix",
};

/** Players in join order, as plain objects. */
export function playerRows(room: Room): PlayerRow[] {
  const rows: PlayerRow[] = [];
  room.state.players?.forEach((p: any, id: string) =>
    rows.push({ id, nickname: p.nickname, role: p.role, connected: p.connected, slot: p.slot, skills: [...(p.skills ?? [])] }),
  );
  return rows.sort((a, b) => a.slot - b.slot);
}

/**
 * Call `render` when anything the lobby screens show changes. State patches
 * arrive 20×/s while playing (positions), so we compare a small signature
 * instead of re-rendering — this also keeps the host's <select>s from closing.
 */
export function onLobbyChange(room: Room, render: () => void) {
  let last = "";
  const check = () => {
    if (!room.state?.phase) return; // first state not received yet
    const s = room.state;
    const sig = JSON.stringify([
      s.phase, s.hostConnected, s.paused, s.pauseReason, s.checkpoint, s.levelId, s.difficulty, s.spottedCount,
      s.objectivesDone ? [...s.objectivesDone] : [], s.missionSeconds, playerRows(room),
    ]);
    if (sig === last) return;
    last = sig;
    document.body.classList.toggle("playing", room.state.phase !== "lobby");
    render();
  };
  room.onStateChange(check);
  check(); // state may already be here if the caller awaited something first
}

/** Mission briefing lines for the current level, and the difficulty. */
export function briefingHtml(levelId: string, difficulty: string): string {
  const level = getLevel(levelId);
  const d = getDifficulty(difficulty);
  return `<h1>${escapeHtml(level.name.toUpperCase())}</h1>
    <p class="difficulty">${escapeHtml(d.name)}: ${escapeHtml(d.blurb)}</p>
    <div class="briefing">${level.briefing.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}</div>`;
}

/** Mission complete: stars, and what each one is for (so the class knows how to get more). */
export function resultHtml(room: Room): string {
  const s = room.state;
  const level = getLevel(s.levelId);
  const stars = missionStars(level.parSeconds, s.missionSeconds, s.spottedCount);
  const text = {
    done: "Mission complete",
    spotted: `Spotted ${STAR_MAX_SPOTTED} times or less`,
    time: `Faster than ${formatTime(level.parSeconds)}`,
  };
  return `<p class="stars">${stars.map((x) => (x.got ? "★" : "☆")).join("")}</p>
    <p>Time: <b>${formatTime(s.missionSeconds)}</b> · Spotted: <b>${s.spottedCount}</b> time${s.spottedCount === 1 ? "" : "s"} · ${escapeHtml(getDifficulty(s.difficulty).name)}</p>
    <ul class="star-list">${stars.map((x) => `<li class="${x.got ? "got" : ""}">${x.got ? "★" : "☆"} ${text[x.kind]}</li>`).join("")}</ul>`;
}

/** Role card: role, what your skills do, and 3 phrases to say. */
export function roleCardHtml(role: string, skills: string[]): string {
  if (!isRole(role)) return "";
  return `<div class="role-card" style="--role-color:${roleCss(role)}">
    <h2>You are the ${ROLE_INFO[role].name}</h2>
    <ul class="skill-help">${skills.map((s) => `<li>${escapeHtml(SKILL_HELP[s as Skill] ?? s)}</li>`).join("")}</ul>
    <h2>Say this</h2>
    <ul class="phrases">${ROLE_PHRASES[role].map((p) => `<li>“${escapeHtml(p)}”</li>`).join("")}</ul>
  </div>`;
}

export function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Full-screen "connection lost" message with a rejoin button (reload reconnects via token). */
export function showDisconnected(message: string) {
  const ui = uiRoot();
  ui.className = "";
  ui.innerHTML = `
    <div class="screen">
      <h1>STEALTH SQUAD</h1>
      <p>${escapeHtml(message)}</p>
      <p><button id="rejoin">Rejoin</button></p>
    </div>`;
  ui.querySelector("#rejoin")!.addEventListener("click", () => location.reload());
}
