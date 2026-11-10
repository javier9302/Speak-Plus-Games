import { testLevel, type LevelDef } from "../level.js";
import { snowOutpost } from "./snowOutpost.js";
import { bridgeCheckpoint } from "./bridgeCheckpoint.js";
import { nightDepot } from "./nightDepot.js";
import { harborYard } from "./harborYard.js";
import { robotFactory } from "./robotFactory.js";

/** All playable levels, in lobby order. */
export const LEVELS: LevelDef[] = [snowOutpost, bridgeCheckpoint, nightDepot, harborYard, robotFactory, testLevel];

export function getLevel(id: string): LevelDef {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}
