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
 *   1  Avenue / south excavation
 *   2  Solar Pyramid north/front face
 *   3  on the Star Tunnel stair looking toward the aperture
 *   4  high aerial overview
 *   5  night view due north (star trails around Polaris)
 *   D / G / N   day / golden hour / night
 *   T  toggle star trails (night)
 *   L  toggle enhanced lighting and post-processing
 */

import {
  ACESFilmicToneMapping,
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
import { MesaWind, type MesaWindFrame } from './staraxis/wind';
import { WindsweptSand } from './staraxis/windsweptSand';
import { StarAxisSoundscape } from './soundscape';
import { createVisualEffects } from './visualEffects';
import {
  APERTURE_CENTER_Y,
  APERTURE_ELEVATION_RAD,
  APERTURE_REAR_Z,
  STAIR_TOP,
  STAIR_BASE,
  STAIR_STEP_RUN,
  STAIR_STEP_COUNT,
  STAIR_WIDTH,
  FRONT_SLIT_HALF_WIDTH,
  PYRAMID_BASE_Y,
  PYRAMID_CENTER,
  PYRAMID_FRONT_Z,
  PYRAMID_REAR_Z,
  PORTAL_Z,
  TERRACE_TOP_Y,
  TRENCH_SOUTH_Z,
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
const soundToggle = document.getElementById('sound-toggle') as HTMLButtonElement | null;
const soundLabel = document.getElementById('sound-label') as HTMLSpanElement | null;
const soundStatus = document.getElementById('sound-status') as HTMLSpanElement | null;
const soundVolume = document.getElementById('sound-volume') as HTMLInputElement | null;

const soundscape = new StarAxisSoundscape();
soundscape.onChange((state) => {
  const soundRoot = document.getElementById('soundscape');
  if (soundRoot) {
    soundRoot.dataset.started = String(state.started);
    soundRoot.dataset.audible = String(state.audible);
  }
  soundToggle?.setAttribute('aria-pressed', String(state.audible));
  if (soundLabel) {
    soundLabel.textContent = !state.started
      ? 'Awaken sound'
      : state.audible
        ? `Sounding · ${state.place}`
        : 'Sound paused';
  }
  if (soundStatus) {
    soundStatus.textContent = !state.started
      ? 'Generative soundscape is off'
      : state.audible
        ? `Generative soundscape active in ${state.place}`
        : 'Generative soundscape paused';
  }
});
soundToggle?.addEventListener('click', () => void soundscape.toggle());
soundVolume?.addEventListener('input', () => soundscape.setVolume(Number(soundVolume.value)));

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

const deviceMemory =
  (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
const constrainedDevice = navigator.hardwareConcurrency <= 4 || deviceMemory <= 4;
const sandQuality = requestedQuality === 'high' ? 1.25 : constrainedDevice ? 0.65 : 1;
const sand = new WindsweptSand(sandQuality);
scene.add(sand.group);
scene.fogNode = sand.fogNode;
const mesaWind = new MesaWind();
let latestWind: MesaWindFrame = {
  directionX: 1,
  directionZ: 0,
  strength: 0.4,
  gust: 0,
  turbulence: 0.4,
  speed: 8,
  elapsed: 0,
};

const sky = createSky();
scene.add(sky.group);
scene.add(sky.sunLight);
scene.add(sky.sunLight.target);
scene.add(sky.hemi);

const visualEffects = createVisualEffects({
  renderer,
  scene,
  camera,
  sunLight: sky.sunLight,
  constrainedDevice,
  highQualityRequested: requestedQuality === 'high',
});

// The static monument, displaced terrain, and instanced stair treads are
// world-baked into BVHs so both grounding and wall collision use visible
// triangles rather than a parallel analytic approximation.
const collider = buildCollider([monument.group, terrain.group]);
fp.setCollider(collider);

// Static scene → render the sun's shadow map only when the sun moves
// (mode crossfades), not every frame.
sky.sunLight.shadow.autoUpdate = false;
sky.sunLight.shadow.needsUpdate = true;
const sunPrev = new Vector3().copy(sky.sunLight.position);

// ---------------------------------------------------------------- camera presets
interface Preset {
  pos: [number, number, number];
  target: [number, number, number];
  fov?: number;
  mode?: 'day' | 'goldenHour' | 'night';
}

const APERTURE_VIEW: [number, number, number] = [
  0,
  APERTURE_CENTER_Y + Math.sin(APERTURE_ELEVATION_RAD) * 40,
  APERTURE_REAR_Z - Math.cos(APERTURE_ELEVATION_RAD) * 40,
];

const PRESETS: Record<string, Preset> = {
  '1': {
    pos: [0, 4.2, TRENCH_SOUTH_Z - 3],
    target: [0, 10.5, -2],
    fov: 54,
    mode: 'day',
  },
  '2': {
    pos: [0, 31.5, PYRAMID_FRONT_Z - 26],
    target: [0, 37, PYRAMID_CENTER.z],
    fov: 52,
    mode: 'goldenHour',
  },
  '3': {
    pos: [STAIR_BASE.x, STAIR_BASE.y + EYE_HEIGHT + 0.35, STAIR_BASE.z + 2.2],
    target: APERTURE_VIEW,
    fov: 48,
    mode: 'day',
  },
  '4': { pos: [-105, 92, 118], target: [0, 18, -24], fov: 48, mode: 'day' },
  '5': {
    pos: [0, STAIR_TOP.y + EYE_HEIGHT, APERTURE_REAR_Z + 1.35],
    target: APERTURE_VIEW,
    fov: 62,
    mode: 'night',
  },
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
    title: 'One continuous north-rising work',
    description:
      'The Avenue is the lower southern excavation. It enters the Equinoctial Chamber, becomes the 147-step Star Tunnel, and rises through the mesa into the Solar Pyramid at the north end.',
    fact: 'The Avenue, stair axis, mesa slot and pyramid are now one connected route—not separate attractions.',
    pos: [-105, 92, 118],
    target: [0, 18, -24],
    fov: 48,
    mode: 'day',
  },
  {
    label: 'Avenue',
    title: 'The excavated southern approach',
    description:
      'Curved, outward-leaning stone walls descend into the cut. The distant triangular portal and the centered stair reveal the entire axial sequence from the first step into the site.',
    fact: 'Published accounts describe the Avenue as a roughly 75-foot-deep excavation leading to the 147-step passage.',
    pos: [0, 4.2, TRENCH_SOUTH_Z - 3],
    target: [0, 10.5, -2],
    fov: 54,
    mode: 'day',
  },
  {
    label: 'Equinoctial',
    title: 'Triangular threshold',
    description:
      'The lower granite flight passes through a real triangular void in the retaining wall. Beyond it, the long stair continues north through the rubble bowl without a wall or terrain sheet blocking the view.',
    fact: 'The portal belongs to the Equinoctial Chamber at the base of the Star Tunnel.',
    pos: [0, 4.6, 17],
    target: [0, TERRACE_TOP_Y + 4.6, PORTAL_Z - 5],
    fov: 50,
    mode: 'day',
  },
  {
    label: 'Star Tunnel',
    title: '147 steps toward Polaris',
    description:
      'The stair rises due north at the local latitude angle. Instanced granite treads and paired open masonry walls preserve the sightline while keeping the scene light enough for real-time exploration.',
    fact: 'The model uses 147 treads and an 8.25-inch published rise.',
    pos: [0, STAIR_BASE.y + EYE_HEIGHT + 0.25, STAIR_BASE.z + 2.2],
    target: APERTURE_VIEW,
    fov: 48,
    mode: 'day',
  },
  {
    label: 'Pyramid rear',
    title: 'The stair enters the same pyramid',
    description:
      'At the upper mesa the stair passes through a deep opening in the south/back face of the Solar Pyramid. The masonry returns, tunnel walls, stair bed and shell all meet as one construction.',
    fact: 'This is the corrected relationship that replaces the former detached pyramid and tunnel.',
    pos: [25, 33, -28],
    target: [0, 37, -50],
    fov: 50,
    mode: 'goldenHour',
  },
  {
    label: 'On the stair',
    title: 'Ascending the open axis',
    description:
      'The side walls stay above the carved ground and remain open to the sky. Looking ahead, the broad circular aperture stays centered instead of collapsing into a tiny dot.',
    fact: 'Each tread advances toward the same aperture housed in the pyramid crown.',
    pos: [0, 23.1, -29.2],
    target: APERTURE_VIEW,
    fov: 48,
    mode: 'day',
  },
  {
    label: 'Aperture',
    title: 'Upper Room and Polaris',
    description:
      'The stair ends on a level eye-height viewing bay. The broad steel-lined mouth now opens through a flared passage to the live sky, so stars carry real depth and parallax instead of sitting on a flat card.',
    fact: 'The opening is centered on a six-foot visitor and fills peripheral vision at the threshold.',
    pos: [0, STAIR_TOP.y + EYE_HEIGHT, APERTURE_REAR_Z + 1.35],
    target: APERTURE_VIEW,
    fov: 60,
    mode: 'night',
  },
  {
    label: 'Pyramid front',
    title: 'Hour Chamber slit on the north face',
    description:
      'The public front remains the steep truncated pylon seen in the photographs: irregular granite courses, a tall needle slit, an upper polar opening, summit rods and twenty exterior granite steps along the rear edge.',
    fact: 'The front slit is the Hour Chamber—not the entrance to the 147-step Star Tunnel.',
    pos: [0, 31.5, PYRAMID_FRONT_Z - 26],
    target: [0, 37, PYRAMID_CENTER.z],
    fov: 52,
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
/** Hold Z + move horizontally to scrub solar time (sun angle / day–night). */
let scrubbing = false;

function setScrubbing(active: boolean): void {
  if (active === scrubbing) return;
  scrubbing = active;
  if (active) {
    // Don't let orbit / look steal the pointer while scrubbing.
    controls.enabled = false;
    fp.controls.enabled = false;
  } else if (nav === 'fp') {
    fp.controls.enabled = fp.enabled;
  } else {
    controls.enabled = true;
  }
}

function setNav(next: Nav): void {
  nav = next;
  if (nav === 'fp') {
    controls.enabled = false;
    fp.enable();
    // Scrubbing owns the pointer; keep look disabled until Z is released.
    if (scrubbing) fp.controls.enabled = false;
  } else {
    fp.disable();
    controls.enabled = !scrubbing;
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
  if (e.code === 'KeyZ' && !e.repeat) {
    setScrubbing(true);
    e.preventDefault();
    return;
  }
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
  } else if (k === 'k') {
    void soundscape.toggle();
  } else if (k === 'l' && !e.repeat) {
    visualEffects.toggle();
    updateInfo();
  } else if (k === '/') {
    debugOn = !debugOn;
    if (debugEl) debugEl.style.display = debugOn ? 'block' : 'none';
    updateDebug();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyZ') setScrubbing(false);
  fp.handleKey(e.code, false);
});

window.addEventListener('blur', () => setScrubbing(false));

window.addEventListener('pointermove', (e) => {
  if (!scrubbing || e.movementX === 0) return;
  sky.scrubSolar(e.movementX * 0.0014);
});

window.addEventListener(
  'wheel',
  (e) => {
    if (!scrubbing) return;
    // Trackpad horizontal swipe → deltaX; mouse wheel → deltaY as fallback.
    const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (delta === 0) return;
    e.preventDefault();
    sky.scrubSolar(delta * 0.0007);
  },
  { passive: false },
);

function updateInfo(): void {
  if (!info) return;
  const views = '1 Avenue · 2 pyramid front · 3 Star Tunnel · 4 aerial · 5 aperture night · M tour';
  const light = 'Z+drag time · D/G/N light · T trails · L light lab · K sound · / stats';
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
  if (Math.abs(x) < 2.8 && Math.abs(z - STAIR_TOP.z) < 3.2) {
    return 'Upper Room — the Star Tunnel reaches the live Polaris aperture inside the Solar Pyramid';
  }
  if (
    Math.abs(x) <= STAIR_WIDTH / 2 + 0.45 &&
    z <= STAIR_BASE.z &&
    z >= STAIR_TOP.z
  ) {
    const step = Math.min(
      STAIR_STEP_COUNT,
      Math.max(1, Math.ceil((STAIR_BASE.z - z) / STAIR_STEP_RUN)),
    );
    const year = 2100 + Math.round(((step / STAIR_STEP_COUNT) * 12900) / 50) * 50;
    return `Star Tunnel — rising due north through the mesa · step ${step}/${STAIR_STEP_COUNT} · AD ${year}`;
  }
  if (
    Math.abs(x) <= FRONT_SLIT_HALF_WIDTH + 0.7 &&
    z >= PYRAMID_FRONT_Z - 3 &&
    z <= PYRAMID_REAR_Z
  ) {
    return 'Hour Chamber — the north/front slit looks through the unified Solar Pyramid';
  }
  const px = x - PYRAMID_CENTER.x;
  const pz = z - PYRAMID_CENTER.z;
  if (Math.abs(x) < 13 && z > 12 && z < TRENCH_SOUTH_Z + 5) {
    return 'The Avenue — a deep southern excavation aligned with the Star Tunnel';
  }
  if (Math.abs(x) < 20 && z >= -7 && z <= 12) {
    return 'Equinoctial Chamber — triangular threshold into the 147-step axis';
  }
  if (Math.abs(px) < 15 && Math.abs(pz) < 18) {
    return 'Solar Pyramid — Hour Chamber in front, Star Tunnel entering from the rear';
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
    `sand volume + ${(sand.totalCount / 1000).toFixed(1)}k micro · wind ${Math.round(latestWind.strength * 100)}%<br>` +
    `collider ${collider.triangleCount} tris<br>` +
    `${nav}${fp.fly ? ' · fly' : ''} · ${sky.getMode()} · fx ${visualEffects.snapshot().active ? 'on' : 'off'}<br>` +
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
const previousCameraPosition = new Vector3().copy(camera.position);

await renderer.init();
sand.initialize(renderer, camera.position);

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (nav === 'fp') fp.update(dt);
  else controls.update();
  sky.update(dt);
  // redraw the shadow map only while the sun is actually moving
  if (sky.sunLight.position.distanceToSquared(sunPrev) > 0.25) {
    sky.sunLight.shadow.needsUpdate = true;
    sunPrev.copy(sky.sunLight.position);
  }
  const cameraTravel = camera.position.distanceTo(previousCameraPosition);
  latestWind = mesaWind.update(dt, camera.position.x, camera.position.z, sky.getMode());
  sand.update(renderer, latestWind, camera.position, dt, sky.getMode());
  soundscape.update({
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
    dt,
    mode: sky.getMode(),
    moving: nav === 'fp' && cameraTravel > 0.0005,
    windStrength: latestWind.strength,
    windGust: latestWind.gust,
    windTurbulence: latestWind.turbulence,
  });
  previousCameraPosition.copy(camera.position);
  updateCaption();
  visualEffects.render();
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
  visualEffects.render();
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
  camera: camera.position.toArray().map((value) => Number(value.toFixed(3))),
  cameraY: Number(camera.position.y.toFixed(2)),
  colliderTriangles: collider.triangleCount,
  solidColliderTriangles: collider.solidTriangleCount,
  drawCalls: renderer.info.render.drawCalls,
  triangles: renderer.info.render.triangles,
  geometries: renderer.info.memory.geometries,
  mode: sky.getMode(),
  componentCount: Object.keys(monument.components).length,
  componentIds: Object.keys(monument.components).sort(),
  tourOpen,
  tourStop: TOUR_STOPS[tourIndex].label,
  wind: {
    strength: Number(latestWind.strength.toFixed(3)),
    gust: Number(latestWind.gust.toFixed(3)),
    speed: Number(latestWind.speed.toFixed(2)),
    direction: [
      Number(latestWind.directionX.toFixed(3)),
      Number(latestWind.directionZ.toFixed(3)),
    ],
  },
  sand: sand.snapshot(),
  soundscape: soundscape.snapshot(),
  visualEffects: visualEffects.snapshot(),
  sculptRuntime: monument.group.userData.sculptRuntime,
});
