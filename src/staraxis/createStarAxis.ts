/**
 * Procedural factory for the rebuilt Star Axis monument.
 *
 * The former scene treated the stair, earthwork and pyramid as independent
 * attractions.  This factory makes the intended reading unambiguous:
 *
 *   south/front  — a narrow Hour Chamber slit cut into the pyramid
 *   north/rear   — the 147-step Star Tunnel carved into that same shell
 *   summit       — one aperture/upper room shared by the whole mass
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
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Object3D,
  Path,
  PlaneGeometry,
  Quaternion,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector3,
} from 'three/webgpu';

import {
  APERTURE_INNER_RADIUS,
  APERTURE_LENGTH,
  APERTURE_WALL,
  APRON_HEIGHT,
  FRONT_CHAMBER_DEPTH,
  FRONT_SLIT_HALF_WIDTH,
  FRONT_SLIT_TOP_Y,
  PYRAMID_APEX,
  PYRAMID_BASE_HALF,
  PYRAMID_BASE_Y,
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
} from './constants';
import type { StarAxisMaterials } from './materials';

export interface StarAxisModel {
  group: Group;
  components: Record<string, Object3D>;
}

interface Mats {
  shell: MeshStandardNodeMaterial;
  cutStone: MeshStandardNodeMaterial;
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

/** Point on the south/front face at an absolute Y elevation. */
function frontFacePoint(x: number, y: number): [number, number, number] {
  const t = (y - PYRAMID_BASE_Y) / (PYRAMID_APEX.y - PYRAMID_BASE_Y);
  return [x, y, PYRAMID_FRONT_Z + (PYRAMID_TOP_FRONT_Z - PYRAMID_FRONT_Z) * t];
}

/** Point on the north/rear face at an absolute Y elevation. */
function rearFacePoint(x: number, y: number): [number, number, number] {
  const t = (y - PYRAMID_BASE_Y) / (PYRAMID_APEX.y - PYRAMID_BASE_Y);
  return [x, y, PYRAMID_REAR_Z + (PYRAMID_TOP_REAR_Z - PYRAMID_REAR_Z) * t];
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

  // South/front face: two wings and a cap leave a real tapered slit.
  const slitBottomL = frontFacePoint(-FRONT_SLIT_HALF_WIDTH, y0);
  const slitBottomR = frontFacePoint(FRONT_SLIT_HALF_WIDTH, y0);
  const slitTopHalf = 0.18;
  const slitTopL = frontFacePoint(-slitTopHalf, FRONT_SLIT_TOP_Y);
  const slitTopR = frontFacePoint(slitTopHalf, FRONT_SLIT_TOP_Y);
  shell.add(
    faceMesh(
      'pyramid-front-west',
      [sfL, slitBottomL, slitTopL, tfL],
      [0, 1, 2, 0, 2, 3],
      mats.shell,
    ),
    faceMesh(
      'pyramid-front-east',
      [slitBottomR, sfR, tfR, slitTopR],
      [0, 1, 2, 0, 2, 3],
      mats.shell,
    ),
    faceMesh(
      'pyramid-front-cap',
      [slitTopL, slitTopR, tfR, tfL],
      [0, 1, 2, 0, 2, 3],
      mats.shell,
    ),
  );

  // North/rear face: the shell parts around one continuous stair excavation.
  const notchBottomHalf = STAIR_WIDTH / 2 + 1.05;
  const notchTopY = 34.3;
  const notchTopHalf = 1.92;
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

  return shell;
}

// ---------------------------------------------------------------- front slit / Hour Chamber

