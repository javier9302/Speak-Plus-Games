// A lever: a player uses it, and its target (a timed door, a broken bridge or a gate) is open for a few seconds.
// Put it far from the door: the player at the lever calls "Go!", the others run through. The clock is the mission
// clock, so it stops when the teacher pauses.
const SECONDS = 10;
const secondsOf = (t) => t.def.seconds || SECONDS;
const abilityOf = (t) => t.def.by || 'use';
export default {
  kind: 'lever',
  about: 'A lever. A player uses it and its target (a timed door, a bridge or a gate) is open for a few seconds. Far from the door, so the team must call "Go!".',
  fields: { target: 'the id of the timed door (or gap, or gate) it opens', seconds: 'how long it stays open: 3 to 60 (default 10)', by: 'the ability that pulls it (default "use")' },
  check(o, v) {
    if (!o.target) v.problem('a lever needs "target": the id of a timed door');
    else v.object(o.target, 'target', (k) => k.holdable, 'something a lever can open for a while (a timed door, a gap or a gate)');
    if (o.seconds !== undefined && !(Number.isInteger(o.seconds) && o.seconds >= 3 && o.seconds <= 60)) v.problem('"seconds" is how long the door stays open: 3 to 60');
    if (o.by) v.ability(o.by, 'by');
  },
  start: () => ({ st: 'x', until: 0 }),
  // For the solver: the target is open for every player but the one at the lever (he or she pulls it, the others cross).
  opens: (t) => t.def.target,
  opensWith: abilityOf,
  markUsed: (t, s) => (s.owners(abilityOf(t)).some((i) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => s.regs[i].has(`${t.x + dx},${t.y + dy}`)))) ? [abilityOf(t)] : []),
  force(t) { t.until = 1e9; t.st = 'on'; return 'pulled'; },
  how: (o) => `${(o.by || 'use')[0].toUpperCase()}${(o.by || 'use').slice(1)} it: the door opens for ${o.seconds || SECONDS} seconds. Another player must be ready at the door.`,
  // While the clock runs the target is held open; when it stops, the door shuts.
  tick(t, c) {
    if (t.st !== 'on') return false;
    const target = c.byId(t.def.target);
    if (c.room.clock >= t.until) { t.st = 'x'; if (target) target.held = false; return true; }
    if (target && !target.held) { target.held = true; return true; }
    return false;
  },
  actions: [
    {
      ability: abilityOf, when: (t) => t.st === 'x', solver: false,
      do(t, c) { t.st = 'on'; t.until = c.room.clock + secondsOf(t); const target = c.byId(t.def.target); if (target) target.held = true; },
      say: (t) => `It is open for ${secondsOf(t)} seconds! Tell your team: Go!`,
    },
  ],
  art: {
    pal: {'a': '#8b93a7', 'b': '#5a6275', 'c': '#c68a4e', 'd': '#e8483b'},
    states: {
      default: [
        '......kkkk......', '......kddk......', '......kkkk......', '.......ck.......',
        '.......ck.......', '.......ck.......', '.......ck.......', '.......ck.......',
        '.......ck.......', '......kkkk......', '......kbbk......', '...kkkkbbkkkk...',
        '...kaaaaaaaak...', '...kaaaaaaaak...', '...kkkkkkkkkk...', '................',
      ],
      x: [
        '......kkkk......', '......kddk......', '......kkkk......', '.......ck.......',
        '.......ck.......', '.......ck.......', '.......ck.......', '.......ck.......',
        '.......ck.......', '......kkkk......', '......kbbk......', '...kkkkbbkkkk...',
        '...kaaaaaaaak...', '...kaaaaaaaak...', '...kkkkkkkkkk...', '................',
      ],
      on: [
        '................', '................', '................', '................',
        '................', '................', '............kkk.', '..........kckdk.',
        '........kcckkkk.', '......kkkk......', '......kbbk......', '...kkkkbbkkkk...',
        '...kaaaaaaaak...', '...kaaaaaaaak...', '...kkkkkkkkkk...', '................',
      ],
    },
  },
};
