/**
 * First-person walking surfaces for the unified pyramid.
 *
 * General travel follows the analytic terrain.  In the rear cut, the 147
 * treads override the flat apron so the visitor can climb to the aperture.
 */

import {
  EYE_HEIGHT,
  PYRAMID_BASE_Y,
  PYRAMID_FRONT_Z,
  PYRAMID_REAR_Z,
  STAIR_BASE,
  STAIR_TOP,
  STAIR_WIDTH,
  TERRACE_STAIR_HALF_W,
  TERRACE_STAIR_TOP_Z,
  TERRACE_STAIR_COUNT,
  TERRACE_STAIR_RUN,
  UPPER_LANDING_FRONT_Z,
} from './constants';
import { stairSurfaceY, terrainHeight, terraceStairLineY } from './heightfield';

export { EYE_HEIGHT } from './constants';
const CHANNEL_HALF = STAIR_WIDTH / 2 + 0.28;

export function inStairChannel(x: number, z: number): boolean {
  const zMin = Math.min(STAIR_BASE.z, STAIR_TOP.z) - 0.35;
  const zMax = Math.max(STAIR_BASE.z, STAIR_TOP.z) + 0.35;
  return (
    Math.abs(x - STAIR_BASE.x) <= CHANNEL_HALF &&
    z >= zMin &&
    z <= zMax
  );
}

/** Level viewing bay between the last tread and the aperture mouth. */
export function inUpperViewingBay(x: number, z: number): boolean {
  const zMin = Math.min(STAIR_TOP.z - 0.45, UPPER_LANDING_FRONT_Z);
  const zMax = Math.max(STAIR_TOP.z + 0.45, UPPER_LANDING_FRONT_Z);
  return (
    Math.abs(x - STAIR_TOP.x) <= STAIR_WIDTH / 2 + 0.48 &&
    z >= zMin &&
    z <= zMax
  );
}

export function onTerraceStair(x: number, z: number): boolean {
  const zSouth = TERRACE_STAIR_TOP_Z + TERRACE_STAIR_COUNT * TERRACE_STAIR_RUN;
  return Math.abs(x) <= TERRACE_STAIR_HALF_W && z >= TERRACE_STAIR_TOP_Z && z <= zSouth;
}

function inHourChamber(x: number, z: number): boolean {
  const zMin = Math.min(PYRAMID_FRONT_Z, PYRAMID_REAR_Z);
  const zMax = Math.max(PYRAMID_FRONT_Z, PYRAMID_REAR_Z);
  return Math.abs(x) < 0.72 && z >= zMin - 5 && z <= zMax;
}

export function walkSurfaceY(x: number, z: number): number {
  if (inUpperViewingBay(x, z)) return STAIR_TOP.y;
  if (inStairChannel(x, z)) return stairSurfaceY(z);
  if (onTerraceStair(x, z)) return terraceStairLineY(z);
  if (inHourChamber(x, z)) return PYRAMID_BASE_Y;
  return terrainHeight(x, z);
}
