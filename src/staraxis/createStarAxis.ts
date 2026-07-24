/**
 * Procedural factory for the rebuilt Star Axis monument.
 *
 * The former scene treated the stair, earthwork and pyramid as independent
 * attractions.  This factory makes the intended reading unambiguous:
 *
 *   south        — the excavated Avenue and Equinoctial Chamber
 *   north-rising — the 147-step Star Tunnel through the mesa
 *   pyramid rear — the stair enters the Solar Pyramid crown
 *   pyramid front — a separate Hour Chamber slit and live polar aperture
 *
 * Materials remain reusable, but every architectural mesh is rebuilt.
 */

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Object3D,
  Path,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector3,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  APERTURE_CENTER_Y,
  APERTURE_ELEVATION_RAD,
  APERTURE_EXIT_RADIUS,
  APERTURE_INNER_RADIUS,
  APERTURE_LENGTH,
  APERTURE_REAR_Z,
  APERTURE_WALL,
  BOWL_FLOOR_Y,
  CRESCENT_ARC_HALF_RAD,
  CRESCENT_RADIUS,
  CRESCENT_THICKNESS,
  CRESCENT_TOP_Y,
  COPING_HEIGHT,
  ENTRY_WALL_HALF_GAP_NORTH,
  ENTRY_WALL_HALF_GAP_SOUTH,
  ENTRY_WALL_HEIGHT,
  ENTRY_WALL_LEAN_RAD,
  FRONT_SLIT_HALF_WIDTH,
  FRONT_SLIT_TOP_Y,
  PORTAL_BASE_HALF_WIDTH,
  PORTAL_DEPTH,
  PORTAL_HEIGHT,
  PORTAL_VOID_HALF_WIDTH,
  PORTAL_VOID_HEIGHT,
  PORTAL_Z,
  PYRAMID_APEX,
  PYRAMID_BASE_HALF,
  PYRAMID_BASE_Y,
  PYRAMID_CENTER,
  PYRAMID_HEIGHT,
  PYRAMID_FRONT_Z,
  PYRAMID_REAR_Z,
  PYRAMID_TOP_FRONT_Z,
  PYRAMID_TOP_HALF,
  PYRAMID_TOP_REAR_Z,
  STAIR_BASE,
  STAIR_STEP_COUNT,
  STAIR_STEP_RISE,
  STAIR_STEP_RUN,
  STAIR_TOP,
  STAIR_WIDTH,
  STRINGER_GAP_X,
  STRINGER_HEIGHT,
  STRINGER_WIDTH,
  TERRACE_STAIR_COUNT,
  TERRACE_STAIR_HALF_W,
  TERRACE_STAIR_RISE,
  TERRACE_STAIR_RUN,
  TERRACE_STAIR_TOP_Y,
  TERRACE_STAIR_TOP_Z,
  TERRACE_TOP_Y,
  TERRACE_WIDTH,
  TERRACE_Z,
  TRENCH_SOUTH_Z,
  TUNNEL_MOUTH_T,
  UPPER_LANDING_FRONT_Z,
  crescentCrownY,
  stairPoint,
} from './constants';
import { terrainHeight, trenchFloorY } from './heightfield';
import type { StarAxisMaterials } from './materials';

export interface StarAxisModel {
  group: Group;
  components: Record<string, Object3D>;
}

interface Mats {
  shell: MeshStandardNodeMaterial;
  cutStone: MeshStandardNodeMaterial;
  avenueStone: MeshStandardNodeMaterial;
  ashlar: MeshStandardNodeMaterial;
  stair: MeshStandardNodeMaterial;
  paleStone: MeshStandardNodeMaterial;
  darkStone: MeshStandardNodeMaterial;
  steel: MeshStandardNodeMaterial;
  bronze: MeshStandardNodeMaterial;
}

const _up = new Vector3(0, 1, 0);

