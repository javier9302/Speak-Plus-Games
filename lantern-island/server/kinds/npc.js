// A character. Talk gives its clue; the teacher can answer as the character from the panel,
// and a mission's goal can ask for items to be carried to it.
export default {
  kind: 'npc',
  about: 'A character. Talk gives its "talk" clue; the teacher can answer as it, and a goal can ask for items to be brought to it.',
  fields: { lines: 'sentences the teacher can send as this character (a list)' },
  character: true,
  // While it follows a player (an "escort" goal), players can walk through it.
  solid: (t) => !t.following,
  how: () => 'Talk. The teacher can answer as this character from the panel.',
  // Talk always does something, even without a "talk" clue: a goal may react (bring items, follow a player).
  actions: [{ ability: 'talk', when: () => true, solver: false, do: () => {} }],
};
