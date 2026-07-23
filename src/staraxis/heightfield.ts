/**
 * Analytic terrain height field for the Star Axis site.
 *
 * Single source of truth for ground elevation: the terrain mesh displaces
 * with it, and the monument seats its footings against it. Deterministic —
 * no random state, so every load produces the identical landscape.
 */

import {
  SUMMIT_CENTER,
  SUMMIT_HEIGHT,
  SUMMIT_RADIUS,
  BOWL_CENTER,
  BOWL_FLOOR_Y,
  TRENCH_SOUTH_Z,
  STAIR_BASE,
  STAIR_TOP,
  TUNNEL_MOUTH_T,
  PYRAMID_CENTER,
  PYRAMID_BASE_Y,
  crescentCrownY,
} from './constants';

function smooth01(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic rolling-plain undulation (value-noise-ish sine stack). */
function plainNoise(x: number, z: number): number {
  return (
    2.6 * Math.sin(x * 0.0042 + 0.9) * Math.sin(z * 0.0051 - 1.3) +
    1.5 * Math.sin(x * 0.011 + 1.7) * Math.sin(z * 0.013 - 0.6) +
    0.8 * Math.sin(x * 0.031 - 2.1) * Math.sin(z * 0.027 + 1.2) +
    0.3 * Math.sin(x * 0.083 + 0.4) * Math.sin(z * 0.071 - 1.9)
  );
}

/** Natural (uncarved) terrain: plain + summit mound + mesa plateau north. */
export function naturalHeight(x: number, z: number): number {
  let h = plainNoise(x, z);
  const dxs = x - SUMMIT_CENTER.x;
  const dzs = z - SUMMIT_CENTER.z;
  const mound =
    SUMMIT_HEIGHT * Math.exp(-(dxs * dxs + dzs * dzs) / (SUMMIT_RADIUS * SUMMIT_RADIUS));
  // Broad mesa plateau extending north: the monument sits at the mesa's
  // south rim, with the plains dropping away to the south and east.
  const plateau =
    (SUMMIT_HEIGHT - 1) *
    smooth01((-z - 25) / 45) *
    smooth01((300 - Math.abs(x + 40)) / 180);
  h += Math.max(mound, plateau);
  return h;
}

/** Stair walking-surface elevation at a given z along the tunnel axis. */
export function stairSurfaceY(z: number): number {
  const t = (STAIR_BASE.z - z) / (STAIR_BASE.z - STAIR_TOP.z);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return lerp(STAIR_BASE.y, STAIR_TOP.y, c);
}

/** Entry-path floor elevation along the trench. */
export function trenchFloorY(z: number): number {
  const t = smooth01((TRENCH_SOUTH_Z - z) / (TRENCH_SOUTH_Z - 2));
  return lerp(3.0, 2.0, t);
}

/**
 * Final terrain height with the three excavations carved in:
 * circular bowl, entry trench, and the stair slot through the summit.
 */
export function terrainHeight(x: number, z: number): number {
  let h = naturalHeight(x, z);

  // --- circular bowl carve (masonry wall lines the inner face)
  // Inside the wall face: flat bowl floor. Behind the wall (20.5..27 m):
  // pull the hillside down so it laps the wall back just below the coping,
  // exactly like the rubble hill meeting the rim in the reference photos.
  const db = Math.hypot(x - BOWL_CENTER.x, z - BOWL_CENTER.z);
  if (db < 29) {
    const a = Math.atan2(x - BOWL_CENTER.x, -(z - BOWL_CENTER.z)); // 0 = due north
    const crown = crescentCrownY(a) - 0.35;
    if (db <= 22.6) {
      // Court floor north of the terrace face; path level south of it.
      // The terrace retaining wall masks the elevation step.
      const court = BOWL_FLOOR_Y;
      const south = trenchFloorY(z);
      const target = lerp(court, south, smooth01((z - 1.2) / 2.2));
      h = Math.min(h, target);
    } else {
      const t = smooth01((29 - db) / 6.4); // berm laps the wall back
      const carved = Math.min(h, crown);
      h = lerp(h, carved, t);
    }
  }

  // --- entry trench carve (south approach corridor)
  if (z > 1 && z < TRENCH_SOUTH_Z + 14) {
    const floor = trenchFloorY(z);
    // steep bank above the trench floor edge so the leaning masonry walls
    // embed fully; half-width grows southward
    const halfW = lerp(5.2, 11.0, smooth01((z - 2) / (TRENCH_SOUTH_Z - 2)));
    const wallRise = Math.max(0, Math.abs(x) - halfW) * 1.7;
    const carved = Math.min(h, floor + wallRise);
    const along = smooth01((TRENCH_SOUTH_Z + 14 - z) / 14); // fade in from the south
    h = lerp(h, carved, along);
  }

  // --- stair slot carve: open channel only up to the tunnel mouth; the
  // upper run is covered by the hillside (the stair goes underground and
  // re-emerges at the headwall slab on the summit).
  const mouthZ = STAIR_BASE.z + (STAIR_TOP.z - STAIR_BASE.z) * TUNNEL_MOUTH_T;
  if (z > mouthZ - 1 && z < STAIR_BASE.z + 2) {
    const surf = stairSurfaceY(z) - 0.5;
    const halfW = 3.1;
    const wallRise = Math.max(0, Math.abs(x) - halfW) * 1.4;
    const carved = Math.min(h, surf + wallRise);
    const along = smooth01((STAIR_BASE.z + 2 - z) / 4) * smooth01((z - (mouthZ - 1)) / 3);
    h = lerp(h, carved, along);
  }

  // --- burial ridge over the covered upper run so no hood geometry
  // pierces the hillside surface
  const ridgeS = STAIR_BASE.z + (STAIR_TOP.z - STAIR_BASE.z) * TUNNEL_MOUTH_T - 0.5; // just north of the mouth
  const ridgeN = STAIR_TOP.z + 2.5;
  if (z > ridgeN && z < ridgeS && Math.abs(x) < 7) {
    const cover = stairSurfaceY(z) + 5.9;
    const t =
      smooth01((7 - Math.abs(x)) / 4) *
      smooth01((ridgeS - z) / 2.5) *
      smooth01((z - ridgeN) / 2.5);
    h = lerp(h, Math.max(h, cover), t);
  }

  // --- small dish where the headwall emerges at the summit
  const dh = Math.hypot(x, z - (STAIR_TOP.z - 1));
  if (dh < 5) {
    const t = smooth01((5 - dh) / 3);
    h = lerp(h, Math.min(h, STAIR_TOP.y - 0.3), t);
  }

  // --- rubble apron under the solar pyramid so its base never floats
  const dp = Math.hypot(x - PYRAMID_CENTER.x, z - PYRAMID_CENTER.z);
  if (dp < 19) {
    h = Math.max(h, lerp(h, PYRAMID_BASE_Y + 0.4, smooth01((19 - dp) / 6)));
  }

  return h;
}
