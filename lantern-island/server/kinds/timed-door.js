// A door that is shut. A lever (kind "lever") opens it for a few seconds: one player pulls the lever, far away, and has
// to call "Go!" so the others can run through before it shuts. Like a bridge with a flat stone, but with a clock.
export default {
  kind: 'timed-door',
  about: 'A shut door. A lever opens it for a few seconds: one player pulls the lever and the others must run through in time.',
  fields: {},
  check: () => {},
  start: () => ({ st: 'closed' }),
  solid: (t) => !t.forced,
  holdable: true,
  // The lever keeps it open (held) while its clock runs; the picture follows.
  tick(t) {
    const st = t.held || t.forced ? 'open' : 'closed';
    if (t.st === st) return false;
    t.st = st;
    return true;
  },
  force(t) { t.forced = !t.forced; t.st = t.forced ? 'open' : 'closed'; return t.forced ? 'opened' : 'closed'; },
  how: () => 'Shut. A lever opens it for a few seconds: one player pulls the lever and the others run through.',
  rules: (t, things) => (things.some((l) => l.kind === 'lever' && l.def.target === t.id) ? null : `${t.name}: no lever opens it, so nobody can ever get through`),
  art: {
    pal: {'a': '#8b93a7', 'b': '#5a6275', 'e': '#2b2f45', 'y': '#ffd166'},
    states: {
      default: [
        '................', '.kkkkkkkkkkkkkk.', '.kyybbyybbyybbk.', '.kyybbyybbyybbk.',
        '.kaaaaaaaaaaaak.', '.kaaaaabbaaaaak.', '.kaaaaabbaaaaak.', '.kaaaaabbaaaaak.',
        '.kabbbbbbbbbbak.', '.kaaaaabbayyaak.', '.kaaaaabbayyaak.', '.kaaaaabbaaaaak.',
        '.kabbbbbbbbbbak.', '.kaaaaabbaaaaak.', '.kaaaaabbaaaaak.', '.kaaaaabbaaaaak.',
      ],
      closed: [
        '................', '.kkkkkkkkkkkkkk.', '.kyybbyybbyybbk.', '.kyybbyybbyybbk.',
        '.kaaaaaaaaaaaak.', '.kaaaaabbaaaaak.', '.kaaaaabbaaaaak.', '.kaaaaabbaaaaak.',
        '.kabbbbbbbbbbak.', '.kaaaaabbayyaak.', '.kaaaaabbayyaak.', '.kaaaaabbaaaaak.',
        '.kabbbbbbbbbbak.', '.kaaaaabbaaaaak.', '.kaaaaabbaaaaak.', '.kaaaaabbaaaaak.',
      ],
      open: [
        '................', '.kkkkkkkkkkkkkk.', '.kyybeyyeeyyeek.', '.kyybeyyeeyyeek.',
        '.kaabeeeeeeeeek.', '.kaabeeeeeeeeek.', '.kaabeeeeeeeeek.', '.kaabeeeeeeeeek.',
        '.kaabeeeeeeeeek.', '.kaabeeeeeeeeek.', '.kaabeeeeeeeeek.', '.kaabeeeeeeeeek.',
        '.kaabeeeeeeeeek.', '.kaabeeeeeeeeek.', '.kaabeeeeeeeeek.', '.kaabeeeeeeeeek.',
      ],
    },
  },
};
