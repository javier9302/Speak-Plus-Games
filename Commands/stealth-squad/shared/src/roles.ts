/** The six specialist roles. Skills are data (M4); roles are a label + default bundle. */
export enum Role {
  Scout = "scout",
  Trapper = "trapper",
  Tagger = "tagger",
  Sleeper = "sleeper",
  Disguise = "disguise",
  Engineer = "engineer",
}

export const ROLES: Role[] = [
  Role.Scout,
  Role.Trapper,
  Role.Tagger,
  Role.Sleeper,
  Role.Disguise,
  Role.Engineer,
];

/** Display info shown in the lobby. `color` also tints the character in game. */
export const ROLE_INFO: Record<Role, { name: string; blurb: string; color: number }> = {
  [Role.Scout]: { name: "Scout", blurb: "Sees where robots are looking. Tells the team when to go.", color: 0x7fd1ff },
  [Role.Trapper]: { name: "Trapper", blurb: "Sets traps, hides in snow, covers switched-off robots.", color: 0xb6f27a },
  [Role.Tagger]: { name: "Tagger", blurb: "Sneaks behind robots, ties them up and carries them.", color: 0xff9f6e },
  [Role.Sleeper]: { name: "Sleeper", blurb: "Switches robots off from far away. Few darts!", color: 0xa58bff },
  [Role.Disguise]: { name: "Disguise", blurb: "Dresses as a robot and chats to distract them.", color: 0xf27ad8 },
  [Role.Engineer]: { name: "Engineer", blurb: "Opens doors, cuts fences, switches off machines.", color: 0xffe066 },
};

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

/**
 * Suggested roles per player count (from the brief's merge table). Each inner
 * array is one player: the first role is the one they pick, the rest are
 * merged in. The merge itself is implemented in M4; the lobby only shows it.
 */
export const SUGGESTED_TEAMS: Record<number, Role[][]> = {
  1: [ROLES],
  2: [
    [Role.Scout, Role.Disguise, Role.Sleeper],
    [Role.Trapper, Role.Tagger, Role.Engineer],
  ],
  3: [
    [Role.Scout, Role.Disguise],
    [Role.Trapper, Role.Engineer],
    [Role.Tagger, Role.Sleeper],
  ],
  4: [[Role.Scout], [Role.Trapper, Role.Engineer], [Role.Tagger, Role.Sleeper], [Role.Disguise]],
  5: [[Role.Scout], [Role.Trapper, Role.Engineer], [Role.Tagger], [Role.Sleeper], [Role.Disguise]],
  6: ROLES.map((r) => [r]),
};

/** Role card phrases (A2 English) shown on the phone during the briefing and in game. */
export const ROLE_PHRASES: Record<Role, string[]> = {
  [Role.Scout]: ["Wait!", "Go now!", "The robot is turning. 3, 2, 1…"],
  [Role.Trapper]: ["I'll put a trap here.", "Hide in the snow!", "I can cover it."],
  [Role.Tagger]: ["I'm behind it.", "I'll tie it up.", "Help me hide it."],
  [Role.Sleeper]: ["I can see it. Shooting now!", "It's switched off. Go!", "I have two darts left."],
  [Role.Disguise]: ["I'll talk to it.", "It's looking at me. Go now!", "I can't stay long."],
  [Role.Engineer]: ["I'll open the door.", "Wait, I'm cutting the fence.", "The radio is off!"],
};
