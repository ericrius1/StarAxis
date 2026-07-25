/**
 * First-person visitor rig (pointer lock).
 *
 * Walking casts directly against the world-baked three-mesh-bvh collider.
 * Short movement substeps, a full-height capsule, and a guarded maximum
 * step/drop keep the visitor on visible terrain and stairs without tunneling
 * through thin architecture or falling into triangle seams. Fly mode lifts
 * the surface constraint for reaching the pyramid apex and aerial views.
 */

import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import type { PerspectiveCamera } from 'three/webgpu';
import { Vector3 } from 'three/webgpu';

import { EYE_HEIGHT, walkSurfaceY } from './walk';
import { castGroundY, resolveCapsule, type Collider } from './collision';

const WALK_SPEED = 5.5; // m/s — an unhurried visitor's pace
const SPRINT_SPEED = 16;
const FLY_SPEED = 22;
const FLY_SPRINT_SPEED = 70;
/** Auto-enable fly when a preset spawns the camera this far above ground. */
const FLY_SPAWN_THRESHOLD = 4;
/** Published treads rise 0.21 m; leave margin for terrain tessellation. */
const MAX_STEP_UP = 0.36;
/** A walker stops at a ledge instead of dropping into cuts or mesh seams. */
const MAX_STEP_DOWN = 0.58;
/** Smaller than the capsule radius, preventing traversal through thin walls. */
const WALK_SUBSTEP = 0.14;
const FLY_SUBSTEP = 0.22;
const MAX_FRAME_DT = 0.1;
const GROUND_EPSILON = 0.03;

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
  const previousPosition = new Vector3();
  const walkStepStart = new Vector3();
  const up = new Vector3(0, 1, 0);
  const lockListeners: Array<(locked: boolean) => void> = [];

  let enabled = false;
  let fly = false;
  let collider: Collider | null = null;
  let needsGroundSnap = true;

  function localGroundY(referenceY: number): number | null {
    if (!collider) return walkSurfaceY(camera.position.x, camera.position.z);
    return castGroundY(
      collider,
      camera.position.x,
      camera.position.z,
      referenceY + MAX_STEP_UP + GROUND_EPSILON,
      MAX_STEP_UP + MAX_STEP_DOWN + GROUND_EPSILON * 2,
    );
  }

  function snapToGround(): void {
    const analyticY = walkSurfaceY(camera.position.x, camera.position.z);
    if (!collider) {
      camera.position.y = analyticY + EYE_HEIGHT;
      needsGroundSnap = false;
      return;
    }

    // Long casts are reserved for teleports and leaving fly mode. Normal
    // walking uses the tightly bounded local cast above.
    const originY = Math.max(
      camera.position.y + MAX_STEP_UP,
      analyticY + EYE_HEIGHT + 2,
    );
    const groundY = castGroundY(
      collider,
      camera.position.x,
      camera.position.z,
      originY,
      2000,
    );
    camera.position.y = (groundY ?? analyticY) + EYE_HEIGHT;
    needsGroundSnap = false;
  }

  function settleWalkingPosition(): boolean {
    const referenceY = camera.position.y - EYE_HEIGHT;
    previousPosition.copy(camera.position);

    // Acquire the next rendered tread before testing the body. This lets the
    // feet rise over a legal step before the capsule meets an adjacent portal
    // threshold or riser at the old elevation.
    const groundY = localGroundY(referenceY);
    if (groundY === null) {
      camera.position.copy(previousPosition);
      return false;
    }
    camera.position.y = groundY + EYE_HEIGHT;

    // Raising onto a tread can bring the upper body into a sloped return or
    // rail. Resolve once more, then ground the corrected XZ position.
    if (collider) {
      resolveCapsule(collider, camera.position, { horizontalOnly: true });
      const correctedGroundY = localGroundY(groundY);
      if (correctedGroundY === null) {
        camera.position.copy(previousPosition);
        return false;
      }
      camera.position.y = correctedGroundY + EYE_HEIGHT;
    }
    return true;
  }

  function attemptWalkStep(dx: number, dz: number): boolean {
    walkStepStart.copy(camera.position);
    camera.position.x += dx;
    camera.position.z += dz;
    if (settleWalkingPosition()) return true;
    camera.position.copy(walkStepStart);
    return false;
  }

  function moveWalking(delta: Vector3): void {
    const distance = Math.hypot(delta.x, delta.z);
    const substeps = Math.max(1, Math.ceil(distance / WALK_SUBSTEP));
    const dx = delta.x / substeps;
    const dz = delta.z / substeps;
    for (let i = 0; i < substeps; i++) {
      if (attemptWalkStep(dx, dz)) continue;
      // Preserve natural wall sliding when a diagonal step is blocked.
      if (Math.abs(dx) > 1e-8) attemptWalkStep(dx, 0);
      if (Math.abs(dz) > 1e-8) attemptWalkStep(0, dz);
    }
  }

  function moveFlying(delta: Vector3): void {
    const distance = delta.length();
    const substeps = Math.max(1, Math.ceil(distance / FLY_SUBSTEP));
    delta.multiplyScalar(1 / substeps);
    for (let i = 0; i < substeps; i++) {
      camera.position.add(delta);
      if (collider) resolveCapsule(collider, camera.position);
      if (collider) {
        const groundY = castGroundY(
          collider,
          camera.position.x,
          camera.position.z,
          camera.position.y + MAX_STEP_UP,
          EYE_HEIGHT + MAX_STEP_UP + GROUND_EPSILON,
        );
        if (groundY !== null) {
          camera.position.y = Math.max(camera.position.y, groundY + EYE_HEIGHT);
        }
      }
    }
  }

  controls.addEventListener('lock', () => lockListeners.forEach((cb) => cb(true)));
  controls.addEventListener('unlock', () => lockListeners.forEach((cb) => cb(false)));

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
      if (!fly) needsGroundSnap = true;
    },

    isLocked: () => controls.isLocked,

    enable() {
      enabled = true;
      controls.enabled = true;
      if (!fly) needsGroundSnap = true;
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
      needsGroundSnap = !fly;
    },

    setCollider(c) {
      collider = c;
      if (!fly) needsGroundSnap = true;
    },

    toggleFly() {
      fly = !fly;
      if (!fly) needsGroundSnap = true;
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
      const frameDt = Math.min(Math.max(dt, 0), MAX_FRAME_DT);
      if (!fly && needsGroundSnap) snapToGround();

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
        camera.rotateOnWorldAxis(up, yaw * 1.2 * frameDt);
        camera.rotateX(pitchUp * 1.0 * frameDt);
      }

      move.set(0, 0, 0);
      if (f || s || (fly && upAxis)) {
        camera.getWorldDirection(forward);
        if (!fly) {
          forward.y = 0; // walking stays level regardless of where you look
        }
        forward.normalize();
        right.crossVectors(forward, up).normalize();

        move.addScaledVector(forward, f).addScaledVector(right, s);
        if (fly) move.addScaledVector(up, upAxis);
        if (move.lengthSq() > 0) {
          move.normalize().multiplyScalar(speed * frameDt);
        }
      }

      if (fly) {
        if (move.lengthSq() > 0) moveFlying(move);
      } else {
        if (move.lengthSq() > 0) moveWalking(move);
        else settleWalkingPosition();
      }
    },

    onLockChange(cb) {
      lockListeners.push(cb);
    },
  };

  return rig;
}
