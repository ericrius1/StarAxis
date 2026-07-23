/**
 * Procedural factory for the Star Axis monument.
 *
 * Builds the five architectural systems as named component groups
 * (ids match the sculpt spec componentTree):
 *   entry-channel  — leaning flagstone walls flanking the south approach
 *   entry-terrace  — masonry terrace + freestanding A-frame portal
 *   crescent-wall  — the great arc wall around the excavated bowl + bastions
 *   star-tunnel    — 147-step stair at the latitude angle, hood, headwall,
 *                    brushed-steel aperture aimed at Polaris
 *   solar-pyramid  — solstice-angled pyramid, edge stair, hour-chamber wedge
 *
 * All geometry seats against the analytic heightfield so nothing floats.
 */

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  DoubleSide,
  MeshStandardNodeMaterial,
  Object3D,
  Path,
  Quaternion,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  BASTION_SIZE,
  BOWL_FLOOR_Y,
  CRESCENT_ARC_HALF_RAD,
  CRESCENT_RADIUS,
  CRESCENT_THICKNESS,
  CRESCENT_TOP_Y,
  COPING_HEIGHT,
  ENTRY_WALL_HEIGHT,
  ENTRY_WALL_LEAN_RAD,
  APERTURE_INNER_RADIUS,
  APERTURE_LENGTH,
  APERTURE_WALL,
  LATITUDE_RAD,
  PORTAL_BASE_HALF_WIDTH,
  PORTAL_DEPTH,
  PORTAL_HEIGHT,
  PORTAL_VOID_HALF_WIDTH,
  PORTAL_VOID_HEIGHT,
  PORTAL_Z,
  PYRAMID_BASE_HALF,
  PYRAMID_BASE_Y,
  PYRAMID_CENTER,
  PYRAMID_HEIGHT,
  STAIR_BASE,
  STAIR_STEP_COUNT,
  STAIR_STEP_RISE,
  STAIR_STEP_RUN,
  STAIR_TOP,
  STAIR_WIDTH,
  STRINGER_GAP_X,
  STRINGER_HEIGHT,
  STRINGER_WIDTH,
  TERRACE_TOP_Y,
  TERRACE_WIDTH,
  TERRACE_Z,
  TERRACE_STAIR_COUNT,
  TERRACE_STAIR_HALF_W,
  TERRACE_STAIR_RISE,
  TERRACE_STAIR_RUN,
  TERRACE_STAIR_TOP_Y,
  TERRACE_STAIR_TOP_Z,
} from './constants';
import { stairPoint, crescentCrownY, TUNNEL_MOUTH_T } from './constants';
import { terrainHeight, trenchFloorY } from './heightfield';
import { EYE_HEIGHT } from './walk';
import type { StarAxisMaterials } from './materials';

export interface StarAxisModel {
  group: Group;
  /** Component lookup by sculpt-spec id. */
  components: Record<string, Object3D>;
}

interface Mats {
  flagstone: MeshStandardNodeMaterial;
  fieldstone: MeshStandardNodeMaterial;
  ashlar: MeshStandardNodeMaterial;
  bronze: MeshStandardNodeMaterial;
  granite: MeshStandardNodeMaterial;
  graniteCoping: MeshStandardNodeMaterial;
  pyramidSandstone: MeshStandardNodeMaterial;
  stainless: MeshStandardNodeMaterial;
  concrete: MeshStandardNodeMaterial;
  concreteDark: MeshStandardNodeMaterial;
}

function shadowed<T extends Mesh | InstancedMesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- entry channel

function buildEntryChannel(mats: Mats): Group {
  const g = new Group();
  g.name = 'entry-channel';

  // Leaning wall: a tapered slab. Plan converges northward, top edge rakes
  // down toward the south where the trench shallows out. All segments are
  // baked into two merged meshes (wall + coping) — one draw call each
  // instead of 48.
  const wallGeos: BufferGeometry[] = [];
  const copGeos: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const segments = 12;
    const zSouth = 56;
    const zNorth = 2.4;
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const z0 = zSouth + (zNorth - zSouth) * t0;
      const z1 = zSouth + (zNorth - zSouth) * t1;
      const zc = (z0 + z1) / 2;
      // channel half-width narrows northward; wall height grows northward
      const half = 10.5 + (5.0 - 10.5) * ((zc - zSouth) / (zNorth - zSouth));
      const floor = trenchFloorY(zc) - 0.6;
      const h = ENTRY_WALL_HEIGHT * (0.35 + 0.65 * ((zSouth - zc) / (zSouth - zNorth)));
      const lean = side * -ENTRY_WALL_LEAN_RAD;

      const geo = new BoxGeometry(1.4, h, Math.abs(z1 - z0) + 0.12);
      geo.rotateZ(lean);
      geo.translate(side * (half + 0.7), floor + h / 2, zc);
      wallGeos.push(geo);

      // pale coping strip along the raked top edge (overlapped for continuity)
      const cop = new BoxGeometry(1.7, 0.3, Math.abs(z1 - z0) + 0.55);
      cop.rotateZ(lean);
      cop.translate(side * (half + 0.7) - Math.sin(lean) * (h / 2), floor + h + 0.1, zc);
      copGeos.push(cop);
    }
  }
  const wallMesh = shadowed(new Mesh(mergeGeometries(wallGeos), mats.flagstone));
  wallMesh.name = 'entry-wall-west'; // merged: west + east share the mesh
  const copMesh = shadowed(new Mesh(mergeGeometries(copGeos), mats.graniteCoping));
  copMesh.name = 'entry-wall-coping';
  g.add(wallMesh, copMesh);
  return g;
}

// ---------------------------------------------------------------- terrace + portal

