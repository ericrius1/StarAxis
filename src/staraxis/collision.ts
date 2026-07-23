/**
 * Static collision world for the first-person visitor.
 *
 * All solid monument meshes are baked (world-transformed) into one position-
 * only BufferGeometry and indexed with a three-mesh-bvh MeshBVH. The player
 * capsule is resolved against it with shapecast push-out. Terrain is NOT in
 * the BVH — ground height comes from the analytic heightfield (walk.ts),
 * which is exact and cheaper than mesh collision.
 *
 * Opt-outs: InstancedMesh scatter/treads (treads are handled by the walk
 * surface; rocks are set dressing) and anything tagged userData.noCollide
 * (e.g. the tunnel-mouth darkness panel, which must stay enterable).
 */

import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  InstancedMesh,
  Line3,
  Mesh,
  Object3D,
  Vector3,
} from 'three/webgpu';
import { MeshBVH } from 'three-mesh-bvh';

export interface Collider {
  bvh: MeshBVH;
  triangleCount: number;
}

export function buildCollider(root: Object3D): Collider {
  root.updateWorldMatrix(true, true);
  const positions: number[] = [];
  const v = new Vector3();

  root.traverse((o) => {
    if (!(o instanceof Mesh) || o instanceof InstancedMesh) return;
    if (o.userData.noCollide) return;
    let blocked = false;
    o.traverseAncestors((p) => {
      if (p.userData.noCollide) blocked = true;
    });
    if (blocked) return;

    const geom = o.geometry as BufferGeometry;
    const pos = geom.getAttribute('position');
    if (!pos) return;
    const index = geom.getIndex();
    const m = o.matrixWorld;
    const push = (i: number): void => {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      positions.push(v.x, v.y, v.z);
    };
    if (index) {
      for (let i = 0; i < index.count; i++) push(index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) push(i);
    }
  });

  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return { bvh: new MeshBVH(merged), triangleCount: positions.length / 9 };
}

// ---------------------------------------------------------------- capsule

const _seg = new Line3();
const _box = new Box3();
const _triPoint = new Vector3();
const _capPoint = new Vector3();
const _dir = new Vector3();

/**
 * Push a vertical capsule out of the collider. `position` is the eye point;
 * the capsule spans [position + bottomOffset - r, position + topOffset + r]
 * so knee-height steps pass underneath while walls and parapets block.
 * Mutates and returns `position`.
 */
export function resolveCapsule(
  collider: Collider,
  position: Vector3,
  radius = 0.32,
  topOffset = -0.1,
  bottomOffset = -0.8,
  iterations = 3,
): Vector3 {
  for (let it = 0; it < iterations; it++) {
    _seg.start.set(position.x, position.y + topOffset, position.z);
    _seg.end.set(position.x, position.y + bottomOffset, position.z);
    _box.makeEmpty();
    _box.expandByPoint(_seg.start);
    _box.expandByPoint(_seg.end);
    _box.expandByScalar(radius);

    let moved = false;
    collider.bvh.shapecast({
      intersectsBounds: (box) => box.intersectsBox(_box),
      intersectsTriangle: (tri) => {
        const dist = tri.closestPointToSegment(_seg, _triPoint, _capPoint);
        if (dist < radius) {
          const depth = radius - dist;
          if (dist > 1e-7) {
            _dir.copy(_capPoint).sub(_triPoint).divideScalar(dist);
          } else {
            tri.getNormal(_dir);
          }
          _seg.start.addScaledVector(_dir, depth);
          _seg.end.addScaledVector(_dir, depth);
          position.addScaledVector(_dir, depth);
          moved = true;
        }
      },
    });
    if (!moved) break;
  }
  return position;
}
