/**
 * Terrain for the Star Axis site.
 *
 * Builds the displaced mesa ground plane, a ring of distant horizon mesas,
 * two deterministic multi-geometry stone batches, and an instanced grass
 * layer. All ground elevations come from terrainHeight() — the single analytic
 * source of truth — and every placement derives from index-based hashing so
 * the landscape is identical on every load (no Math.random()).
 */

import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import {
  mergeGeometries,
  toCreasedNormals,
} from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BOWL_CENTER,
  BOWL_RADIUS,
  TRENCH_SOUTH_Z,
  TERRAIN_SIZE,
  TERRAIN_SEGMENTS,
  PYRAMID_FRONT_Z,
  PYRAMID_REAR_Z,
  STAIR_BASE,
  STAIR_TOP,
} from './constants';
import { terrainHeight } from './heightfield';

// ---------------------------------------------------------------- helpers

/** Deterministic per-index hash in [0, 1). */
function hash01(i: number, salt: number): number {
  const s = Math.sin(i * 12.9898 + salt * 78.233 + 0.5) * 43758.5453123;
  return s - Math.floor(s);
}

/** |∇h| of the terrain height field via central differences. */
function slopeMag(x: number, z: number): number {
  const e = 0.75;
  const dx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
  const dz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}

/** Analytic terrain normal used to seat static scatter without point contacts. */
function terrainNormal(x: number, z: number, target: Vector3): Vector3 {
  const e = 0.65;
  const dx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
  const dz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  return target.set(-dx, 1, -dz).normalize();
}

/** Keep-out region above the star-tunnel stair slot. */
function inStairSlot(x: number, z: number): boolean {
  const zMin = Math.min(STAIR_BASE.z, STAIR_TOP.z) - 4;
  const zMax = Math.max(STAIR_BASE.z, STAIR_TOP.z) + 4;
  return (
    Math.abs(x) < 4.25 &&
    z > zMin &&
    z < zMax
  );
}

function inPyramidFootprint(x: number, z: number): boolean {
  const zMin = Math.min(PYRAMID_REAR_Z, PYRAMID_FRONT_Z) - 1;
  const zMax = Math.max(PYRAMID_REAR_Z, PYRAMID_FRONT_Z) + 1;
  return Math.abs(x) < 11.5 && z > zMin && z < zMax;
}

const _pos = new Vector3();
const _quat = new Quaternion();
const _euler = new Euler();
const _scale = new Vector3();
const _mat = new Matrix4();
const _up = new Vector3(0, 1, 0);
const _normal = new Vector3();
const _twist = new Quaternion();
const _rockTilt = new Quaternion();

interface Placement {
  matrix: Matrix4;
  color: Color;
}

interface BatchedPlacement extends Placement {
  geometryIndex: number;
}

