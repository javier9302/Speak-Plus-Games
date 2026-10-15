// Find the odd one out: several look-alike objects (kind "candidate"); the clues point to one ("answer").
// Choosing a wrong one costs nothing.
import { KINDS } from '../kinds/index.js';
export default {
  type: 'odd-one-out',
  label: 'The odd one',
  about: 'Several look-alike objects (kind "candidate"); clues point to the right one ("answer"). Choosing it finishes the mission. A wrong choice costs nothing.',
  fields: { answer: 'the id of the right candidate, or "random": a different one every run (clues name it with {odd})' },
  normalize(raw, c) {
    const cands = c.objectsOf((k) => !!k.candidate).map((o) => o.id);
    if (cands.length < 2) c.fail('goal: an "odd-one-out" goal needs 2 or more candidates (kind "candidate") on the map');
    const answer = raw.answer ?? c.base.answer;
    if (!cands.includes(answer) && answer !== 'random') { c.fail(`goal: "answer" must be one of the candidates (${cands.join(', ') || 'none'}), or "random".${c.didYouMean(answer, cands)}`); return null; }
    return { answer, label: raw.label };
  },
  random: (goal) => goal.answer === 'random',
  // "random": a candidate chosen by the run's seed (the first one in the layout as written).
  run(goal, rnd, zone) {
    if (goal.answer !== 'random') return goal;
    const cands = zone.objects.filter((o) => KINDS[o.kind].candidate);
    return { ...goal, answer: cands[rnd ? Math.floor(rnd() * cands.length) : 0].id };
  },
  placeholders: (goal, c) => ({ odd: c.name(goal.answer) }),
  describe: () => 'the odd one out',
  start: () => ({ found: false }),
  progress: (room) => ({ have: room.goalState.found ? 1 : 0, need: 1, done: room.goalState.found }),
  afterAct(room, p, t) {
    if (!KINDS[t.kind].candidate || room.goalState.found) return null;
    if (t.id === room.mission.goal.answer) { room.goalState.found = true; return { say: 'That is the one! Well done.', changed: true }; }
    t.st = 'x';                                        // it can be chosen again later; nothing is lost
    return { say: 'Not this one. Read your clues again and talk with your team.', changed: true };
  },
  solver(s) {
    const t = () => s.byId[s.mission.goal.answer];
    return {
      done: () => t().st === 'checked',
      why: () => [`nobody can get to the ${t().name.toLowerCase()} to choose it`],
    };
  },
  sheet: (goal, c) => `find the odd one out: the right one is the ${c.name(goal.answer)}`,
};
