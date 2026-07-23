/**
 * First-person walking surfaces for the unified pyramid.
 *
 * General travel follows the analytic terrain.  In the rear cut, the 147
 * treads override the flat apron so the visitor can climb to the aperture.
 */

import {
  EYE_HEIGHT,
  STAIR_BASE,
  STAIR_TOP,
  STAIR_WIDTH,
  UPPER_LANDING_FRONT_Z,
} from './constants';
import { stairSurfaceY, terrainHeight } from './heightfield';

export { EYE_HEIGHT } from './constants';
const CHANNEL_HALF = STAIR_WIDTH / 2 + 0.28;

export function inStairChannel(x: number, z: number): boolean {
  return (
    Math.abs(x - STAIR_BASE.x) <= CHANNEL_HALF &&
    z >= STAIR_BASE.z - 0.35 &&
    z <= STAIR_TOP.z + 0.35
  );
}

/** Level viewing bay between the last tread and the aperture mouth. */
export function inUpperViewingBay(x: number, z: number): boolean {
  return (
    Math.abs(x - STAIR_TOP.x) <= STAIR_WIDTH / 2 + 0.48 &&
    z >= STAIR_TOP.z - 0.45 &&
    z <= UPPER_LANDING_FRONT_Z
  );
}

/** Kept for callers compiled against the former two-stair layout. */
export function onTerraceStair(): boolean {
  return false;
}

export function walkSurfaceY(x: number, z: number): number {
  if (inUpperViewingBay(x, z)) return STAIR_TOP.y;
  if (inStairChannel(x, z)) return stairSurfaceY(z);
  return terrainHeight(x, z);
}
