/**
 * Analytic height field shared by rendering and first-person walking.
 *
 * The Avenue and circular Equinoctial excavation are carved into one natural
 * mesa. The full Star Tunnel slot is then cut northward through that same
 * landform so no terrain sheet can clip across the 147-step sightline.
 */

import {
  BOWL_CENTER,
  BOWL_FLOOR_Y,
  CRESCENT_ARC_HALF_RAD,
  FRONT_SLIT_HALF_WIDTH,
  PYRAMID_BASE_HALF,
  PYRAMID_BASE_Y,
  PYRAMID_CENTER,
  PYRAMID_FRONT_Z,
  PYRAMID_REAR_Z,
  STAIR_BASE,
  STAIR_TOP,
  SUMMIT_CENTER,
  SUMMIT_HEIGHT,
  SUMMIT_RADIUS,
  TERRACE_STAIR_HALF_W,
  TERRACE_STAIR_RISE,
  TERRACE_STAIR_RUN,
  TERRACE_STAIR_TOP_Y,
  TERRACE_STAIR_TOP_Z,
  TRENCH_SOUTH_Z,
  crescentCrownY,
} from './constants';

function smooth01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function plainNoise(x: number, z: number): number {
  return (
    2.15 * Math.sin(x * 0.0042 + 0.9) * Math.sin(z * 0.0051 - 1.3) +
    1.2 * Math.sin(x * 0.011 + 1.7) * Math.sin(z * 0.013 - 0.6) +
    0.52 * Math.sin(x * 0.031 - 2.1) * Math.sin(z * 0.027 + 1.2)
  );
}

/**
 * Transverse sand waves, crests lying across the prevailing WSW wind.
 *
 * Amplitude is deliberately tiny — under 20 cm, well below anything a walker
 * notices — but at the shallow sun angles this site is built around, a 20 m
 * crest throws a shadow several metres long. Without them the desert renders
 * as a shadeless sheet, because at a 3.6 m grid pitch there is nothing else
 * for a low sun to rake across.
 *
 * Wavelengths stay at 21 m and up for that same reason: the terrain samples
 * every 3.6 m, and crests any tighter than about six samples apart resolve
 * into visible triangle facets rather than waves.
 */
function sandRipples(x: number, z: number): number {
  const along = x * 0.9239 + z * 0.3827;
  const across = z * 0.9239 - x * 0.3827;
  // A slow warp bends the crests around the larger landforms so they never
  // read as a printed pattern.
  const warp =
    2.9 * Math.sin(across * 0.019 + 0.7) + 1.6 * Math.sin(along * 0.015 - 1.9);
  const primary = Math.sin((along + warp) * 0.30);
  const secondary = Math.sin((along + warp * 1.7) * 0.17 + 1.1);
  const envelope = 0.55 + 0.45 * Math.sin(across * 0.031 + 2.3);
  return (primary * 0.1 + secondary * 0.085) * envelope;
}

export function naturalHeight(x: number, z: number): number {
  const dx = x - SUMMIT_CENTER.x;
  const dz = z - SUMMIT_CENTER.z;
  const mound =
    SUMMIT_HEIGHT * Math.exp(-(dx * dx + dz * dz) / (SUMMIT_RADIUS * SUMMIT_RADIUS));
  const northernPlateau =
    (SUMMIT_HEIGHT - 1.8) *
    smooth01((-z - 24) / 48) *
    smooth01((310 - Math.abs(x + 30)) / 185);
  return plainNoise(x, z) + sandRipples(x, z) + Math.max(mound, northernPlateau);
}

export function stairSurfaceY(z: number): number {
  const t = (STAIR_BASE.z - z) / (STAIR_BASE.z - STAIR_TOP.z);
  return lerp(STAIR_BASE.y, STAIR_TOP.y, Math.max(0, Math.min(1, t)));
}

export function trenchFloorY(z: number): number {
  const t = smooth01((TRENCH_SOUTH_Z - z) / (TRENCH_SOUTH_Z - 2));
  return lerp(1.1, 2.2, t);
}

export function terraceStairLineY(z: number): number {
  const line =
    TERRACE_STAIR_TOP_Y -
    ((z - TERRACE_STAIR_TOP_Z) * TERRACE_STAIR_RISE) / TERRACE_STAIR_RUN;
  return Math.min(TERRACE_STAIR_TOP_Y, Math.max(trenchFloorY(z), line));
}

