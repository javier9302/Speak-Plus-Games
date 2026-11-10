import { ROLES, Role, SUGGESTED_TEAMS } from "./roles.js";

/**
 * Abilities are data: a player holds a list of these and the phone shows one
 * button per ability (except passive ones). Buttons are contextual — e.g.
 * "tag" means Tie, Pick up or Drop depending on what's nearby.
 */
export enum Skill {
  /** Passive: sees guard cones and turn timers. */
  Eyes = "eyes",
  /** Mark a spot on the map for everyone (aim + tap). */
  Ping = "ping",
  /** Trapper: burrow in snow / get up, or cover a tied guard. */
  Dig = "dig",
  /** Tagger: tie up a guard from behind (or a sleeping one), pick up / drop a tied guard. */
  Tag = "tag",
  /** Sleeper: sleep dart (aim + tap a guard). Team total per checkpoint. */
  Dart = "dart",
  /** Trapper: place glue / net, or throw a noise maker (aim + tap; press again to switch kind). */
  Trap = "trap",
  /** Disguise: put on / take off the uniform; next to a guard: chat to turn him around. */
  Disguise = "disguise",
  /** Engineer: open doors, cut fences, switch off panels (stand next to one). */
  Fix = "fix",
}

export type TrapKind = "glue" | "net" | "noise";
export const TRAP_KINDS: TrapKind[] = ["glue", "net", "noise"];

/** One-line help for each skill (role card, simple English). */
export const SKILL_HELP: Record<Skill, string> = {
  [Skill.Eyes]: "You see where the robots are looking, and when they turn.",
  [Skill.Ping]: "Ping: tap it, then tap the map to show a place to everyone.",
  [Skill.Dig]: "Burrow: hide in the snow. Cover: hide a tied robot.",
  [Skill.Tag]: "Tie: stand behind a robot. Then pick it up and carry it.",
  [Skill.Dart]: "Dart: tap it, then tap a robot. It switches off for 20 seconds.",
  [Skill.Trap]: "Trap: glue, net or noise. Tap it, then tap the map.",
  [Skill.Disguise]: "Costume: look like a robot. Chat: make a robot turn to you.",
  [Skill.Fix]: "Fix: open doors, cut fences, switch off machines.",
};

export const PASSIVE_SKILLS = new Set<Skill>([Skill.Eyes]);

/** Skills that need a target: press the button, then tap the map. */
export const AIMED_SKILLS = new Set<Skill>([Skill.Ping, Skill.Dart, Skill.Trap]);

export const ROLE_SKILLS: Record<Role, Skill[]> = {
  [Role.Scout]: [Skill.Eyes, Skill.Ping],
  [Role.Trapper]: [Skill.Trap, Skill.Dig],
  [Role.Tagger]: [Skill.Tag],
  [Role.Sleeper]: [Skill.Dart],
  [Role.Disguise]: [Skill.Disguise],
  [Role.Engineer]: [Skill.Fix],
};

/** Ability tuning (distances in tiles, times in seconds). */
export const ABILITY = {
  tieRange: 1.6,
  carryRange: 1.6,
  coverRange: 1.6,
  coverSeconds: 2,
  getUpSeconds: 1,
  carrySpeedFactor: 0.6,
  dartRange: 7,
  dartsPerCheckpoint: 3,
  sleepSeconds: 20,
  /** A guard who woke up sees this much further and notices faster. */
  wokeRangeFactor: 1.3,
  wokeFillFactor: 1.5,
  pingSeconds: 4,
  /** Team totals per checkpoint, whatever the number of players. */
  gluePerCheckpoint: 2,
  netsPerCheckpoint: 1,
  noisePerCheckpoint: 2,
  /** Glue / net are placed within this distance of the Trapper. */
  trapPlaceRange: 2,
  /** A guard this close to a glue / net trap steps in it. */
  trapTriggerRange: 0.6,
  glueSeconds: 8,
  noiseThrowRange: 6,
  /** Guards this close to a noise maker go and look. */
  noiseHearRange: 8,
  investigateSeconds: 3,
  uniformSeconds: 1,
  chatRange: 1.6,
  chatSeconds: 4,
  /** Total seconds a disguised player can be watched before the disguise fails. */
  suspicionSeconds: 5,
  fixRange: 1.5,
} as const;

/**
 * Decide everyone's skills for this many players. Each player gets their own
 * role's skills; every role nobody picked is merged into a present player, as
 * in the brief's table (SUGGESTED_TEAMS), else into whoever has fewest skills.
 * So every skill is always available to the team.
 *
 * `roles` = each player's role ("" if none) in join order. Returns skills per
 * player (same order) and the role each ended up with (unpicked ones filled in).
 */
export function assignSkills(roles: string[]): { roles: Role[]; skills: Skill[][] } {
  const n = roles.length;
  const team = SUGGESTED_TEAMS[n] ?? SUGGESTED_TEAMS[6];
  const final: (Role | "")[] = roles.map((r) => (ROLES.includes(r as Role) ? (r as Role) : ""));

  // Players without a role get a free one, preferring the table's primaries.
  const preferred = [...team.map((t) => t[0]), ...ROLES];
  for (let i = 0; i < n; i++) {
    if (final[i]) continue;
    final[i] = preferred.find((r) => !final.includes(r)) ?? Role.Scout;
  }

  const skills: Skill[][] = final.map((r) => [...ROLE_SKILLS[r as Role]]);
  const holder = (role: Role) => final.indexOf(role);

  for (const missing of ROLES) {
    if (holder(missing) !== -1 || n === 0) continue;
    const bundle = team.find((t) => t.includes(missing));
    let to = bundle ? holder(bundle[0]) : -1;
    if (to === -1) {
      // Fewest skills; ties → earliest player.
      to = skills.reduce((best, s, i) => (s.length < skills[best].length ? i : best), 0);
    }
    for (const s of ROLE_SKILLS[missing]) if (!skills[to].includes(s)) skills[to].push(s);
  }
  return { roles: final as Role[], skills };
}
