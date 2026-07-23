/**
 * Unified Star Axis monument layout.
 *
 * Coordinate frame: metres; +Y up; NORTH = -Z; the public/front approach is
 * from the south (+Z).  The pyramid, Hour Chamber slit, rear Star Tunnel
 * stair and Polaris aperture are one continuous architectural mass.
 */

export const LATITUDE_DEG = 34.5;
export const LATITUDE_RAD = (LATITUDE_DEG * Math.PI) / 180;

/** Unit vector from the site toward Polaris (up-tilted due north). */
export const POLARIS_DIR = {
  x: 0,
  y: Math.sin(LATITUDE_RAD),
  z: -Math.cos(LATITUDE_RAD),
} as const;

// ---------------------------------------------------------------- terrain
export const TERRAIN_SIZE = 1600;
export const TERRAIN_SEGMENTS = 512;
export const APRON_HEIGHT = 8;
export const APRON_HALF_WIDTH = 34;
export const APRON_FRONT_Z = 26;
export const APRON_REAR_Z = -94;
export const APRON_SLOPE_RUN = 44;

/** Broad natural mesa under the man-made apron. */
export const SUMMIT_CENTER = { x: 0, z: -34 } as const;
export const SUMMIT_HEIGHT = 7.5;
export const SUMMIT_RADIUS = 118;

// ---------------------------------------------------------------- unified pyramid
export const PYRAMID_CENTER = { x: 0, z: -25 } as const;
export const PYRAMID_BASE_Y = APRON_HEIGHT;
export const PYRAMID_HEIGHT = 30;
export const PYRAMID_BASE_HALF = 12.5;
export const PYRAMID_FRONT_Z = 8;
export const PYRAMID_REAR_Z = -58;
export const PYRAMID_APEX = { x: 0, y: 38, z: -18 } as const;
export const PYRAMID_TOP_HALF = 2.4;
export const PYRAMID_TOP_FRONT_Z = -16;
export const PYRAMID_TOP_REAR_Z = -21.5;

/** The tall needle-like Hour Chamber entry in the south/front face. */
export const FRONT_SLIT_HALF_WIDTH = 0.82;
export const FRONT_SLIT_TOP_Y = 24;
export const FRONT_CHAMBER_DEPTH = 18;

// ---------------------------------------------------------------- rear Star Tunnel stair
export const STAIR_STEP_COUNT = 147;
export const STAIR_WIDTH = 3.2;
export const STAIR_BASE = { x: 0, y: APRON_HEIGHT, z: PYRAMID_REAR_Z + 0.7 } as const;
export const STAIR_TOP = { x: 0, y: 34.2, z: -18.9 } as const;
export const STAIR_STEP_RISE = (STAIR_TOP.y - STAIR_BASE.y) / STAIR_STEP_COUNT;
export const STAIR_STEP_RUN = (STAIR_TOP.z - STAIR_BASE.z) / STAIR_STEP_COUNT;
export const STRINGER_HEIGHT = 0.58;
export const STRINGER_WIDTH = 0.42;
export const STRINGER_GAP_X = STAIR_WIDTH / 2 + 0.36;
export const APERTURE_INNER_RADIUS = 0.72;
export const APERTURE_WALL = 0.09;
export const APERTURE_LENGTH = 1.15;

/** Rear landing behind the lowest stair, held level before the mesa drops. */
export const REAR_LANDING_FRONT_Z = PYRAMID_REAR_Z - 0.5;
export const REAR_LANDING_REAR_Z = -88;

// ---------------------------------------------------------------- sky
export const SKY_RADIUS = 1200;
export const STAR_COUNT = 3500;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Point along the rear stair, t=0 at the apron and t=1 at the aperture. */
export function stairPoint(t: number): { x: number; y: number; z: number } {
  const c = Math.max(0, Math.min(1, t));
  return {
    x: 0,
    y: STAIR_BASE.y + (STAIR_TOP.y - STAIR_BASE.y) * c,
    z: STAIR_BASE.z + (STAIR_TOP.z - STAIR_BASE.z) * c,
  };
}
