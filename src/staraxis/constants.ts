/**
 * Integrated Star Axis site layout.
 *
 * Coordinate frame: metres; +Y up; NORTH = -Z; EAST = +X.
 *
 * The visitor sequence is one continuous piece of land art:
 *   south (+Z) Avenue excavation
 *   → Equinoctial Chamber triangular portal
 *   → 147-step Star Tunnel rising due north
 *   → Solar Pyramid crowning the tunnel at the mesa rim.
 *
 * The Pyramid's public/front elevation faces north. Its Hour Chamber slit is
 * independent of the Star Tunnel, which enters from the south/rear.
 */

export const LATITUDE_DEG = 34.5;
export const LATITUDE_RAD = (LATITUDE_DEG * Math.PI) / 180;

/** Unit vector from the site toward Polaris (up-tilted due north). */
export const POLARIS_DIR = {
  x: 0,
  y: Math.sin(LATITUDE_RAD),
  z: -Math.cos(LATITUDE_RAD),
} as const;

// ---------------------------------------------------------------- terrain / Avenue
export const TERRAIN_SIZE = 1600;
export const TERRAIN_SEGMENTS = 448;
export const SUMMIT_CENTER = { x: -4, z: -48 } as const;
export const SUMMIT_HEIGHT = 31;
export const SUMMIT_RADIUS = 82;

export const BOWL_CENTER = { x: 0, z: -1 } as const;
export const BOWL_RADIUS = 22;
export const BOWL_FLOOR_Y = 6;
export const TRENCH_SOUTH_Z = 68;
export const TRENCH_NORTH_Z = 3;
export const TRENCH_HALF_WIDTH = 10.5;
export const PATH_FLOOR_SOUTH_Y = 1.1;
export const PATH_FLOOR_NORTH_Y = 2.2;

export const ENTRY_WALL_HEIGHT = 9.5;
export const ENTRY_WALL_LEAN_RAD = 0.46;
export const ENTRY_WALL_HALF_GAP_NORTH = 5.2;
export const ENTRY_WALL_HALF_GAP_SOUTH = 12.5;

// ---------------------------------------------------------------- Equinoctial Chamber / court
export const TERRACE_TOP_Y = BOWL_FLOOR_Y;
export const TERRACE_Z = 2.1;
export const TERRACE_WIDTH = 18;
export const PORTAL_Z = -1.2;
export const PORTAL_HEIGHT = 7.2;
export const PORTAL_BASE_HALF_WIDTH = 2.7;
export const PORTAL_DEPTH = 2.8;
export const PORTAL_VOID_HALF_WIDTH = 1.35;
export const PORTAL_VOID_HEIGHT = 5.8;

export const TERRACE_STAIR_HALF_W = 1.85;
export const TERRACE_STAIR_RISE = 0.16;
export const TERRACE_STAIR_RUN = 0.25;
export const TERRACE_STAIR_TOP_Y = TERRACE_TOP_Y;
export const TERRACE_STAIR_TOP_Z = 0.1;
export const TERRACE_STAIR_COUNT = 25;

export const CRESCENT_RADIUS = 21.5;
export const CRESCENT_THICKNESS = 3.2;
export const CRESCENT_ARC_HALF_RAD = 2.02;
export const CRESCENT_BASE_Y = BOWL_FLOOR_Y;
export const CRESCENT_TOP_Y = 17.5;
export const COPING_HEIGHT = 0.45;

// ---------------------------------------------------------------- 147-step Star Tunnel
export const STAIR_STEP_COUNT = 147;
/** Published tread rise: 8.25 inches. */
export const STAIR_STEP_RISE = 0.20955;
/** Run chosen so the stair axis matches the site's 34.5° latitude. */
export const STAIR_STEP_RUN = STAIR_STEP_RISE / Math.tan(LATITUDE_RAD);
export const STAIR_WIDTH = 3.0;
export const STAIR_BASE = { x: 0, y: BOWL_FLOOR_Y, z: -4.4 } as const;
export const STAIR_TOP = {
  x: 0,
  y: STAIR_BASE.y + STAIR_STEP_COUNT * STAIR_STEP_RISE,
  z: STAIR_BASE.z - STAIR_STEP_COUNT * STAIR_STEP_RUN,
} as const;
export const STRINGER_HEIGHT = 0.62;
export const STRINGER_WIDTH = 0.44;
export const STRINGER_GAP_X = STAIR_WIDTH / 2 + 0.38;
export const TUNNEL_MOUTH_T = 0.43;

// ---------------------------------------------------------------- Solar Pyramid
export const PYRAMID_CENTER = { x: 0, z: -52 } as const;
export const PYRAMID_BASE_Y = 28.5;
export const PYRAMID_HEIGHT = 18.5;
export const PYRAMID_BASE_HALF = 8.7;
/** North/public face with the Hour Chamber slit. */
export const PYRAMID_FRONT_Z = -64;
/** South/back face receiving the Star Tunnel stair. */
export const PYRAMID_REAR_Z = -39.5;
export const PYRAMID_APEX = { x: 0, y: 47, z: -52.5 } as const;
export const PYRAMID_TOP_HALF = 1.65;
export const PYRAMID_TOP_FRONT_Z = -54.2;
export const PYRAMID_TOP_REAR_Z = -50.8;

export const FRONT_SLIT_HALF_WIDTH = 0.92;
export const FRONT_SLIT_TOP_Y = 36.8;
export const FRONT_CHAMBER_DEPTH = PYRAMID_FRONT_Z - PYRAMID_REAR_Z;

/** Visitor eye line at the top landing, aligned to the polar axis. */
export const PLAYER_HEIGHT = 1.83;
export const EYE_HEIGHT = 1.7;
export const APERTURE_CENTER_Y = STAIR_TOP.y + EYE_HEIGHT;
export const APERTURE_REAR_Z = STAIR_TOP.z - 0.45;
export const APERTURE_ELEVATION_RAD = LATITUDE_RAD;
export const APERTURE_INNER_RADIUS = 1.18;
export const APERTURE_EXIT_RADIUS = 1.32;
export const APERTURE_WALL = 0.1;
export const APERTURE_LENGTH = 0.52;
export const UPPER_LANDING_FRONT_Z = APERTURE_REAR_Z - 0.55;

// ---------------------------------------------------------------- sky
export const SKY_RADIUS = 1200;
export const STAR_COUNT = 3000;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Point along the Star Tunnel stair, t=0 south/lower and t=1 north/upper. */
export function stairPoint(t: number): { x: number; y: number; z: number } {
  const c = Math.max(0, Math.min(1, t));
  return {
    x: STAIR_BASE.x,
    y: STAIR_BASE.y + (STAIR_TOP.y - STAIR_BASE.y) * c,
    z: STAIR_BASE.z + (STAIR_TOP.z - STAIR_BASE.z) * c,
  };
}

/** Curved excavation crown, highest at the north end of the bowl. */
export function crescentCrownY(angle: number): number {
  const t = Math.abs(angle) / CRESCENT_ARC_HALF_RAD;
  return CRESCENT_TOP_Y - 4.3 * Math.pow(Math.min(1, t), 1.55);
}
