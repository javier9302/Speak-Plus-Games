// How a challenge card looks to a student. Used by the phone, and by the teacher's preview,
// so the preview is exactly what students see. Styles: card.css.
import { esc } from './net.js';

// Only http(s) and same-site addresses may be used for pictures and sound.
export const safeUrl = (u) => (/^(https?:\/\/|\/)[^\s"'<>]*$/i.test(u || '') ? u : '');

// card = what the server sends to a phone (no answers). hints = the hints the teacher released so far.
export function cardHtml(card, hints = []) {
  const c = card, media = c.media || {};
  let h = `<h3>Challenge · only you can see this. Read it to your team!</h3><h2>${esc(c.prompt)}</h2>`;
  if (c.note) h += `<p class="note">${esc(c.note)}</p>`;
  if (safeUrl(media.image)) h += `<img class="media" src="${esc(safeUrl(media.image))}" alt="">`;
  if (safeUrl(media.audio)) h += `<audio controls src="${esc(safeUrl(media.audio))}"></audio>`;
  else if (media.tts) h += `<button type="button" class="play" data-say="${esc(media.tts)}">▶ Play the word</button>`;
  if (c.describe) h += `<p class="describe">${esc(c.describe)}</p>`;
  if (c.type === 'choice') {
    h += `<div class="opts">${Object.entries(c.options || {}).map(([k, v]) => `<button type="button" class="opt" data-value="${esc(k)}"><b>${esc(k)}</b><span>${esc(v)}</span></button>`).join('')}</div>`;
  } else if (c.type === 'code') {
    h += `<p class="call">CALL THE TEACHER!</p><p>Answer out loud. The teacher gives you a code.</p>
      <form data-answer><input inputmode="numeric" pattern="[0-9]*" maxlength="${Number(c.digits) || 6}" placeholder="Code" aria-label="Code"><button class="big" type="submit">Enter</button></form>`;
  } else {
    h += `<form data-answer><input autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="100" placeholder="Type the answer" aria-label="Your answer"><button class="big" type="submit">Check</button></form>`;
  }
  h += '<p id="card-result" class="result" role="status" hidden></p>';
  h += `<div id="card-hints">${hintsHtml(hints)}</div>`;
  return h;
}

export const hintsHtml = (hints) => (hints.length ? `<div class="hints"><h3>Hints from the teacher</h3><ol>${hints.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : '');

// Says a word aloud with the device's own voice. Returns false if the device has none.
export function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = 0.8;
  speechSynthesis.speak(u);
  return true;
}
