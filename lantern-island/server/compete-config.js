// Competitive mode: every number and name in one place. Change them here, not in the code.
// Tests can override any part with createApp({ compete: { ... } }).
export const COMPETE = {
  maxRooms: 4,                 // teams in one match
  roomSize: 6,                 // players in one room (also the limit in the normal, cooperative game)
  teamNames: ['Team Dolphin', 'Team Turtle', 'Team Crab', 'Team Seagull'],   // one per room, in order

  // Points. Every score change in a match comes from one of these.
  points: {
    clue: 5,                   // a clue nobody in the team had found yet
    challenge: 10,             // a tablet's card answered (or rescued by the teacher)
    obstacle: 10,              // a locked gate unlocked, a bridge fixed, a sluice fixed, a rock pushed aside (once each)
    monster: 20,               // the monster chased away
    finish: [50, 30, 20, 10],  // reaching the final objective: 1st, 2nd, 3rd, 4th
    speaking: 5,               // the teacher's bonus button for good speaking (the teacher can also add or take any amount)
  },

  sabotage: {
    enabled: true,             // the teacher can switch it off during a match
    cluesPerCharge: 3,         // a team earns a charge for every N new clues
    maxCharges: 1,             // charges a team can keep at once
    cooldownSeconds: 30,       // after an effect ends, the same room cannot be hit again for this long
    effects: {
      fog: { seconds: 20 },    // the target's phones cannot see the map
    },
  },
};

// A copy of the defaults with some values replaced (one level deep, plus sabotage.effects).
export function competeConfig(over = {}) {
  const c = structuredClone(COMPETE);
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && c[k] && typeof c[k] === 'object' && !Array.isArray(c[k])) Object.assign(c[k], v);
    else c[k] = v;
  }
  if (over.sabotage?.effects) c.sabotage.effects = { ...COMPETE.sabotage.effects, ...over.sabotage.effects };
  return c;
}
