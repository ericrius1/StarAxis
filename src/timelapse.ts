/**
 * Five-second time-lapse clips from the strongest plate viewpoints.
 *
 * A clip holds the camera nearly still — a still lock, or a drift slow enough
 * that you notice it only in retrospect — and moves time instead. The sun
 * crosses the horizon, the exposure ramps with it, and the star field wheels
 * about the Polaris axis by exactly the angle the elapsed solar time implies:
 * the sky turns for the same reason the sun sets, not as a separate effect.
 *
 * Each frame also integrates one frame's worth of that rotation, which is the
 * motion blur a real time-lapse gets from its shutter. Without it the stars
 * strobe from position to position.
 *
 * Pure data, like cinema.ts and plates.ts: frame n renders identically on
 * every run.
 */

import { Vector3 } from 'three/webgpu';
import { LATITUDE_RAD, PYRAMID_CENTER } from './staraxis/constants';

export const CLIP_FPS = 24;
export const CLIP_SECONDS = 5;
export const CLIP_FRAMES = CLIP_FPS * CLIP_SECONDS;

interface CameraState {
  position: Vector3;
  target: Vector3;
  fov: number;
}

export interface Clip {
  id: string;
  title: string;
  note: string;
  from: CameraState;
  to: CameraState;
  /** Solar phase at the first and last frame. 0.25 sunrise, 0.75 sunset. */
  solarFrom: number;
  solarTo: number;
  /**
   * Total sky rotation across the clip, radians. Normally the rotation is
   * implied by the elapsed solar time; a clip that holds still at night has no
   * elapsed time to imply it, so it states the turn directly.
   */
  skyTurn?: number;
  /**
   * Shutter, in radians of sky rotation per frame. Left unset, a frame
   * integrates exactly one frame's worth of rotation — enough to keep motion
   * smooth, far too little to draw a trail. Set it long and every frame
   * becomes a star-trail exposure in its own right.
   */
  exposureArc?: number;
  samples: number;
  bounces?: number;
}

export interface ClipFrame {
  position: Vector3;
  target: Vector3;
  fov: number;
  solarTime: number;
  /** Absolute sky rotation for this frame, radians about the Polaris axis. */
  celestialRotation: number;
  /** Sky rotation during this frame's exposure — the shutter's worth. */
  trailArc: number;
  samples: number;
  bounces: number;
}

const POLARIS_UP = Math.sin(LATITUDE_RAD);

export const CLIPS: Clip[] = [
  {
    id: 'A-polaris-turns-over-the-pyramid',
    title: 'Night into dawn, the sky turning about Polaris',
    note: 'Looking straight up the axis of the work from the foot of the Star Tunnel. The stars wheel around the point the stair is aimed at, and then the sun comes up behind the camera and takes them away.',
    from: {
      position: new Vector3(0, 11, 5),
      target: new Vector3(0, 41, -40),
      fov: 80,
    },
    // A metre and a half of push over five seconds: felt, not seen.
    to: {
      position: new Vector3(0, 11.4, 3.4),
      target: new Vector3(0, 41, -41),
      fov: 78,
    },
    solarFrom: 0.05,
    solarTo: 0.27,
    samples: 224,
  },
  {
    id: 'B-milky-way-into-morning',
    title: 'The Milky Way, and then the morning',
    note: 'Locked off, low and well back on the mesa. The galaxy rotates out of frame as the eastern sky opens; nothing in the shot moves except the sky.',
    from: {
      position: new Vector3(-31, 32.5, -130),
      target: new Vector3(0, 43, PYRAMID_CENTER.z),
      fov: 68,
    },
    to: {
      position: new Vector3(-31, 32.5, -130),
      target: new Vector3(0, 43, PYRAMID_CENTER.z),
      fov: 68,
    },
    solarFrom: 0.09,
    solarTo: 0.285,
    samples: 224,
  },
  {
    id: 'C-west-face-into-night',
    title: 'The west face losing the sun',
    note: 'The other direction: late light still on the west elevation, then dusk, then the stars. A slow drift to the right opens the sunset side of the sky as the face goes dark.',
    from: {
      position: new Vector3(-52, 37, -71),
      target: new Vector3(-2, 35, PYRAMID_CENTER.z - 1),
      fov: 42,
    },
    to: {
      position: new Vector3(-58, 35.5, -63),
      target: new Vector3(-2, 34.5, PYRAMID_CENTER.z - 1),
      fov: 42,
    },
    solarFrom: 0.735,
    solarTo: 0.862,
    samples: 224,
  },
  {
    id: 'D-star-trails-over-the-bowl',
    title: 'Star trails over the excavation, holding at night',
    note: 'Raised above the Avenue looking north down the whole axis, and staying there. The sun never moves; only the sky turns. Each frame is a long exposure, so the stars are drawn as arcs rather than points, and the arcs themselves rotate slowly about Polaris over the five seconds.',
    from: {
      position: new Vector3(0, 19, 24),
      target: new Vector3(0, 36, -46),
      fov: 72,
    },
    to: {
      position: new Vector3(0, 19, 24),
      target: new Vector3(0, 36, -46),
      fov: 72,
    },
    // Held at deep night: the moon is high in the south, behind the camera.
    solarFrom: 0.0,
    solarTo: 0.0,
    // A third of a radian of turn across the clip — slow enough to read as
    // meditation rather than time lapse.
    skyTurn: 0.34,
    // Each frame holds about 70 minutes of sky, which is the trail length.
    exposureArc: 0.3,
    samples: 192,
  },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ease so neither the move nor the light starts or stops abruptly. */
function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

const _position = new Vector3();
const _target = new Vector3();

export function clipFrame(clipIndex: number, frameIndex: number): ClipFrame {
  const clip = CLIPS[Math.min(CLIPS.length - 1, Math.max(0, clipIndex))];
  const span = Math.max(1, CLIP_FRAMES - 1);
  const t = Math.min(1, Math.max(0, frameIndex / span));
  const move = easeInOut(t);

  _position.lerpVectors(clip.from.position, clip.to.position, move);
  _target.lerpVectors(clip.from.target, clip.to.target, move);

  const solarSpan = clip.solarTo - clip.solarFrom;
  const solarTime = clip.solarFrom + solarSpan * t;
  // One solar day is one turn of the sky, so the rotation is normally just the
  // elapsed phase. Sign: the sky turns the opposite way to the observer.
  const celestialRotation =
    clip.skyTurn !== undefined
      ? -clip.skyTurn * t
      : -Math.PI * 2 * (solarTime - clip.solarFrom);
  const perFrame =
    clip.skyTurn !== undefined
      ? clip.skyTurn / span
      : (Math.PI * 2 * solarSpan) / span;

  return {
    position: _position,
    target: _target,
    fov: lerp(clip.from.fov, clip.to.fov, move),
    solarTime,
    celestialRotation,
    // Blur by one frame's rotation unless the clip asks for a real shutter.
    trailArc: clip.exposureArc ?? Math.abs(perFrame),
    samples: clip.samples,
    bounces: clip.bounces ?? 4,
  };
}

/** Kept so the capture harness can report the axis it is turning about. */
export const CLIP_POLARIS_ELEVATION = POLARIS_UP;
