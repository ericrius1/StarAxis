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
  MeshStandardNodeMaterial,
  Object3D,
  Quaternion,
  Shape,
  Vector3,
} from 'three/webgpu';

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
  HEADWALL,
  HOOD_BASE_HALF_WIDTH,
  HOOD_END_T,
  HOOD_START_T,
  HOOD_TOP_HALF_WIDTH,
  HOOD_WALL_HEIGHT,
  HOUR_WEDGE_DEG,
  HOUR_WEDGE_HEIGHT,
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
} from './constants';
import { stairPoint, crescentCrownY, TUNNEL_MOUTH_T } from './constants';
import { terrainHeight, trenchFloorY } from './heightfield';
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
  // down toward the south where the trench shallows out.
  for (const side of [-1, 1]) {
    const wall = new Group();
    wall.name = side < 0 ? 'entry-wall-west' : 'entry-wall-east';

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
      const geo = new BoxGeometry(1.4, h, Math.abs(z1 - z0) + 0.12);
      const m = shadowed(new Mesh(geo, mats.flagstone));
      m.position.set(side * (half + 0.7), floor + h / 2, zc);
      m.rotation.z = side * -ENTRY_WALL_LEAN_RAD;
      wall.add(m);

      // pale coping strip along the raked top edge (overlapped for continuity)
      const cop = shadowed(new Mesh(new BoxGeometry(1.7, 0.3, Math.abs(z1 - z0) + 0.55), mats.graniteCoping));
      const lean = side * -ENTRY_WALL_LEAN_RAD;
      cop.position.set(
        side * (half + 0.7) - Math.sin(lean) * (h / 2),
        floor + h + 0.1,
        zc,
      );
      cop.rotation.z = lean;
      wall.add(cop);
    }
    g.add(wall);
  }
  return g;
}

// ---------------------------------------------------------------- terrace + portal

