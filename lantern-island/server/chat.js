// Teacher chat, helpers and couriers.
//
// Chat goes one way: teacher -> students. Students never type to each other; they talk.
// A message can be text, a link, a sound or a picture. It can be "shareable": the student who
// gets it has a Share button that stays locked until the teacher unlocks it, which the
// teacher does when somebody has asked for help out loud, in English.
//
// Helpers (Listening Helper, Reading Helper) are students the teacher names at any moment.
// Link cards send their link to the matching helper.
//
// A courier is a letter: one player (who has Give) must hand it to another at a named place.
import { REACH } from './world.js';
import { HELPERS } from './cards.js';

const WEB = /^https?:\/\/[^\s"'<>]+$/i;
const MEDIA = /^(https?:\/\/|\/media\/)[^\s"'<>]*$/i;
const KINDS = ['text', 'link', 'audio', 'image'];
const NEAR_PLACE = 3.5;            // tiles: how close to the meeting place a letter can be handed over
const line = (v, max = 400) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function createChat({ send, sendQueue, sendRoster }) {
  const byId = (room, id) => room.players.find((p) => p.id === id);

  // ---------- messages ----------
  // What one player sees in their inbox.
  function inboxOf(room, p) {
    return room.messages.filter((m) => m.to.includes(p.id) || m.shared.includes(p.id)).map((m) => {
      const mine = m.to.includes(p.id);                      // only the first receiver can share it on
      const has = (id) => m.to.includes(id) || m.shared.includes(id);
      const targets = !mine || !m.shareable || !m.unlock ? [] : room.players.filter((q) => q.id !== p.id && !has(q.id) && (m.unlock === 'any' || m.unlock === q.id));
      return {
        id: m.id, kind: m.kind, text: m.text, url: m.url, from: mine ? m.from : `${m.from}, shared by ${m.sharedBy || 'a teammate'}`, o: m.o,
        shareable: mine && m.shareable, locked: mine && m.shareable && !m.unlock,
        canShare: targets.map((q) => ({ id: q.id, name: q.name })),
      };
    });
  }
  function pushInboxes(room, only) {
    for (const p of room.players) if (!only || only.includes(p.id)) send(p.ws, { t: 'inbox', list: inboxOf(room, p) });
    sendQueue(room);
  }

  // Who "to" means: "all", "random", a helper role, one id, or a list of ids.
  function resolve(room, to) {
    if (to === 'all') return room.players.map((p) => p.id);
    if (to === 'random') return room.players.length ? [pick(room.players).id] : [];
    if (HELPERS.includes(to)) return room.helpers[to] ? [room.helpers[to]] : [];
    return (Array.isArray(to) ? to : [to]).filter((id) => byId(room, id));
  }

  // Puts a message in inboxes. Throws (with a message for the teacher) if an address is not allowed.
  function post(room, { to, kind = 'text', text, url, shareable = false, from = 'Teacher', o = null, quiet = false }) {
    const bad = (why) => { throw Object.assign(new Error(why), { status: 400 }); };
    if (!KINDS.includes(kind) && kind !== 'card') bad('Unknown kind of message.');
    url = line(url, 500);
    if (kind === 'link' && !WEB.test(url)) bad('A link must start with http:// or https://');
    if ((kind === 'audio' || kind === 'image') && !MEDIA.test(url)) bad('Upload the file, or use an address that starts with http:// or https://');
    const ids = resolve(room, to);
    if (!ids.length) bad(HELPERS.includes(to) ? `Nobody is the ${to === 'listening' ? 'Listening' : 'Reading'} Helper yet. Choose one first.` : 'Choose who gets the message.');
    const m = { id: `m${++room.seq}`, kind, text: line(text), url: kind === 'text' || kind === 'card' ? '' : url, shareable: !!shareable, unlock: null, to: ids, shared: [], sharedBy: '', from, o };
    if (!m.text && !m.url) bad('The message is empty.');
    room.messages.push(m);
    if (!quiet) for (const id of ids) send(byId(room, id).ws, { t: 'say', msg: m.shareable ? 'You have a message you can share. Someone may ask for your help.' : `New message from ${from === 'Teacher' ? 'the teacher' : from.toLowerCase()}. Open Mail.` });
    pushInboxes(room, ids);
    return m;
  }

  // A student presses Share on an unlocked message.
  function share(room, p, msg) {
    const m = room.messages.find((x) => x.id === msg.m);
    const target = byId(room, msg.to);
    if (!m || !target || !m.to.includes(p.id) || !m.shareable) return;
    if (!m.unlock) return send(p.ws, { t: 'nope', msg: 'It is locked. Somebody must ask you for help, in English.' });
    if (m.unlock !== 'any' && m.unlock !== target.id) return send(p.ws, { t: 'nope', msg: 'The teacher unlocked it for another teammate.' });
    if (m.to.includes(target.id) || m.shared.includes(target.id)) return;
    m.shared.push(target.id);
    m.sharedBy = p.name;
    send(target.ws, { t: 'say', msg: `${p.name} shared something with you. Open Mail.` });
    send(p.ws, { t: 'say', msg: `Shared with ${target.name}.` });
    pushInboxes(room, [p.id, target.id]);
  }

  // What the teacher panel shows about messages.
  const forTeacher = (room) => room.messages.filter((m) => m.kind !== 'card').map((m) => {
    const name = (id) => byId(room, id)?.name || '?';
    return { id: m.id, kind: m.kind, text: m.text, url: m.url, from: m.from, to: m.to.map(name), shared: m.shared.map(name), shareable: m.shareable, unlock: m.unlock === 'any' ? 'any' : m.unlock ? name(m.unlock) : null, o: m.o };
  });

  // ---------- link cards ----------
  // A link card was opened at a tablet for the first time: its link goes to the helper
  // (locked), so the opener has to ask for it. Returns the helper, to tell the opener who to ask.
  function linkOpened(room, t, opener) {
    const card = t.card;
    let helper = byId(room, room.helpers[card.helper]);
    if (!helper || helper === opener) helper = pick(room.players.filter((p) => p !== opener && p.ws)) || pick(room.players.filter((p) => p !== opener)) || null;
    if (!helper) return null;
    // Nobody had that role (or the helper is the one asking): this player is the helper now.
    if (room.helpers[card.helper] !== helper.id) {
      room.helpers[card.helper] = helper.id;
      send(helper.ws, { t: 'say', msg: `You are the ${card.helper === 'listening' ? 'Listening' : 'Reading'} Helper! Teammates may ask you for help.` });
      sendRoster(room);
    }
    t.linkHelper = helper.id;
    if (card.link && !t.linkSent) {
      t.linkSent = post(room, { to: helper.id, kind: 'link', url: card.link, text: `For the ${t.name.toLowerCase()}. A teammate needs this!`, shareable: true, o: t.id }).id;
    }
    return helper;
  }

  // ---------- couriers ----------
  const place = (room, id) => room.zone.places.find((p) => p.id === id) || null;
  const giver = (room) => room.players.find((p) => p.abilities.includes('give') && p.ws) || room.players.find((p) => p.abilities.includes('give'));
  const others = (room, not) => { const list = room.players.filter((p) => p !== not); return list.filter((p) => p.ws).length ? list.filter((p) => p.ws) : list; };

  function tell(room, t) {
    const c = t.courier, carrier = byId(room, c.carrier), to = byId(room, c.to), at = place(room, c.place);
    const where = at ? ` Meet at ${at.name}.` : '';
    room.messages = room.messages.filter((m) => !(m.o === t.id && m.courier));       // replace older instructions
    const a = post(room, { to: carrier.id, text: `Bring this letter to ${to.name}.${where} Stand next to ${to.name} and press Give.`, from: 'Letter', o: t.id });
    const b = post(room, { to: to.id, text: `${to.name}, ${carrier.name} is bringing you a letter. Ask where to meet!${at ? ` (The letter says: ${at.name}.)` : ''}`, from: 'Letter', o: t.id });
    a.courier = b.courier = true;
    pushInboxes(room);                                       // also clears the old instructions from whoever had them
  }

  // A courier card was opened at a tablet: choose who carries and who receives, hand out the letter.
  function startCourier(room, t, opener) {
    if (!t.courier) {
      const carrier = giver(room);
      if (!carrier || room.players.length < 2) return null;
      const to = t.card.recipient === 'opener' && opener !== carrier ? opener : pick(others(room, carrier));
      t.courier = { carrier: carrier.id, to: to.id, place: place(room, t.card.meetAt)?.id || null };
      carrier.items.push({ item: 'letter', from: null, courier: t.id });
      tell(room, t);
    }
    return t.courier;
  }

  // Keeps every undelivered letter playable: it is in the pocket of a player who has Give,
  // and the receiver is somebody else who is still in the game. Called when abilities are
  // shared out again and when a player leaves.
  function fixCouriers(room) {
    for (const t of room.things) {
      const c = t.courier;
      if (!c || t.delivered || t.st === 'solved') continue;
      const carrier = giver(room);
      if (!carrier) continue;
      let changed = false;
      for (const p of room.players) {
        const had = p.items.length;
        if (p !== carrier) p.items = p.items.filter((it) => it.courier !== t.id);
        changed ||= p.items.length !== had;
      }
      if (!carrier.items.some((it) => it.courier === t.id)) { carrier.items.push({ item: 'letter', from: null, courier: t.id }); changed = true; }
      if (c.carrier !== carrier.id) { c.carrier = carrier.id; changed = true; }
      if (!byId(room, c.to) || c.to === carrier.id) { c.to = pick(others(room, carrier))?.id; changed = true; }
      if (changed && c.to) tell(room, t);
    }
  }

  // Give with a letter selected. Returns { nope } or { deliver: tablet, to: player }.
  function giveLetter(room, p, it) {
    const t = room.things.find((x) => x.id === it.courier);
    if (!t?.courier || t.delivered || t.st === 'solved') { p.items = p.items.filter((x) => x !== it); return { nope: 'This letter is not needed any more.' }; }
    const to = byId(room, t.courier.to), at = place(room, t.courier.place);
    if (!to) return { nope: 'Nobody is waiting for this letter. Ask the teacher.' };
    if (Math.hypot(to.x - p.x, to.y - p.y) > REACH) return { nope: `This letter is for ${to.name}. ${at ? `Meet at ${at.name} and stand` : 'Stand'} next to ${to.name}.` };
    if (at && Math.hypot(at.x + 0.5 - p.x, at.y + 0.5 - p.y) > NEAR_PLACE) return { nope: `Not here! The letter says: meet at ${at.name}.` };
    p.items = p.items.filter((x) => x !== it);
    return { deliver: t, to };
  }

  // The letter arrives (handed over, or the teacher delivers it): the card inside now belongs to the receiver.
  function deliver(room, t) {
    const to = byId(room, t.courier.to);
    for (const p of room.players) p.items = p.items.filter((it) => it.courier !== t.id);
    t.delivered = true;
    t.answerer = to.id;
    room.messages = room.messages.filter((m) => !(m.o === t.id && m.courier));
    post(room, { to: to.id, kind: 'card', text: 'A letter for you, with a challenge inside. Only you can answer it!', from: 'Letter', o: t.id, quiet: true });
    pushInboxes(room);
    return to;
  }

  // ---------- the teacher's commands ----------
  const commands = {
    msg(room, m) { post(room, { to: m.to, kind: m.kind, text: m.text, url: m.url, shareable: m.shareable, o: null }); },
    // Unlock sharing: for one teammate (the one who asked), or for anyone.
    unlock(room, m) {
      const msg = room.messages.find((x) => x.id === m.m);
      if (!msg || !msg.shareable) return;
      msg.unlock = m.to === 'any' ? 'any' : byId(room, m.to) ? m.to : null;
      if (msg.unlock) for (const id of msg.to) send(byId(room, id)?.ws, { t: 'say', msg: 'Unlocked! You can share your message now. Open Mail.' });
      pushInboxes(room);
    },
    lock(room, m) { const msg = room.messages.find((x) => x.id === m.m); if (msg) { msg.unlock = null; pushInboxes(room); } },
    // Send it straight to another student (for example the one who asked).
    forward(room, m) {
      const msg = room.messages.find((x) => x.id === m.m), p = byId(room, m.p);
      if (!msg || !p || msg.to.includes(p.id) || msg.shared.includes(p.id)) return;
      msg.shared.push(p.id); msg.sharedBy = 'the teacher';
      send(p.ws, { t: 'say', msg: 'New message from the teacher. Open Mail.' });
      pushInboxes(room, [p.id]);
    },
    revoke(room, m) { room.messages = room.messages.filter((x) => x.id !== m.m); pushInboxes(room); },
    // Name a helper: a player id, "random", or nothing to clear the role.
    helper(room, m) {
      if (!HELPERS.includes(m.role)) return;
      const p = m.p === 'random' ? pick(room.players) : byId(room, m.p);
      room.helpers[m.role] = p ? p.id : null;
      if (p) send(p.ws, { t: 'say', msg: `You are the ${m.role === 'listening' ? 'Listening' : 'Reading'} Helper! Teammates may ask you for help.` });
      sendRoster(room); sendQueue(room);
    },
    // Reroute a letter to another student, or deliver it now (if the class is stuck).
    courier(room, m, ws, api) {
      const t = room.things.find((x) => x.id === m.o);
      if (room.phase !== 'play' || !t?.courier || t.delivered || t.st === 'solved') return;
      if (m.deliver) return api.delivered(room, t, deliver(room, t));
      const p = byId(room, m.to);
      if (!p || p.id === t.courier.carrier) return;
      t.courier.to = p.id;
      tell(room, t);
      sendQueue(room);
    },
  };

  return { inboxOf, pushInboxes, post, share, forTeacher, linkOpened, startCourier, fixCouriers, giveLetter, deliver, commands };
}