function shadowed<T extends Mesh | InstancedMesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function polygonGeometry(points: Array<[number, number, number]>, triangles: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(points.flat()), 3));
  // Planar UVs keep the reused granite panel texture active on every custom
  // shell facet. Front/rear faces project X/Y; side and return faces Z/Y.
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const zs = points.map((point) => point[2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const useX = maxX - minX >= maxZ - minZ;
  const uMin = useX ? minX : minZ;
  const uSpan = Math.max(1e-5, (useX ? maxX : maxZ) - uMin);
  const vSpan = Math.max(1e-5, maxY - minY);
  const uvs = new Float32Array(points.length * 2);
  points.forEach((point, index) => {
    uvs[index * 2] = ((useX ? point[0] : point[2]) - uMin) / uSpan;
    uvs[index * 2 + 1] = (point[1] - minY) / vSpan;
  });
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function faceMesh(
  name: string,
  points: Array<[number, number, number]>,
  triangles: number[],
  material: MeshStandardNodeMaterial,
): Mesh {
  const mesh = shadowed(new Mesh(polygonGeometry(points, triangles), material));
  mesh.name = name;
  return mesh;
}

function addWorldUv(geometry: BufferGeometry, scale = 0.09): void {
  const positions = geometry.getAttribute('position') as BufferAttribute;
  const uvs = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uvs[i * 2] = positions.getZ(i) * scale;
    uvs[i * 2 + 1] = positions.getY(i) * scale;
  }
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
}

function beamBetween(
  name: string,
  start: Vector3,
  end: Vector3,
  width: number,
  depth: number,
  material: MeshStandardNodeMaterial,
): Mesh {
  const direction = end.clone().sub(start);
  const mesh = shadowed(new Mesh(new BoxGeometry(width, direction.length(), depth), material));
  mesh.name = name;
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(_up, direction.normalize());
  return mesh;
}

/** Point on the north/public face at an absolute Y elevation. */
function frontFacePoint(x: number, y: number): [number, number, number] {
  const t = (y - PYRAMID_BASE_Y) / (PYRAMID_APEX.y - PYRAMID_BASE_Y);
  return [x, y, PYRAMID_FRONT_Z + (PYRAMID_TOP_FRONT_Z - PYRAMID_FRONT_Z) * t];
}

/** Point on the south/rear face at an absolute Y elevation. */
function rearFacePoint(x: number, y: number): [number, number, number] {
  const t = (y - PYRAMID_BASE_Y) / (PYRAMID_APEX.y - PYRAMID_BASE_Y);
  return [x, y, PYRAMID_REAR_Z + (PYRAMID_TOP_REAR_Z - PYRAMID_REAR_Z) * t];
}

const apertureAxis = new Vector3(
  0,
  Math.sin(APERTURE_ELEVATION_RAD),
  -Math.cos(APERTURE_ELEVATION_RAD),
).normalize();

/** Exact intersection of the rising aperture axis with the north shell. */
function apertureFrontPoint(): Vector3 {
  const rear = new Vector3(0, APERTURE_CENTER_Y, APERTURE_REAR_Z);
  const faceAtRearY = frontFacePoint(0, rear.y)[2];
  const faceDzDy =
    (PYRAMID_TOP_FRONT_Z - PYRAMID_FRONT_Z) /
    (PYRAMID_APEX.y - PYRAMID_BASE_Y);
  const distance =
    (faceAtRearY - rear.z) /
    (apertureAxis.z - apertureAxis.y * faceDzDy);
  return rear.addScaledVector(apertureAxis, distance);
}

/**
 * The upper north facet has a true cutout. This replaces the former dark
 * circle pasted over a solid shell, which necessarily blocked the live sky.
 */
function frontFaceGeometryWithOpenings(): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-PYRAMID_BASE_HALF, PYRAMID_BASE_Y);
  shape.lineTo(PYRAMID_BASE_HALF, PYRAMID_BASE_Y);
  shape.lineTo(PYRAMID_TOP_HALF, PYRAMID_APEX.y);
  shape.lineTo(-PYRAMID_TOP_HALF, PYRAMID_APEX.y);
  shape.closePath();

  const slit = new Path();
  slit.moveTo(-FRONT_SLIT_HALF_WIDTH, PYRAMID_BASE_Y + 0.02);
  slit.lineTo(0, FRONT_SLIT_TOP_Y);
  slit.lineTo(FRONT_SLIT_HALF_WIDTH, PYRAMID_BASE_Y + 0.02);
  slit.closePath();
  shape.holes.push(slit);

  // The circular steel tube sits in a rectangular recess on the real north
  // elevation. Cutting the full sight box here also guarantees live sky
  // remains visible even when the oblique bore projects beyond a circle in
  // the face plane.
  const sightY = apertureFrontPoint().y;
  const aperture = new Path();
  aperture.moveTo(-2.35, sightY - 2.1);
  aperture.lineTo(-2.35, sightY + 2.1);
  aperture.lineTo(2.35, sightY + 2.1);
  aperture.lineTo(2.35, sightY - 2.1);
  aperture.closePath();
  shape.holes.push(aperture);

  const geometry = new ShapeGeometry(shape, 64);
  const positions = geometry.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    positions.setXYZ(i, x, y, frontFacePoint(0, y)[2]);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// ---------------------------------------------------------------- Avenue / Equinoctial excavation

function indicesQuad(out: number[], a: number, b: number, a1: number, b1: number): void {
  out.push(a, b, a1, b, b1, a1);
}

/**
 * Long south approach. The segmented, outward-leaning walls follow the real
 * excavation instead of reading as freestanding rails on a flat pad.
 */
function buildAvenue(mats: Mats): Group {
  const avenue = new Group();
  avenue.name = 'avenue';
  const segments = 28;
  const southZ = TRENCH_SOUTH_Z - 4;
  const northZ = TERRACE_Z + 1.4;

  for (const side of [-1, 1]) {
    const wallPositions: number[] = [];
    const wallIndices: number[] = [];
    const copingPositions: number[] = [];
    const copingIndices: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = southZ + (northZ - southZ) * t;
      const half =
        ENTRY_WALL_HALF_GAP_SOUTH +
        (ENTRY_WALL_HALF_GAP_NORTH - ENTRY_WALL_HALF_GAP_SOUTH) * t;
      const floor = trenchFloorY(z) - 0.5;
      const height = ENTRY_WALL_HEIGHT * (0.34 + 0.66 * t);
      const topOutset = Math.tan(ENTRY_WALL_LEAN_RAD) * height;
      const innerBottom = side * half;
      const innerTop = side * (half + topOutset);
      const outerTop = side * (half + topOutset + 1.45);
      const outerBottom = side * (half + 1.45);
      wallPositions.push(
        innerBottom, floor, z,
        innerTop, floor + height, z,
        outerTop, floor + height, z,
        outerBottom, floor, z,
      );

      const copingInner = side * (half + topOutset - 0.12);
      const copingOuter = side * (half + topOutset + 1.7);
      copingPositions.push(
        copingInner, floor + height - 0.08, z,
        copingInner, floor + height + 0.28, z,
        copingOuter, floor + height + 0.28, z,
        copingOuter, floor + height - 0.08, z,
      );
    }

    for (let i = 0; i < segments; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      indicesQuad(wallIndices, a, b, a + 1, b + 1);
      indicesQuad(wallIndices, a + 1, b + 1, a + 2, b + 2);
      indicesQuad(wallIndices, a + 2, b + 2, a + 3, b + 3);
      indicesQuad(copingIndices, a, b, a + 1, b + 1);
      indicesQuad(copingIndices, a + 1, b + 1, a + 2, b + 2);
      indicesQuad(copingIndices, a + 2, b + 2, a + 3, b + 3);
    }

    const wallGeometry = new BufferGeometry();
    wallGeometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(wallPositions), 3),
    );
    wallGeometry.setIndex(wallIndices);
    addWorldUv(wallGeometry);
    wallGeometry.computeVertexNormals();
    const wall = shadowed(new Mesh(wallGeometry, mats.avenueStone));
    wall.name = side < 0 ? 'avenue-wall-west' : 'avenue-wall-east';

    const copingGeometry = new BufferGeometry();
    copingGeometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(copingPositions), 3),
    );
    copingGeometry.setIndex(copingIndices);
    addWorldUv(copingGeometry);
    copingGeometry.computeVertexNormals();
    const coping = shadowed(new Mesh(copingGeometry, mats.paleStone));
    coping.name = side < 0 ? 'avenue-coping-west' : 'avenue-coping-east';
    avenue.add(wall, coping);
  }
  return avenue;
}

