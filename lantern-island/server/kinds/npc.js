// A character. Talk gives its clue; the teacher can answer as the character from the panel,
// and a mission's goal can ask for items to be carried to it.
import { lookProblems } from '../looks.js';
export default {
  kind: 'npc',
  about: 'A character. Talk gives its "talk" clue; the teacher can answer as it, and a goal can ask for items to be brought to it.',
  fields: { lines: 'sentences the teacher can send as this character (a list)', look: 'how it looks, for picture clues: { "hat": "red", "hair": "black", "glasses": true, "shirt": "green" }',
    ask: 'it answers (its "talk" clue) only to the right question: { "frames": ["Where is the bakery?", "What time is it?"], "right": 0, "teacher": true }' },
  check(o, v) {
    if (o.look !== undefined) for (const p of lookProblems(o.look)) v.problem(p);
    if (o.ask !== undefined) {
      const a = o.ask;
      if (!a || typeof a !== 'object' || Array.isArray(a)) return v.problem('"ask" is { "frames": ["Where is the bakery?", "What time is it?"], "right": 0 }');
      for (const k of Object.keys(a)) if (!['frames', 'right', 'teacher'].includes(k)) v.problem(`"ask" has an unknown field "${k}". Fields: frames, right, teacher`);
      if (!Array.isArray(a.frames) || a.frames.length < 2 || a.frames.length > 6 || a.frames.some((f) => typeof f !== 'string' || !f.trim() || f.length > 80)) v.problem('"ask" frames are 2 to 6 questions, each a short sentence');
      else if (!(Number.isInteger(a.right) && a.right >= 0 && a.right < a.frames.length)) v.problem(`"ask" right is the number of the right question, counting from 0 (0 to ${a.frames.length - 1})`);
      if (a.teacher !== undefined && typeof a.teacher !== 'boolean') v.problem('"ask" teacher is true or false');
      if (!o.clues?.talk) v.problem('a character with "ask" needs a "talk" clue: the answer it gives to the right question');
    }
  },
  character: true,
  // While it follows a player (an "escort" goal), players can walk through it.
  solid: (t) => !t.following,
  how: () => 'Talk. The teacher can answer as this character from the panel.',
  // Talk always does something, even without a "talk" clue: a goal may react (bring items, follow a player).
  actions: [{ ability: 'talk', when: () => true, solver: false, do: () => {} }],
};
