// Sync between the two windows (same browser, same origin) with BroadcastChannel,
// plus the localStorage save that survives a refresh or a crash.
//
// Messages:
//   board → teacher  { t: 'hello' }                 "I just opened, send me the state"
//   board → teacher  { t: 'act', action }           a player pressed a button on the board
//   teacher → board  { t: 'state', state }          the full game state after every change
//   teacher → board  { t: 'error', text }           an action from the board was refused
//   teacher → board  { t: 'bye' }                   the teacher window is closing

export const CHANNEL_NAME = 'sp-city-v1';
export const STATE_KEY = 'sp-city-state-v1';
export const SETTINGS_KEY = 'sp-city-settings-v1';

export function openChannel(onMessage) {
  if (typeof BroadcastChannel === 'undefined') return { send() {}, close() {}, ok: false };
  const ch = new BroadcastChannel(CHANNEL_NAME);
  ch.onmessage = e => onMessage(e.data || {});
  return { send: msg => ch.postMessage(msg), close: () => ch.close(), ok: true };
}

export function saveState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }   // storage full or blocked: the game goes on, only the auto-save is lost
}

export function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }
  catch { return null; }
}

export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); }
  catch { return null; }
}