function buildInstancedMesh(
  geometry: BufferGeometry,
  material: MeshStandardNodeMaterial,
  placements: Placement[],
  name: string,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, placements.length);
  for (let i = 0; i < placements.length; i++) {
    mesh.setMatrixAt(i, placements[i].matrix);
    mesh.setColorAt(i, placements[i].color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  mesh.name = name;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * One opaque draw containing multiple unique static geometries. This keeps
 * silhouette variety cheap: instances select a stored rock shape while
 * retaining per-object frustum culling and color.
 */
function buildBatchedMesh(
  geometries: BufferGeometry[],
  material: MeshStandardNodeMaterial,
  placements: BatchedPlacement[],
  name: string,
): BatchedMesh {
  const maxVertexCount = geometries.reduce(
    (sum, geometry) => sum + geometry.getAttribute('position').count,
    0,
  );
  const maxIndexCount = geometries.reduce(
    (sum, geometry) => sum + (geometry.getIndex()?.count ?? 0),
    0,
  );
  const mesh = new BatchedMesh(
    placements.length,
    maxVertexCount,
    maxIndexCount,
    material,
  );
  const geometryIds = geometries.map((geometry) => mesh.addGeometry(geometry));
  for (const placement of placements) {
    const instanceId = mesh.addInstance(geometryIds[placement.geometryIndex]);
    mesh.setMatrixAt(instanceId, placement.matrix);
    mesh.setColorAt(instanceId, placement.color);
  }
  mesh.name = name;
  mesh.perObjectFrustumCulled = true;
  mesh.sortObjects = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.noCollide = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return mesh;
}

type Point3 = readonly [number, number, number];

function pushTriangle(
  positions: number[],
  colors: number[],
  indices: number[],
  a: Point3,
  b: Point3,
  c: Point3,
  faceColor: Color,
): void {
  const start = positions.length / 3;
  positions.push(...a, ...b, ...c);
  for (let i = 0; i < 3; i++) colors.push(faceColor.r, faceColor.g, faceColor.b);
  indices.push(start, start + 1, start + 2);
}

function makeTriangleGeometry(
  positions: number[],
  colors: number[],
  indices: number[],
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

interface StoneRing {
  y: number;
  radius: number;
  offsetX: number;
  offsetZ: number;
  value: number;
}

/**
 * A low-cost fractured stone with real shoulders, a chipped crown, a darker
 * embedded base and no radial symmetry. Triangle vertices are deliberately
 * split so every facet keeps a stable, hard normal.
 */
function buildStoneGeometry(
  seed: number,
  radialSegments: number,
  rings: StoneRing[],
  depthScale: number,
): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const ringPoints: Point3[][] = [];
  const phaseA = hash01(seed, 201) * Math.PI * 2;
  const phaseB = hash01(seed, 202) * Math.PI * 2;

  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    const points: Point3[] = [];
    for (let j = 0; j < radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const silhouette =
        1 +
        Math.sin(angle * 2 + phaseA) * 0.1 +
        Math.sin(angle * 5 + phaseB) * 0.055 +
        (hash01(seed * 97 + j, 203 + r) - 0.5) * 0.13;
      const yJitter =
        (hash01(seed * 71 + j, 226 + r) - 0.5) *
        (r === rings.length - 1 ? 0.13 : 0.055);
      points.push([
        Math.cos(angle) * ring.radius * silhouette + ring.offsetX,
        ring.y + yJitter,
        Math.sin(angle) * ring.radius * silhouette * depthScale + ring.offsetZ,
      ]);
    }
    ringPoints.push(points);
  }

  const faceColor = new Color();
  for (let r = 0; r < rings.length - 1; r++) {
    const low = ringPoints[r];
    const high = ringPoints[r + 1];
    for (let j = 0; j < radialSegments; j++) {
      const next = (j + 1) % radialSegments;
      const variation = 0.94 + hash01(seed * 131 + j, 240 + r) * 0.13;
      // Near-white geometry factors preserve the instance palette instead of
      // multiplying linear-space stone colors into black shadow facets.
      const value = (0.86 + rings[r].value * 0.16) * variation;
      faceColor.setRGB(value * 1.02, value, value * 0.96);
      if ((j + r) % 2 === 0) {
        pushTriangle(positions, colors, indices, low[j], high[next], low[next], faceColor);
        pushTriangle(positions, colors, indices, low[j], high[j], high[next], faceColor);
      } else {
        pushTriangle(positions, colors, indices, low[j], high[j], low[next], faceColor);
        pushTriangle(positions, colors, indices, low[next], high[j], high[next], faceColor);
      }
    }
  }

  const top = ringPoints[ringPoints.length - 1];
  const topRing = rings[rings.length - 1];
  const topCenter: Point3 = [
    topRing.offsetX + (hash01(seed, 260) - 0.5) * 0.12,
    topRing.y + 0.025,
    topRing.offsetZ + (hash01(seed, 261) - 0.5) * 0.12,
  ];
  faceColor.setRGB(1.08, 1.055, 1.0);
  for (let j = 0; j < radialSegments; j++) {
    pushTriangle(
      positions,
      colors,
      indices,
      top[j],
      topCenter,
      top[(j + 1) % radialSegments],
      faceColor,
    );
  }

  const bottom = ringPoints[0];
  const bottomRing = rings[0];
  const bottomCenter: Point3 = [
    bottomRing.offsetX,
    bottomRing.y - 0.02,
    bottomRing.offsetZ,
  ];
  faceColor.setRGB(0.84, 0.82, 0.79);
  for (let j = 0; j < radialSegments; j++) {
    pushTriangle(
      positions,
      colors,
      indices,
      bottom[j],
      bottom[(j + 1) % radialSegments],
      bottomCenter,
      faceColor,
    );
  }

  return makeTriangleGeometry(positions, colors, indices);
}

// ---------------------------------------------------------------- ground

/**
 * Ground as an 8×8 grid of chunks instead of one monolithic plane: each
 * chunk gets its own bounding sphere, so at ground level the frustum culls
 * most of the ~1.2M terrain triangles. Normals come from central differences
 * of the analytic height field — exact, seam-free across chunk borders, and
 * smoother than mesh-derived normals.
 */
function createGround(desertMaterial: MeshStandardNodeMaterial): Group {
  const group = new Group();
  group.name = 'terrain-mesa';

  const CHUNKS = 8;
  const chunkSize = TERRAIN_SIZE / CHUNKS;
  const segPerChunk = TERRAIN_SEGMENTS / CHUNKS;
  const e = 0.9; // central-difference step for analytic normals
  const n = new Vector3();
  const sand = new Color('#d3bda0');
  const caliche = new Color('#e2d3b8');
  const rubble = new Color('#9f7d5f');
  const baked = new Color();

  for (let cy = 0; cy < CHUNKS; cy++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const geometry = new PlaneGeometry(chunkSize, chunkSize, segPerChunk, segPerChunk);
      geometry.rotateX(-Math.PI / 2);
      const ox = -TERRAIN_SIZE / 2 + chunkSize * (cx + 0.5);
      const oz = -TERRAIN_SIZE / 2 + chunkSize * (cy + 0.5);
      geometry.translate(ox, 0, oz);

      const position = geometry.attributes.position;
      const normal = geometry.attributes.normal;
      const colors = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const z = position.getZ(i);
        position.setY(i, terrainHeight(x, z));
        const dx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
        const dz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
        n.set(-dx, 1, -dz).normalize();
        normal.setXYZ(i, n.x, n.y, n.z);

        // Bake the former multi-noise TSL desert shader into vertex color.
        // This preserves large-scale caliche/rubble breakup but turns the
        // ground fragment stage into one inexpensive texture-free material.
        const patch =
          0.5 +
          0.24 * Math.sin(x * 0.071 + z * 0.043) +
          0.18 * Math.sin(x * 0.019 - z * 0.031);
        const slope = Math.min(1, Math.hypot(dx, dz) * 2.8);
        const approach =
          Math.abs(x) < 7.5 && z > 1 && z < TRENCH_SOUTH_Z
            ? Math.max(0, 1 - Math.abs(x) / 6.5)
            : 0;
        const bowlDistance = Math.hypot(x - BOWL_CENTER.x, z - BOWL_CENTER.z);
        const apron =
          bowlDistance < BOWL_RADIUS + 2
            ? 0.36
            : 0;
        const path = Math.max(approach, apron);
        baked
          .copy(sand)
          .lerp(rubble, Math.min(0.72, slope * 0.65 + Math.max(0, patch - 0.58) * 0.35))
          .lerp(caliche, path * 0.7);
        colors[i * 3] = baked.r;
        colors[i * 3 + 1] = baked.g;
        colors[i * 3 + 2] = baked.b;
      }
      geometry.setAttribute('color', new BufferAttribute(colors, 3));
      geometry.computeBoundingSphere();

      const mesh = new Mesh(geometry, desertMaterial);
      mesh.name = `terrain-chunk-${cx}-${cy}`;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.userData.collisionSurfaceOnly = true;
      group.add(mesh);
    }
  }
  return group;
}