function buildFrontChamber(mats: Mats): Group {
  const chamber = new Group();
  chamber.name = 'front-slit-chamber';

  // Recessed floor and ceiling carry the eye into the black interior instead
  // of making the slit read as a decal painted on the facade.
  const floor = shadowed(
    new Mesh(
      new BoxGeometry(FRONT_SLIT_HALF_WIDTH * 2 - 0.12, 0.16, FRONT_CHAMBER_DEPTH),
      mats.darkStone,
    ),
  );
  floor.name = 'hour-chamber-floor';
  floor.position.set(0, PYRAMID_BASE_Y + 0.02, PYRAMID_FRONT_Z - FRONT_CHAMBER_DEPTH / 2);
  chamber.add(floor);

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

  // A deep shadow terminus with one cold sighting point provides depth when
  // viewed from the front, while remaining non-colliding.
  const shadow = new Mesh(
    new PlaneGeometry(FRONT_SLIT_HALF_WIDTH * 1.8, 7.5),
    new MeshBasicNodeMaterial({ color: '#07090c', side: DoubleSide }),
  );
  shadow.name = 'hour-chamber-shadow';
  shadow.position.set(0, PYRAMID_BASE_Y + 7.1, PYRAMID_FRONT_Z - FRONT_CHAMBER_DEPTH + 0.2);
  shadow.userData.noCollide = true;
  chamber.add(shadow);

  const sight = new Mesh(
    new CircleGeometry(0.13, 24),
    new MeshBasicNodeMaterial({ color: '#cfe8ff', side: DoubleSide }),
  );
  sight.name = 'hour-chamber-sighting-point';
  sight.position.set(0, PYRAMID_BASE_Y + 12.4, shadow.position.z + 0.025);
  sight.userData.noCollide = true;
  chamber.add(sight);

  return chamber;
}

// ---------------------------------------------------------------- rear stair / Star Tunnel

