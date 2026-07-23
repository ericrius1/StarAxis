/**
 * Star Axis site layout constants.
 *
 * Coordinate frame: meters; +Y up; NORTH = -Z; EAST = +X.
 * The Star Tunnel stair rises toward due north at the site latitude angle,
 * so its axis is parallel to Earth's rotation axis and aims at Polaris.
 * Dimensions are approximations derived from published facts
 * (11 stories tall, ~160 m across, 147 steps, 15° hour wedge, lat ≈ 34.5°)
 * plus reference-photo proportions.
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
export const TERRAIN_SIZE = 1600; // width/depth of the ground plane
export const TERRAIN_SEGMENTS = 768;

/** Mesa summit mound: gaussian centered north of the bowl. */
export const SUMMIT_CENTER = { x: -4, z: -40 } as const;
export const SUMMIT_HEIGHT = 30; // peak height above south plain (y=0)
export const SUMMIT_RADIUS = 75; // gaussian sigma-ish falloff radius

/** Circular excavated bowl carved into the south slope of the summit. */
export const BOWL_CENTER = { x: 0, z: 0 } as const;
export const BOWL_RADIUS = 21;
export const BOWL_FLOOR_Y = 6; // bowl floor elevation

/** Entry trench runs due south from the terrace inside the bowl. */
export const TRENCH_HALF_WIDTH = 9; // at floor level
export const TRENCH_SOUTH_Z = 58; // where trench fades into the plain
export const TRENCH_NORTH_Z = 2; // meets the terrace retaining wall
export const PATH_FLOOR_SOUTH_Y = 0.0;
export const PATH_FLOOR_NORTH_Y = 2.0; // gentle rise toward the terrace

// ---------------------------------------------------------------- entry channel
export const ENTRY_WALL_LENGTH = 38;
export const ENTRY_WALL_HEIGHT = 8.5;
export const ENTRY_WALL_LEAN_RAD = 0.5; // outward lean from vertical (~29°)
export const ENTRY_WALL_Z_CENTER = 37; // wall run center (z from 18 to 56)
export const ENTRY_WALL_HALF_GAP_NORTH = 4.8; // channel half-width at north end
export const ENTRY_WALL_HALF_GAP_SOUTH = 10.5; // channel half-width at south end

// ---------------------------------------------------------------- terrace + portal
export const TERRACE_TOP_Y = 6.0; // platform top = bowl court level
export const TERRACE_BASE_Y = 2.0;
export const TERRACE_Z = 1.8; // retaining face plane (inside the bowl)
export const TERRACE_WIDTH = 16.5;
export const PORTAL_Z = -1.4;
export const PORTAL_HEIGHT = 6.2; // outer gable height above terrace top
export const PORTAL_BASE_HALF_WIDTH = 2.3;
export const PORTAL_DEPTH = 2.4;
export const PORTAL_VOID_HALF_WIDTH = 1.15;
export const PORTAL_VOID_HEIGHT = 4.8;

/** Terrace stair: the walkable flight from path level up through the
 *  retaining-wall notch onto the court. Top tread surface sits at court
 *  level; the flight descends due south. */
export const TERRACE_STAIR_HALF_W = 1.7;
export const TERRACE_STAIR_RISE = 0.16;
export const TERRACE_STAIR_RUN = 0.24;
export const TERRACE_STAIR_TOP_Y = 6.0;
export const TERRACE_STAIR_TOP_Z = -0.05;
export const TERRACE_STAIR_COUNT = 25;

// ---------------------------------------------------------------- crescent wall
export const CRESCENT_RADIUS = 20; // wall face radius around bowl center
export const CRESCENT_THICKNESS = 3.2;
/** Arc opens toward the south: wall spans azimuth (from +Z south, around north). */
export const CRESCENT_ARC_HALF_RAD = 2.0; // ±~115° from due north
export const CRESCENT_BASE_Y = BOWL_FLOOR_Y;
export const CRESCENT_TOP_Y = 16.5; // rim/coping top at the north crown
export const COPING_HEIGHT = 0.45;
export const BASTION_SIZE = { w: 7, h: 7.5, d: 7 } as const;

// ---------------------------------------------------------------- star tunnel
export const STAIR_BASE = { x: 0, y: BOWL_FLOOR_Y, z: -4.5 } as const;
export const STAIR_STEP_COUNT = 147;
export const STAIR_STEP_RISE = 0.155;
export const STAIR_STEP_RUN = 0.225;
export const STAIR_WIDTH = 2.6;
/** Derived stair top (north end). */
export const STAIR_TOP = {
  x: 0,
  y: STAIR_BASE.y + STAIR_STEP_COUNT * STAIR_STEP_RISE, // ≈ 28.8
  z: STAIR_BASE.z - STAIR_STEP_COUNT * STAIR_STEP_RUN, // ≈ -19.6
} as const;
export const STRINGER_HEIGHT = 1.5;
export const STRINGER_WIDTH = 0.9;
export const STRINGER_GAP_X = 1.85; // stringer center offset from axis

/** Covered hood over the upper portion of the run (fractions of the run). */
export const HOOD_START_T = 0.52;
export const HOOD_END_T = 0.88;
export const HOOD_WALL_HEIGHT = 4.4;
export const HOOD_BASE_HALF_WIDTH = 2.9;
export const HOOD_TOP_HALF_WIDTH = 1.6;

export const HEADWALL = { w: 3.4, h: 6.8, d: 1.5 } as const;
export const APERTURE_INNER_RADIUS = 0.51;
export const APERTURE_WALL = 0.05;
export const APERTURE_LENGTH = 3.4;

// ---------------------------------------------------------------- solar pyramid
export const PYRAMID_CENTER = { x: -16, z: -47 } as const;
export const PYRAMID_BASE_Y = 29.2; // sits proud on the summit mound
export const PYRAMID_HEIGHT = 16.8; // ≈ 55 ft
export const PYRAMID_BASE_HALF = 11.5;
/** 15° wedge aperture of the Hour Chamber, cut into the north face. */
export const HOUR_WEDGE_DEG = 15;
export const HOUR_WEDGE_HEIGHT = 8.8;

// ---------------------------------------------------------------- sky
export const SKY_RADIUS = 1200;
export const STAR_COUNT = 3500;

// ---------------------------------------------------------------- helpers
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Point along the stair axis at parameter t (0 = base, 1 = top). */
export function stairPoint(t: number): { x: number; y: number; z: number } {
  return {
    x: 0,
    y: STAIR_BASE.y + (STAIR_TOP.y - STAIR_BASE.y) * t,
    z: STAIR_BASE.z + (STAIR_TOP.z - STAIR_BASE.z) * t,
  };
}

/**
 * Fraction of the stair run where it enters the hillside (dark tunnel mouth).
 * Chosen so the mouth sits exactly in the crescent wall plane at rim height:
 * stair y at t=0.465 ≈ 16.6 m ≈ wall crown.
 */
export const TUNNEL_MOUTH_T = 0.465;

/**
 * Crescent wall crown height above bowl floor at arc angle `a`
 * (a = 0 at the north crown, ±CRESCENT_ARC_HALF_RAD at the bastion ends).
 */
export function crescentCrownY(a: number): number {
  const t = Math.abs(a) / CRESCENT_ARC_HALF_RAD;
  return CRESCENT_TOP_Y - 4.0 * Math.pow(t, 1.6);
}