// ---------------------------------------------------------------- horizon mesas

function createHorizonMesas(): Group {
  const group = new Group();
  group.name = 'horizon-mesas';

  const material = new MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
    emissive: '#514941',
    emissiveIntensity: 0.22,
    vertexColors: true,
    flatShading: true,
  });

  /**
   * Distant Glorieta/Las Vegas Plateau language: low, broad erosion remnants
   * with a talus foot, recessed cliff band and slightly proud caprock. Each
   * mass is irregular but the full horizon is still merged into one draw.
   */
  const buildMesa = (
    seed: number,
    width: number,
    depth: number,
    height: number,
    distanceFade: number,
  ): BufferGeometry => {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const radialSegments = 32 + Math.floor(hash01(seed, 301) * 9);
    const talusTop = 0.43 + hash01(seed, 360) * 0.1;
    const cliffBase = talusTop + 0.065 + hash01(seed, 361) * 0.035;
    const cliffTop = 0.76 + hash01(seed, 362) * 0.085;
    const capTop = cliffTop + 0.055 + hash01(seed, 363) * 0.025;
    const topInset = 0.49 + hash01(seed, 364) * 0.08;
    const profile = [
      { y: -0.06, radius: 1.06 },
      { y: 0.14 + hash01(seed, 365) * 0.055, radius: 0.93 + hash01(seed, 366) * 0.05 },
      { y: talusTop, radius: 0.69 + hash01(seed, 367) * 0.065 },
      { y: cliffBase, radius: 0.61 + hash01(seed, 368) * 0.055 },
      { y: cliffTop, radius: 0.54 + hash01(seed, 369) * 0.055 },
      { y: capTop, radius: 0.575 + hash01(seed, 370) * 0.035 },
      { y: 0.93 + hash01(seed, 371) * 0.045, radius: topInset },
    ];
    const palette = [
      new Color('#a69789'),
      new Color('#ae9b87'),
      new Color('#918780'),
      new Color('#ad9b8a'),
      new Color('#b7a590'),
      new Color('#b3a897'),
    ];
    const haze = new Color('#a5acb6');
    for (const c of palette) c.lerp(haze, 0.18 + distanceFade * 0.46);

    const phaseA = hash01(seed, 302) * Math.PI * 2;
    const phaseB = hash01(seed, 303) * Math.PI * 2;
    const leanX = (hash01(seed, 304) - 0.5) * width * 0.09;
    const leanZ = (hash01(seed, 305) - 0.5) * depth * 0.09;
    const ringPoints: Point3[][] = [];

    for (let r = 0; r < profile.length; r++) {
      const ring = profile[r];
      const points: Point3[] = [];
      const rise = r / (profile.length - 1);
      for (let j = 0; j < radialSegments; j++) {
        const angle = (j / radialSegments) * Math.PI * 2;
        const broadErosion =
          1 +
          Math.sin(angle * 2 + phaseA) * 0.07 +
          Math.sin(angle * 5 + phaseB) * 0.045;
        const chippedRim =
          (hash01(seed * 173 + j, 306 + r) - 0.5) *
          (r >= profile.length - 2 ? 0.15 : 0.065);
        const topBreak =
          r === profile.length - 1
            ? (hash01(seed * 211 + j, 320) - 0.5) * height * 0.035
            : (hash01(seed * 211 + j, 321 + r) - 0.5) * height * 0.008;
        const radius = ring.radius * (broadErosion + chippedRim);
        points.push([
          Math.cos(angle) * width * radius + leanX * rise,
          ring.y * height + topBreak,
          Math.sin(angle) * depth * radius + leanZ * rise,
        ]);
      }
      ringPoints.push(points);
    }

    const faceColor = new Color();
    for (let r = 0; r < profile.length - 1; r++) {
      const low = ringPoints[r];
      const high = ringPoints[r + 1];
      for (let j = 0; j < radialSegments; j++) {
        const next = (j + 1) % radialSegments;
        faceColor
          .copy(palette[r])
          .multiplyScalar(0.94 + hash01(seed * 191 + j, 340 + r) * 0.12);
        if ((j + r) % 2 === 0) {
          pushTriangle(positions, colors, indices, low[j], high[next], low[next], faceColor);
          pushTriangle(positions, colors, indices, low[j], high[j], high[next], faceColor);
        } else {
          pushTriangle(positions, colors, indices, low[j], high[j], low[next], faceColor);
          pushTriangle(positions, colors, indices, low[next], high[j], high[next], faceColor);
        }
      }
    }

    const top = ringPoints[ringPoints.length - 1];
    const topProfile = profile[profile.length - 1];
    const topCenter: Point3 = [
      leanX,
      topProfile.y * height,
      leanZ,
    ];
    faceColor.copy(palette[palette.length - 1]).multiplyScalar(1.03);
    for (let j = 0; j < radialSegments; j++) {
      pushTriangle(
        positions,
        colors,
        indices,
        top[j],
        topCenter,
        top[(j + 1) % radialSegments],
        faceColor,
      );
    }

    return makeTriangleGeometry(positions, colors, indices);
  };

  // Broad primary remnants plus occasional lower shoulders make 15 geological
  // groups without producing the evenly spaced "three props" look.
  const COUNT = 15;
  const geos: BufferGeometry[] = [];
  for (let i = 0; i < COUNT; i++) {
    const angle = (i / COUNT) * Math.PI * 2 + (hash01(i, 1) - 0.5) * 0.36;
    const radius = 610 + hash01(i, 2) * 185;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const width = 74 + hash01(i, 3) * 72;
    const depth = 45 + hash01(i, 4) * 50;
    const height = 28 + hash01(i, 5) * 38;
    const distanceFade = Math.max(0, Math.min(1, (radius - 610) / 185));
    const geo = buildMesa(i, width, depth, height, distanceFade);
    // Long axis follows the horizon, as erosion remnants and cuestas do from
    // the central site, with only a small natural skew.
    geo.rotateY(Math.PI / 2 - angle + (hash01(i, 9) - 0.5) * 0.32);
    const groundY = terrainHeight(x, z);
    geo.translate(x, groundY - 5, z);
    geos.push(geo);

    if (hash01(i, 10) > 0.57) {
      const shoulderWidth = width * (0.42 + hash01(i, 11) * 0.2);
      const shoulderDepth = depth * (0.65 + hash01(i, 12) * 0.18);
      const shoulderHeight = height * (0.42 + hash01(i, 13) * 0.14);
      const shoulder = buildMesa(
        100 + i,
        shoulderWidth,
        shoulderDepth,
        shoulderHeight,
        Math.min(1, distanceFade + 0.08),
      );
      shoulder.rotateY(Math.PI / 2 - angle + (hash01(i, 14) - 0.5) * 0.42);
      const tangentX = -Math.sin(angle);
      const tangentZ = Math.cos(angle);
      const side = hash01(i, 15) < 0.5 ? -1 : 1;
      const offset = width * (0.64 + hash01(i, 16) * 0.12) * side;
      const sx = x + tangentX * offset;
      const sz = z + tangentZ * offset;
      shoulder.translate(sx, terrainHeight(sx, sz) - 4.2, sz);
      geos.push(shoulder);
    }
  }
  // Smooth the broad talus planes while retaining the sharp caprock breaks.
  // This removes visible low-poly triangle pinwheels at horizon distance.
  const mergedGeometry = toCreasedNormals(
    mergeGeometries(geos),
    Math.PI * 0.28,
  );
  mergedGeometry.computeBoundingSphere();
  const merged = new Mesh(mergedGeometry, material);
  merged.name = 'horizon-mesas-merged';
  merged.matrixAutoUpdate = false;
  merged.userData.noCollide = true;
  merged.userData.drawCalls = 1;
  merged.userData.geologicalMasses = geos.length;
  group.add(merged);
  return group;
}

