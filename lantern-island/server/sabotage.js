// Sabotage effects one team can send to another. Each effect is an entry in EFFECTS:
//   id        the name phones and the teacher panel use
//   name      what students read ("Team Turtle sent you fog!")
//   apply     (room) => void   server side, when the effect starts in the target room
//   expire    (room) => void   server side, when it ends (time is up, the teacher cancelled it, or the room finished)
// How long it lasts comes from compete-config.js (sabotage.effects.<id>.seconds), so the teacher's numbers stay in one place.
// The phone draws the effect: see EFFECT_VIEWS in public/phone/phone.js.
//
// To add an effect (for example "slow"): add an entry here, its seconds in compete-config.js, and its view on the phone.
// A "slow" effect would set room.slow = 0.5 in apply, use it in the game loop, and delete it in expire.
export const EFFECTS = {
  fog: {
    id: 'fog',
    name: 'fog',
    // Fog changes nothing in the game: the target's phones cover their map until it ends.
    apply() {},
    expire() {},
  },
};
