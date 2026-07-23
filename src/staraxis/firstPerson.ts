/**
 * First-person visitor rig (pointer lock).
 *
 * Free-walk, not a physics sim: the camera follows the walkable surface and
 * there is no wall collision, so you can wander anywhere on the mesa. Fly
 * mode lifts the surface constraint entirely for reaching the pyramid apex
 * or looking down into the bowl.
 */

import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import type { PerspectiveCamera } from 'three/webgpu';
import { Vector3 } from 'three/webgpu';

import { EYE_HEIGHT, walkSurfaceY } from './walk';
import { resolveCapsule, type Collider } from './collision';

const WALK_SPEED = 5.5; // m/s — an unhurried visitor's pace
const SPRINT_SPEED = 16;
const FLY_SPEED = 22;
const FLY_SPRINT_SPEED = 70;
/** How fast the eye settles onto the ground height (higher = stiffer). */
const GROUND_STIFFNESS = 12;
/** Auto-enable fly when a preset spawns the camera this far above ground. */
const FLY_SPAWN_THRESHOLD = 4;

export interface FirstPersonRig {
  readonly controls: PointerLockControls;
  enabled: boolean;
  fly: boolean;
  isLocked(): boolean;
  enable(): void;
  disable(): void;
  lock(): void;
  /** Teleport to a vantage point; auto-selects walk or fly. */
  placeAt(pos: Vector3 | [number, number, number], lookAt: Vector3 | [number, number, number]): void;
  /** Attach the static collision world (capsule vs monument BVH). */
  setCollider(collider: Collider): void;
  toggleFly(): boolean;
  /** True if the key was consumed as a movement key. */
  handleKey(code: string, down: boolean): boolean;
  update(dt: number): void;
  onLockChange(cb: (locked: boolean) => void): void;
}

const MOVE_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyQ', 'ShiftLeft', 'ShiftRight',
]);

export function createFirstPerson(
  camera: PerspectiveCamera,
  domElement: HTMLElement,
): FirstPersonRig {
  const controls = new PointerLockControls(camera, domElement);
  // Stop just short of straight up/down so the horizon never flips.
  controls.minPolarAngle = 0.02;
  controls.maxPolarAngle = Math.PI - 0.02;
  controls.enabled = false;

  const keys = new Set<string>();
  const forward = new Vector3();
  const right = new Vector3();
  const move = new Vector3();
  const lockListeners: Array<(locked: boolean) => void> = [];

  let enabled = false;
  let fly = false;
  let collider: Collider | null = null;
  /** Eye height is eased toward the surface instead of snapping. */
  let groundedY = camera.position.y;

  controls.addEventListener('lock', () => lockListeners.forEach((cb) => cb(true)));
  controls.addEventListener('unlock', () => lockListeners.forEach((cb) => cb(false)));

  function surfaceEyeY(): number {
    return walkSurfaceY(camera.position.x, camera.position.z) + EYE_HEIGHT;
  }

  const rig: FirstPersonRig = {
    controls,

    get enabled() {
      return enabled;
    },
    set enabled(v: boolean) {
      if (v) rig.enable();
      else rig.disable();
    },

    get fly() {
      return fly;
    },
    set fly(v: boolean) {
      fly = v;
      if (!fly) groundedY = camera.position.y;
    },

    isLocked: () => controls.isLocked,

    enable() {
      enabled = true;
      controls.enabled = true;
      groundedY = camera.position.y;
    },

    disable() {
      enabled = false;
      controls.enabled = false;
      keys.clear();
      if (controls.isLocked) controls.unlock();
    },

    lock() {
      if (enabled && !controls.isLocked) controls.lock();
    },

    placeAt(pos, lookAt) {
      const p = Array.isArray(pos) ? new Vector3(...pos) : pos;
      const l = Array.isArray(lookAt) ? new Vector3(...lookAt) : lookAt;
      camera.position.copy(p);
      camera.lookAt(l);
      // A vantage far off the ground (the aerial view, the aperture landing)
      // is meant to be held, so start flying rather than dropping to grade.
      const ground = walkSurfaceY(p.x, p.z) + EYE_HEIGHT;
      fly = p.y - ground > FLY_SPAWN_THRESHOLD;
      groundedY = camera.position.y;
    },

    setCollider(c) {
      collider = c;
    },

    toggleFly() {
      fly = !fly;
      if (!fly) groundedY = camera.position.y;
      return fly;
    },

    handleKey(code, down) {
      if (!MOVE_CODES.has(code)) return false;
      if (down) keys.add(code);
      else keys.delete(code);
      return true;
    },

    update(dt) {
      if (!enabled) return;

      const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const speed = fly
        ? sprint
          ? FLY_SPRINT_SPEED
          : FLY_SPEED
        : sprint
          ? SPRINT_SPEED
          : WALK_SPEED;

      const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const upAxis = (keys.has('Space') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
      const pitchUp = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
      const yaw = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0);

      // Arrow keys steer, so the piece can be toured without a mouse.
      if (yaw || pitchUp) {
        camera.rotateOnWorldAxis(new Vector3(0, 1, 0), yaw * 1.2 * dt);
        camera.rotateX(pitchUp * 1.0 * dt);
      }

      if (f || s || (fly && upAxis)) {
        camera.getWorldDirection(forward);
        if (!fly) {
          forward.y = 0; // walking stays level regardless of where you look
        }
        forward.normalize();
        right.crossVectors(forward, new Vector3(0, 1, 0)).normalize();

        move.set(0, 0, 0).addScaledVector(forward, f).addScaledVector(right, s);
        if (fly) move.addScaledVector(new Vector3(0, 1, 0), upAxis);
        if (move.lengthSq() > 0) {
          move.normalize().multiplyScalar(speed * dt);
          camera.position.add(move);
        }
      }

      if (fly) {
        // Never let free-flight sink below the ground.
        const floor = surfaceEyeY() - EYE_HEIGHT + 0.4;
        if (camera.position.y < floor) camera.position.y = floor;
        groundedY = camera.position.y;
      } else {
        // Ease onto the surface so stairs and slopes feel like walking.
        const targetY = surfaceEyeY();
        groundedY += (targetY - groundedY) * Math.min(GROUND_STIFFNESS * dt, 1);
        camera.position.y = groundedY;
      }

      // Solid architecture: push the capsule out of walls in either mode.
      if (collider) {
        resolveCapsule(collider, camera.position);
        if (!fly) groundedY = camera.position.y;
      }
    },

    onLockChange(cb) {
      lockListeners.push(cb);
    },
  };

  return rig;
}