// ---------------------------------------------------------------- rock rubble

function createRockRubble(): BatchedMesh {
  const geometries = [
    buildStoneGeometry(
      1,
      7,
      [
        { y: -0.46, radius: 0.7, offsetX: 0, offsetZ: 0, value: 0.72 },
        { y: -0.17, radius: 1.03, offsetX: -0.05, offsetZ: 0.03, value: 0.84 },
        { y: 0.25, radius: 0.83, offsetX: 0.04, offsetZ: 0, value: 0.94 },
        { y: 0.61, radius: 0.39, offsetX: 0.14, offsetZ: -0.06, value: 1.02 },
      ],
      0.82,
    ),
    buildStoneGeometry(
      2,
      8,
      [
        { y: -0.38, radius: 0.82, offsetX: 0, offsetZ: 0, value: 0.7 },
        { y: -0.12, radius: 1.08, offsetX: 0.02, offsetZ: -0.02, value: 0.83 },
        { y: 0.22, radius: 0.95, offsetX: -0.08, offsetZ: 0.05, value: 0.93 },
        { y: 0.44, radius: 0.58, offsetX: -0.2, offsetZ: 0.02, value: 1.01 },
        { y: 0.53, radius: 0.26, offsetX: -0.26, offsetZ: 0.08, value: 1.05 },
      ],
      0.68,
    ),
    buildStoneGeometry(
      3,
      6,
      [
        { y: -0.48, radius: 0.76, offsetX: 0, offsetZ: 0, value: 0.71 },
        { y: -0.2, radius: 1.02, offsetX: 0.08, offsetZ: -0.04, value: 0.82 },
        { y: 0.2, radius: 0.72, offsetX: 0.22, offsetZ: 0.02, value: 0.93 },
        { y: 0.65, radius: 0.18, offsetX: 0.36, offsetZ: 0.06, value: 1.02 },
      ],
      0.92,
    ),
  ];
  const material = new MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
    vertexColors: true,
    flatShading: true,
  });

  const rust = new Color('#987052');
  const tan = new Color('#a88d6d');
  const gray = new Color('#7b7871');
  const tint = new Color();

  const TARGET = 1600;
  const placements: BatchedPlacement[] = [];
  for (let i = 0; i < 250000 && placements.length < TARGET; i++) {
    // bias toward the monument so talus reads dense at the wall and flanks
    const r = Math.pow(hash01(i, 11), 1.2) * 200 + 8;
    const a = hash01(i, 12) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inStairSlot(x, z)) continue;
    if (slopeMag(x, z) <= 0.15) continue; // rubble collects on meaningful slopes
    if (inPyramidFootprint(x, z)) continue;

    // Large-scale wave interference creates erosion drifts and open sand gaps.
    const drift =
      0.5 +
      Math.sin(x * 0.071 + z * 0.031) * 0.26 +
      Math.sin(z * 0.053 - x * 0.024 + 1.7) * 0.24;
    if (hash01(i, 90) > Math.max(0.12, Math.min(0.92, drift))) continue;

    const sizeSeed = hash01(i, 13);
    let base = 0.17 + Math.pow(sizeSeed, 2.7) * 0.67;
    if (hash01(i, 91) > 0.975) base += 0.35 + hash01(i, 92) * 0.42;
    const geometryIndex = Math.floor(hash01(i, 17) * geometries.length);
    const sx = base * (0.84 + hash01(i, 14) * 0.48);
    const sy =
      base *
      (geometryIndex === 1
        ? 0.82 + hash01(i, 15) * 0.46
        : 1.04 + hash01(i, 15) * 0.58);
    const sz = base * (0.78 + hash01(i, 16) * 0.52);

    // Follow the slope, then spin around the local up axis. The lower geometry
    // ring remains buried, producing a stable contact rather than a point.
    terrainNormal(x, z, _normal);
    _quat.setFromUnitVectors(_up, _normal);
    _twist.setFromAxisAngle(_up, hash01(i, 18) * Math.PI * 2);
    _euler.set(
      (hash01(i, 99) - 0.5) * 0.24,
      0,
      (hash01(i, 100) - 0.5) * 0.24,
    );
    _rockTilt.setFromEuler(_euler);
    _quat.multiply(_twist).multiply(_rockTilt);
    const y = terrainHeight(x, z) + sy * 0.27;

    _pos.set(x, y, z);
    _scale.set(sx, sy, sz);
    _mat.compose(_pos, _quat, _scale);

    tint.lerpColors(rust, tan, hash01(i, 20));
    if (geometryIndex === 2 || hash01(i, 93) > 0.84) {
      tint.lerp(gray, 0.22 + hash01(i, 94) * 0.28);
    }
    tint.multiplyScalar(0.93 + hash01(i, 21) * 0.16);
    placements.push({
      geometryIndex,
      matrix: _mat.clone(),
      color: tint.clone(),
    });
  }

  const mesh = buildBatchedMesh(
    geometries,
    material,
    placements,
    'rock-rubble-scatter',
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.variantCount = geometries.length;
  mesh.userData.instanceCount = placements.length;
  mesh.userData.drawCalls = 1;
  return mesh;
}

