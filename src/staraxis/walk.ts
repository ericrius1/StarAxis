/**
 * Walkable-surface query for the first-person visitor.
 *
 * The terrain heightfield is the general ground, but the Star Tunnel stair
 * runs *under* the summit hillside (the upper run is deliberately buried),
 * so inside the stair channel the tread surface wins over the terrain above
 * it. That is what lets a visitor climb all 147 steps, pass through the
 * tunnel mouth, and emerge at the aperture — the whole point of the piece.
 */

import { STAIR_BASE, STAIR_TOP, STAIR_WIDTH } from './constants';
import { terrainHeight, stairSurfaceY } from './heightfield';

/** Standing eye height above the walking surface. */
export const EYE_HEIGHT = 1.7;

/** Half-width of the walkable stair channel (between the stringer rails). */
const CHANNEL_HALF = STAIR_WIDTH / 2 + 0.35;

/** True when (x, z) is inside the Star Tunnel stair channel. */
export function inStairChannel(x: number, z: number): boolean {
  return Math.abs(x) <= CHANNEL_HALF && z <= STAIR_BASE.z && z >= STAIR_TOP.z;
}

/** Height of the surface a visitor stands on at (x, z). */
export function walkSurfaceY(x: number, z: number): number {
  if (inStairChannel(x, z)) return stairSurfaceY(z);
  return terrainHeight(x, z);
}