function buildTerrace(mats: Mats): Group {
  const g = new Group();
  g.name = 'entry-terrace';

  // Retaining wall facing south, spanning the trench mouth.
  // Retaining wall split into two flanking blocks with a central notch for
  // the terrace stair — the real route from the entry path up to the court.
  // Faces sit proud of the platform (+0.15 z, +0.1 x) so no coplanar faces
  // z-fight where the masses meet.
  const wallH = TERRACE_TOP_Y - (trenchFloorY(TERRACE_Z) - 0.4);
  const wallW = (TERRACE_WIDTH + 0.2) / 2 - TERRACE_STAIR_HALF_W;
  for (const side of [-1, 1]) {
    const wall = shadowed(new Mesh(new BoxGeometry(wallW, wallH, 2.4), mats.fieldstone));
    wall.position.set(
      side * (TERRACE_STAIR_HALF_W + wallW / 2),
      trenchFloorY(TERRACE_Z) - 0.4 + wallH / 2,
      TERRACE_Z - 1.05,
    );
    wall.name = side < 0 ? 'terrace-retaining-west' : 'terrace-retaining-east';
    g.add(wall);
  }

  // Platform behind the wall up to the stair base; top raised 0.06 above
  // the court-floor terrain so the two never share a plane. Split into two
  // wings plus a short center slab so the stair flight's notch runs clear
  // — otherwise its south face blocks the capsule at the top of the climb.
  const platGeos: BufferGeometry[] = [];
  const platN = STAIR_BASE.z - 1.5; // north edge
  const wingD = TERRACE_Z - platN;
  const wingW = TERRACE_WIDTH / 2 - TERRACE_STAIR_HALF_W;
  for (const side of [-1, 1]) {
    const wing = new BoxGeometry(wingW, 1.0, wingD);
    wing.translate(side * (TERRACE_STAIR_HALF_W + wingW / 2), TERRACE_TOP_Y - 0.5 + 0.06, (TERRACE_Z + platN) / 2);
    platGeos.push(wing);
  }
  const centerN = platN;
  const centerS = TERRACE_STAIR_TOP_Z - 0.3; // stops where the flight begins
  const center = new BoxGeometry(TERRACE_STAIR_HALF_W * 2, 1.0, centerS - centerN);
  center.translate(0, TERRACE_TOP_Y - 0.5 + 0.06, (centerS + centerN) / 2);
  platGeos.push(center);
  const plat = shadowed(new Mesh(mergeGeometries(platGeos), mats.fieldstone));
  plat.name = 'terrace-platform';
  g.add(plat);

  // ---- terrace stair: the flight from path level up through the notch.
  const tSteps = new InstancedMesh(
    new BoxGeometry(TERRACE_STAIR_HALF_W * 2 - 0.4, 0.2, 0.32),
    mats.granite,
    TERRACE_STAIR_COUNT,
  );
  tSteps.name = 'terrace-stair';
  const tm = new Matrix4();
  for (let i = 0; i < TERRACE_STAIR_COUNT; i++) {
    const y = TERRACE_STAIR_TOP_Y - i * TERRACE_STAIR_RISE;
    const z = TERRACE_STAIR_TOP_Z + i * TERRACE_STAIR_RUN;
    tm.setPosition(0, y - 0.1, z);
    tSteps.setMatrixAt(i, tm);
  }
  shadowed(tSteps);
  g.add(tSteps);
  // solid masonry mass under the flight so its sides read as built stone
  const flightLen = Math.hypot(
    TERRACE_STAIR_COUNT * TERRACE_STAIR_RISE,
    TERRACE_STAIR_COUNT * TERRACE_STAIR_RUN,
  );
  const flightDir = new Vector3(0, TERRACE_STAIR_RISE, -TERRACE_STAIR_RUN).normalize();
  const flightFill = shadowed(
    new Mesh(new BoxGeometry(TERRACE_STAIR_HALF_W * 2 - 0.3, 3.0, flightLen + 0.6), mats.fieldstone),
  );
  const fq = new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), flightDir);
  const fDown = new Vector3(0, -1, 0).applyQuaternion(fq);
  flightFill.quaternion.copy(fq);
  flightFill.position
    .set(
      0,
      (TERRACE_STAIR_TOP_Y + (TERRACE_STAIR_TOP_Y - TERRACE_STAIR_COUNT * TERRACE_STAIR_RISE)) / 2,
      (TERRACE_STAIR_TOP_Z + (TERRACE_STAIR_TOP_Z + TERRACE_STAIR_COUNT * TERRACE_STAIR_RUN)) / 2,
    )
    .addScaledVector(fDown, 1.5 + 0.28);
  flightFill.name = 'terrace-stair-fill';
  g.add(flightFill);

  // ---- A-frame portal: triangular gable with a real triangular void.
  // This is the simplified Equatorial Chamber entrance: standing beneath it,
  // the apex notch frames the band of sky where equatorial stars cross.
  const outer = new Shape();
  outer.moveTo(-PORTAL_BASE_HALF_WIDTH, 0);
  outer.lineTo(PORTAL_BASE_HALF_WIDTH, 0);
  outer.lineTo(0, PORTAL_HEIGHT);
  outer.closePath();
  const voidTri = new Shape();
  voidTri.moveTo(-PORTAL_VOID_HALF_WIDTH, 0);
  voidTri.lineTo(PORTAL_VOID_HALF_WIDTH, 0);
  voidTri.lineTo(0, PORTAL_VOID_HEIGHT);
  voidTri.closePath();
  outer.holes.push(voidTri);
  const portalGeo = new ExtrudeGeometry(outer, { depth: PORTAL_DEPTH, bevelEnabled: false });
  portalGeo.translate(0, 0, -PORTAL_DEPTH / 2);
  const portal = shadowed(new Mesh(portalGeo, mats.fieldstone));
  portal.position.set(0, TERRACE_TOP_Y, PORTAL_Z);
  portal.name = 'triangle-portal';
  g.add(portal);

  // Bronze edging along the void jambs (Star Axis's fifth material).
  for (const side of [-1, 1]) {
    const jambLen = Math.hypot(PORTAL_VOID_HALF_WIDTH, PORTAL_VOID_HEIGHT);
    const jamb = new Mesh(new BoxGeometry(0.07, jambLen, PORTAL_DEPTH + 0.06), mats.bronze);
    jamb.position.set(side * (PORTAL_VOID_HALF_WIDTH / 2 + 0.03), TERRACE_TOP_Y + PORTAL_VOID_HEIGHT / 2, PORTAL_Z);
    jamb.rotation.z = side * Math.atan2(PORTAL_VOID_HALF_WIDTH, PORTAL_VOID_HEIGHT);
    jamb.userData.noCollide = true;
    g.add(jamb);
  }

  // Flat granite pavers through the void (the old rising steps clipped the
  // walker; the flight now lives in the terrace notch where it belongs).
  const pavers = new InstancedMesh(new BoxGeometry(2.0, 0.08, 0.55), mats.granite, 4);
  pavers.name = 'portal-inner-steps';
  const m4 = new Matrix4();
  for (let i = 0; i < 4; i++) {
    m4.setPosition(0, TERRACE_TOP_Y + 0.1, PORTAL_Z + 0.85 - i * 0.6);
    pavers.setMatrixAt(i, m4);
  }
  shadowed(pavers);
  g.add(pavers);

  return g;
}