// ---------------------------------------------------------------- gravel

function createGravel(): BatchedMesh {
  const geometries = [
    buildStoneGeometry(
      21,
      5,
      [
        { y: -0.34, radius: 0.86, offsetX: 0, offsetZ: 0, value: 0.72 },
        { y: -0.08, radius: 1.04, offsetX: 0.02, offsetZ: 0, value: 0.87 },
        { y: 0.3, radius: 0.48, offsetX: 0.12, offsetZ: 0.04, value: 1.02 },
      ],
      0.82,
    ),
    buildStoneGeometry(
      22,
      6,
      [
        { y: -0.29, radius: 0.9, offsetX: 0, offsetZ: 0, value: 0.74 },
        { y: -0.06, radius: 1.08, offsetX: -0.02, offsetZ: 0.02, value: 0.86 },
        { y: 0.2, radius: 0.82, offsetX: -0.1, offsetZ: 0.03, value: 0.96 },
        { y: 0.35, radius: 0.32, offsetX: -0.18, offsetZ: -0.02, value: 1.03 },
      ],
      0.68,
    ),
    buildStoneGeometry(
      23,
      5,
      [
        { y: -0.38, radius: 0.78, offsetX: 0, offsetZ: 0, value: 0.7 },
        { y: -0.11, radius: 1.02, offsetX: 0.04, offsetZ: -0.04, value: 0.85 },
        { y: 0.36, radius: 0.26, offsetX: 0.2, offsetZ: 0.05, value: 1.03 },
      ],
      0.96,
    ),
  ];
  const material = new MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
    vertexColors: true,
    flatShading: true,
  });

  const dark = new Color('#948d80');
  const light = new Color('#bdae96');
  const warm = new Color('#aa8c6f');
  const tint = new Color();

  const TARGET = 1500;
  const placements: BatchedPlacement[] = [];
  for (let i = 0; i < 90000 && placements.length < TARGET; i++) {
    let x: number;
    let z: number;
    if (hash01(i, 31) < 0.62) {
      // South forecourt leading directly to the front slit.
      x = (hash01(i, 32) - 0.5) * 26;
      z = 10 + hash01(i, 33) * 46;
    } else {
      // The visibly level plane behind the rear stair.
      x = (hash01(i, 34) - 0.5) * 48;
      z = -62 - hash01(i, 35) * 25;
    }
    if (inStairSlot(x, z) || inPyramidFootprint(x, z)) continue;

    const drift =
      0.52 +
      Math.sin(x * 0.46 + z * 0.16) * 0.23 +
      Math.sin(z * 0.31 - x * 0.19 + 0.8) * 0.2;
    if (hash01(i, 95) > Math.max(0.18, Math.min(0.9, drift))) continue;

    const s = 0.055 + Math.pow(hash01(i, 36), 1.7) * 0.115;
    const sx = s * (0.78 + hash01(i, 40) * 0.5);
    const sy = s * (0.62 + hash01(i, 41) * 0.34);
    const sz = s * (0.76 + hash01(i, 43) * 0.54);
    const y = terrainHeight(x, z) + sy * 0.22;

    terrainNormal(x, z, _normal);
    _quat.setFromUnitVectors(_up, _normal);
    _twist.setFromAxisAngle(_up, hash01(i, 38) * Math.PI * 2);
    _quat.multiply(_twist);
    _pos.set(x, y, z);
    _scale.set(sx, sy, sz);
    _mat.compose(_pos, _quat, _scale);

    const geometryIndex = Math.floor(hash01(i, 39) * geometries.length);
    tint.lerpColors(dark, light, hash01(i, 42));
    if (hash01(i, 96) > 0.78) tint.lerp(warm, 0.25 + hash01(i, 97) * 0.25);
    tint.multiplyScalar(0.94 + hash01(i, 98) * 0.13);
    placements.push({
      geometryIndex,
      matrix: _mat.clone(),
      color: tint.clone(),
    });
  }

  const mesh = buildBatchedMesh(geometries, material, placements, 'gravel-scatter');
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.variantCount = geometries.length;
  mesh.userData.instanceCount = placements.length;
  mesh.userData.drawCalls = 1;
  return mesh;
}