/**
 * The south retaining wall and triangular Equinoctial portal seen at the
 * end of the Avenue. The void is real and frames the first Star Tunnel steps.
 */
function buildEquinoctialChamber(mats: Mats): Group {
  const chamber = new Group();
  chamber.name = 'equinoctial-chamber';

  const wallBottom = trenchFloorY(TERRACE_Z) - 0.45;
  const wallHeight = TERRACE_TOP_Y - wallBottom;
  const flankWidth = TERRACE_WIDTH / 2 - TERRACE_STAIR_HALF_W;
  for (const side of [-1, 1]) {
    const wall = shadowed(
      new Mesh(new BoxGeometry(flankWidth, wallHeight, 2.5), mats.cutStone),
    );
    wall.name = side < 0 ? 'equinoctial-retaining-west' : 'equinoctial-retaining-east';
    wall.position.set(
      side * (TERRACE_STAIR_HALF_W + flankWidth / 2),
      wallBottom + wallHeight / 2,
      TERRACE_Z - 1.05,
    );
    chamber.add(wall);
  }

  const terraceDepth = TERRACE_Z - (STAIR_BASE.z + 1.4);
  for (const side of [-1, 1]) {
    const slab = shadowed(
      new Mesh(
        new BoxGeometry(flankWidth, 0.9, terraceDepth),
        mats.cutStone,
      ),
    );
    slab.name = side < 0 ? 'equinoctial-court-west' : 'equinoctial-court-east';
    slab.position.set(
      side * (TERRACE_STAIR_HALF_W + flankWidth / 2),
      TERRACE_TOP_Y - 0.4,
      TERRACE_Z - terraceDepth / 2,
    );
    slab.userData.collisionSurfaceOnly = true;
    chamber.add(slab);
  }

  const lowerSteps = new InstancedMesh(
    new BoxGeometry(TERRACE_STAIR_HALF_W * 2 - 0.35, 0.2, TERRACE_STAIR_RUN + 0.07),
    mats.stair,
    TERRACE_STAIR_COUNT,
  );
  lowerSteps.name = 'avenue-lower-25-steps';
  const matrix = new Matrix4();
  for (let i = 0; i < TERRACE_STAIR_COUNT; i++) {
    const y = TERRACE_STAIR_TOP_Y - i * TERRACE_STAIR_RISE;
    const z = TERRACE_STAIR_TOP_Z + i * TERRACE_STAIR_RUN;
    matrix.setPosition(0, y - 0.1, z);
    lowerSteps.setMatrixAt(i, matrix);
  }
  lowerSteps.instanceMatrix.needsUpdate = true;
  lowerSteps.userData.collisionSurfaceOnly = true;
  chamber.add(shadowed(lowerSteps));

  // Two real flanks make the triangular opening continuous with the floor.
  // A hole inside one solid extrusion necessarily left a tiny bottom ring
  // that caught the rounded visitor foot before it could reach the top step.
  const portalFlanks = [-1, 1].map((side) => {
    const shape = new Shape();
    if (side < 0) {
      shape.moveTo(-PORTAL_BASE_HALF_WIDTH, 0);
      shape.lineTo(-PORTAL_VOID_HALF_WIDTH, 0);
      shape.lineTo(0, PORTAL_VOID_HEIGHT);
      shape.lineTo(0, PORTAL_HEIGHT);
    } else {
      shape.moveTo(PORTAL_VOID_HALF_WIDTH, 0);
      shape.lineTo(PORTAL_BASE_HALF_WIDTH, 0);
      shape.lineTo(0, PORTAL_HEIGHT);
      shape.lineTo(0, PORTAL_VOID_HEIGHT);
    }
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, {
      depth: PORTAL_DEPTH,
      bevelEnabled: false,
    });
    geometry.translate(0, 0, -PORTAL_DEPTH / 2);
    return geometry;
  });
  const portalGeometry = mergeGeometries(portalFlanks);
  const portal = shadowed(new Mesh(portalGeometry, mats.cutStone));
  portal.name = 'equinoctial-triangular-portal';
  portal.position.set(0, TERRACE_TOP_Y, PORTAL_Z);
  chamber.add(portal);

  for (const side of [-1, 1]) {
    chamber.add(
      beamBetween(
        side < 0 ? 'portal-bronze-west' : 'portal-bronze-east',
        new Vector3(
          side * PORTAL_VOID_HALF_WIDTH,
          TERRACE_TOP_Y,
          PORTAL_Z - PORTAL_DEPTH / 2 - 0.03,
        ),
        new Vector3(
          0,
          TERRACE_TOP_Y + PORTAL_VOID_HEIGHT,
          PORTAL_Z - PORTAL_DEPTH / 2 - 0.03,
        ),
        0.08,
        0.08,
        mats.bronze,
      ),
    );
  }

  return chamber;
}

/**
 * Curved bowl wall around the excavation. It is deliberately open at the
 * southern Avenue and notched at the north so the 147-step axis remains one
 * uninterrupted visible route.
 */
