/**
 * Analytic terrain for the rebuilt, unified monument.
 *
 * The important authored landform is a level apron around and behind the
 * pyramid.  It continues well beyond the foot of the rear stair, then breaks
 * into a broad slope at its north edge.  The same function drives both the
 * rendered terrain and the first-person walking surface.
 */

import {
  APRON_FRONT_Z,
  APRON_HALF_WIDTH,
  APRON_HEIGHT,
  APRON_REAR_Z,
  APRON_SLOPE_RUN,
  STAIR_BASE,
  STAIR_TOP,
  SUMMIT_CENTER,
  SUMMIT_HEIGHT,
  SUMMIT_RADIUS,
} from './constants';

function smooth01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Low, deterministic high-desert undulation. */
function plainNoise(x: number, z: number): number {
  return (
    1.15 * Math.sin(x * 0.008 + 0.9) * Math.sin(z * 0.009 - 1.3) +
    0.62 * Math.sin(x * 0.021 + 1.7) * Math.sin(z * 0.019 - 0.6) +
    0.24 * Math.sin(x * 0.061 - 2.1) * Math.sin(z * 0.054 + 1.2)
  );
}

/** The unbuilt mesa underneath the architectural grading. */
export function naturalHeight(x: number, z: number): number {
  const dx = x - SUMMIT_CENTER.x;
  const dz = z - SUMMIT_CENTER.z;
  const mesa =
    SUMMIT_HEIGHT * Math.exp(-(dx * dx + dz * dz) / (SUMMIT_RADIUS * SUMMIT_RADIUS));
  return plainNoise(x, z) + mesa;
}

/** Continuous walking line along the rear stair. */
export function stairSurfaceY(z: number): number {
  const t = (z - STAIR_BASE.z) / (STAIR_TOP.z - STAIR_BASE.z);
  return lerp(STAIR_BASE.y, STAIR_TOP.y, Math.max(0, Math.min(1, t)));
}

/**
 * Rectangular mesa grading.  `outside` is zero across the flat apron and
 * grows past its side/front/rear break lines.  The rear run is deliberately
 * long and obvious in profile: flat ground behind the stair, then slope.
 */
export function terrainHeight(x: number, z: number): number {
  const natural = naturalHeight(x, z);
  const sideOutside = Math.max(0, Math.abs(x) - APRON_HALF_WIDTH);
  const frontOutside = Math.max(0, z - APRON_FRONT_Z);
  const rearOutside = Math.max(0, APRON_REAR_Z - z);
  const outside = Math.max(sideOutside, frontOutside, rearOutside);
  const blend = smooth01(outside / APRON_SLOPE_RUN);

  // The 8 m pad is intentionally planar; only the falloff carries natural
  // undulation.  This is the flat plane visible behind the staircase.
  return lerp(APRON_HEIGHT, natural, blend);
}
