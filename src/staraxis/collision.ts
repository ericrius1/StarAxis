/**
 * Static collision world for the first-person visitor.
 *
 * All rendered collision meshes are baked (world-transformed) into position-
 * only BufferGeometry and indexed with three-mesh-bvh. This includes the
 * displaced terrain chunks and every transform of the instanced stair
 * treads, so ground queries cast against the triangles the visitor sees.
 *
 * A second BVH omits meshes tagged `collisionSurfaceOnly`; it is used for
 * capsule push-out so walkable floors and stair risers cannot snag the body.
 * Decorative meshes tagged `noCollide` are omitted from both trees.
 */

import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedMesh,
  Line3,
  Matrix4,
  Mesh,
  Object3D,
  Ray,
  Vector3,
} from 'three/webgpu';
import { MeshBVH } from 'three-mesh-bvh';

export interface Collider {
  /** Complete rendered collision geometry, used for direct ground casts. */
  bvh: MeshBVH;
  /** Non-walkable rendered geometry, used for capsule wall resolution. */
  solidBvh: MeshBVH;
  triangleCount: number;
  solidTriangleCount: number;
}

function isOptedOut(object: Object3D): boolean {
  if (object.userData.noCollide) return true;
  let blocked = false;
  object.traverseAncestors((parent) => {
    if (parent.userData.noCollide) blocked = true;
  });
  return blocked;
}

function isSurfaceOnly(object: Object3D): boolean {
  if (object.userData.collisionSurfaceOnly) return true;
  let surfaceOnly = false;
  object.traverseAncestors((parent) => {
    if (parent.userData.collisionSurfaceOnly) surfaceOnly = true;
  });
  return surfaceOnly;
}

function appendGeometry(
  geometry: BufferGeometry,
  matrix: Matrix4,
  positions: number[],
  vertex: Vector3,
): void {
  const position = geometry.getAttribute('position');
  if (!position) return;
  const index = geometry.getIndex();
  const push = (i: number): void => {
    vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
    positions.push(vertex.x, vertex.y, vertex.z);
  };
  if (index) {
    for (let i = 0; i < index.count; i++) push(index.getX(i));
  } else {
    for (let i = 0; i < position.count; i++) push(i);
  }
}

function makeBvh(positions: number[]): MeshBVH {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(positions), 3),
  );
  return new MeshBVH(geometry);
}

export function buildCollider(roots: Object3D | Object3D[]): Collider {
  const rootList = Array.isArray(roots) ? roots : [roots];
  for (const root of rootList) root.updateWorldMatrix(true, true);

  const positions: number[] = [];
  const solidPositions: number[] = [];
  const v = new Vector3();
  const instanceMatrix = new Matrix4();
  const worldMatrix = new Matrix4();

  for (const root of rootList) {
    root.traverse((object) => {
      if (!(object instanceof Mesh) || isOptedOut(object)) return;

      const geometry = object.geometry as BufferGeometry;
      const targets = isSurfaceOnly(object)
        ? [positions]
        : [positions, solidPositions];

      if (object instanceof InstancedMesh) {
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, instanceMatrix);
          worldMatrix.multiplyMatrices(object.matrixWorld, instanceMatrix);
          for (const target of targets) {
            appendGeometry(geometry, worldMatrix, target, v);
          }
        }
      } else {
        for (const target of targets) {
          appendGeometry(geometry, object.matrixWorld, target, v);
        }
      }
    });
  }

  return {
    bvh: makeBvh(positions),
    solidBvh: makeBvh(solidPositions),
    triangleCount: positions.length / 9,
    solidTriangleCount: solidPositions.length / 9,
  };
}

// ---------------------------------------------------------------- direct ground cast

const _groundRay = new Ray(new Vector3(), new Vector3(0, -1, 0));

/**
 * Return the first rendered surface directly below a world-space point.
 * The BVH stores world-baked triangles, so the returned Y needs no transform.
 */
export function castGroundY(
  collider: Collider,
  x: number,
  z: number,
  originY: number,
  maxDistance: number,
): number | null {
  _groundRay.origin.set(x, originY, z);
  const hit = collider.bvh.raycastFirst(
    _groundRay,
    DoubleSide,
    0,
    maxDistance,
  );
  return hit ? hit.point.y : null;
}

// ---------------------------------------------------------------- capsule

const _seg = new Line3();
const _box = new Box3();
const _triPoint = new Vector3();
const _capPoint = new Vector3();
const _dir = new Vector3();
const _segCenter = new Vector3();
const _push = new Vector3();

export interface CapsuleResolveOptions {
  radius?: number;
  topOffset?: number;
  bottomOffset?: number;
  iterations?: number;
  /** Walking resolves walls in XZ; flying resolves in all three axes. */
  horizontalOnly?: boolean;
}

/**
 * Push a vertical capsule out of the collider. `position` is the eye point;
 * with the defaults its bottom sits 1.70 m below the eye. Walkable geometry
 * is absent from the solid BVH, so the full-height body can meet rails and
 * parapets without being snagged by floor or tread triangles.
 * Mutates and returns `position`.
 */
export function resolveCapsule(
  collider: Collider,
  position: Vector3,
  options: CapsuleResolveOptions = {},
): Vector3 {
  const {
    radius = 0.32,
    topOffset = -0.12,
    bottomOffset = -1.38,
    iterations = 4,
    horizontalOnly = false,
  } = options;

  for (let it = 0; it < iterations; it++) {
    _seg.start.set(position.x, position.y + topOffset, position.z);
    _seg.end.set(position.x, position.y + bottomOffset, position.z);
    _box.makeEmpty();
    _box.expandByPoint(_seg.start);
    _box.expandByPoint(_seg.end);
    _box.expandByScalar(radius);

    let moved = false;
    collider.solidBvh.shapecast({
      intersectsBounds: (box) => box.intersectsBox(_box),
      intersectsTriangle: (tri) => {
        const dist = tri.closestPointToSegment(_seg, _triPoint, _capPoint);
        if (dist < radius) {
          const depth = radius - dist;
          if (dist > 1e-7) {
            _dir.copy(_capPoint).sub(_triPoint).divideScalar(dist);
          } else {
            tri.getNormal(_dir);
            _segCenter.copy(_seg.start).add(_seg.end).multiplyScalar(0.5);
            if (_dir.dot(_segCenter.sub(tri.a)) < 0) _dir.negate();
          }
          if (horizontalOnly) {
            _dir.y = 0;
            if (_dir.lengthSq() < 1e-10) return false;
          }
          _push.copy(_dir).multiplyScalar(depth);
          _seg.start.add(_push);
          _seg.end.add(_push);
          position.add(_push);
          moved = true;
        }
        return false;
      },
    });
    if (!moved) break;
  }
  return position;
}
