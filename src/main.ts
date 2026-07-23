/**
 * Star Axis — Charles Ross. Procedural Three.js (WebGPU + TSL) recreation.
 *
 * Navigation (first person by default; C switches to orbit):
 *   click        lock the pointer and walk
 *   W A S D      move · Shift sprint · F fly · Space/Q up/down while flying
 *   arrows       look, for touring without a mouse
 *   Esc          release the pointer
 *   M            open the guided field tour
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
  PYRAMID_BASE_Y,
  PYRAMID_CENTER,
  LATITUDE_RAD,
} from './staraxis/constants';
import { EYE_HEIGHT } from './staraxis/walk';

const app = document.getElementById('app') as HTMLDivElement;
const info = document.getElementById('info') as HTMLDivElement;
const crosshair = document.getElementById('crosshair') as HTMLDivElement | null;
const tourToggle = document.getElementById('tour-toggle') as HTMLButtonElement | null;
const tourPanel = document.getElementById('tour-panel') as HTMLElement | null;
const tourClose = document.getElementById('tour-close') as HTMLButtonElement | null;
const tourTitle = document.getElementById('tour-title') as HTMLHeadingElement | null;
const tourDescription = document.getElementById('tour-description') as HTMLParagraphElement | null;
const tourFact = document.getElementById('tour-fact') as HTMLDivElement | null;
const tourStopsEl = document.getElementById('tour-stops') as HTMLDivElement | null;
const tourProgress = document.getElementById('tour-progress') as HTMLSpanElement | null;
const tourPrev = document.getElementById('tour-prev') as HTMLButtonElement | null;
const tourNext = document.getElementById('tour-next') as HTMLButtonElement | null;

const renderer = new WebGPURenderer({ antialias: true });
// A 2× backing buffer quadrupled fragment work on Retina displays and was
// the single largest frame-time cost. Native CSS resolution remains crisp
// for a full-window WebGPU scene; ?quality=high opts back into 1.5×.
const requestedQuality = new URLSearchParams(location.search).get('quality');
const pixelRatioCap = requestedQuality === 'high' ? 1.5 : 1;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
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

const APERTURE_VIEW: [number, number, number] = [
  STAIR_TOP.x,
  STAIR_TOP.y + EYE_HEIGHT + Math.sin(LATITUDE_RAD) * 2.2,
  STAIR_TOP.z - Math.cos(LATITUDE_RAD) * 2.2,
];

const PRESETS: Record<string, Preset> = {
  '1': { pos: [0, 3.7, 40], target: [0, 12.5, -8], fov: 62, mode: 'day' },
  '2': { pos: [27, 25, -12], target: [-16, 36, -47], fov: 55, mode: 'goldenHour' },
  '3': {
    // on the upper landing, sighting up the aperture bore toward Polaris
    // (matches the tunnel_2 reference)
    pos: [STAIR_BASE.x, STAIR_BASE.y + 23.13, STAIR_BASE.z - 30.9],
    target: APERTURE_VIEW,
    fov: 50,
    mode: 'day',
  },
  '4': { pos: [-90, 95, 120], target: [0, 12, 0], fov: 50, mode: 'day' },
  '5': { pos: [0, 5.5, 42], target: [0, 22, -20], fov: 70, mode: 'night' },
};

interface TourStop extends Preset {
  label: string;
  title: string;
  description: string;
  fact: string;
}

const TOUR_STOPS: TourStop[] = [
  {
    label: 'Overview',
    title: 'Earth aligned to sky',
    description:
      'Charles Ross conceived Star Axis in 1971 as an architectonic earthwork and naked-eye observatory. Every major angle translates a relationship between Earth, sun, and stars into a space that can be crossed on foot.',
    fact: 'Scale · 11 stories high · about one-tenth of a mile across · construction began in 1976',
    pos: [-88, 82, 118],
    target: [0, 12, -5],
    fov: 50,
    mode: 'day',
  },
  {
    label: 'Approach',
    title: 'The excavated approach',
    description:
      'The south approach enters a seven-story excavation in the mesa. Leaning stone walls lead toward the great curved enclosure, whose geometry evokes the sweep of Earth’s axis through the 26,000-year cycle of precession.',
    fact: 'Move through the channel toward the triangular opening at the foot of the stair.',
    pos: [0, 3.7, 47],
    target: [0, 11.5, -10],
    fov: 62,
    mode: 'day',
  },
  {
    label: 'Equatorial',
    title: 'Equatorial Chamber',
    description:
      'At the entrance to the Star Tunnel, this compact chamber frames the equinox sun and stars traveling above Earth’s equator. Its celestial alignment meets the polar alignment of the stair at a right angle.',
    fact: 'Two celestial systems meet here: the equatorial plane and Earth’s north–south axis.',
    pos: [0, 7.7, 3.1],
    target: [0, 12.4, -12],
    fov: 57,
    mode: 'day',
  },
  {
    label: 'Star Tunnel',
    title: 'Star Tunnel',
    description:
      'The central 147-step stair is exactly parallel to Earth’s axis. As the open-air corridor climbs toward Polaris, each step reveals a wider field of sky and corresponds to a different circumpolar orbit in the precession cycle.',
    fact: 'Bottom view · Polaris’s orbit appears dime-sized · top view · the orbit fills human peripheral vision',
    pos: [0, 8.2, -2.8],
    target: APERTURE_VIEW,
    fov: 52,
    mode: 'day',
  },
  {
    label: 'Upper Room',
    title: 'Upper Room & aperture',
    description:
      'At the final stair, a 40-inch circular oculus fills the visual field. Its axis is aimed at Polaris, framing the largest orbit in the cycle—seen approximately 13,000 years in either direction from the present.',
    fact: 'The oculus is approximately the width of human peripheral vision when viewed at close range.',
    pos: [0, STAIR_TOP.y + 1.75, STAIR_TOP.z + 2.8],
    target: APERTURE_VIEW,
    fov: 56,
    mode: 'night',
  },
  {
    label: 'Solar Pyramid',
    title: 'Solar Pyramid',
    description:
      'The 55-foot granite tetrahedron is formed by the angles of the sun at the summer and winter solstices. Its exterior stair and sharp profile turn the annual solar cycle into monumental geometry.',
    fact: 'The pyramid acts as a gnomon: its moving shadow records both daily and seasonal solar motion.',
    pos: [24, 41, -18],
    target: [PYRAMID_CENTER.x, PYRAMID_BASE_Y + 7, PYRAMID_CENTER.z],
    fov: 54,
    mode: 'goldenHour',
  },
  {
    label: 'Hour Chamber',
    title: 'Hour Chamber',
    description:
      'A passage through the Solar Pyramid opens to a 15-degree triangular view of the northern sky. A star entering at the west edge takes one hour to reach the east edge, while Polaris remains fixed at the apex.',
    fact: 'Look north through the chamber: the opening makes one hour of Earth’s rotation visible.',
    pos: [PYRAMID_CENTER.x, PYRAMID_BASE_Y + 4.8, PYRAMID_CENTER.z - 3],
    target: [PYRAMID_CENTER.x, PYRAMID_BASE_Y + 5.8, PYRAMID_CENTER.z - 18],
    fov: 55,
    mode: 'night',
  },
  {
    label: 'Shadow Field',
    title: 'Shadow Field',
    description:
      'Beyond the Solar Pyramid, the Shadow Field is shaped by the full family of shadows the tetrahedron casts over a year—from the long reach of winter solstice to the compact shadow of summer.',
    fact: 'The field is not a conventional dial face; its boundary is the accumulated geometry of a year of shadows.',
    pos: [28, 59, -15],
    target: [PYRAMID_CENTER.x, PYRAMID_BASE_Y, PYRAMID_CENTER.z - 9],
    fov: 58,
    mode: 'goldenHour',
  },
];

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

let tourOpen = false;
let tourIndex = 0;
const tourStopButtons: HTMLButtonElement[] = [];

function renderTourStop(): void {
  const stop = TOUR_STOPS[tourIndex];
  if (tourTitle) tourTitle.textContent = stop.title;
  if (tourDescription) tourDescription.textContent = stop.description;
  if (tourFact) tourFact.textContent = stop.fact;
  if (tourProgress) tourProgress.textContent = `${tourIndex + 1} / ${TOUR_STOPS.length}`;
  tourStopButtons.forEach((button, index) => {
    const active = index === tourIndex;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
}

function goToTourStop(index: number): void {
  tourIndex = (index + TOUR_STOPS.length) % TOUR_STOPS.length;
  if (nav !== 'orbit') setNav('orbit');
  applyPreset(TOUR_STOPS[tourIndex]);
  renderTourStop();
}

function setTourOpen(open: boolean): void {
  tourOpen = open;
  if (tourPanel) {
    tourPanel.dataset.open = String(open);
    tourPanel.setAttribute('aria-hidden', String(!open));
  }
  tourToggle?.setAttribute('aria-expanded', String(open));
  if (open) {
    goToTourStop(tourIndex);
    tourClose?.focus({ preventScroll: true });
  } else {
    tourToggle?.focus({ preventScroll: true });
  }
  updateInfo();
}

if (tourStopsEl) {
  TOUR_STOPS.forEach((stop, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tour-stop';
    button.textContent = `${String(index + 1).padStart(2, '0')} · ${stop.label}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-label', `Go to ${stop.title}`);
    button.addEventListener('click', () => goToTourStop(index));
    tourStopsEl.appendChild(button);
    tourStopButtons.push(button);
  });
}
tourToggle?.addEventListener('click', () => setTourOpen(!tourOpen));
tourClose?.addEventListener('click', () => setTourOpen(false));
tourPrev?.addEventListener('click', () => goToTourStop(tourIndex - 1));
tourNext?.addEventListener('click', () => goToTourStop(tourIndex + 1));
renderTourStop();

renderer.domElement.addEventListener('click', () => {
  if (nav === 'fp' && !tourOpen) fp.lock();
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

const tourParam = params.get('tour');
if (tourParam !== null) {
  const requestedStop = Number(tourParam);
  if (Number.isFinite(requestedStop)) {
    tourIndex = Math.min(TOUR_STOPS.length - 1, Math.max(0, Math.round(requestedStop) - 1));
  }
  setTourOpen(true);
}

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'm') {
    setTourOpen(!tourOpen);
    return;
  }
  if (tourOpen && e.key === 'Escape') {
    setTourOpen(false);
    return;
  }
  if (tourOpen && (e.key === ']' || e.key === 'PageDown')) {
    goToTourStop(tourIndex + 1);
    return;
  }
  if (tourOpen && (e.key === '[' || e.key === 'PageUp')) {
    goToTourStop(tourIndex - 1);
    return;
  }
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
  const views = '1 entry · 2 pyramid · 3 tunnel · 4 aerial · 5 night · M tour';
  const light = 'D/G/N light · T trails · / stats';
  const line =
    tourOpen
      ? 'guided tour · [ / ] previous / next · Esc close'
      : nav === 'fp'
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
    const year = 2100 + Math.round(((step / STAIR_STEP_COUNT) * 12900) / 50) * 50;
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
    __setTour?: (index: number) => void;
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
window.__setTour = (index: number) => {
  setTourOpen(true);
  goToTourStop(index);
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
  tourOpen,
  tourStop: TOUR_STOPS[tourIndex].label,
  sculptRuntime: monument.group.userData.sculptRuntime,
});
