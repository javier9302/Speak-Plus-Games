// Keyboard + Gamepad API, turned into the same simple state for every device:
//   { connected, move: {x, y}, down: {a, b, x, y, start}, pressed: {...}, nav: {x, y} }
// "pressed" is true only on the frame a button goes down.
// "nav" is a one-frame step (-1 / 0 / 1) for menus and the number pad.
//
// Devices: "kb1" (WASD), "kb2" (arrows), "pad0" ... "pad3".

const KEYBOARDS = {
  kb1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], a: ['KeyE'], b: ['KeyQ'], x: ['KeyR'], y: ['KeyF'] },
  kb2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], a: ['Enter'], b: ['ShiftRight', 'ShiftLeft'], x: ['Period'], y: ['Slash'] },
};
// Standard gamepad mapping.
const PAD = { a: 0, b: 1, x: 2, y: 3, start: 9, up: 12, down: 13, left: 14, right: 15 };
const BUTTONS = ['a', 'b', 'x', 'y', 'start'];
const DEADZONE = 0.35;
// Keys the browser should not act on while playing (scrolling, quick find).
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash', 'Backspace', 'Quote']);

export const DEVICE_LABELS = { kb1: 'Keyboard WASD', kb2: 'Keyboard arrows', pad0: 'Controller 1', pad1: 'Controller 2', pad2: 'Controller 3', pad3: 'Controller 4' };

const blank = () => ({
  connected: false,
  move: { x: 0, y: 0 },
  down: {}, pressed: {},
  nav: { x: 0, y: 0 },
  dir: { x: 0, y: 0 },
});
export const NO_INPUT = Object.freeze(blank());

export function createInput() {
  const held = new Set();   // keys held right now
  let queue = [];           // keys pressed since the last frame
  let frameKeys = [];
  const devices = { kb1: blank(), kb2: blank(), pad0: blank(), pad1: blank(), pad2: blank(), pad3: blank() };

  const typing = (e) => /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName);
  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey) return;
    if (!e.repeat) { held.add(e.code); queue.push(e.code); }
    if (PREVENT.has(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());

  function finish(dev, move, down, tapped = {}) {
    for (const b of BUTTONS) {
      dev.pressed[b] = !!tapped[b] || (!!down[b] && !dev.down[b]);
      dev.down[b] = !!down[b];
    }
    dev.move = move;
    const dir = { x: Math.abs(move.x) > 0.5 ? Math.sign(move.x) : 0, y: Math.abs(move.y) > 0.5 ? Math.sign(move.y) : 0 };
    dev.nav = { x: dir.x !== dev.dir.x ? dir.x : 0, y: dir.y !== dev.dir.y ? dir.y : 0 };
    dev.dir = dir;
  }

  function poll() {
    frameKeys = queue;
    queue = [];

    for (const [id, map] of Object.entries(KEYBOARDS)) {
      const dev = devices[id];
      dev.connected = true;
      const on = (name) => map[name].some((code) => held.has(code));
      const tap = (name) => map[name].some((code) => frameKeys.includes(code));
      const move = { x: (on('right') ? 1 : 0) - (on('left') ? 1 : 0), y: (on('down') ? 1 : 0) - (on('up') ? 1 : 0) };
      const down = { a: on('a'), b: on('b'), x: on('x'), y: on('y'), start: false };
      finish(dev, move, down, { a: tap('a'), b: tap('b'), x: tap('x'), y: tap('y') });
    }

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      const dev = devices[`pad${i}`];
      const gp = pads[i];
      if (!gp || !gp.connected) {
        dev.connected = false;
        finish(dev, { x: 0, y: 0 }, {});
        continue;
      }
      dev.connected = true;
      const btn = (n) => !!(gp.buttons[n] && gp.buttons[n].pressed);
      let x = Math.abs(gp.axes[0] || 0) > DEADZONE ? gp.axes[0] : 0;
      let y = Math.abs(gp.axes[1] || 0) > DEADZONE ? gp.axes[1] : 0;
      if (btn(PAD.left)) x = -1;
      if (btn(PAD.right)) x = 1;
      if (btn(PAD.up)) y = -1;
      if (btn(PAD.down)) y = 1;
      finish(dev, { x, y }, { a: btn(PAD.a), b: btn(PAD.b), x: btn(PAD.x), y: btn(PAD.y), start: btn(PAD.start) });
    }
  }

  return {
    poll,
    ids: () => Object.keys(devices),
    device: (id) => devices[id] || NO_INPUT,
    // Was this keyboard key pressed this frame? (for T, M, Esc, Space ...)
    key: (code) => frameKeys.includes(code),
    anyKey: () => frameKeys.length > 0,
    // Digits typed this frame, from the top row or the number pad.
    digits: () => frameKeys.map((c) => (/^(Digit|Numpad)(\d)$/.exec(c) || [])[2]).filter(Boolean),
  };
}
