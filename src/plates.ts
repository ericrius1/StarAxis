/**
 * Ten still "photographs" of the site, path traced.
 *
 * Each plate is a viewpoint the work itself is built around, chosen from the
 * moments described in reporting on Star Axis: the west face taking the last
 * sun near the solstice and the east face for the few seconds it goes
 * tangerine at sunrise; the triangular doorway at the head of the Avenue; the
 * window opening out as you climb the Star Tunnel; Polaris held in that
 * window; the long exposure from the foot of the stair where the stars turn
 * as circles; an hour of sky crossing the Hour Chamber's slit; the Milky Way
 * over the mesa; moonlight strong enough to throw the Pyramid's shadow; and
 * the whole axis at once, a speck at the scale of the landscape.
 *
 * Like cinema.ts these are pure data — no clock, no random source — so a plate
 * renders identically on every run.
 */

import { Vector3 } from 'three/webgpu';
import {
  APERTURE_APPROACH_DISTANCE,
  APERTURE_CENTER_Y,
  APERTURE_REAR_Z,
  LATITUDE_RAD,
  PYRAMID_BASE_Y,
  PYRAMID_CENTER,
  STAIR_BASE,
  STAIR_TOP,
  stairPoint,
} from './staraxis/constants';
import { EYE_HEIGHT } from './staraxis/walk';

export interface Plate {
  /** File-name stem. */
  id: string;
  title: string;
  /** What this viewpoint is, and why it is one. */
  note: string;
  position: Vector3;
  target: Vector3;
  fov: number;
  /** 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. */
  solarTime: number;
  /** Radians of celestial rotation to integrate; 0 freezes the sky. */
  trailArc?: number;
  /** Per-plate sample budget — night plates carry far more variance. */
  samples: number;
  bounces?: number;
}

/** One hour of the Earth's rotation, in radians. */
const ONE_HOUR = (Math.PI * 2) / 24;

/** Unit vector toward Polaris, which several plates sight along. */
const POLARIS = new Vector3(
  0,
  Math.sin(LATITUDE_RAD),
  -Math.cos(LATITUDE_RAD),
).normalize();

/** A point `distance` along the polar axis from `from`. */
function alongPolarAxis(from: Vector3, distance: number): Vector3 {
  return from.clone().addScaledVector(POLARIS, distance);
}

const stairAt42 = stairPoint(0.42);
const upperRoomEye = new Vector3(
  0,
  STAIR_TOP.y + EYE_HEIGHT,
  APERTURE_REAR_Z + APERTURE_APPROACH_DISTANCE,
);
const stairFootEye = new Vector3(0, STAIR_BASE.y + EYE_HEIGHT, STAIR_BASE.z + 2.9);
const apertureThreshold = new Vector3(0, APERTURE_CENTER_Y, APERTURE_REAR_Z);

export const PLATES: Plate[] = [
  {
    id: '01-solstice-sunset-west-face',
    title: 'Solstice sunset, west face',
    note: 'The sun almost due west and a few degrees up. The west elevation takes the last direct light while the public north face has already gone into shade.',
    position: new Vector3(-52, 37, -71),
    target: new Vector3(-2, 35, PYRAMID_CENTER.z - 1),
    fov: 42,
    solarTime: 0.7385,
    samples: 384,
  },
  {
    id: '02-solstice-sunrise-east-face',
    title: 'Solstice sunrise, east face',
    note: 'The other end of the day: the east face lit for the few seconds before the sun clears the haze, against the violet counter-twilight still hanging in the west.',
    position: new Vector3(55, 36, -57),
    target: new Vector3(-2, 34.5, PYRAMID_CENTER.z - 1),
    fov: 42,
    solarTime: 0.2615,
    samples: 384,
  },
  {
    id: '03-avenue-triangular-portal',
    title: 'The Avenue and the triangular doorway',
    note: 'On the floor of the Avenue looking north. The excavated walls gather into the Equinoctial Chamber portal, with the stair and the Pyramid on the same axis beyond it.',
    position: new Vector3(0, 3.6, 24),
    target: new Vector3(0, 9, -6),
    fov: 46,
    solarTime: 0.68,
    samples: 448,
  },
  {
    id: '04-star-tunnel-window-opening',
    title: 'Climbing the Star Tunnel',
    note: 'Eye height on the 147 steps, a little under halfway. The window at the head of the stair widens as you climb; a long lens is what that feels like.',
    position: new Vector3(stairAt42.x, stairAt42.y + EYE_HEIGHT, stairAt42.z),
    target: apertureThreshold,
    fov: 38,
    solarTime: 0.737,
    samples: 448,
  },
  {
    id: '05-polaris-in-the-window',
    title: 'Polaris in the window',
    note: 'Night. From the bench in the Upper Room, sighting straight up the polar axis: the steel rim frames the north star, and the sky beyond it is real geometry, not a card.',
    position: upperRoomEye,
    target: alongPolarAxis(apertureThreshold, 40),
    fov: 40,
    solarTime: 0,
    samples: 768,
    bounces: 5,
  },
  {
    id: '06-star-trails-from-the-stair-foot',
    title: 'Long exposure from the foot of the stair',
    note: 'Night. The whole axis in one frame with about two hours of sky integrated into it — every star wheels, and Polaris, sitting on the axis, does not.',
    position: new Vector3(0, 11, 5),
    target: new Vector3(0, 41, -40),
    fov: 80,
    solarTime: 0,
    trailArc: 0.85,
    samples: 1024,
  },
  {
    id: '07-hour-chamber-one-hour-of-sky',
    title: 'One hour in the Hour Chamber',
    note: 'Night. Inside the slit that runs through the Pyramid, looking north. The exposure is exactly one hour of the Earth’s rotation, which is how long a star takes to cross the opening.',
    position: new Vector3(0, PYRAMID_BASE_Y + 1.9, -59.6),
    target: new Vector3(0, PYRAMID_BASE_Y + 7.4, -96),
    fov: 62,
    solarTime: 0,
    trailArc: ONE_HOUR,
    samples: 896,
  },
  {
    id: '08-milky-way-over-the-mesa',
    title: 'The Milky Way over the mesa',
    note: 'Night. Low and well back on the mesa, late enough that the galaxy has swung up over the site. The moon is off frame to the west and still raking the ground.',
    position: new Vector3(-31, 32.5, -130),
    target: new Vector3(0, 43, PYRAMID_CENTER.z),
    fov: 68,
    solarTime: 0.14,
    samples: 640,
  },
  {
    id: '09-moonlight-and-the-pyramid-shadow',
    title: 'Moonlight, and the shadow it throws',
    note: 'Night. A moon well up in the west is enough to model the stonework and lay the Pyramid’s own shadow out across the caliche toward the camera.',
    position: new Vector3(78, 44, -22),
    target: new Vector3(0, 33, -50),
    fov: 48,
    solarTime: 0.18,
    samples: 640,
  },
  {
    id: '10-the-whole-axis-from-the-air',
    title: 'The whole axis, from the air',
    note: 'Early morning, high and to the south-east, with the shadows still long: the Avenue, the Equinoctial Chamber, the 147 steps and the Solar Pyramid resolve into one continuous north-rising line.',
    position: new Vector3(120, 78, 96),
    target: new Vector3(0, 18, -26),
    fov: 44,
    solarTime: 0.285,
    samples: 448,
  },
];