// ---------------------------------------------------------------- crescent wall

const crownY = crescentCrownY;

function buildCrescentWall(mats: Mats): Group {
  const g = new Group();
  g.name = 'crescent-wall';

  const SEGS = 72;
  const positions: number[] = [];
  const indices: number[] = [];
  const rIn = CRESCENT_RADIUS;
  const rOut = CRESCENT_RADIUS + CRESCENT_THICKNESS;
  const batter = 0.9; // inner face leans back this much at the crown

  // ring vertices: for each arc step, 4 verts (inner-bottom, inner-top, outer-top, outer-bottom)
  for (let i = 0; i <= SEGS; i++) {
    const a = -CRESCENT_ARC_HALF_RAD + (2 * CRESCENT_ARC_HALF_RAD * i) / SEGS;
    const sx = Math.sin(a);
    const cz = -Math.cos(a);
    const top = crownY(a);
    const bottom = BOWL_FLOOR_Y - 1.5;
    positions.push(rIn * sx, bottom, rIn * cz);
    positions.push((rIn + batter) * sx, top, (rIn + batter) * cz);
    positions.push(rOut * sx, top, rOut * cz);
    positions.push(rOut * sx, bottom - 1, rOut * cz);
  }
  // Notch the wall where the stair slot pierces it (|a| < ~7.5°).
  const NOTCH = 0.13;
  const midA = (i: number): number =>
    -CRESCENT_ARC_HALF_RAD + (2 * CRESCENT_ARC_HALF_RAD * (i + 0.5)) / SEGS;
  for (let i = 0; i < SEGS; i++) {
    if (Math.abs(midA(i)) < NOTCH) continue;
    const b = i * 4;
    const n = (i + 1) * 4;
    // inner face (visible), top face, outer face
    indices.push(b, n, b + 1, n, n + 1, b + 1);
    indices.push(b + 1, n + 1, b + 2, n + 1, n + 2, b + 2);
    indices.push(b + 2, n + 2, b + 3, n + 2, n + 3, b + 3);
  }
  const wallGeo = new BufferGeometry();
  wallGeo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  wallGeo.setIndex(indices);
  wallGeo.computeVertexNormals();
  const wall = shadowed(new Mesh(wallGeo, mats.fieldstone));
  wall.name = 'crescent-arc-wall';
  g.add(wall);

  // Ashlar band: neat coursed blocks lining the top ~2.4 m of the inner face.
  const bandPos: number[] = [];
  const bandIdx: number[] = [];
  for (let i = 0; i <= SEGS; i++) {
    const a = -CRESCENT_ARC_HALF_RAD + (2 * CRESCENT_ARC_HALF_RAD * i) / SEGS;
    const sx = Math.sin(a);
    const cz = -Math.cos(a);
    const top = crownY(a);
    const rB = rIn + batter - 0.06; // just proud of the rubble face
    bandPos.push(rB * sx, top - 2.4, rB * cz);
    bandPos.push(rB * sx, top + 0.02, rB * cz);
  }
  for (let i = 0; i < SEGS; i++) {
    if (Math.abs(midA(i)) < NOTCH) continue;
    const b = i * 2;
    const n = (i + 1) * 2;
    indicesQuad(bandIdx, b, n, b + 1, n + 1);
  }
  const bandGeo = new BufferGeometry();
  bandGeo.setAttribute('position', new BufferAttribute(new Float32Array(bandPos), 3));
  bandGeo.setIndex(bandIdx);
  bandGeo.computeVertexNormals();
  const band = new Mesh(bandGeo, mats.ashlar);
  band.name = 'crescent-ashlar-band';
  band.receiveShadow = true;
  g.add(band);

  // Coping strip riding the crown.
  const copPos: number[] = [];
  const copIdx: number[] = [];
  for (let i = 0; i <= SEGS; i++) {
    const a = -CRESCENT_ARC_HALF_RAD + (2 * CRESCENT_ARC_HALF_RAD * i) / SEGS;
    const sx = Math.sin(a);
    const cz = -Math.cos(a);
    const top = crownY(a);
    const rI = rIn + batter - 0.15;
    const rO = rOut + 0.15;
    copPos.push(rI * sx, top, rI * cz);
    copPos.push(rI * sx, top + COPING_HEIGHT, rI * cz);
    copPos.push(rO * sx, top + COPING_HEIGHT, rO * cz);
    copPos.push(rO * sx, top, rO * cz);
  }
  for (let i = 0; i < SEGS; i++) {
    if (Math.abs(midA(i)) < NOTCH) continue;
    const b = i * 4;
    const n = (i + 1) * 4;
    indicesQuad(copIdx, b, n, b + 1, n + 1);
    indicesQuad(copIdx, b + 1, n + 1, b + 2, n + 2);
    indicesQuad(copIdx, b + 2, n + 2, b + 3, n + 3);
  }
  const copGeo = new BufferGeometry();
  copGeo.setAttribute('position', new BufferAttribute(new Float32Array(copPos), 3));
  copGeo.setIndex(copIdx);
  copGeo.computeVertexNormals();
  const coping = shadowed(new Mesh(copGeo, mats.graniteCoping));
  coping.name = 'coping-cap';
  g.add(coping);

  // Bastion pylons at the arc ends: battered truncated masses + pale caps.
  for (const side of [-1, 1]) {
    const a = side * CRESCENT_ARC_HALF_RAD;
    const sx = Math.sin(a);
    const cz = -Math.cos(a);
    const px = (rIn + 1.6) * sx;
    const pz = (rIn + 1.6) * cz;
    const baseY = Math.min(terrainHeight(px, pz), crownY(a) - 2);
    const h = crownY(a) + 1.6 - baseY;

    const bast = new Group();
    bast.name = side < 0 ? 'bastion-west' : 'bastion-east';
    const body = shadowed(
      new Mesh(new CylinderGeometry(BASTION_SIZE.w * 0.38, BASTION_SIZE.w * 0.62, h, 4, 1), mats.fieldstone),
    );
    body.rotation.y = Math.PI / 4 + a;
    body.position.set(px, baseY + h / 2, pz);
    bast.add(body);
    const cap = shadowed(
      new Mesh(new CylinderGeometry(BASTION_SIZE.w * 0.42, BASTION_SIZE.w * 0.42, 0.35, 4, 1), mats.graniteCoping),
    );
    cap.rotation.y = Math.PI / 4 + a;
    cap.position.set(px, baseY + h + 0.17, pz);
    bast.add(cap);
    g.add(bast);
  }

  return g;
}

