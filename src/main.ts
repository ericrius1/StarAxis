/**
 * Star Axis — Charles Ross. Procedural Three.js (WebGPU + TSL) recreation.
 *
 * Navigation (first person by default; C switches to orbit):
 *   click        lock the pointer and walk
 *   W A S D      move · Shift sprint · F fly · Space/Q up/down while flying
 *   arrows       look, for touring without a mouse
 *   Esc          release the pointer
 *
 * Keys:
 *   1  entry channel view (matches the aerial reference photo)
 *   2  summit / solar pyramid view (matches the golden-hour reference)
 *   3  inside the star tunnel looking up through the steel aperture
 *   4  high aerial overview
 *   5  night view due north (star trails around Polaris)
 *   D / G / N   day / golden hour / night
 *   T  toggle star trails (night)
 */

import {
  ACESFilmicToneMapping,
  Color,
  Fog,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createMaterials } from './staraxis/materials';
import { createStarAxis } from './staraxis/createStarAxis';
import { createTerrain } from './staraxis/terrain';
import { createSky } from './staraxis/sky';
import { createFirstPerson } from './staraxis/firstPerson';
import { buildCollider } from './staraxis/collision';
import {
  STAIR_TOP,
  STAIR_BASE,
  STAIR_STEP_RUN,
  STAIR_STEP_COUNT,
  PORTAL_Z,
  PYRAMID_CENTER,
} from './staraxis/constants';

const app = document.getElementById('app') as HTMLDivElement;
const info = document.getElementById('info') as HTMLDivElement;
const crosshair = document.getElementById('crosshair') as HTMLDivElement | null;

const renderer = new WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 4000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
// Allow steep upward views (sighting Polaris through the aperture needs
// the camera well below its target).
controls.maxPolarAngle = Math.PI * 0.88;

const fp = createFirstPerson(camera, renderer.domElement);

// ---------------------------------------------------------------- scene build
const bootParams = new URLSearchParams(location.search);
const materials = createMaterials();
const monument = createStarAxis(materials, { blockout: bootParams.get('blockout') === '1' });
scene.add(monument.group);

const terrain = createTerrain(materials.desert);
scene.add(terrain.group);

const sky = createSky();
scene.add(sky.group);
scene.add(sky.sunLight);
scene.add(sky.sunLight.target);
scene.add(sky.hemi);

// The monument is static: bake it into one BVH for capsule collision.
const collider = buildCollider(monument.group);
fp.setCollider(collider);

// Static scene → render the sun's shadow map only when the sun moves
// (mode crossfades), not every frame.
sky.sunLight.shadow.autoUpdate = false;
sky.sunLight.shadow.needsUpdate = true;
const sunPrev = new Vector3().copy(sky.sunLight.position);

// Distance haze sells the mesa scale; color tracks the light mode.
const FOG_COLORS = {
  day: new Color('#cfd8e4'),
  goldenHour: new Color('#dcb28a'),
  night: new Color('#070a12'),
} as const;
scene.fog = new Fog(FOG_COLORS.day.clone(), 500, 1500);

// ---------------------------------------------------------------- camera presets
interface Preset {
  pos: [number, number, number];
  target: [number, number, number];
  fov?: number;
  mode?: 'day' | 'goldenHour' | 'night';
}

const PRESETS: Record<string, Preset> = {
  '1': { pos: [0, 3.7, 40], target: [0, 12.5, -8], fov: 62, mode: 'day' },
  '2': { pos: [27, 25, -12], target: [-16, 36, -47], fov: 55, mode: 'goldenHour' },
  '3': {
    // on the upper landing, sighting up the aperture bore toward Polaris
    // (matches the tunnel_2 reference)
    pos: [STAIR_BASE.x, STAIR_BASE.y + 23.13, STAIR_BASE.z - 30.9],
    target: [STAIR_TOP.x, STAIR_TOP.y + 3.6, STAIR_TOP.z - 2.6],
    fov: 50,
    mode: 'day',
  },
  '4': { pos: [-90, 95, 120], target: [0, 12, 0], fov: 50, mode: 'day' },
  '5': { pos: [0, 5.5, 42], target: [0, 22, -20], fov: 70, mode: 'night' },
};

function applyPreset(p: Preset): void {
  camera.position.set(...p.pos);
  controls.target.set(...p.target);
  if (p.fov) {
    camera.fov = p.fov;
    camera.updateProjectionMatrix();
  }
  if (p.mode) sky.setMode(p.mode);
  controls.update();
  // In first person the same vantage becomes a spawn point: the rig decides
  // whether to stand there or hold it in flight.
  if (nav === 'fp') fp.placeAt(p.pos, p.target);
}

// ---------------------------------------------------------------- navigation
type Nav = 'fp' | 'orbit';
let nav: Nav = 'fp';

