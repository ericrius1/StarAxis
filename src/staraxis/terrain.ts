/**
 * Terrain for the Star Axis site.
 *
 * Builds the displaced mesa ground plane, a ring of distant horizon mesas,
 * and three deterministic instanced scatter layers (rock rubble, gravel,
 * grass tufts). All ground elevations come from terrainHeight() — the single
 * analytic source of truth — and every placement derives from index-based
 * hashing so the landscape is identical on every load (no Math.random()).
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import { clamp, color, mix, positionWorld } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  APRON_FRONT_Z,
  APRON_HALF_WIDTH,
  APRON_REAR_Z,
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

/** Keep-out region above the star-tunnel stair slot. */
function inStairSlot(x: number, z: number): boolean {
  return (
    Math.abs(x) < 4.25 &&
    z > STAIR_BASE.z - 4 &&
    z < STAIR_TOP.z + 4
  );
}

function inPyramidFootprint(x: number, z: number): boolean {
  return Math.abs(x) < 16.5 && z > PYRAMID_REAR_Z - 1 && z < PYRAMID_FRONT_Z + 1;
}

const _pos = new Vector3();
const _quat = new Quaternion();
const _euler = new Euler();
const _scale = new Vector3();
const _mat = new Matrix4();

interface Placement {
  matrix: Matrix4;
  color: Color;
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
          Math.abs(x) < 6.5 && z > PYRAMID_FRONT_Z && z < 68
            ? Math.max(0, 1 - Math.abs(x) / 6.5)
            : 0;
        const apron =
          Math.abs(x) < APRON_HALF_WIDTH &&
          z < APRON_FRONT_Z &&
          z > APRON_REAR_Z
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
    roughness: 1.0,
    metalness: 0.0,
    flatShading: true,
  });
  // Muted blue-tan: hazier (bluer) at the base, warmer toward the caprock.
  material.colorNode = mix(
    color('#a39aa2'),
    color('#ab9d8e'),
    clamp(positionWorld.y.div(55.0), 0.0, 1.0),
  );

  // All mesa silhouettes baked into one geometry — a single draw call.
  const COUNT = 12;
  const geos: BufferGeometry[] = [];
  for (let i = 0; i < COUNT; i++) {
    const angle = (i / COUNT) * Math.PI * 2 + (hash01(i, 1) - 0.5) * 0.42;
    const radius = 600 + hash01(i, 2) * 300; // 600–900 m
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const baseRadius = 55 + hash01(i, 3) * 95;
    const topRadius = baseRadius * (0.45 + hash01(i, 4) * 0.3); // flat cap, tapered flanks
    const height = 26 + hash01(i, 5) * 44;
    const radialSegments = 5 + Math.floor(hash01(i, 6) * 3.999); // 5–8 facets

    const geo = new CylinderGeometry(topRadius, baseRadius, height, radialSegments, 1);
    geo.scale(1 + (hash01(i, 7) - 0.5) * 0.55, 1, 1 + (hash01(i, 8) - 0.5) * 0.55);
    geo.rotateY(hash01(i, 9) * Math.PI * 2);
    const groundY = terrainHeight(x, z);
    geo.translate(x, groundY + height / 2 - 6, z); // sink base to hide the seam
    geos.push(geo);
  }
  const merged = new Mesh(mergeGeometries(geos), material);
  merged.name = 'horizon-mesas-merged';
  merged.matrixAutoUpdate = false;
  group.add(merged);
  return group;
}

// ---------------------------------------------------------------- rock rubble

