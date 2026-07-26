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
  UPPER_LANDING_FRONT_Z,
  crescentCrownY,
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

/** Deterministic per-block hash in [0, 1). */
function blockHash(a: number, b: number, salt: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + salt * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

interface CoursedFaceOptions {
  /** Face corners in order: bottom-start, bottom-end, top-end, top-start. */
  corners: [Vector3, Vector3, Vector3, Vector3];
  /** Number of horizontal courses up the face. */
  courses: number;
  /** Target block width in metres; each course fits a whole number of them. */
  blockWidth: number;
  /** Recessed joint width in metres. */
  joint: number;
  /** Mean outward projection of a block from the backing plane. */
  depth: number;
  /**
   * Flat margin of bare facet left at each vertical edge. Where two coursed
   * facets meet at an arris, blocks running right to the edge leave a notch
   * one block-depth deep that renders as a black crack through the shell; a
   * margin turns the same corner into a recessed quoin.
   */
  margin: number;
  seed: number;
  /** Return true to leave a block out — used around openings. */
  skip?: (x: number, y: number, z: number, halfWidth: number) => boolean;
}

/**
 * Lay real, individually proud stone blocks over a flat pyramid facet.
 *
 * The facet itself stays as the backing plane; this adds a layer of slabs a
 * few centimetres off it, each with its own depth, so the recessed joints are
 * geometry rather than a texture. That matters twice over: the path tracer
 * samples no fragment shaders at all, so relief it can trace is the only
 * relief it has, and at this site's habitually shallow sun a 5 cm reveal is
 * what turns a flat triangle into masonry.
 */
function coursedFaceGeometry(options: CoursedFaceOptions): BufferGeometry {
  const { corners, courses, blockWidth, joint, depth, margin, seed, skip } = options;
  const [c0, c1, c2, c3] = corners;

  // Bilinear point on the facet: u across, v up.
  const _p = new Vector3();
  const facePoint = (u: number, v: number, target: Vector3): Vector3 => {
    target.copy(c0).lerp(c1, u);
    _p.copy(c3).lerp(c2, u);
    return target.lerp(_p, v);
  };

  const edgeU = new Vector3().subVectors(c1, c0);
  const edgeV = new Vector3().subVectors(c3, c0);
  const normal = new Vector3().crossVectors(edgeU, edgeV).normalize();
  // Face outward, away from the pyramid's vertical axis.
  const centroid = new Vector3()
    .add(c0)
    .add(c1)
    .add(c2)
    .add(c3)
    .multiplyScalar(0.25);
  const outward = new Vector3(
    centroid.x - PYRAMID_CENTER.x,
    0,
    centroid.z - PYRAMID_CENTER.z,
  );
  if (normal.dot(outward) < 0) normal.negate();

  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const corner = new Vector3();

  const pushQuad = (
    a: Vector3,
    b: Vector3,
    c: Vector3,
    d: Vector3,
    uScale: number,
    vScale: number,
  ): void => {
    const base = positions.length / 3;
    for (const point of [a, b, c, d]) positions.push(point.x, point.y, point.z);
    uvs.push(0, 0, uScale, 0, uScale, vScale, 0, vScale);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const raised: Vector3[] = [
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
  ];
  const flat: Vector3[] = [
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
  ];

  const faceHeight = edgeV.length();
  const _rowStart = new Vector3();
  const _rowEnd = new Vector3();

  // Shared boundaries: a block runs from boundary(n) to boundary(n + 1), so
  // perturbing the boundary varies every stone's size without ever opening a
  // gap between neighbours. Regular blocks read as roof shingles; this is what
  // makes it read as quarried granite.
  const courseBoundary = (row: number): number => {
    if (row <= 0) return 0;
    if (row >= courses) return 1;
    return (row + (blockHash(row, 0, seed + 41) - 0.5) * 0.34) / courses;
  };
  const columnBoundary = (row: number, column: number, perRow: number, bond: number): number =>
    (column + bond + (blockHash(row, column, seed + 17) - 0.5) * 0.46) / perRow;

  for (let row = 0; row < courses; row++) {
    const v0 = courseBoundary(row);
    const v1 = courseBoundary(row + 1);
    const courseHeight = (v1 - v0) * faceHeight;
    const jointV = joint / faceHeight;

    // Block count comes from this course's own world width, so stones stay a
    // constant size up a tapering facet instead of shrinking with it. A
    // running bond offsets alternate rows by half a block.
    facePoint(0, (v0 + v1) / 2, _rowStart);
    facePoint(1, (v0 + v1) / 2, _rowEnd);
    const rowWidth = _rowStart.distanceTo(_rowEnd);
    const marginU = Math.min(0.35, margin / Math.max(rowWidth, 0.001));
    const perRow = Math.max(1, Math.round(rowWidth / blockWidth));
    const bond = row % 2 === 0 ? 0 : 0.5;

    for (let column = -1; column <= perRow; column++) {
      const u0 = columnBoundary(row, column, perRow, bond);
      const u1 = columnBoundary(row, column + 1, perRow, bond);
      if (u1 <= marginU || u0 >= 1 - marginU) continue;
      const clampedU0 = Math.max(marginU, u0);
      const clampedU1 = Math.min(1 - marginU, u1);
      if (clampedU1 - clampedU0 < 0.25 / perRow) continue;

      const jitter = blockHash(row, column, seed);
      const blockDepth = depth * (0.45 + 1.15 * jitter);
      const jointU = (joint * (0.75 + 0.6 * blockHash(row, column, seed + 9))) / rowWidth;

      const au0 = clampedU0 + (clampedU0 > marginU ? jointU : 0);
      const au1 = clampedU1 - (clampedU1 < 1 - marginU ? jointU : 0);
      const av0 = v0 + (row > 0 ? jointV : 0);
      const av1 = v1 - (row < courses - 1 ? jointV : 0);
      if (au1 <= au0 || av1 <= av0) continue;

      facePoint((au0 + au1) / 2, (av0 + av1) / 2, corner);
      const halfWidth = ((au1 - au0) * rowWidth) / 2;
      if (skip?.(corner.x, corner.y, corner.z, halfWidth)) continue;

      const uv: Array<[number, number]> = [
        [au0, av0],
        [au1, av0],
        [au1, av1],
        [au0, av1],
      ];
      uv.forEach(([u, v], index) => {
        facePoint(u, v, flat[index]);
        raised[index].copy(flat[index]).addScaledVector(normal, blockDepth);
      });

      const blockU = (au1 - au0) * rowWidth;
      pushQuad(raised[0], raised[1], raised[2], raised[3], blockU * 0.35, courseHeight * 0.35);
      // Reveals: four short returns down to the backing plane.
      pushQuad(flat[0], flat[1], raised[1], raised[0], blockU * 0.35, 0.12);
      pushQuad(flat[1], flat[2], raised[2], raised[1], courseHeight * 0.35, 0.12);
      pushQuad(flat[2], flat[3], raised[3], raised[2], blockU * 0.35, 0.12);
      pushQuad(flat[3], flat[0], raised[0], raised[3], courseHeight * 0.35, 0.12);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
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

  // Real proud stonework over both long facets. Merged into a single mesh per
  // side, so the whole elevation is still one draw call.
  const sideCourses: CoursedFaceOptions[] = [
    {
      corners: [
        new Vector3(...sbL),
        new Vector3(...sfL),
        new Vector3(...tfL),
        new Vector3(...tbL),
      ],
      courses: 11,
      blockWidth: 2.35,
      joint: 0.075,
      depth: 0.115,
      margin: 0.34,
      seed: 3.1,
    },
    {
      corners: [
        new Vector3(...sfR),
        new Vector3(...sbR),
        new Vector3(...tbR),
        new Vector3(...tfR),
      ],
      courses: 11,
      blockWidth: 2.35,
      joint: 0.075,
      depth: 0.115,
      margin: 0.34,
      seed: 8.7,
    },
  ];
  sideCourses.forEach((options, index) => {
    const stones = shadowed(
      new Mesh(coursedFaceGeometry(options), mats.shell),
    );
    stones.name = index === 0 ? 'pyramid-west-courses' : 'pyramid-east-courses';
    stones.userData.noCollide = true;
    shell.add(stones);
  });

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

  // Coursed stonework across the public elevation and both rear wings. This
  // replaces an earlier set of thin applied seam beams: the same large
  // irregular granite reading, but as blocks with real depth that shadow each
  // other and survive into the traced render.
  const slitHalfAt = (y: number): number =>
    y >= FRONT_SLIT_TOP_Y
      ? 0
      : FRONT_SLIT_HALF_WIDTH *
        (1 - Math.max(0, y - y0) / (FRONT_SLIT_TOP_Y - y0));
  const sightY = apertureFrontPoint().y;
  const frontStones = shadowed(
    new Mesh(
      coursedFaceGeometry({
        corners: [
          new Vector3(...frontFacePoint(x0, y0)),
          new Vector3(...frontFacePoint(-x0, y0)),
          new Vector3(...frontFacePoint(-xt, yt)),
          new Vector3(...frontFacePoint(xt, yt)),
        ],
        courses: 11,
        blockWidth: 2.2,
        joint: 0.07,
        depth: 0.115,
        margin: 0.34,
        seed: 5.3,
        // Leave the Hour Chamber slit and the aperture recess clear.
        skip: (x, y, _z, halfWidth) =>
          Math.abs(x) - halfWidth < slitHalfAt(y) + 0.14 ||
          (y > sightY - 2.45 && y < sightY + 2.45 && Math.abs(x) - halfWidth < 2.62),
      }),
      mats.shell,
    ),
  );
  frontStones.name = 'pyramid-front-courses';
  frontStones.userData.noCollide = true;
  shell.add(frontStones);

  // South/rear elevation. The grid is laid over the *whole* face rather than
  // over each wing, so its courses stay level; the notch and the open crown
  // above it are then subtracted, which is also how the real cut reads —
  // continuous coursing interrupted by the Star Tunnel, not two separately
  // coursed panels either side of it.
  const notchHalfAt = (y: number): number => {
    if (y <= notchTopY) {
      const t = (y - y0) / Math.max(0.001, notchTopY - y0);
      return notchBottomHalf + (notchTopHalf - notchBottomHalf) * t;
    }
    const t = (y - notchTopY) / Math.max(0.001, yt - notchTopY);
    return notchTopHalf + (xt - notchTopHalf) * t;
  };
  const rearStones = shadowed(
    new Mesh(
      coursedFaceGeometry({
        corners: [
          new Vector3(...rearFacePoint(-x0, y0)),
          new Vector3(...rearFacePoint(x0, y0)),
          new Vector3(...rearFacePoint(xt, yt)),
          new Vector3(...rearFacePoint(-xt, yt)),
        ],
        courses: 11,
        blockWidth: 2.1,
        joint: 0.075,
        depth: 0.105,
        margin: 0.3,
        seed: 12.9,
        skip: (x, y, _z, halfWidth) => Math.abs(x) - halfWidth < notchHalfAt(y) + 0.12,
      }),
      mats.shell,
    ),
  );
  rearStones.name = 'pyramid-rear-courses';
  rearStones.userData.noCollide = true;
  shell.add(rearStones);

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

  // The chamber used to be flanked by two dark stone slabs. Standing inside
  // the Pyramid they closed the room into a narrow box and blocked the view
  // across to the Star Tunnel, so the interior is now the open shell and the
  // slit alone carries the opening.

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
  // close enough for the aperture to fill their peripheral field. Build it as
  // a real granite slab so the underside reads from the stair below — a single
  // plane disappears under back-face culling.
  const landingRearZ = STAIR_TOP.z + 0.35;
  const landingFrontZ = UPPER_LANDING_FRONT_Z;
  const landingDepth = Math.abs(landingFrontZ - landingRearZ);
  const landingThickness = 0.28;
  const landingTopY = STAIR_TOP.y + 0.04;
  const landing = shadowed(
    new Mesh(
      new BoxGeometry(4.25, landingThickness, landingDepth),
      mats.stair,
    ),
  );
  landing.name = 'upper-room-landing';
  landing.userData.collisionSurfaceOnly = true;
  landing.position.set(
    0,
    landingTopY - landingThickness / 2,
    (landingRearZ + landingFrontZ) / 2,
  );
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
  const upper = buildUpperRoom(mats);
  group.add(
    avenue,
    equinoctial,
    excavation,
    shell,
    exteriorStair,
    front,
    stair,
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