function setNav(next: Nav): void {
  nav = next;
  if (nav === 'fp') {
    controls.enabled = false;
    fp.enable();
  } else {
    fp.disable();
    controls.enabled = true;
    // Hand the orbit rig a target in front of wherever the walker is looking.
    const ahead = camera.getWorldDirection(new Vector3()).multiplyScalar(25);
    controls.target.copy(camera.position).add(ahead);
    controls.update();
  }
  updateInfo();
}

renderer.domElement.addEventListener('click', () => {
  if (nav === 'fp') fp.lock();
});
fp.onLockChange((locked) => {
  if (crosshair) crosshair.style.opacity = locked ? '1' : '0';
  updateInfo();
});

// URL-driven view for automated captures: ?view=1..5&mode=day|goldenHour|night&trails=1&blockout=1
// Free camera: ?cam=x,y,z&look=x,y,z (overrides view)
// Navigation: ?nav=fp|orbit — first person is the default, but a scripted
// capture (free camera or blockout) implies the fixed orbit framing.
const params = bootParams;
const navParam = params.get('nav');
const impliesOrbit = params.has('cam') || params.has('look') || params.get('blockout') === '1';
nav = navParam === 'orbit' || (navParam !== 'fp' && impliesOrbit) ? 'orbit' : 'fp';

const viewParam = params.get('view') ?? '1';
applyPreset(PRESETS[viewParam] ?? PRESETS['1']);
const camParam = params.get('cam');
const lookParam = params.get('look');
if (camParam && lookParam) {
  const c = camParam.split(',').map(Number);
  const l = lookParam.split(',').map(Number);
  if (c.length === 3 && l.length === 3 && [...c, ...l].every(Number.isFinite)) {
    camera.position.set(c[0], c[1], c[2]);
    controls.target.set(l[0], l[1], l[2]);
    const fovParam = Number(params.get('fov'));
    if (Number.isFinite(fovParam) && fovParam > 10) {
      camera.fov = fovParam;
      camera.updateProjectionMatrix();
    }
    controls.update();
    if (nav === 'fp') fp.placeAt([c[0], c[1], c[2]], [l[0], l[1], l[2]]);
  }
}
const modeParam = params.get('mode');
if (modeParam === 'day' || modeParam === 'goldenHour' || modeParam === 'night') {
  sky.setMode(modeParam);
}

let trails = params.get('trails') === '1' ? 1 : 0;
if (trails) sky.setTrailAmount(1);

// Fast-forward the light-mode crossfade so URL-driven captures (headless
// virtual time) land on the settled lighting state.
for (let i = 0; i < 40; i++) sky.update(0.25);

setNav(nav);

window.addEventListener('keydown', (e) => {
  // W/A/S/D and friends belong to the walker; everything else is a command.
  if (nav === 'fp' && fp.handleKey(e.code, true)) {
    if (e.code === 'Space') e.preventDefault(); // don't scroll the page
    return;
  }
  const k = e.key.toLowerCase();
  if (PRESETS[k]) applyPreset(PRESETS[k]);
  else if (k === 'c') setNav(nav === 'fp' ? 'orbit' : 'fp');
  else if (k === 'f' && nav === 'fp') {
    fp.toggleFly();
    updateInfo();
  } else if (k === 'd') sky.setMode('day');
  else if (k === 'g') sky.setMode('goldenHour');
  else if (k === 'n') sky.setMode('night');
  else if (k === 't') {
    trails = trails > 0 ? 0 : 1;
    sky.setTrailAmount(trails);
  } else if (k === '/') {
    debugOn = !debugOn;
    if (debugEl) debugEl.style.display = debugOn ? 'block' : 'none';
    updateDebug();
  }
});

window.addEventListener('keyup', (e) => {
  fp.handleKey(e.code, false);
});

function updateInfo(): void {
  if (!info) return;
  const views = '1 entry · 2 pyramid · 3 tunnel · 4 aerial · 5 night';
  const light = 'D/G/N light · T trails · / stats';
  const line =
    nav === 'fp'
      ? fp.isLocked()
        ? `WASD move · Shift sprint · F ${fp.fly ? 'walk' : 'fly'}${
            fp.fly ? ' · Space/Q up/down' : ''
          } · Esc release · C orbit`
        : 'click to walk · C orbit'
      : 'drag to orbit · scroll to zoom · C first person';
  info.innerHTML =
    '<h1>Star Axis — Charles Ross</h1>' +
    `<div>${line}</div>` +
    `<div style="opacity:.62">${views} · ${light}</div>`;
}

// ---------------------------------------------------------------- zone captions
// Naming the five elements as the visitor reaches them, per staraxis.org.
// On the Star Tunnel stair, each step advances through the 26,000-year
// precession cycle — Polaris's circle grows from dime-sized today to the
// whole sky ~13,000 years from now.
const captionEl = document.getElementById('caption') as HTMLDivElement | null;
let lastCaption = '';