// ---------------------------------------------------------------- grass tufts

/**
 * Three tapered blade cards. This uses fewer triangles than the former
 * crossed rectangles and removes the field of obvious floating squares.
 */
function buildGrassGeometry(): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const halfWidth = 0.18;
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI;
    const tangentX = -Math.sin(angle);
    const tangentZ = Math.cos(angle);
    const leanX = Math.cos(angle) * 0.12;
    const leanZ = Math.sin(angle) * 0.12;
    const start = positions.length / 3;
    positions.push(
      tangentX * halfWidth,
      0,
      tangentZ * halfWidth,
      -tangentX * halfWidth,
      0,
      -tangentZ * halfWidth,
      leanX,
      1,
      leanZ,
    );
    indices.push(start, start + 1, start + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createGrassTufts(): InstancedMesh {
  const geometry = buildGrassGeometry();
  const material = new MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
    side: DoubleSide,
  });

  const straw = new Color('#cbb98a');
  const tint = new Color();

  const TARGET = 4200;
  const placements: Placement[] = [];
  for (let i = 0; i < 200000 && placements.length < TARGET; i++) {
    const r = Math.pow(hash01(i, 51), 0.85) * 230 + 6;
    const a = hash01(i, 52) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;

    if (Math.hypot(x - BOWL_CENTER.x, z - BOWL_CENTER.z) < BOWL_RADIUS + 4) continue;
    if (Math.abs(x) < 14 && z > 0 && z < TRENCH_SOUTH_Z + 4) continue;
    if (inPyramidFootprint(x, z)) continue;
    if (inStairSlot(x, z)) continue;
    if (slopeMag(x, z) > 0.42) continue; // gentle slopes only

    const h = 0.35 + hash01(i, 53) * 0.35; // 0.35–0.7 m tall
    const y = terrainHeight(x, z) - h * 0.3; // embed ~30% of the tuft base

    _euler.set(0, hash01(i, 54) * Math.PI * 2, (hash01(i, 55) - 0.5) * 0.22);
    _quat.setFromEuler(_euler);
    _pos.set(x, y, z);
    _scale.set(h * (1.5 + hash01(i, 56) * 0.9), h, h * (1.5 + hash01(i, 57) * 0.9));
    _mat.compose(_pos, _quat, _scale);

    // Pale straw with slight hue/value jitter.
    tint.copy(straw);
    tint.offsetHSL(
      (hash01(i, 58) - 0.5) * 0.05,
      (hash01(i, 59) - 0.5) * 0.14,
      (hash01(i, 60) - 0.5) * 0.1,
    );
    placements.push({ matrix: _mat.clone(), color: tint.clone() });
  }

  const mesh = buildInstancedMesh(geometry, material, placements, 'grass-tufts');
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.noCollide = true;
  return mesh;
}

// ---------------------------------------------------------------- entry point

export function createTerrain(desertMaterial: MeshStandardNodeMaterial): { group: Group } {
  const group = new Group();
  group.name = 'terrain';

  group.add(createGround(desertMaterial));
  group.add(createHorizonMesas());
  group.add(createRockRubble());
  group.add(createGravel());
  group.add(createGrassTufts());

  return { group };
}