function buildRearStair(mats: Mats): Group {
  const stair = new Group();
  stair.name = 'rear-star-tunnel-stair';

  const stepGeometry = new BoxGeometry(
    STAIR_WIDTH,
    Math.max(0.16, STAIR_STEP_RISE + 0.025),
    STAIR_STEP_RUN + 0.055,
  );
  const steps = new InstancedMesh(stepGeometry, mats.stair, STAIR_STEP_COUNT);
  steps.name = 'star-tunnel-147-steps';
  const matrix = new Matrix4();
  for (let i = 0; i < STAIR_STEP_COUNT; i++) {
    const y = STAIR_BASE.y + (i + 1) * STAIR_STEP_RISE;
    const z = STAIR_BASE.z + (i + 0.5) * STAIR_STEP_RUN;
    matrix.setPosition(STAIR_BASE.x, y - 0.08, z);
    steps.setMatrixAt(i, matrix);
  }
  steps.instanceMatrix.needsUpdate = true;
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
  flight.position
    .copy(new Vector3(STAIR_BASE.x, STAIR_BASE.y, STAIR_BASE.z))
    .add(new Vector3(STAIR_TOP.x, STAIR_TOP.y, STAIR_TOP.z))
    .multiplyScalar(0.5)
    .add(new Vector3(0, -0.48, 0));
  flight.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), runDirection.clone().normalize());
  stair.add(flight);

  // Pale granite stringers visually bind the staircase into the rear cut.
  for (const side of [-1, 1]) {
    const offset = new Vector3(side * STRINGER_GAP_X, 0.3, 0);
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
  const topY = 34.3;
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
  const apertureY = 36.0;

  const wallShape = new Shape();
  wallShape.moveTo(-2.25, 0);
  wallShape.lineTo(2.25, 0);
  wallShape.lineTo(2.25, 5.6);
  wallShape.lineTo(-2.25, 5.6);
  wallShape.closePath();
  const hole = new Path();
  hole.absarc(0, 3.7, APERTURE_INNER_RADIUS, 0, Math.PI * 2, false);
  wallShape.holes.push(hole);

  const headwall = shadowed(new Mesh(new ShapeGeometry(wallShape, 32), mats.darkStone));
  headwall.name = 'upper-room-headwall';
  headwall.position.set(0, 32.3, -18.25);
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
  bore.rotation.x = Math.PI / 2;
  bore.position.set(0, apertureY, -18.78);
  upper.add(bore);

  const ring = shadowed(
    new Mesh(new TorusGeometry(outerRadius, APERTURE_WALL, 10, 48), mats.steel),
  );
  ring.name = 'polaris-aperture-rim';
  ring.position.set(0, apertureY, -19.38);
  upper.add(ring);

  // The bore remains readable in both day and night captures.  It is a
  // distant sky card, not a plug at the front of the opening.
  const skyDisc = new Mesh(
    new CircleGeometry(APERTURE_INNER_RADIUS * 0.97, 48),
    new MeshBasicNodeMaterial({ color: '#17314d', side: DoubleSide }),
  );
  skyDisc.name = 'aperture-sky';
  skyDisc.position.set(0, apertureY, -19.29);
  skyDisc.userData.noCollide = true;
  upper.add(skyDisc);

  const star = new Mesh(
    new CircleGeometry(0.055, 20),
    new MeshBasicNodeMaterial({ color: '#ffffff', side: DoubleSide }),
  );
  star.name = 'polaris-point';
  star.position.set(0, apertureY, -19.27);
  star.userData.noCollide = true;
  upper.add(star);

  // The same bore exits through the south/front face above the vertical
  // slit.  This is the key front/back relationship in the supplied photos:
  // the visitor climbs the rear stair to the hole that is also visible on
  // the pyramid's front elevation.
  const frontSurface = new Vector3(...frontFacePoint(0, apertureY));
  const frontNormal = new Vector3(0, 0.8, 1).normalize();
  const frontRotation = new Quaternion().setFromUnitVectors(
    new Vector3(0, 0, 1),
    frontNormal,
  );
  const frontRim = shadowed(
    new Mesh(new TorusGeometry(outerRadius, APERTURE_WALL * 1.25, 12, 48), mats.steel),
  );
  frontRim.name = 'front-polaris-aperture-rim';
  frontRim.position.copy(frontSurface).addScaledVector(frontNormal, 0.11);
  frontRim.quaternion.copy(frontRotation);
  upper.add(frontRim);

  const frontSky = new Mesh(
    new CircleGeometry(APERTURE_INNER_RADIUS * 0.98, 48),
    new MeshBasicNodeMaterial({ color: '#07111f', side: DoubleSide }),
  );
  frontSky.name = 'front-polaris-aperture-shadow';
  frontSky.position.copy(frontSurface).addScaledVector(frontNormal, 0.07);
  frontSky.quaternion.copy(frontRotation);
  frontSky.userData.noCollide = true;
  upper.add(frontSky);

  const frontStar = new Mesh(
    new CircleGeometry(0.055, 20),
    new MeshBasicNodeMaterial({ color: '#ffffff', side: DoubleSide }),
  );
  frontStar.name = 'front-polaris-point';
  frontStar.position.copy(frontSurface).addScaledVector(frontNormal, 0.13);
  frontStar.quaternion.copy(frontRotation);
  frontStar.userData.noCollide = true;
  upper.add(frontStar);

  // A compact landing joins the final tread to the upper room.
  const landing = shadowed(new Mesh(new BoxGeometry(4.25, 0.32, 3.2), mats.stair));
  landing.name = 'upper-room-landing';
  landing.position.set(0, STAIR_TOP.y - 0.12, STAIR_TOP.z + 0.7);
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
  materials.concrete.side = DoubleSide;
  materials.concreteDark.side = DoubleSide;

  const mats: Mats = {
    shell: materials.pyramidSandstone,
    cutStone: materials.fieldstone,
    stair: materials.granite,
    paleStone: materials.graniteCoping,
    darkStone: materials.concreteDark,
    steel: materials.stainless,
    bronze: materials.bronze,
  };

  const group = new Group();
  group.name = 'star-axis-unified-monument';

  const shell = buildPyramidShell(mats);
  const front = buildFrontChamber(mats);
  const stair = buildRearStair(mats);
  const upper = buildUpperRoom(mats);
  group.add(shell, front, stair, upper);

  const components: Record<string, Object3D> = {
    'unified-pyramid-shell': shell,
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
    walkableSurfaces: ['hour-chamber-floor', 'star-tunnel-147-steps', 'upper-room-landing'],
    actionAnchors: {
      frontEntrance: [0, APRON_HEIGHT + 1.7, PYRAMID_FRONT_Z + 1.4],
      rearStairBase: [STAIR_BASE.x, STAIR_BASE.y + 1.7, STAIR_BASE.z - 2],
      apertureLanding: [STAIR_TOP.x, STAIR_TOP.y + 1.7, STAIR_TOP.z],
    },
    colliders: 'mesh-bvh plus analytic terrain/stair walking surfaces',
  };

  return { group, components };
}