function indicesQuad(out: number[], a: number, b: number, a1: number, b1: number): void {
  out.push(a, b, a1, b, b1, a1);
}

// ---------------------------------------------------------------- star tunnel

function buildStarTunnel(mats: Mats): Group {
  const g = new Group();
  g.name = 'star-tunnel';

  const slopeDir = new Vector3(0, STAIR_TOP.y - STAIR_BASE.y, STAIR_TOP.z - STAIR_BASE.z).normalize();
  const slopeLen = Math.hypot(STAIR_TOP.y - STAIR_BASE.y, STAIR_TOP.z - STAIR_BASE.z);

  // ---- 147 instanced treads
  const treadGeo = new BoxGeometry(STAIR_WIDTH, STAIR_STEP_RISE + 0.02, STAIR_STEP_RUN + 0.06);
  const treads = new InstancedMesh(treadGeo, mats.granite, STAIR_STEP_COUNT);
  treads.name = 'stair-run';
  const m4 = new Matrix4();
  for (let i = 0; i < STAIR_STEP_COUNT; i++) {
    const y = STAIR_BASE.y + (i + 0.5) * STAIR_STEP_RISE;
    const z = STAIR_BASE.z - (i + 0.5) * STAIR_STEP_RUN;
    m4.setPosition(0, y - (STAIR_STEP_RISE + 0.02) / 2 + 0.01, z);
    treads.setMatrixAt(i, m4);
  }
  shadowed(treads);
  g.add(treads);

  // Solid masonry embankment under the open run: the stair crosses the bowl
  // as a raised causeway, so it needs real mass from floor to treads.
  // The box is slope-rotated, so it must be offset along its own local down
  // axis — a world-Y offset would skew the top face up through the treads.
  const RAMP_DEPTH = 12;
  const ramp = shadowed(
    new Mesh(new BoxGeometry(STAIR_WIDTH + 3.0, RAMP_DEPTH, slopeLen + 1), mats.fieldstone),
  );
  const mid = stairPoint(0.5);
  const slopeQuat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), slopeDir);
  const localDown = new Vector3(0, -1, 0).applyQuaternion(slopeQuat);
  ramp.quaternion.copy(slopeQuat);
  // top face sits 0.25 m below the tread line, parallel to it
  ramp.position.copy(new Vector3(mid.x, mid.y, mid.z)).addScaledVector(localDown, RAMP_DEPTH / 2 + 0.25);
  ramp.name = 'stair-ramp-fill';
  g.add(ramp);

  // ---- stringer rails
  for (const side of [-1, 1]) {
    const s = shadowed(new Mesh(new BoxGeometry(STRINGER_WIDTH, STRINGER_HEIGHT, slopeLen + 2.5), mats.granite));
    s.name = side < 0 ? 'stringer-west' : 'stringer-east';
    s.position.set(side * STRINGER_GAP_X, mid.y + 0.35, mid.z);
    s.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), slopeDir);
    g.add(s);
  }

  // ---- open upper tunnel: one continuous pair of walls follows the stair
  // from the crescent notch to the oculus. Explicit world-vertical prisms
  // avoid the rotated-box corners that used to dip through the terrain.
  const hood = new Group();
  hood.name = 'open-star-tunnel';
  const axis = new Vector3(0, Math.sin(LATITUDE_RAD), -Math.cos(LATITUDE_RAD)).normalize();
  const start = stairPoint(TUNNEL_MOUTH_T);
  const p0 = new Vector3(start.x, start.y, start.z);
  const extension = 2.2;
  const p1 = new Vector3(STAIR_TOP.x, STAIR_TOP.y, STAIR_TOP.z).addScaledVector(axis, extension);
  const wallHeight = 6.5;
  const wallMat = mats.concreteDark.clone();
  wallMat.side = DoubleSide;
  for (const side of [-1, 1]) {
    const innerBottomX = side * 2.15;
    const outerBottomX = side * 3.15;
    const innerTopX = side * 1.62;
    const outerTopX = side * 2.38;
    const positions = new Float32Array([
      innerBottomX, p0.y - 0.45, p0.z,
      outerBottomX, p0.y - 0.45, p0.z,
      outerTopX, p0.y + wallHeight, p0.z,
      innerTopX, p0.y + wallHeight, p0.z,
      innerBottomX, p1.y - 0.45, p1.z,
      outerBottomX, p1.y - 0.45, p1.z,
      outerTopX, p1.y + wallHeight, p1.z,
      innerTopX, p1.y + wallHeight, p1.z,
    ]);
    const indices = [
      0, 1, 2, 0, 2, 3,
      4, 7, 6, 4, 6, 5,
      0, 3, 7, 0, 7, 4,
      1, 5, 6, 1, 6, 2,
      0, 4, 5, 0, 5, 1,
      3, 2, 6, 3, 6, 7,
    ];
    const wallGeo = new BufferGeometry();
    wallGeo.setAttribute('position', new BufferAttribute(positions, 3));
    wallGeo.setIndex(indices);
    wallGeo.computeVertexNormals();
    const slab = shadowed(new Mesh(wallGeo, wallMat));
    slab.name = side < 0 ? 'star-tunnel-wall-west' : 'star-tunnel-wall-east';
    hood.add(slab);
  }
  g.add(hood);

  // ---- oculus assembly. Its center lies on the exact continuation of the
  // stair visitor's eye line, so the bore stays concentric from every step.
  const topEye = new Vector3(STAIR_TOP.x, STAIR_TOP.y + EYE_HEIGHT, STAIR_TOP.z);
  const apertureCenter = topEye.clone().addScaledVector(axis, extension);

  // A real circular cutout replaces the old rectangular slot. The frame is
  // perpendicular to the polar axis and the steel tube passes cleanly through.
  const frameShape = new Shape();
  frameShape.moveTo(-3.4, -2.6);
  frameShape.lineTo(3.4, -2.6);
  frameShape.lineTo(3.4, 3.4);
  frameShape.lineTo(-3.4, 3.4);
  frameShape.closePath();
  const frameHole = new Path();
  frameHole.absarc(
    0,
    0,
    APERTURE_INNER_RADIUS + APERTURE_WALL + 0.06,
    0,
    Math.PI * 2,
    true,
  );
  frameShape.holes.push(frameHole);
  const headwall = shadowed(new Mesh(new ShapeGeometry(frameShape, 48), wallMat));
  headwall.name = 'headwall-circular-frame';
  headwall.position.copy(apertureCenter);
  headwall.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), axis.clone().negate());
  g.add(headwall);

  const tube = new Group();
  tube.name = 'steel-aperture';
  const tubeMat = mats.stainless.clone();
  tubeMat.side = DoubleSide;
  const inner = new Mesh(
    new CylinderGeometry(APERTURE_INNER_RADIUS, APERTURE_INNER_RADIUS, APERTURE_LENGTH, 40, 1, true),
    tubeMat,
  );
  const outer = new Mesh(
    new CylinderGeometry(
      APERTURE_INNER_RADIUS + APERTURE_WALL,
      APERTURE_INNER_RADIUS + APERTURE_WALL,
      APERTURE_LENGTH,
      40,
      1,
      true,
    ),
    tubeMat,
  );
  // A thin front annulus gives the close view the broad, shallow metal lip
  // visible in the reference instead of the former long telescope-bore look.
  const lipShape = new Shape();
  lipShape.absarc(0, 0, APERTURE_INNER_RADIUS + APERTURE_WALL, 0, Math.PI * 2, false);
  const lipHole = new Path();
  lipHole.absarc(0, 0, APERTURE_INNER_RADIUS, 0, Math.PI * 2, true);
  lipShape.holes.push(lipHole);
  const lip = new Mesh(new ShapeGeometry(lipShape, 48), tubeMat);
  // The group later maps local +Y to the polar axis, so this plane belongs
  // at the visitor-facing local -Y end of the cylinder.
  lip.position.set(0, -APERTURE_LENGTH / 2 - 0.006, 0);
  lip.rotation.x = -Math.PI / 2;
  tube.add(inner, outer, lip);
  tube.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), axis);
  tube.position.copy(apertureCenter);
  g.add(tube);

  return g;
}