function buildExcavationWall(mats: Mats): Group {
  const group = new Group();
  group.name = 'equinoctial-excavation-wall';
  const segments = 64;
  const positions: number[] = [];
  const indices: number[] = [];
  const rIn = CRESCENT_RADIUS;
  const rOut = CRESCENT_RADIUS + CRESCENT_THICKNESS;
  const batter = 0.9;

  for (let i = 0; i <= segments; i++) {
    const angle =
      -CRESCENT_ARC_HALF_RAD + (2 * CRESCENT_ARC_HALF_RAD * i) / segments;
    const sx = Math.sin(angle);
    const cz = -Math.cos(angle);
    const top = crescentCrownY(angle);
    const bottom = BOWL_FLOOR_Y - 1.2;
    positions.push(rIn * sx, bottom, -1 + rIn * cz);
    positions.push((rIn + batter) * sx, top, -1 + (rIn + batter) * cz);
    positions.push(rOut * sx, top, -1 + rOut * cz);
    positions.push(rOut * sx, bottom - 0.8, -1 + rOut * cz);
  }

  const notch = 0.14;
  for (let i = 0; i < segments; i++) {
    const angle =
      -CRESCENT_ARC_HALF_RAD +
      (2 * CRESCENT_ARC_HALF_RAD * (i + 0.5)) / segments;
    if (Math.abs(angle) < notch) continue;
    const a = i * 4;
    const b = (i + 1) * 4;
    indicesQuad(indices, a, b, a + 1, b + 1);
    indicesQuad(indices, a + 1, b + 1, a + 2, b + 2);
    indicesQuad(indices, a + 2, b + 2, a + 3, b + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  addWorldUv(geometry);
  geometry.computeVertexNormals();
  const wall = shadowed(new Mesh(geometry, mats.cutStone));
  wall.name = 'excavation-crescent-masonry';
  group.add(wall);

  const copingGeometries: BufferGeometry[] = [];
  for (let i = 0; i < segments; i++) {
    const a0 =
      -CRESCENT_ARC_HALF_RAD + (2 * CRESCENT_ARC_HALF_RAD * i) / segments;
    const a1 =
      -CRESCENT_ARC_HALF_RAD + (2 * CRESCENT_ARC_HALF_RAD * (i + 1)) / segments;
    const mid = (a0 + a1) / 2;
    if (Math.abs(mid) < notch) continue;
    const radius = rOut + 0.1;
    const arcLength = radius * (a1 - a0) + 0.08;
    const coping = new BoxGeometry(1.1, COPING_HEIGHT, arcLength);
    coping.rotateY(-mid);
    coping.translate(
      radius * Math.sin(mid),
      crescentCrownY(mid) + COPING_HEIGHT / 2,
      -1 - radius * Math.cos(mid),
    );
    copingGeometries.push(coping);
  }
  const coping = shadowed(
    new Mesh(mergeGeometries(copingGeometries), mats.paleStone),
  );
  coping.name = 'excavation-rim-coping';
  group.add(coping);

  return group;
}

// ---------------------------------------------------------------- pyramid shell

function buildPyramidShell(mats: Mats): Group {
  const shell = new Group();
  shell.name = 'unified-pyramid-shell';

  const y0 = PYRAMID_BASE_Y;
  const yt = PYRAMID_APEX.y;
  const x0 = PYRAMID_BASE_HALF;
  const xt = PYRAMID_TOP_HALF;
  const sfL: [number, number, number] = [-x0, y0, PYRAMID_FRONT_Z];
  const sfR: [number, number, number] = [x0, y0, PYRAMID_FRONT_Z];
  const sbL: [number, number, number] = [-x0, y0, PYRAMID_REAR_Z];
  const sbR: [number, number, number] = [x0, y0, PYRAMID_REAR_Z];
  const tfL: [number, number, number] = [-xt, yt, PYRAMID_TOP_FRONT_Z];
  const tfR: [number, number, number] = [xt, yt, PYRAMID_TOP_FRONT_Z];
  const tbL: [number, number, number] = [-xt, yt, PYRAMID_TOP_REAR_Z];
  const tbR: [number, number, number] = [xt, yt, PYRAMID_TOP_REAR_Z];

  // Side planes establish one long pyramid silhouette from every orbit angle.
  shell.add(
    faceMesh('pyramid-west-face', [sfL, tfL, tbL, sbL], [0, 1, 2, 0, 2, 3], mats.shell),
    faceMesh('pyramid-east-face', [sfR, sbR, tbR, tfR], [0, 1, 2, 0, 2, 3], mats.shell),
  );

  // North/front face: two wings and a cap leave a real tapered slit.
  const slitBottomL = frontFacePoint(-FRONT_SLIT_HALF_WIDTH, y0);
  const slitBottomR = frontFacePoint(FRONT_SLIT_HALF_WIDTH, y0);
  const slitTopHalf = 0.18;
  const slitTopL = frontFacePoint(-slitTopHalf, FRONT_SLIT_TOP_Y);
  const slitTopR = frontFacePoint(slitTopHalf, FRONT_SLIT_TOP_Y);
  const frontCap = shadowed(
    new Mesh(frontFaceGeometryWithOpenings(), mats.shell),
  );
  frontCap.name = 'pyramid-front-face-with-openings';
  shell.add(frontCap);

  // South/rear face: the shell parts around the continuous Star Tunnel.
  const notchBottomHalf = STAIR_WIDTH / 2 + 1.05;
  const notchTopY = STAIR_TOP.y + 0.45;
  const notchTopHalf = 2.05;
  const notchBottomL = rearFacePoint(-notchBottomHalf, y0);
  const notchBottomR = rearFacePoint(notchBottomHalf, y0);
  const notchTopL = rearFacePoint(-notchTopHalf, notchTopY);
  const notchTopR = rearFacePoint(notchTopHalf, notchTopY);
  shell.add(
    faceMesh(
      'pyramid-rear-west',
      [sbL, tbL, notchTopL, notchBottomL],
      [0, 1, 2, 0, 2, 3],
      mats.shell,
    ),
    faceMesh(
      'pyramid-rear-east',
      [notchBottomR, notchTopR, tbR, sbR],
      [0, 1, 2, 0, 2, 3],
      mats.shell,
    ),
  );

  // A narrow summit cap reinforces the pylon-like flat crown in the close
  // reference while retaining the triangular long-distance silhouette.
  const cap = shadowed(
    new Mesh(
      new BoxGeometry(PYRAMID_TOP_HALF * 2, 0.45, PYRAMID_TOP_FRONT_Z - PYRAMID_TOP_REAR_Z),
      mats.paleStone,
    ),
  );
  cap.name = 'pyramid-summit-cap';
  cap.position.set(0, yt - 0.18, (PYRAMID_TOP_FRONT_Z + PYRAMID_TOP_REAR_Z) / 2);
  shell.add(cap);

  // Recessed slab courses restore the large irregular granite construction
  // visible in the front photograph without a runtime procedural shader.
  const courseYs = [
    y0 + 3.1,
    y0 + 6.4,
    y0 + 9.5,
  ];
  const slitHalfAt = (y: number): number =>
    y >= FRONT_SLIT_TOP_Y
      ? 0
      : FRONT_SLIT_HALF_WIDTH *
        (1 - Math.max(0, y - y0) / (FRONT_SLIT_TOP_Y - y0));
  for (let row = 0; row < courseYs.length; row++) {
    const y = courseYs[row];
    const t = (y - y0) / (yt - y0);
    const half = x0 + (xt - x0) * t;
    const slitHalf = slitHalfAt(y) + 0.09;
    const courseSegments: Array<[number, number]> =
      slitHalf > 0.1
        ? [
            [-half + 0.18, -slitHalf],
            [slitHalf, half - 0.18],
          ]
        : [[-half + 0.18, half - 0.18]];
    courseSegments.forEach(([xStart, xEnd], segment) => {
      const horizontal = beamBetween(
        `pyramid-front-course-${row + 1}-${segment + 1}`,
        new Vector3(...frontFacePoint(xStart, y)),
        new Vector3(...frontFacePoint(xEnd, y)),
        0.055,
        0.045,
        mats.darkStone,
      );
      horizontal.position.z -= 0.045;
      horizontal.userData.noCollide = true;
      shell.add(horizontal);
    });

    const lowerY = row === 0 ? y0 + 0.15 : courseYs[row - 1] + 0.08;
    const ratios = row % 2 === 0 ? [-0.48, 0.12, 0.62] : [-0.68, -0.08, 0.46];
    for (let seam = 0; seam < ratios.length; seam++) {
      const ratio = ratios[seam];
      const lowerT = (lowerY - y0) / (yt - y0);
      const lowerHalf = x0 + (xt - x0) * lowerT;
      const xStart = ratio * lowerHalf;
      const xEnd = ratio * half;
      const slitClearance = Math.max(slitHalfAt(lowerY), slitHalfAt(y)) + 0.08;
      if (Math.abs((xStart + xEnd) / 2) < slitClearance) continue;
      const vertical = beamBetween(
        `pyramid-front-joint-${row + 1}-${seam + 1}`,
        new Vector3(...frontFacePoint(xStart, lowerY)),
        new Vector3(...frontFacePoint(xEnd, y - 0.08)),
        0.055,
        0.045,
        mats.darkStone,
      );
      vertical.position.z -= 0.045;
      vertical.userData.noCollide = true;
      shell.add(vertical);
    }
  }

  for (const side of [-1, 1]) {
    const rod = shadowed(
      new Mesh(new CylinderGeometry(0.035, 0.035, 1.25, 10), mats.steel),
    );
    rod.name = side < 0 ? 'summit-rod-west' : 'summit-rod-east';
    rod.position.set(side * 0.5, yt + 0.48, (PYRAMID_TOP_FRONT_Z + PYRAMID_TOP_REAR_Z) / 2);
    shell.add(rod);
  }

  return shell;
}

/** Twenty broad exterior granite steps climb the photographed west/rear edge. */
function buildExteriorPyramidStair(mats: Mats): Group {
  const group = new Group();
  group.name = 'pyramid-exterior-20-step-spine';
  const count = 20;
  const steps = new InstancedMesh(
    new BoxGeometry(1.25, 0.34, 1.05),
    mats.paleStone,
    count,
  );
  steps.name = 'pyramid-exterior-20-steps';
  const matrix = new Matrix4();
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const y = PYRAMID_BASE_Y + 0.22 + t * (PYRAMID_HEIGHT - 0.75);
    const x = -PYRAMID_BASE_HALF - 0.28 + t * (PYRAMID_BASE_HALF - PYRAMID_TOP_HALF + 0.34);
    const z = PYRAMID_REAR_Z - 0.18 + t * (PYRAMID_TOP_REAR_Z - PYRAMID_REAR_Z);
    matrix.makeTranslation(x, y, z);
    steps.setMatrixAt(i, matrix);
  }
  steps.instanceMatrix.needsUpdate = true;
  steps.userData.collisionSurfaceOnly = true;
  group.add(shadowed(steps));
  return group;
}

// ---------------------------------------------------------------- front slit / Hour Chamber

function buildFrontChamber(mats: Mats): Group {
  const chamber = new Group();
  chamber.name = 'front-slit-chamber';

  // The Hour Chamber occupies the north/front half of the Pyramid. Ending its
  // floor and walls before the rear stair arrives prevents a hidden slab from
  // crossing the Star Tunnel while preserving a clear view through the slit
  // toward the opposite opening.
  const chamberRearZ = PYRAMID_CENTER.z - 3;
  const chamberDepth = Math.abs(PYRAMID_FRONT_Z - chamberRearZ);
  const chamberCenterZ = (PYRAMID_FRONT_Z + chamberRearZ) / 2;
  const floor = shadowed(
    new Mesh(
      new BoxGeometry(FRONT_SLIT_HALF_WIDTH * 2 - 0.12, 0.16, chamberDepth),
      mats.darkStone,
    ),
  );
  floor.name = 'hour-chamber-floor';
  floor.position.set(0, PYRAMID_BASE_Y + 0.02, chamberCenterZ);
  floor.userData.collisionSurfaceOnly = true;
  chamber.add(floor);

  for (const side of [-1, 1]) {
    const wall = shadowed(
      new Mesh(new BoxGeometry(0.16, 7.4, chamberDepth), mats.darkStone),
    );
    wall.name = side < 0 ? 'hour-chamber-wall-west' : 'hour-chamber-wall-east';
    wall.position.set(
      side * (FRONT_SLIT_HALF_WIDTH - 0.04),
      PYRAMID_BASE_Y + 3.7,
      chamberCenterZ,
    );
    chamber.add(wall);
  }

  // Bronze lines make the needle opening legible without broadening it.
  const zTop = frontFacePoint(0, FRONT_SLIT_TOP_Y)[2];
  for (const side of [-1, 1]) {
    chamber.add(
      beamBetween(
        side < 0 ? 'front-slit-bronze-west' : 'front-slit-bronze-east',
        new Vector3(side * FRONT_SLIT_HALF_WIDTH, PYRAMID_BASE_Y, PYRAMID_FRONT_Z + 0.025),
        new Vector3(side * 0.18, FRONT_SLIT_TOP_Y, zTop + 0.025),
        0.07,
        0.08,
        mats.bronze,
      ),
    );
  }

  return chamber;
}

// ---------------------------------------------------------------- rear stair / Star Tunnel

function buildRearStair(mats: Mats): Group {
  const stair = new Group();
  stair.name = 'rear-star-tunnel-stair';

  // A real granite threshold bridges the coarsely tessellated terrain cut to
  // the first riser. The former analytic walk surface concealed this gap.
  const baseLandingDepth = 1.65;
  const baseLanding = shadowed(
    new Mesh(new BoxGeometry(STAIR_WIDTH, 0.24, baseLandingDepth), mats.stair),
  );
  baseLanding.name = 'star-tunnel-base-landing';
  baseLanding.position.set(
    STAIR_BASE.x,
    STAIR_BASE.y - 0.12,
    STAIR_BASE.z + baseLandingDepth / 2,
  );
  baseLanding.userData.collisionSurfaceOnly = true;
  stair.add(baseLanding);

  const stepHeight = Math.max(0.16, STAIR_STEP_RISE + 0.025);
  const stepGeometry = new BoxGeometry(
    STAIR_WIDTH,
    stepHeight,
    STAIR_STEP_RUN + 0.055,
  );
  const steps = new InstancedMesh(stepGeometry, mats.stair, STAIR_STEP_COUNT);
  steps.name = 'star-tunnel-147-steps';
  const matrix = new Matrix4();
  for (let i = 0; i < STAIR_STEP_COUNT; i++) {
    const topY = STAIR_BASE.y + (i + 1) * STAIR_STEP_RISE;
    const z = STAIR_BASE.z - (i + 0.5) * STAIR_STEP_RUN;
    matrix.setPosition(STAIR_BASE.x, topY - stepHeight / 2, z);
    steps.setMatrixAt(i, matrix);
  }
  steps.instanceMatrix.needsUpdate = true;
  steps.userData.collisionSurfaceOnly = true;
  shadowed(steps);
  stair.add(steps);

  // The stepped flight is visibly supported by the pyramid rather than
  // floating as a separate object.
  const runDirection = new Vector3(
    STAIR_TOP.x - STAIR_BASE.x,
    STAIR_TOP.y - STAIR_BASE.y,
    STAIR_TOP.z - STAIR_BASE.z,
  );
  const flight = shadowed(
    new Mesh(
      new BoxGeometry(STAIR_WIDTH + 0.12, 0.72, runDirection.length() + 0.7),
      mats.darkStone,
    ),
  );
  flight.name = 'star-tunnel-stair-bed';
  flight.userData.noCollide = true;
  flight.position
    .copy(new Vector3(STAIR_BASE.x, STAIR_BASE.y, STAIR_BASE.z))
    .add(new Vector3(STAIR_TOP.x, STAIR_TOP.y, STAIR_TOP.z))
    .multiplyScalar(0.5)
    .add(new Vector3(0, -0.48, 0));
  flight.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), runDirection.clone().normalize());
  // The real stair reads as a sequence of treads between side stringers.
  // Keeping the former full-width sloped slab here both flattened the steps
  // visually and blocked the independent Hour Chamber sightline below.

  // Continuous, raised granite stringers bind the staircase into the rear
  // cut and provide visible edge protection for the visitor capsule.
  for (const side of [-1, 1]) {
    const offset = new Vector3(side * STRINGER_GAP_X, STRINGER_HEIGHT / 2, 0);
    stair.add(
      beamBetween(
        side < 0 ? 'star-tunnel-west-stringer' : 'star-tunnel-east-stringer',
        new Vector3(STAIR_BASE.x, STAIR_BASE.y, STAIR_BASE.z).add(offset),
        new Vector3(STAIR_TOP.x, STAIR_TOP.y, STAIR_TOP.z).add(offset),
        STRINGER_WIDTH,
        STRINGER_HEIGHT,
        mats.paleStone,
      ),
    );
  }

  // Thick return walls show that the notch is a cut through the pyramid face.
  const bottomY = PYRAMID_BASE_Y;
  const topY = STAIR_TOP.y + 0.45;
  const backL = rearFacePoint(-(STAIR_WIDTH / 2 + 1.05), bottomY);
  const backR = rearFacePoint(STAIR_WIDTH / 2 + 1.05, bottomY);
  const topL = rearFacePoint(-1.92, topY);
  const topR = rearFacePoint(1.92, topY);
  const depth = 3.2;
  stair.add(
    faceMesh(
      'rear-cut-west-return',
      [
        backL,
        [backL[0], backL[1], backL[2] + depth],
        [topL[0], topL[1], topL[2] + depth],
        topL,
      ],
      [0, 1, 2, 0, 2, 3],
      mats.cutStone,
    ),
    faceMesh(
      'rear-cut-east-return',
      [
        backR,
        topR,
        [topR[0], topR[1], topR[2] + depth],
        [backR[0], backR[1], backR[2] + depth],
      ],
      [0, 1, 2, 0, 2, 3],
      mats.cutStone,
    ),
  );

  return stair;
}