function zoneCaption(x: number, z: number): string {
  // summit landing at the aperture
  if (Math.abs(x) < 2.6 && z >= STAIR_TOP.z - 3.2 && z < STAIR_TOP.z + 2.0) {
    return 'Star Tunnel aperture — sighted on Polaris, the axis of the sky';
  }
  // on the stair: walk through layers of celestial time
  if (Math.abs(x) <= 1.75 && z <= STAIR_BASE.z && z >= STAIR_TOP.z) {
    const step = Math.min(
      STAIR_STEP_COUNT,
      Math.max(1, Math.ceil((STAIR_BASE.z - z) / STAIR_STEP_RUN)),
    );
    const year = 2026 + Math.round(((step / STAIR_STEP_COUNT) * 13000) / 50) * 50;
    return `Star Tunnel — parallel to Earth's axis · step ${step}/${STAIR_STEP_COUNT} · Polaris's circle in AD ${year}`;
  }
  // beneath the portal
  if (Math.abs(x) <= 2.6 && Math.abs(z - PORTAL_Z) <= 2.2) {
    return 'Equatorial Chamber portal — the notch frames stars crossing the celestial equator';
  }
  const px = x - PYRAMID_CENTER.x;
  const pz = z - PYRAMID_CENTER.z;
  // inside the hour chamber behind the slit
  if (Math.abs(px) < 3.6 && pz > 5.0 && pz < 11.0) {
    return 'Hour Chamber — the 15° slit holds one hour of Earth’s rotation';
  }
  if (Math.hypot(px, pz) < 22) {
    return 'Solar Pyramid & Shadow Field — a year of collected shadows draws the field';
  }
  if (Math.abs(x) < 11 && z > 4 && z < 58) {
    return 'Entry channel — the walk in toward the star';
  }
  return '';
}

function updateCaption(): void {
  if (!captionEl) return;
  const text = nav === 'fp' ? zoneCaption(camera.position.x, camera.position.z) : '';
  if (text !== lastCaption) {
    lastCaption = text;
    captionEl.textContent = text;
    captionEl.style.opacity = text ? '1' : '0';
  }
}

// ---------------------------------------------------------------- debug stats
const debugEl = document.getElementById('debug') as HTMLDivElement | null;
let debugOn = false;
let frameMsAccum = 0;
let frameMsCount = 0;

function updateDebug(): void {
  if (!debugEl || !debugOn) return;
  const ms = frameMsCount > 0 ? frameMsAccum / frameMsCount : 0;
  frameMsAccum = 0;
  frameMsCount = 0;
  const p = camera.position;
  debugEl.innerHTML =
    `fps ${Math.round(lastFps)} · ${ms.toFixed(2)} ms<br>` +
    `draws ${renderer.info.render.drawCalls} · tris ${(renderer.info.render.triangles / 1e6).toFixed(2)}M<br>` +
    `collider ${collider.triangleCount} tris<br>` +
    `${nav}${fp.fly ? ' · fly' : ''} · ${sky.getMode()}<br>` +
    `pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
}
setInterval(updateDebug, 500);

// ---------------------------------------------------------------- loop
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
let frames = 0;
let fpsWindowStart = performance.now();
let lastFps = 0;

await renderer.init();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (nav === 'fp') fp.update(dt);
  else controls.update();
  sky.update(dt);
  if (scene.fog instanceof Fog) {
    scene.fog.color.lerp(FOG_COLORS[sky.getMode()], Math.min(dt * 2, 1));
  }
  // redraw the shadow map only while the sun is actually moving
  if (sky.sunLight.position.distanceToSquared(sunPrev) > 0.25) {
    sky.sunLight.shadow.needsUpdate = true;
    sunPrev.copy(sky.sunLight.position);
  }
  updateCaption();
  renderer.render(scene, camera);
  frames++;
  frameMsAccum += dt * 1000;
  frameMsCount++;
  if (now - fpsWindowStart >= 1000) {
    lastFps = (frames * 1000) / (now - fpsWindowStart);
    frames = 0;
    fpsWindowStart = now;
  }
});

// Screenshot hook for the sculpt review pipeline (canvas → PNG data URL).
declare global {
  interface Window {
    __capture?: () => string;
    __setView?: (key: string) => void;
  }
}
window.__capture = () => {
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
};
window.__setView = (key: string) => {
  const p = PRESETS[key];
  if (p) applyPreset(p);
};

// Runtime introspection for the sculpt pipeline (interaction/optimization).
declare global {
  interface Window {
    __runtime?: () => unknown;
  }
}
window.__runtime = () => ({
  fps: Math.round(lastFps),
  nav,
  fly: fp.fly,
  pointerLocked: fp.isLocked(),
  cameraY: Number(camera.position.y.toFixed(2)),
  drawCalls: renderer.info.render.drawCalls,
  triangles: renderer.info.render.triangles,
  geometries: renderer.info.memory.geometries,
  mode: sky.getMode(),
  componentCount: Object.keys(monument.components).length,
  componentIds: Object.keys(monument.components).sort(),
  sculptRuntime: monument.group.userData.sculptRuntime,
});