export function terrainHeight(x: number, z: number): number {
  let h = naturalHeight(x, z);

  // Circular Equinoctial excavation. The court and rubble bowl are a single
  // cut, with the masonry crown following the photographed arc.
  const db = Math.hypot(x - BOWL_CENTER.x, z - BOWL_CENTER.z);
  if (db < 30.5) {
    const angle = Math.atan2(x - BOWL_CENTER.x, -(z - BOWL_CENTER.z));
    const boundedAngle = Math.max(
      -CRESCENT_ARC_HALF_RAD,
      Math.min(CRESCENT_ARC_HALF_RAD, angle),
    );
    const crown = crescentCrownY(boundedAngle) - 0.35;
    if (db <= 23.2) {
      const court = BOWL_FLOOR_Y;
      const south = trenchFloorY(z);
      const target = lerp(court, south, smooth01((z - 1.1) / 2.4));
      h = Math.min(h, target);
    } else {
      const t = smooth01((30.5 - db) / 7.3);
      h = lerp(h, Math.min(h, crown), t);
    }
  }

  // Avenue: a long, south-facing trench whose upper banks widen outward.
  if (z > 1 && z < TRENCH_SOUTH_Z + 18) {
    const floor = trenchFloorY(z);
    const halfWidth = lerp(5.4, 13.2, smooth01((z - 2) / (TRENCH_SOUTH_Z - 2)));
    const wallRise = Math.max(0, Math.abs(x) - halfWidth) * 1.55;
    const carved = Math.min(h, floor + wallRise);
    const fade = smooth01((TRENCH_SOUTH_Z + 18 - z) / 18);
    h = lerp(h, carved, fade);
  }

  // Granite stair through the lower retaining wall.
  if (Math.abs(x) < TERRACE_STAIR_HALF_W + 0.25 && z > -1.4 && z < 6.8) {
    h = Math.min(h, terraceStairLineY(z) - 0.32);
  }

  // Full Star Tunnel slot. Keeping this open from portal to pyramid prevents
  // the old invisible-ground wall and makes the complete sightline readable.
  if (z > STAIR_TOP.z - 3.5 && z < STAIR_BASE.z + 2.2) {
    const stairY = stairSurfaceY(z);
    const halfWidth = 3.65;
    const wallRise = Math.max(0, Math.abs(x) - halfWidth) * 2.35;
    const carved = Math.min(h, stairY - 0.58 + wallRise);
    const along =
      smooth01((STAIR_BASE.z + 2.2 - z) / 3.2) *
      smooth01((z - (STAIR_TOP.z - 3.5)) / 1.8);
    h = lerp(h, carved, along);
  }

  // Seat the Solar Pyramid into the mesa. Bank sand against the full base
  // perimeter (especially the north/public face, which otherwise floats).
  // Keep the rear Star Tunnel slot and Hour Chamber interior unfilled.
  const localX = Math.abs(x - PYRAMID_CENTER.x);
  const localZ = Math.abs(z - PYRAMID_CENTER.z);
  const apronHalfX = PYRAMID_BASE_HALF + 6.5;
  const apronHalfZ = PYRAMID_BASE_HALF + 12;
  const pyramidApron = localX < apronHalfX && localZ < apronHalfZ;
  const inTunnelSlot =
    localX < 4.1 && z > STAIR_TOP.z - 3.5 && z < STAIR_BASE.z + 2.2;
  // Strictly inside the north wall — the base line itself must still seat.
  const inHourChamber =
    localX < FRONT_SLIT_HALF_WIDTH + 0.35 &&
    z > PYRAMID_FRONT_Z + 0.2 &&
    z <= PYRAMID_REAR_Z - 0.5;
  if (pyramidApron && !inTunnelSlot && !inHourChamber) {
    const edge = Math.max(localX / apronHalfX, localZ / apronHalfZ);
    // A true level platform, cut as well as filled. Only filling left the
    // mesa summit standing ~2.5 m proud of the Pyramid's base course, so the
    // shell rose out of a drift instead of standing on ground. The 0.4 m
    // over-height still stops low cameras seeing daylight under the shell.
    const padY = PYRAMID_BASE_Y + 0.4;
    h = lerp(padY, h, smooth01((edge - 0.62) / 0.38));
  }

  return h;
}