/**
 * Paired open walls bind the exposed upper stair to the excavation and the
 * Pyramid. There is intentionally no roof or end wall across the view.
 */
function buildOpenStarTunnel(mats: Mats): Group {
  const tunnel = new Group();
  tunnel.name = 'open-star-tunnel';
  const start = stairPoint(TUNNEL_MOUTH_T);
  const end = stairPoint(1);
  const wallHeight = 6.3;
  const innerBottom = STAIR_WIDTH / 2 + 0.58;
  const outerBottom = innerBottom + 1.05;
  const innerTop = STAIR_WIDTH / 2 + 0.28;
  const outerTop = innerTop + 0.82;

  for (const side of [-1, 1]) {
    const positions = new Float32Array([
      side * innerBottom, start.y - 0.52, start.z,
      side * outerBottom, start.y - 0.52, start.z,
      side * outerTop, start.y + wallHeight, start.z,
      side * innerTop, start.y + wallHeight, start.z,
      side * innerBottom, end.y - 0.52, end.z,
      side * outerBottom, end.y - 0.52, end.z,
      side * outerTop, end.y + wallHeight, end.z,
      side * innerTop, end.y + wallHeight, end.z,
    ]);
    const indices = [
      0, 1, 2, 0, 2, 3,
      4, 7, 6, 4, 6, 5,
      0, 3, 7, 0, 7, 4,
      1, 5, 6, 1, 6, 2,
      0, 4, 5, 0, 5, 1,
      3, 2, 6, 3, 6, 7,
    ];
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const wall = shadowed(new Mesh(geometry, mats.darkStone));
    wall.name = side < 0 ? 'star-tunnel-wall-west' : 'star-tunnel-wall-east';
    tunnel.add(wall);
  }

  return tunnel;
}