function buildTerrace(mats: Mats): Group {
  const g = new Group();
  g.name = 'entry-terrace';

  // Retaining wall facing south, spanning the trench mouth.
  const wallH = TERRACE_TOP_Y - (trenchFloorY(TERRACE_Z) - 0.4);
  const wall = shadowed(new Mesh(new BoxGeometry(TERRACE_WIDTH, wallH, 2.4), mats.fieldstone));
  wall.position.set(0, trenchFloorY(TERRACE_Z) - 0.4 + wallH / 2, TERRACE_Z - 1.2);
  wall.name = 'terrace-retaining-face';
  g.add(wall);

  // Platform slab behind the wall up to the stair base.
  const platD = TERRACE_Z - (STAIR_BASE.z - 1.5);
  const plat = shadowed(new Mesh(new BoxGeometry(TERRACE_WIDTH, 1.0, platD), mats.fieldstone));
  plat.position.set(0, TERRACE_TOP_Y - 0.5, TERRACE_Z - 1.2 - platD / 2 + 1.2);
  plat.name = 'terrace-platform';
  g.add(plat);

  // ---- A-frame portal: triangular gable with a triangular void.
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

  // Inner steps rising through the portal void toward the stair base.
  const stepCount = 6;
  const steps = new InstancedMesh(new BoxGeometry(2.0, 0.18, 0.5), mats.granite, stepCount);
  steps.name = 'portal-inner-steps';
  const m4 = new Matrix4();
  for (let i = 0; i < stepCount; i++) {
    m4.setPosition(0, TERRACE_TOP_Y + 0.09 + i * 0.16, PORTAL_Z - 0.4 - i * 0.42);
    steps.setMatrixAt(i, m4);
  }
  shadowed(steps);
  g.add(steps);

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

  // ---- tunnel hood: the covered upper run. Mostly buried in the hillside;
  // from outside only the dark mouth face reads. Interior stays renderable
  // for the inside-the-tunnel viewpoint.
  const hood = new Group();
  hood.name = 'tunnel-hood';
  const hoodT0 = TUNNEL_MOUTH_T;
  const hoodT1 = HOOD_END_T;
  const p0 = stairPoint(hoodT0);
  const p1 = stairPoint(hoodT1);
  const hoodMid = { x: 0, y: (p0.y + p1.y) / 2, z: (p0.z + p1.z) / 2 };
  const hoodLen = slopeLen * (hoodT1 - hoodT0);
  const lean = Math.atan2(HOOD_BASE_HALF_WIDTH - HOOD_TOP_HALF_WIDTH, HOOD_WALL_HEIGHT);
  for (const side of [-1, 1]) {
    const slab = shadowed(new Mesh(new BoxGeometry(0.65, HOOD_WALL_HEIGHT + 0.6, hoodLen), mats.concreteDark));
    const off = (HOOD_BASE_HALF_WIDTH + HOOD_TOP_HALF_WIDTH) / 2;
    slab.position.set(side * off, hoodMid.y + HOOD_WALL_HEIGHT / 2 + 0.5, hoodMid.z);
    slab.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), slopeDir);
    slab.rotateZ(side * lean);
    hood.add(slab);
  }
  const cap = shadowed(new Mesh(new BoxGeometry(HOOD_TOP_HALF_WIDTH * 2 + 1.3, 0.55, hoodLen), mats.concreteDark));
  cap.position.set(0, hoodMid.y + HOOD_WALL_HEIGHT + 0.8, hoodMid.z);
  cap.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), slopeDir);
  hood.add(cap);

  // Mouth face: pale concrete portal frame around a dark opening where the
  // stair enters the hill (the strongest landmark on the lower run).
  const mouth = new Group();
  mouth.name = 'tunnel-mouth';
  const mouthP = stairPoint(hoodT0);
  // Two low cheek walls flanking the slot where it pierces the rim, with a
  // dark opening between them — reads like the reference, not a tower.
  for (const side of [-1, 1]) {
    const cheek = shadowed(new Mesh(new BoxGeometry(1.0, 3.4, 4.2), mats.concrete));
    cheek.position.set(side * (STAIR_WIDTH / 2 + 0.75), mouthP.y + 1.1, mouthP.z - 0.6);
    cheek.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), slopeDir);
    mouth.add(cheek);
  }
  const lintel = shadowed(new Mesh(new BoxGeometry(STAIR_WIDTH + 2.4, 0.8, 3.4), mats.concrete));
  lintel.position.set(0, mouthP.y + 3.1, mouthP.z - 1.4);
  lintel.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), slopeDir);
  mouth.add(lintel);
  const voidMat = new MeshStandardNodeMaterial();
  voidMat.color.set('#0c0b0a');
  voidMat.roughness = 1.0;
  const voidFace = new Mesh(new BoxGeometry(STAIR_WIDTH + 0.2, 3.2, 0.4), voidMat);
  voidFace.position.set(0, mouthP.y + 1.45, mouthP.z - 1.7);
  voidFace.rotation.x = -LATITUDE_RAD * 0.3;
  mouth.add(voidFace);
  g.add(hood, mouth);

  // ---- upper chamber: open concrete shell around the summit exit
  const chamber = new Group();
  chamber.name = 'upper-chamber';
  const chamberS = stairPoint(0.86);
  for (const side of [-1, 1]) {
    const wallLen = Math.abs(STAIR_TOP.z - 2.2 - chamberS.z);
    // walls sunk 2 m below grade so they seat into the summit dish cleanly
    const w = shadowed(new Mesh(new BoxGeometry(0.8, 6.6, wallLen), mats.concrete));
    w.position.set(side * 2.7, STAIR_TOP.y - 1.4, (chamberS.z + STAIR_TOP.z - 2.2) / 2);
    chamber.add(w);
  }
  g.add(chamber);

  // ---- headwall slab at the summit exit, with a real slot so sky shows
  // through the aperture bore
  const headwall = new Group();
  headwall.name = 'headwall-slab';
  const hwCx = 0;
  const hwCy = STAIR_TOP.y + 1.2; // center y ≈ 30
  const hwCz = STAIR_TOP.z - 0.9;
  const slotHalfW = 0.72;
  const slotBot = hwCy + 0.5; // slot spans the tube crossing height
  const slotTop = hwCy + 2.35;
  const hwTop = hwCy + HEADWALL.h / 2;
  const hwBot = hwCy - HEADWALL.h / 2;
  const sideW = HEADWALL.w / 2 - slotHalfW;
  for (const side of [-1, 1]) {
    const p = shadowed(new Mesh(new BoxGeometry(sideW, HEADWALL.h, HEADWALL.d), mats.concrete));
    p.position.set(side * (slotHalfW + sideW / 2), hwCy, hwCz);
    headwall.add(p);
  }
  const below = shadowed(new Mesh(new BoxGeometry(slotHalfW * 2, slotBot - hwBot, HEADWALL.d), mats.concrete));
  below.position.set(hwCx, (slotBot + hwBot) / 2, hwCz);
  headwall.add(below);
  const above = shadowed(new Mesh(new BoxGeometry(slotHalfW * 2, hwTop - slotTop, HEADWALL.d), mats.concrete));
  above.position.set(hwCx, (hwTop + slotTop) / 2, hwCz);
  headwall.add(above);
  g.add(headwall);

  // ---- brushed-steel aperture tube, axis parallel to Earth's axis
  const tube = new Group();
  tube.name = 'steel-aperture';
  const inner = new Mesh(
    new CylinderGeometry(APERTURE_INNER_RADIUS, APERTURE_INNER_RADIUS, APERTURE_LENGTH, 40, 1, true),
    mats.stainless,
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
    mats.stainless,
  );
  inner.material.side = 2; // DoubleSide so the bore interior renders
  tube.add(inner, outer);
  const axis = new Vector3(0, Math.sin(LATITUDE_RAD), -Math.cos(LATITUDE_RAD));
  tube.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), axis);
  tube.position.set(0, STAIR_TOP.y + 2.6, STAIR_TOP.z - 1.1);
  g.add(tube);

  return g;
}

