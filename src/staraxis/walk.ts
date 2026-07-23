/**
 * First-person walking surfaces for the unified pyramid.
 *
 * General travel follows the analytic terrain.  In the rear cut, the 147
 * treads override the flat apron so the visitor can climb to the aperture.
 */

import { STAIR_BASE, STAIR_TOP, STAIR_WIDTH } from './constants';
import { stairSurfaceY, terrainHeight } from './heightfield';

export const EYE_HEIGHT = 1.7;
const CHANNEL_HALF = STAIR_WIDTH / 2 + 0.28;

export function inStairChannel(x: number, z: number): boolean {
  return (
    Math.abs(x - STAIR_BASE.x) <= CHANNEL_HALF &&
    z >= STAIR_BASE.z - 0.35 &&
    z <= STAIR_TOP.z + 0.35
  );
}

/** Kept for callers compiled against the former two-stair layout. */
export function onTerraceStair(): boolean {
  return false;
}

export function walkSurfaceY(x: number, z: number): number {
  if (inStairChannel(x, z)) return stairSurfaceY(z);
  return terrainHeight(x, z);
}