// ---------------------------------------------------------------- upper room / aperture

function buildUpperRoom(mats: Mats): Group {
  const upper = new Group();
  upper.name = 'upper-room-aperture';
  const apertureY = APERTURE_CENTER_Y;
  const headwallHeight = 6.0;
  const rearCenter = new Vector3(0, apertureY, APERTURE_REAR_Z);

  const wallShape = new Shape();
  wallShape.moveTo(-2.25, -headwallHeight / 2);
  wallShape.lineTo(2.25, -headwallHeight / 2);
  wallShape.lineTo(2.25, headwallHeight / 2);
  wallShape.lineTo(-2.25, headwallHeight / 2);
  wallShape.closePath();
  const hole = new Path();
  hole.absarc(
    0,
    0,
    APERTURE_INNER_RADIUS + 0.035,
    0,
    Math.PI * 2,
    false,
  );
  wallShape.holes.push(hole);

  const headwall = shadowed(new Mesh(new ShapeGeometry(wallShape, 32), mats.darkStone));
  headwall.name = 'upper-room-headwall';
  headwall.position.copy(rearCenter).addScaledVector(apertureAxis, APERTURE_LENGTH * 0.58);
  headwall.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), apertureAxis);
  headwall.userData.noCollide = false;
  upper.add(headwall);

  const outerRadius = APERTURE_INNER_RADIUS + APERTURE_WALL;
  const bore = shadowed(
    new Mesh(
      new CylinderGeometry(outerRadius, outerRadius, APERTURE_LENGTH, 48, 1, true),
      mats.steel,
    ),
  );
  bore.name = 'polaris-aperture-bore';
  bore.quaternion.setFromUnitVectors(_up, apertureAxis);
  bore.position.copy(rearCenter).addScaledVector(apertureAxis, APERTURE_LENGTH / 2);
  upper.add(bore);

  const ring = shadowed(
    new Mesh(new TorusGeometry(outerRadius, APERTURE_WALL, 10, 48), mats.steel),
  );
  ring.name = 'polaris-aperture-rim';
  ring.position.copy(rearCenter).addScaledVector(apertureAxis, -0.012);
  ring.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), apertureAxis);
  upper.add(ring);

  // A flared, open passage crosses the crown and terminates at the real hole
  // in the north facet. It reveals the live sky dome and star field with
  // parallax; there is intentionally no opaque disc behind the rim.
  const frontSurface = apertureFrontPoint();
  const fullPassageLength = frontSurface.clone().sub(rearCenter).dot(apertureAxis);
  const passageLength = Math.max(0.2, fullPassageLength - APERTURE_LENGTH);
  const passage = shadowed(
    new Mesh(
      new CylinderGeometry(
        APERTURE_EXIT_RADIUS,
        APERTURE_INNER_RADIUS,
        passageLength,
        64,
        1,
        true,
      ),
      mats.darkStone,
    ),
  );
  passage.name = 'open-star-sighting-passage';
  passage.quaternion.setFromUnitVectors(_up, apertureAxis);
  passage.position
    .copy(rearCenter)
    .addScaledVector(apertureAxis, APERTURE_LENGTH + passageLength / 2);
  passage.userData.noCollide = true;
  upper.add(passage);

  // The same bore exits through the north/front face above the vertical
  // slit.  This is the key front/back relationship in the supplied photos:
  // the visitor climbs the rear stair to the hole that is also visible on
  // the pyramid's front elevation.
  const frontRotation = new Quaternion().setFromUnitVectors(
    new Vector3(0, 0, 1),
    apertureAxis,
  );
  const frontRim = shadowed(
    new Mesh(
      new TorusGeometry(
        APERTURE_EXIT_RADIUS + APERTURE_WALL,
        APERTURE_WALL * 1.25,
        12,
        64,
      ),
      mats.steel,
    ),
  );
  frontRim.name = 'front-polaris-aperture-rim';
  frontRim.position.copy(frontSurface).addScaledVector(apertureAxis, 0.11);
  frontRim.quaternion.copy(frontRotation);
  upper.add(frontRim);

  // The real tube sits inside a deep rectangular sight box. Four recessed
  // returns keep the oculus from reading as a ring pasted onto the facade.
  const sightHalfW = 2.25;
  const sightHalfH = 2.0;
  const sightY = frontSurface.y;
  const sightReturns = [
    beamBetween(
      'front-sight-box-lintel',
      new Vector3(...frontFacePoint(-sightHalfW, sightY + sightHalfH)),
      new Vector3(...frontFacePoint(sightHalfW, sightY + sightHalfH)),
      0.2,
      0.32,
      mats.darkStone,
    ),
    beamBetween(
      'front-sight-box-sill',
      new Vector3(...frontFacePoint(-sightHalfW, sightY - sightHalfH)),
      new Vector3(...frontFacePoint(sightHalfW, sightY - sightHalfH)),
      0.2,
      0.32,
      mats.darkStone,
    ),
    beamBetween(
      'front-sight-box-west',
      new Vector3(...frontFacePoint(-sightHalfW, sightY - sightHalfH)),
      new Vector3(...frontFacePoint(-sightHalfW, sightY + sightHalfH)),
      0.2,
      0.32,
      mats.darkStone,
    ),
    beamBetween(
      'front-sight-box-east',
      new Vector3(...frontFacePoint(sightHalfW, sightY - sightHalfH)),
      new Vector3(...frontFacePoint(sightHalfW, sightY + sightHalfH)),
      0.2,
      0.32,
      mats.darkStone,
    ),
  ];
  for (const sightReturn of sightReturns) {
    sightReturn.position.z -= 0.12;
    upper.add(sightReturn);
  }

  // A quiet local wash keeps the steel rim and chamber thickness legible at
  // night without competing with the star field.
  const viewingLight = new PointLight('#afcfff', 6, 10, 1.8);
  viewingLight.name = 'upper-room-night-wash';
  viewingLight.position.set(0, apertureY + 0.75, APERTURE_REAR_Z - 1.6);
  viewingLight.castShadow = false;
  upper.add(viewingLight);

  // A level viewing bay lets a six-foot visitor leave the last tread and move
  // close enough for the aperture to fill their peripheral field.
  const landingRearZ = STAIR_TOP.z + 0.35;
  const landingFrontZ = UPPER_LANDING_FRONT_Z;
  const landingDepth = Math.abs(landingFrontZ - landingRearZ);
  const landing = shadowed(
    new Mesh(new PlaneGeometry(4.25, landingDepth), mats.stair),
  );
  landing.name = 'upper-room-landing';
  landing.userData.collisionSurfaceOnly = true;
  landing.rotation.x = -Math.PI / 2;
  landing.position.set(0, STAIR_TOP.y + 0.04, (landingRearZ + landingFrontZ) / 2);
  upper.add(landing);

  return upper;
}