// ---------------------------------------------------------------- solar pyramid

function buildSolarPyramid(mats: Mats): Group {
  const g = new Group();
  g.name = 'solar-pyramid';
  g.position.set(PYRAMID_CENTER.x, PYRAMID_BASE_Y, PYRAMID_CENTER.z);

  // Slightly south-shifted apex; square base rotated so one edge faces NE.
  const H = PYRAMID_HEIGHT;
  const B = PYRAMID_BASE_HALF;
  const apex = new Vector3(0, H, 1.5);
  const corners = [
    new Vector3(-B, 0, B * 0.85), // SW
    new Vector3(B, 0, B * 0.85), // SE
    new Vector3(B * 0.9, 0, -B), // NE
    new Vector3(-B * 0.9, 0, -B), // NW
  ];
  const pos: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, apex.x, apex.y, apex.z);
  }
  // base
  pos.push(
    corners[0].x, 0, corners[0].z,
    corners[2].x, 0, corners[2].z,
    corners[1].x, 0, corners[1].z,
    corners[0].x, 0, corners[0].z,
    corners[3].x, 0, corners[3].z,
    corners[2].x, 0, corners[2].z,
  );
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  const body = shadowed(new Mesh(geo, mats.pyramidSandstone));
  body.name = 'pyramid-body';
  g.add(body);

  // ---- hour chamber wedge: dark 15° slot inset on the south face,
  // opening toward the shadow field like the reference
  const wedgeHalf = Math.tan(((HOUR_WEDGE_DEG / 2) * Math.PI) / 180) * HOUR_WEDGE_HEIGHT;
  const wedgeShape = new Shape();
  wedgeShape.moveTo(-wedgeHalf, 0);
  wedgeShape.lineTo(wedgeHalf, 0);
  wedgeShape.lineTo(0, HOUR_WEDGE_HEIGHT);
  wedgeShape.closePath();
  const wedgeGeo = new ExtrudeGeometry(wedgeShape, { depth: 2.2, bevelEnabled: false });
  const voidBlack = new MeshStandardNodeMaterial();
  voidBlack.color.set('#0a0908');
  voidBlack.roughness = 1.0;
  const wedge = new Mesh(wedgeGeo, voidBlack);
  wedge.name = 'hour-chamber';
  // Lay the prism parallel to the south face plane, front sunk ~0.1 m in,
  // so the 15° aperture reads as a slot cut into the face.
  const faceLean = Math.atan2(B * 0.85 - 1.5, H); // face angle from vertical
  wedge.rotation.x = -faceLean;
  wedge.position.set(
    0,
    0.05 - 2.2 * Math.sin(faceLean),
    B * 0.85 + 0.04 - 2.2 * Math.cos(faceLean),
  );
  g.add(wedge);

  // ---- edge stair up the SE edge (facing the site approach, as in the
  // golden-hour reference photo)
  const neA = corners[1];
  const edgeDir = apex.clone().sub(neA);
  const edgeLen = edgeDir.length();
  edgeDir.normalize();
  const stepCount = 64;
  const edgeTreads = new InstancedMesh(new BoxGeometry(1.1, 0.14, 0.4), mats.granite, stepCount);
  edgeTreads.name = 'pyramid-edge-stair';
  const em = new Matrix4();
  const eq = new Quaternion();
  const yaw = Math.atan2(edgeDir.x, edgeDir.z);
  eq.setFromAxisAngle(new Vector3(0, 1, 0), yaw + Math.PI);
  for (let i = 0; i < stepCount; i++) {
    const t = (i + 0.5) / stepCount;
    const p = neA.clone().addScaledVector(edgeDir, t * edgeLen * 0.985);
    em.compose(new Vector3(p.x, p.y + 0.1, p.z), eq, new Vector3(1, 1, 1));
    edgeTreads.setMatrixAt(i, em);
  }
  shadowed(edgeTreads);
  g.add(edgeTreads);

  // twin stringers flanking the edge stair
  for (const side of [-1, 1]) {
    const s = shadowed(new Mesh(new BoxGeometry(0.35, 0.5, edgeLen * 0.99), mats.granite));
    const midP = neA.clone().addScaledVector(edgeDir, edgeLen * 0.5);
    const perp = new Vector3(-edgeDir.z, 0, edgeDir.x).normalize();
    s.position.copy(midP).addScaledVector(perp, side * 0.75).add(new Vector3(0, 0.15, 0));
    s.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), edgeDir);
    g.add(s);
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
          flagstone: gray, fieldstone: gray, ashlar: gray, granite: gray, graniteCoping: gray,
          pyramidSandstone: gray, stainless: gray, concrete: gray, concreteDark: gray,
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