function createRockRubble(): InstancedMesh {
  const geometry = new IcosahedronGeometry(1, 0);
  const material = new MeshStandardNodeMaterial({
    color: 0xffffff, // tint comes from instanceColor
    roughness: 0.95,
    metalness: 0.02,
    flatShading: true,
  });

  const rust = new Color('#8f6a4c');
  const tan = new Color('#a89478');
  const tint = new Color();

  const TARGET = 2000;
  const placements: Placement[] = [];
  for (let i = 0; i < 250000 && placements.length < TARGET; i++) {
    // bias toward the monument so talus reads dense at the wall and flanks
    const r = Math.pow(hash01(i, 11), 1.2) * 200 + 8;
    const a = hash01(i, 12) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inStairSlot(x, z)) continue;
    if (slopeMag(x, z) <= 0.15) continue; // rubble collects on meaningful slopes
    if (inPyramidFootprint(x, z)) continue;

    // Non-uniform angular scale, each axis kept within 0.22–0.85 m.
    const base = 0.22 + hash01(i, 13) * 0.55;
    const jitter = (salt: number): number =>
      Math.min(0.85, Math.max(0.22, base * (0.65 + hash01(i, salt) * 0.7)));
    const sx = jitter(14);
    const sy = jitter(15);
    const sz = jitter(16);

    // Seat on the terrain, embedding ~30% of the rock height (2*sy) in soil.
    const y = terrainHeight(x, z) + sy * 0.4;

    _euler.set(
      hash01(i, 17) * Math.PI,
      hash01(i, 18) * Math.PI * 2,
      hash01(i, 19) * Math.PI,
    );
    _quat.setFromEuler(_euler);
    _pos.set(x, y, z);
    _scale.set(sx, sy, sz);
    _mat.compose(_pos, _quat, _scale);

    tint.lerpColors(rust, tan, hash01(i, 20));
    tint.multiplyScalar(0.88 + hash01(i, 21) * 0.24);
    placements.push({ matrix: _mat.clone(), color: tint.clone() });
  }

  const mesh = buildInstancedMesh(geometry, material, placements, 'rock-rubble-scatter');
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- gravel

function createGravel(): InstancedMesh {
  const geometry = new DodecahedronGeometry(1, 0);
  const material = new MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
    flatShading: true,
  });

  const dark = new Color('#8f8272');
  const light = new Color('#b3a48c');
  const tint = new Color();

  const TARGET = 1500;
  const placements: Placement[] = [];
  for (let i = 0; i < 60000 && placements.length < TARGET; i++) {
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

    const s = 0.06 + hash01(i, 36) * 0.09; // 0.06–0.15 m
    const y = terrainHeight(x, z) + 0.03; // seated just at grade, bottom embedded

    _euler.set(
      hash01(i, 37) * Math.PI,
      hash01(i, 38) * Math.PI * 2,
      hash01(i, 39) * Math.PI,
    );
    _quat.setFromEuler(_euler);
    _pos.set(x, y, z);
    _scale.set(s * (0.8 + hash01(i, 40) * 0.4), s, s * (0.8 + hash01(i, 41) * 0.4));
    _mat.compose(_pos, _quat, _scale);

    tint.lerpColors(dark, light, hash01(i, 42));
    placements.push({ matrix: _mat.clone(), color: tint.clone() });
  }

  const mesh = buildInstancedMesh(geometry, material, placements, 'gravel-scatter');
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- grass tufts

/** Two crossed vertical quads, base at y=0, unit height, up-facing normals. */
function buildGrassGeometry(): BufferGeometry {
  const w = 0.4; // half-width of each blade card
  // prettier-ignore
  const positions = new Float32Array([
    // quad A (XY plane)
    -w, 0, 0,   w, 0, 0,   w, 1, 0,   -w, 1, 0,
    // quad B (ZY plane)
    0, 0, -w,   0, 0, w,   0, 1, w,   0, 1, -w,
  ]);
  const normals = new Float32Array(24);
  for (let i = 0; i < 8; i++) normals[i * 3 + 1] = 1; // all (0,1,0): soft lighting
  // prettier-ignore
  const indices = [
    0, 1, 2,  0, 2, 3,
    4, 5, 6,  4, 6, 7,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setIndex(indices);
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

    if (
      Math.abs(x) < APRON_HALF_WIDTH + 2 &&
      z < APRON_FRONT_Z + 2 &&
      z > APRON_REAR_Z - 2
    ) continue; // preserve the authored flat apron and its crisp break lines
    if (Math.abs(x) < 9 && z > 8 && z < 66) continue; // keep the front approach clear
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