// ---------------------------------------------------------------- solar pyramid

function buildSolarPyramid(mats: Mats): Group {
  const g = new Group();
  g.name = 'solar-pyramid';
  g.position.set(PYRAMID_CENTER.x, PYRAMID_BASE_Y, PYRAMID_CENTER.z);

  const H = PYRAMID_HEIGHT;
  const B = PYRAMID_BASE_HALF;
  const TOP = 1.3;
  const SOUTH_Z = B * 0.85;
  const NORTH_Z = -B * 1.45;
  const TOP_SOUTH_Z = 1.45;
  const TOP_NORTH_Z = -1.55;

  const southLeft = new Vector3(-B, 0, SOUTH_Z);
  const southRight = new Vector3(B, 0, SOUTH_Z);
  const northLeft = new Vector3(-B * 0.9, 0, NORTH_Z);
  const northRight = new Vector3(B * 0.9, 0, NORTH_Z);
  const topSouthLeft = new Vector3(-TOP, H, TOP_SOUTH_Z);
  const topSouthRight = new Vector3(TOP, H, TOP_SOUTH_Z);
  const topNorthLeft = new Vector3(-TOP, H, TOP_NORTH_Z);
  const topNorthRight = new Vector3(TOP, H, TOP_NORTH_Z);

  const quad = (a: Vector3, b: Vector3, c: Vector3, d: Vector3): BufferGeometry => {
    const q = new BufferGeometry();
    q.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([
          a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
          a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z,
        ]),
        3,
      ),
    );
    q.computeVertexNormals();
    return q;
  };

  const bodyMat = mats.pyramidSandstone.clone();
  bodyMat.side = DoubleSide;
  const shadowMat = mats.pyramidSandstone.clone();
  shadowMat.color.set('#66575a');
  shadowMat.roughness = 0.88;
  shadowMat.side = DoubleSide;

  // The real object is a truncated pylon. Broad side faces and a narrow top
  // cap replace the old point-apex triangle fan.
  const sideBody = shadowed(
    new Mesh(
      mergeGeometries([
        quad(southLeft, northLeft, topNorthLeft, topSouthLeft),
        quad(northRight, southRight, topSouthRight, topNorthRight),
      ]),
      shadowMat,
    ),
  );
  sideBody.name = 'pyramid-side-shells';
  g.add(sideBody);

  const summit = shadowed(
    new Mesh(quad(topSouthLeft, topNorthLeft, topNorthRight, topSouthRight), bodyMat),
  );
  summit.name = 'pyramid-truncated-cap';
  g.add(summit);

  // ---- south face: a grade-level triangular entrance plus a separate,
  // deep rectangular sight box near the summit.
  const M = new Vector3(0, 0, SOUTH_Z);
  const U = new Vector3(1, 0, 0);
  const Vd = new Vector3(0, H, TOP_SOUTH_Z).sub(M);
  const faceLen = Vd.length();
  Vd.divideScalar(faceLen);
  const Nf = new Vector3().crossVectors(U, Vd).normalize();
  const mapFace = (u: number, v: number, offset = 0): Vector3 =>
    new Vector3().copy(M).addScaledVector(U, u).addScaledVector(Vd, v).addScaledVector(Nf, offset);

  const entryHeight = 10.15;
  const entryHalfW = 1.38;
  const entryV1 = entryHeight / Vd.y;
  const sightY0 = 13.35;
  const sightY1 = 15.1;
  const sightV0 = sightY0 / Vd.y;
  const sightV1 = sightY1 / Vd.y;
  const sightHalfW = 1.48;

  const faceShape = new Shape();
  faceShape.moveTo(-B, 0);
  faceShape.lineTo(B, 0);
  faceShape.lineTo(TOP, faceLen);
  faceShape.lineTo(-TOP, faceLen);
  faceShape.closePath();
  const entryHole = new Path();
  entryHole.moveTo(-entryHalfW, 0.02);
  entryHole.lineTo(0, entryV1);
  entryHole.lineTo(entryHalfW, 0.02);
  entryHole.closePath();
  faceShape.holes.push(entryHole);
  const sightHole = new Path();
  sightHole.moveTo(-sightHalfW, sightV0);
  sightHole.lineTo(-sightHalfW, sightV1);
  sightHole.lineTo(sightHalfW, sightV1);
  sightHole.lineTo(sightHalfW, sightV0);
  sightHole.closePath();
  faceShape.holes.push(sightHole);

  const southGeo = new ShapeGeometry(faceShape);
  {
    const p = southGeo.getAttribute('position');
    const vtx = new Vector3();
    for (let i = 0; i < p.count; i++) {
      vtx.copy(mapFace(p.getX(i), p.getY(i)));
      p.setXYZ(i, vtx.x, vtx.y, vtx.z);
    }
    southGeo.computeVertexNormals();
  }
  // Double-sided: from inside the chamber the back of this face must read
  // as shadowed masonry, not get backface-culled into a see-through hole.
  const southMat = mats.pyramidSandstone.clone();
  southMat.side = DoubleSide;
  const southFace = shadowed(new Mesh(southGeo, southMat));
  southFace.name = 'pyramid-south-face';
  g.add(southFace);

  // ---- north face: a second true opening aligned with the entrance. The
  // visitor can walk through and see daylight at the far end.
  const northBase = new Vector3(0, 0, NORTH_Z);
  const northV = new Vector3(0, H, TOP_NORTH_Z).sub(northBase);
  const northFaceLen = northV.length();
  northV.divideScalar(northFaceLen);
  const northNormal = new Vector3().crossVectors(northV, U).normalize();
  const mapNorthFace = (u: number, v: number, offset = 0): Vector3 =>
    new Vector3()
      .copy(northBase)
      .addScaledVector(U, u)
      .addScaledVector(northV, v)
      .addScaledVector(northNormal, offset);

  const northOpeningV1 = entryHeight / northV.y;
  const northShape = new Shape();
  northShape.moveTo(-B * 0.9, 0);
  northShape.lineTo(B * 0.9, 0);
  northShape.lineTo(TOP, northFaceLen);
  northShape.lineTo(-TOP, northFaceLen);
  northShape.closePath();
  const northHole = new Path();
  northHole.moveTo(-entryHalfW, 0.02);
  northHole.lineTo(entryHalfW, 0.02);
  northHole.lineTo(0, northOpeningV1);
  northHole.closePath();
  northShape.holes.push(northHole);
  const northGeo = new ShapeGeometry(northShape);
  {
    const p = northGeo.getAttribute('position');
    const vtx = new Vector3();
    for (let i = 0; i < p.count; i++) {
      vtx.copy(mapNorthFace(p.getX(i), p.getY(i)));
      p.setXYZ(i, vtx.x, vtx.y, vtx.z);
    }
    northGeo.computeVertexNormals();
  }
  const northFace = shadowed(new Mesh(northGeo, southMat));
  northFace.name = 'pyramid-north-aperture';
  g.add(northFace);

  // ---- hour chamber: one continuous floor, two walls, and a narrow ceiling
  // span the entire body. MeshBasic keeps the surfaces legible in deep shade.
  const chamber = new Group();
  chamber.name = 'hour-chamber';
  const chamberDark = new MeshBasicNodeMaterial();
  chamberDark.color.set('#332b28');
  chamberDark.side = DoubleSide;
  const southSurfaceZ = (y: number): number => SOUTH_Z + (TOP_SOUTH_Z - SOUTH_Z) * (y / H);
  const northSurfaceZ = (y: number): number =>
    NORTH_Z + (TOP_NORTH_Z - NORTH_Z) * (y / H);
  const floorY = 0.09;
  const ceilingY = entryHeight - 0.08;
  const floorHalfW = entryHalfW - 0.05;
  const ceilingHalfW = 0.035;
  const southFloorZ = southSurfaceZ(floorY) - 0.08;
  const northFloorZ = northSurfaceZ(floorY) + 0.08;
  const southCeilingZ = southSurfaceZ(ceilingY) - 0.08;
  const northCeilingZ = northSurfaceZ(ceilingY) + 0.08;

  const floor = new Mesh(
    quad(
      new Vector3(-floorHalfW, floorY, southFloorZ),
      new Vector3(-floorHalfW, floorY, northFloorZ),
      new Vector3(floorHalfW, floorY, northFloorZ),
      new Vector3(floorHalfW, floorY, southFloorZ),
    ),
    chamberDark,
  );
  floor.name = 'hour-chamber-floor';

  const ceiling = new Mesh(
    quad(
      new Vector3(-ceilingHalfW, ceilingY, southCeilingZ),
      new Vector3(ceilingHalfW, ceilingY, southCeilingZ),
      new Vector3(ceilingHalfW, ceilingY, northCeilingZ),
      new Vector3(-ceilingHalfW, ceilingY, northCeilingZ),
    ),
    chamberDark,
  );
  ceiling.name = 'hour-chamber-ceiling';

  const leftWall = new Mesh(
    quad(
      new Vector3(-floorHalfW, floorY, southFloorZ),
      new Vector3(-ceilingHalfW, ceilingY, southCeilingZ),
      new Vector3(-ceilingHalfW, ceilingY, northCeilingZ),
      new Vector3(-floorHalfW, floorY, northFloorZ),
    ),
    chamberDark,
  );
  leftWall.name = 'hour-chamber-west-wall';

  const rightWall = new Mesh(
    quad(
      new Vector3(floorHalfW, floorY, southFloorZ),
      new Vector3(floorHalfW, floorY, northFloorZ),
      new Vector3(ceilingHalfW, ceilingY, northCeilingZ),
      new Vector3(ceilingHalfW, ceilingY, southCeilingZ),
    ),
    chamberDark,
  );
  rightWall.name = 'hour-chamber-east-wall';

  chamber.add(
    floor,
    ceiling,
    leftWall,
    rightWall,
  );
  g.add(chamber);

  // Deep entrance reveals make the shell thickness readable on approach.
  const REVEAL = 0.72;
  const edgeQuads: Array<[Vector3, Vector3, Vector3, Vector3]> = [
    [mapFace(-entryHalfW, 0.02), mapFace(0, entryV1), mapFace(0, entryV1, -REVEAL), mapFace(-entryHalfW, 0.02, -REVEAL)],
    [mapFace(entryHalfW, 0.02), mapFace(entryHalfW, 0.02, -REVEAL), mapFace(0, entryV1, -REVEAL), mapFace(0, entryV1)],
    [mapFace(-entryHalfW, 0.02), mapFace(-entryHalfW, 0.02, -REVEAL), mapFace(entryHalfW, 0.02, -REVEAL), mapFace(entryHalfW, 0.02)],
  ];
  for (const [a, b, c, d] of edgeQuads) {
    const plate = new Mesh(quad(a, b, c, d), chamberDark);
    plate.material.side = DoubleSide;
    chamber.add(plate);
  }

  // ---- upper rectangular sight box and shallow, separately modeled oculus.
  const sightCenterV = (sightV0 + sightV1) / 2;
  const oculusR = 0.53;
  const oculusWall = 0.075;
  const oculusLength = 0.72;
  const recess = new Shape();
  recess.moveTo(-sightHalfW, -(sightV1 - sightV0) / 2);
  recess.lineTo(sightHalfW, -(sightV1 - sightV0) / 2);
  recess.lineTo(sightHalfW, (sightV1 - sightV0) / 2);
  recess.lineTo(-sightHalfW, (sightV1 - sightV0) / 2);
  recess.closePath();
  const recessOculus = new Path();
  recessOculus.absarc(0, -0.25, oculusR + 0.015, 0, Math.PI * 2, true);
  recess.holes.push(recessOculus);
  const recessMesh = new Mesh(new ShapeGeometry(recess, 48), chamberDark);
  recessMesh.name = 'pyramid-upper-sight-box';
  recessMesh.position.copy(mapFace(0, sightCenterV, -0.055));
  recessMesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), Nf);
  g.add(recessMesh);

  const oculusAxisCenter = mapFace(0, sightCenterV - 0.25, oculusLength / 2 - 0.04);
  const oculusGroup = new Group();
  oculusGroup.name = 'pyramid-solar-oculus';
  oculusGroup.position.copy(oculusAxisCenter);
  oculusGroup.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), Nf);
  const oculusMat = mats.stainless.clone();
  oculusMat.side = DoubleSide;
  const oculusInner = new Mesh(
    new CylinderGeometry(oculusR, oculusR, oculusLength, 48, 1, true),
    oculusMat,
  );
  const oculusOuter = new Mesh(
    new CylinderGeometry(oculusR + oculusWall, oculusR + oculusWall, oculusLength, 48, 1, true),
    oculusMat,
  );
  const oculusLipShape = new Shape();
  oculusLipShape.absarc(0, 0, oculusR + oculusWall, 0, Math.PI * 2, false);
  const oculusLipHole = new Path();
  oculusLipHole.absarc(0, 0, oculusR, 0, Math.PI * 2, true);
  oculusLipShape.holes.push(oculusLipHole);
  const oculusLip = new Mesh(new ShapeGeometry(oculusLipShape, 48), oculusMat);
  oculusLip.position.y = oculusLength / 2 + 0.006;
  oculusLip.rotation.x = Math.PI / 2;
  oculusGroup.add(oculusInner, oculusOuter, oculusLip);
  g.add(oculusGroup);

  // ---- irregular coursed joints. A single merged mesh replaces the old
  // uniform runtime checker shader while retaining visible slab structure.
  const seamGeos: BufferGeometry[] = [];
  const faceBasis = new Matrix4().makeBasis(U, Vd, Nf);
  faceBasis.setPosition(M.clone().addScaledVector(Nf, 0.014));
  const addSeam = (u0: number, v0: number, u1: number, v1: number, thickness = 0.035) => {
    const du = u1 - u0;
    const dv = v1 - v0;
    const length = Math.hypot(du, dv);
    if (length < 0.08) return;
    const line = new BoxGeometry(length, thickness, 0.025);
    const local = new Matrix4().makeRotationZ(Math.atan2(dv, du));
    local.setPosition((u0 + u1) / 2, (v0 + v1) / 2, 0);
    line.applyMatrix4(local);
    line.applyMatrix4(faceBasis);
    seamGeos.push(line);
  };
  const halfAtY = (y: number) => B + (TOP - B) * (y / H);
  const blockedAtY = (y: number): Array<[number, number]> => {
    if (y <= entryHeight) {
      const hw = entryHalfW * (1 - y / entryHeight);
      return [[-hw, hw]];
    }
    if (y >= sightY0 && y <= sightY1) return [[-sightHalfW, sightHalfW]];
    return [];
  };
  const openSegments = (minU: number, maxU: number, blocks: Array<[number, number]>) => {
    let segments: Array<[number, number]> = [[minU, maxU]];
    for (const [b0, b1] of blocks) {
      segments = segments.flatMap(([a, b]) => {
        if (b1 <= a || b0 >= b) return [[a, b] as [number, number]];
        const pieces: Array<[number, number]> = [];
        if (b0 > a) pieces.push([a, b0]);
        if (b1 < b) pieces.push([b1, b]);
        return pieces;
      });
    }
    return segments;
  };
  const courseYs = [1.45, 3.0, 4.55, 6.15, 7.8, 9.55, 11.25, 12.85, 14.3, 15.55];
  for (const y of courseYs) {
    const v = y / Vd.y;
    for (const [u0, u1] of openSegments(-halfAtY(y), halfAtY(y), blockedAtY(y))) {
      addSeam(u0, v, u1, v, 0.045);
    }
  }
  const bounds = [0, ...courseYs, H];
  for (let row = 0; row < bounds.length - 1; row++) {
    const y0 = bounds[row] + 0.08;
    const y1 = bounds[row + 1] - 0.08;
    const ym = (y0 + y1) / 2;
    const half = halfAtY(ym);
    const step = 2.15 + (row % 3) * 0.24;
    const offset = ((row * 0.73) % step) - step * 0.5;
    for (let u = -half + step + offset; u < half - 0.4; u += step) {
      if (blockedAtY(ym).some(([a, b]) => u > a - 0.12 && u < b + 0.12)) continue;
      const slant = (((row + Math.round(u * 3)) % 5) - 2) * 0.055;
      addSeam(u - slant, y0 / Vd.y, u + slant, y1 / Vd.y, 0.035);
    }
  }
  const seamMat = new MeshBasicNodeMaterial();
  seamMat.color.set('#4d3732');
  const frontJoints = new Mesh(mergeGeometries(seamGeos), seamMat);
  frontJoints.name = 'pyramid-irregular-stone-joints';
  frontJoints.receiveShadow = true;
  g.add(frontJoints);

  // ---- edge stair on the photographed left slope.
  const edgeStart = northLeft;
  const edgeEnd = topNorthLeft;
  const edgeDir = edgeEnd.clone().sub(edgeStart);
  const edgeLen = edgeDir.length();
  edgeDir.normalize();
  const stepCount = 54;
  const edgeTreads = new InstancedMesh(new BoxGeometry(0.9, 0.14, 0.46), mats.granite, stepCount);
  edgeTreads.name = 'pyramid-edge-stair';
  const em = new Matrix4();
  const eq = new Quaternion();
  const yaw = Math.atan2(edgeDir.x, edgeDir.z);
  eq.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  for (let i = 0; i < stepCount; i++) {
    const t = (i + 0.5) / stepCount;
    const p = edgeStart.clone().addScaledVector(edgeDir, t * edgeLen * 0.985);
    em.compose(new Vector3(p.x - 0.18, p.y + 0.1, p.z + 0.12), eq, new Vector3(1, 1, 1));
    edgeTreads.setMatrixAt(i, em);
  }
  // Keep the treads visible without projecting 54 long, corrugated shadow
  // bands across the entire side face.
  edgeTreads.castShadow = false;
  edgeTreads.receiveShadow = true;
  g.add(edgeTreads);

  // Twin rails retain the stair as a legible assembly from the side.
  for (const side of [-1, 1]) {
    const s = shadowed(new Mesh(new BoxGeometry(0.35, 0.5, edgeLen * 0.99), mats.granite));
    const midP = edgeStart.clone().addScaledVector(edgeDir, edgeLen * 0.5);
    const perp = new Vector3(-edgeDir.z, 0, edgeDir.x).normalize();
    s.position.copy(midP).addScaledVector(perp, side * 0.58).add(new Vector3(0, 0.12, 0));
    s.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), edgeDir);
    g.add(s);
  }

  // ---- paired summit rods seen against the sky in the exterior reference.
  for (const x of [-0.58, 0.58]) {
    const rod = shadowed(new Mesh(new CylinderGeometry(0.045, 0.045, 0.92, 10), mats.stainless));
    rod.position.set(x, H + 0.46, -0.1);
    rod.name = x < 0 ? 'summit-rod-west' : 'summit-rod-east';
    g.add(rod);
  }

  return g;
}