// ---------------------------------------------------------------- assembly

export function createStarAxis(
  materials: StarAxisMaterials,
  _options?: { blockout?: boolean },
): StarAxisModel {
  // Shell facets must be visible from the chamber cuts as well as outside.
  materials.pyramidSandstone.side = DoubleSide;
  materials.flagstone.side = DoubleSide;
  materials.fieldstone.side = DoubleSide;
  materials.concrete.side = DoubleSide;
  materials.concreteDark.side = DoubleSide;

  const mats: Mats = {
    shell: materials.pyramidSandstone,
    cutStone: materials.fieldstone,
    avenueStone: materials.flagstone,
    ashlar: materials.ashlar,
    stair: materials.granite,
    paleStone: materials.graniteCoping,
    darkStone: materials.concreteDark,
    steel: materials.stainless,
    bronze: materials.bronze,
  };

  const group = new Group();
  group.name = 'star-axis-unified-monument';

  const avenue = buildAvenue(mats);
  const equinoctial = buildEquinoctialChamber(mats);
  const excavation = buildExcavationWall(mats);
  const shell = buildPyramidShell(mats);
  const exteriorStair = buildExteriorPyramidStair(mats);
  const front = buildFrontChamber(mats);
  const stair = buildRearStair(mats);
  const openTunnel = buildOpenStarTunnel(mats);
  const upper = buildUpperRoom(mats);
  group.add(
    avenue,
    equinoctial,
    excavation,
    shell,
    exteriorStair,
    front,
    stair,
    openTunnel,
    upper,
  );

  const components: Record<string, Object3D> = {
    avenue,
    'equinoctial-chamber': equinoctial,
    'equinoctial-excavation-wall': excavation,
    'unified-pyramid-shell': shell,
    'pyramid-exterior-20-step-spine': exteriorStair,
    'front-slit-chamber': front,
    'rear-star-tunnel-stair': stair,
    'open-star-tunnel': openTunnel,
    'upper-room-aperture': upper,
  };
  group.traverse((object) => {
    if (object.name) components[object.name] = object;
  });

  group.userData.sculptRuntime = {
    objectClass: 'architectural earthwork',
    static: true,
    componentIds: Object.keys(components),
    walkableSurfaces: [
      'avenue',
      'avenue-lower-25-steps',
      'hour-chamber-floor',
      'star-tunnel-147-steps',
      'upper-room-landing',
    ],
    actionAnchors: {
      avenueEntry: [0, terrainHeight(0, TRENCH_SOUTH_Z - 2) + 1.7, TRENCH_SOUTH_Z - 2],
      equinoctialPortal: [0, TERRACE_TOP_Y + 1.7, PORTAL_Z + 2.8],
      frontEntrance: [0, PYRAMID_BASE_Y + 1.7, PYRAMID_FRONT_Z - 1.4],
      rearStairBase: [STAIR_BASE.x, STAIR_BASE.y + 1.7, STAIR_BASE.z + 2],
      apertureLanding: [STAIR_TOP.x, STAIR_TOP.y + 1.7, STAIR_TOP.z],
    },
    colliders: 'three-mesh-bvh ground raycasts and capsule shapecasts over rendered geometry',
  };

  return { group, components };
}
