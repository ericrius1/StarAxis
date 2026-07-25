/**
 * Locked-off shot definition for offline path-traced capture.
 *
 * The whole shot is a pure function of normalised time, so a frame rendered
 * now and the same frame rendered on a rerun are identical — nothing here
 * reads a clock, a random source, or the live animation loop. That is what
 * lets the capture harness step the camera and the sun one video frame at a
 * time and spend as long as it likes accumulating samples for each.
 *
 * The move: a slow arc across the east side of the Solar Pyramid, looking back
 * west into the setting sun. The Pyramid stands against the sun's own sky, so
 * it opens as a rim-lit silhouette; the 147-step Star Tunnel runs away from
 * the camera in profile. As the sun goes under, the full moon — always
 * opposite it — rises behind the camera and takes over as the key light, so
 * the face toward us goes dark and then comes back cool and low-contrast.
 * Amber → violet → deep blue, with the star field arriving in the last third.
 */

import { Vector3 } from 'three/webgpu';
import { PYRAMID_CENTER } from './staraxis/constants';

/** Frame rate and length of the capture. 24 fps × 10 s. */
export const SHOT_FPS = 24;
export const SHOT_SECONDS = 10;
export const SHOT_FRAMES = SHOT_FPS * SHOT_SECONDS;

/**
 * Solar phase: 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. The shot opens
 * with the sun ~8° up and closes with it ~15° below the horizon, which puts
 * the day/night crossover a little past the middle of the clip.
 */
const SOLAR_START = 0.728;
const SOLAR_END = 0.7925;

/** Camera arc, in degrees clockwise from due south, around the Pyramid. */
// Opens ~23° off the sun's bearing and closes ~8° off it, so the disc tracks
// down and inward toward the Pyramid rather than sitting on its apex.
const AZIMUTH_START = 121;
const AZIMUTH_END = 106;
const RADIUS_START = 58;
const RADIUS_END = 50;
const HEIGHT_START = 37;
const HEIGHT_END = 34;
const FOV_START = 42;
const FOV_END = 39;

// Aimed above the camera's own eyeline, which pitches the lens up: it puts the
// horizon in the lower third and keeps the shot from giving away half its
// height to featureless foreground sand.
const TARGET_START = new Vector3(-3, 42, PYRAMID_CENTER.z + 1);
const TARGET_END = new Vector3(-2, 40.5, PYRAMID_CENTER.z);

export interface ShotFrame {
  position: Vector3;
  target: Vector3;
  fov: number;
  solarTime: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ease in and out so the move has no visible start or stop. */
function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * The sun should not descend linearly: holding it a beat longer near the
 * horizon buys more of the clip at the colours worth watching, then the last
 * third falls away into night.
 */
function solarEase(t: number): number {
  return Math.pow(t, 1.18);
}

const _position = new Vector3();
const _target = new Vector3();

/** Shot state at normalised time `t` in [0, 1]. */
export function shotAt(t: number): ShotFrame {
  const clamped = Math.min(1, Math.max(0, t));
  const move = easeInOut(clamped);

  const azimuth = (lerp(AZIMUTH_START, AZIMUTH_END, move) * Math.PI) / 180;
  const radius = lerp(RADIUS_START, RADIUS_END, move);
  _position.set(
    Math.sin(azimuth) * radius,
    lerp(HEIGHT_START, HEIGHT_END, move),
    PYRAMID_CENTER.z + Math.cos(azimuth) * radius,
  );
  _target.lerpVectors(TARGET_START, TARGET_END, move);

  return {
    position: _position,
    target: _target,
    fov: lerp(FOV_START, FOV_END, move),
    solarTime: lerp(SOLAR_START, SOLAR_END, solarEase(clamped)),
  };
}

/** Shot state for video frame `index` of `SHOT_FRAMES`. */
export function shotAtFrame(index: number): ShotFrame {
  return shotAt(SHOT_FRAMES <= 1 ? 0 : index / (SHOT_FRAMES - 1));
}