// ---------------------------------------------------------------- assembly

export function createStarAxis(materials: StarAxisMaterials, options?: { blockout?: boolean }): StarAxisModel {
  const mats: Mats = options?.blockout
    ? (() => {
        const gray = new MeshStandardNodeMaterial();
        gray.color.set('#9a958c');
        return {
          flagstone: gray, fieldstone: gray, ashlar: gray, bronze: gray, granite: gray,
          graniteCoping: gray, pyramidSandstone: gray, stainless: gray, concrete: gray,
          concreteDark: gray,
        };
      })()
    : materials;

  const group = new Group();
  group.name = 'star-axis';

  const entry = buildEntryChannel(mats);
  const terrace = buildTerrace(mats);
  const crescent = buildCrescentWall(mats);
  const tunnel = buildStarTunnel(mats);
  const pyramid = buildSolarPyramid(mats);
  group.add(entry, terrace, crescent, tunnel, pyramid);

  const components: Record<string, Object3D> = {};
  group.traverse((o) => {
    if (o.name) components[o.name] = o;
  });

  group.userData.sculptRuntime = {
    spec: 'star-axis',
    componentIds: Object.keys(components),
    sockets: {
      'socket-polaris': { position: [STAIR_BASE.x, STAIR_BASE.y, STAIR_BASE.z] },
      'socket-summit': { position: [PYRAMID_CENTER.x, PYRAMID_BASE_Y, PYRAMID_CENTER.z] },
    },
  };

  return { group, components };
}
