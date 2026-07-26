/**
 * Star Axis — Charles Ross. Procedural Three.js (WebGPU + TSL) recreation.
 *
 * Navigation (first person by default; C switches to orbit / camera mode):
 *   click        lock the pointer and walk
 *   W A S D      move · Shift sprint · F fly · Space/Q up/down while flying
 *   arrows       look, for touring without a mouse
 *   Esc          release the pointer
 *   C            orbit camera (drag rotate · scroll/pinch zoom)
 *   M            open the guided field tour (same CameraControls rig)
 *
 * Keys:
 *   1  Avenue / south excavation
 *   2  Solar Pyramid north/front face
 *   3  on the Star Tunnel stair looking toward the aperture
 *   4  high aerial overview
 *   5  night view due north (star trails around Polaris)
 *   D / G / H   day / golden hour / night
 *   T  toggle star trails (night)
 *   N  toggle Performance / Cinematic render mode
 *   P  toggle the explicit progressive Path Traced mode
 *   L  open or close the render lab
 *   I  toggle immersive mode (hide all UI)
 */

import {
  ACESFilmicToneMapping,
  Box3,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
  WebGPURenderer,
} from 'three/webgpu';
import CameraControls from 'camera-controls';

CameraControls.install({
  THREE: {
    Vector2,
    Vector3,
    Vector4,
    Quaternion,
    Matrix4,
    Spherical,
    Box3,
    Sphere,
    Raycaster,
  },
});

import { createMaterials } from './staraxis/materials';
import { createStarAxis } from './staraxis/createStarAxis';
import { createTerrain } from './staraxis/terrain';
import { createSky } from './staraxis/sky';
import { createFirstPerson } from './staraxis/firstPerson';
import { buildCollider } from './staraxis/collision';
import { MesaWind, type MesaWindFrame } from './staraxis/wind';
import { WindsweptSand } from './staraxis/windsweptSand';
import { StarAxisSoundscape } from './soundscape';
import {
  CINEMATIC_RESOLUTION_SCALE,
  createVisualEffects,
} from './visualEffects';
import {
  APERTURE_APPROACH_DISTANCE,
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
  stairPoint,
} from './staraxis/constants';
import { EYE_HEIGHT } from './staraxis/walk';
import { SHOT_FPS, SHOT_FRAMES, shotAtFrame } from './cinema';
import { PLATES } from './plates';
import { CLIPS, CLIP_FPS, CLIP_FRAMES, clipFrame } from './timelapse';

const app = document.getElementById('app') as HTMLDivElement;
const consoleEl = document.getElementById('console') as HTMLElement | null;
const consoleStatus = document.getElementById('console-status') as HTMLDivElement | null;
const consoleLive = document.getElementById('console-live') as HTMLSpanElement | null;
const consoleKeys = document.getElementById('console-keys') as HTMLButtonElement | null;
const lightToggle = document.getElementById('light-toggle') as HTMLButtonElement | null;
const lightLabel = document.getElementById('light-label') as HTMLSpanElement | null;
const gate = document.getElementById('gate') as HTMLDivElement | null;
const gateStart = document.getElementById('gate-start') as HTMLButtonElement | null;
const gateQuiet = document.getElementById('gate-quiet') as HTMLButtonElement | null;
const crosshair = document.getElementById('crosshair') as HTMLDivElement | null;
const hints = document.getElementById('hints') as HTMLElement | null;
const hintsToggle = document.getElementById('hints-toggle') as HTMLButtonElement | null;
const immersiveHint = document.getElementById('immersive-hint') as HTMLDivElement | null;
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
const soundStatus = consoleLive;
const soundVolume = document.getElementById('sound-volume') as HTMLInputElement | null;

const soundscape = new StarAxisSoundscape();
let soundPlace = '';

const renderer = new WebGPURenderer({ antialias: true });
// createVisualEffects() owns the backing buffer from here on: Cinematic (the
// default) runs an adaptive ratio around CINEMATIC_RESOLUTION_SCALE, Path
// Traced takes the device's full DPR, Performance keeps its half-resolution
// buffer. Matching that here only avoids allocating a buffer nobody renders.
// ?quality=low starts in Performance; ?quality=high pins Cinematic wide open.
const requestedQuality = new URLSearchParams(location.search).get('quality');
const pixelRatioCap =
  requestedQuality === 'low'
    ? 0.5
    : requestedQuality === 'high'
      ? window.devicePixelRatio
      : CINEMATIC_RESOLUTION_SCALE;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 4000);

// One CameraControls rig for orbit mode and the guided tour: drag to orbit,
// scroll/pinch to dolly (zoom), and setLookAt() for preset / tour framing.
const controls = new CameraControls(camera, renderer.domElement);
controls.smoothTime = 0.35;
controls.draggingSmoothTime = 0.12;
controls.minDistance = 1.5;
controls.maxDistance = 900;
controls.dollySpeed = 1.15;
// Allow steep upward views (sighting Polaris through the aperture needs
// the camera well below its target).
controls.maxPolarAngle = Math.PI * 0.88;
controls.enabled = false;

const fp = createFirstPerson(camera, renderer.domElement);

// ---------------------------------------------------------------- scene build
const bootParams = new URLSearchParams(location.search);
const materials = await createMaterials();
const monument = createStarAxis(materials, { blockout: bootParams.get('blockout') === '1' });
scene.add(monument.group);

const terrain = createTerrain(materials.desert);
scene.add(terrain.group);

const deviceMemory =
  (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
const constrainedDevice = navigator.hardwareConcurrency <= 4 || deviceMemory <= 4;
// Four lanes preserve the visible saltation sheet while cutting the default
// per-frame compute workload by one third. High quality restores the denser
// six-to-eight-lane field.
const sandQuality = requestedQuality === 'high' ? 1.25 : constrainedDevice ? 0.55 : 0.65;
const sand = new WindsweptSand(sandQuality);
scene.add(sand.group);
scene.fogNode = sand.fogNode;
const mesaWind = new MesaWind();
let latestWind: MesaWindFrame = {
  directionX: 1,
  directionZ: 0,
  strength: 0.26,
  gust: 0,
  turbulence: 0.24,
  speed: 0.86,
  elapsed: 0,
};

const sky = createSky();
scene.add(sky.group);
scene.add(sky.sunLight);
scene.add(sky.sunLight.target);
scene.add(sky.hemi);

// ---------------------------------------------------------------- light
// Three states of light, one button. D/G/H still jump straight to one, but the
// visible control is a single chip that walks day → golden hour → night.
const LIGHT_LABELS: Record<'day' | 'goldenHour' | 'night', string> = {
  day: 'Day',
  goldenHour: 'Golden hour',
  night: 'Night',
};
const LIGHT_CYCLE: Array<'day' | 'goldenHour' | 'night'> = ['day', 'goldenHour', 'night'];

function setLight(mode: 'day' | 'goldenHour' | 'night'): void {
  sky.setMode(mode);
  showLightState(mode);
}

function showLightState(
  mode: 'day' | 'goldenHour' | 'night',
  label = LIGHT_LABELS[mode],
): void {
  if (lightToggle) lightToggle.dataset.mode = mode;
  if (lightLabel) lightLabel.textContent = label;
  lightToggle?.setAttribute('aria-label', `Light: ${label}. Click for the next.`);
}

lightToggle?.addEventListener('click', () => {
  setLight(LIGHT_CYCLE[(LIGHT_CYCLE.indexOf(sky.getMode()) + 1) % LIGHT_CYCLE.length]);
});
setLight(sky.getMode());

const visualEffects = createVisualEffects({
  renderer,
  scene,
  camera,
  sunLight: sky.sunLight,
  moonLight: sky.moonLight,
  hemisphereLight: sky.hemi,
  traceRoots: [monument.group, terrain.group],
  highQualityRequested: requestedQuality !== 'low',
  maxQuality: requestedQuality === 'high',
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
const APERTURE_THRESHOLD: [number, number, number] = [
  0,
  APERTURE_CENTER_Y,
  APERTURE_REAR_Z,
];
/** Mid-climb standing eye on the Star Tunnel (a little under halfway). */
const ON_STAIR = stairPoint(0.42);
const ON_STAIR_EYE: [number, number, number] = [
  ON_STAIR.x,
  ON_STAIR.y + EYE_HEIGHT,
  ON_STAIR.z,
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
    target: APERTURE_THRESHOLD,
    fov: 48,
    mode: 'day',
  },
  '4': { pos: [-105, 92, 118], target: [0, 18, -24], fov: 48, mode: 'day' },
  '5': {
    pos: [
      0,
      STAIR_TOP.y + EYE_HEIGHT,
      APERTURE_REAR_Z + APERTURE_APPROACH_DISTANCE,
    ],
    target: APERTURE_VIEW,
    fov: 45,
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
    fact: 'One continuous route: Avenue, Equinoctial Chamber, Star Tunnel, and Solar Pyramid.',
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
    fact: 'The Avenue is a roughly 75-foot-deep excavation leading to the 147-step passage.',
    pos: [0, 4.2, TRENCH_SOUTH_Z - 3],
    target: [0, 10.5, -2],
    fov: 54,
    mode: 'day',
  },
  {
    label: 'Equinoctial',
    title: 'Triangular threshold',
    description:
      'The lower granite flight passes through a triangular void in the retaining wall. Beyond it, the long stair continues north through the rubble bowl under an open sky.',
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
      'The stair rises due north at the local latitude angle. Granite treads climb through an open cut in the mesa, holding a clear sightline to the aperture above.',
    fact: 'One hundred forty-seven treads, each with an 8.25-inch rise.',
    pos: [0, STAIR_BASE.y + EYE_HEIGHT + 0.25, STAIR_BASE.z + 2.2],
    target: APERTURE_THRESHOLD,
    fov: 48,
    mode: 'day',
  },
  {
    label: 'Pyramid rear',
    title: 'The stair enters the Solar Pyramid',
    description:
      'At the upper mesa the stair passes through a deep opening in the south/back face of the Solar Pyramid. The masonry returns, stair bed and shell meet as one construction.',
    fact: 'The Star Tunnel climbs into the pyramid and continues to the Upper Room.',
    pos: [25, 33, -28],
    target: [0, 37, -50],
    fov: 50,
    mode: 'goldenHour',
  },
  {
    label: 'On the stair',
    title: 'Ascending the open axis',
    description:
      'The exposed stair stays open to the sky between its raised granite stringers. Looking ahead, the broad circular aperture stays centered in the view.',
    fact: 'Each tread advances toward the aperture housed in the pyramid crown.',
    pos: ON_STAIR_EYE,
    target: APERTURE_THRESHOLD,
    fov: 48,
    mode: 'day',
  },
  {
    label: 'Aperture',
    title: 'Upper Room and Polaris',
    description:
      'The stair ends on a level eye-height viewing bay. A broad steel-lined mouth opens through a flared passage to the live sky, where stars carry depth and parallax.',
    fact: 'The opening is centered on a six-foot visitor and fills peripheral vision at the threshold.',
    pos: [
      0,
      STAIR_TOP.y + EYE_HEIGHT,
      APERTURE_REAR_Z + APERTURE_APPROACH_DISTANCE,
    ],
    target: APERTURE_VIEW,
    fov: 45,
    mode: 'night',
  },
  {
    label: 'Pyramid front',
    title: 'Hour Chamber slit on the north face',
    description:
      'The public front is a steep truncated pylon: irregular granite courses, a tall needle slit, an upper polar opening, summit rods and twenty exterior granite steps along the rear edge.',
    fact: "The front slit is the Hour Chamber, the pyramid's independent north-facing aperture.",
    pos: [0, 31.5, PYRAMID_FRONT_Z - 26],
    target: [0, 37, PYRAMID_CENTER.z],
    fov: 52,
    mode: 'goldenHour',
  },
];

function applyPreset(p: Preset, transition = false): void {
  const animate = transition && nav === 'orbit';
  controls.normalizeRotations();
  void controls.setLookAt(
    p.pos[0],
    p.pos[1],
    p.pos[2],
    p.target[0],
    p.target[1],
    p.target[2],
    animate,
  );
  if (p.fov) {
    camera.fov = p.fov;
    camera.updateProjectionMatrix();
  }
  if (p.mode) setLight(p.mode);
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
  const prev = nav;
  nav = next;
  if (nav === 'fp') {
    // Drop any in-flight orbit drag before the walker takes the canvas —
    // leftover document pointer listeners can swallow the re-lock gesture.
    controls.enabled = false;
    controls.cancel();
    fp.enable();
    // Scrubbing owns the pointer; keep look disabled until Z is released.
    if (scrubbing) fp.controls.enabled = false;
  } else {
    fp.disable();
    controls.enabled = !scrubbing;
    // Only hand off from the walker. Presets / tour stops already framed
    // the CameraControls rig; don't collapse their orbit distance.
    if (prev === 'fp') {
      const ahead = camera.getWorldDirection(new Vector3()).multiplyScalar(25);
      const target = ahead.add(camera.position);
      controls.normalizeRotations();
      void controls.setLookAt(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        target.x,
        target.y,
        target.z,
        false,
      );
    }
  }
  updateConsole();
}

/** Enter first-person and request pointer lock while a user gesture is live. */
function enterFirstPerson(): void {
  setNav('fp');
  if (!tourOpen && !scrubbing) fp.lock();
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
  applyPreset(TOUR_STOPS[tourIndex], true);
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
  updateConsole();
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

// pointerdown keeps the user-activation token that requestPointerLock needs;
// `click` can lose it after orbit/Esc unlock races.
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (nav === 'fp' && !tourOpen && !scrubbing) fp.lock();
});
fp.onLockChange((locked) => {
  if (crosshair) crosshair.style.opacity = locked ? '1' : '0';
  updateConsole();
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
    controls.normalizeRotations();
    void controls.setLookAt(c[0], c[1], c[2], l[0], l[1], l[2], false);
    const fovParam = Number(params.get('fov'));
    if (Number.isFinite(fovParam) && fovParam > 10) {
      camera.fov = fovParam;
      camera.updateProjectionMatrix();
    }
    if (nav === 'fp') fp.placeAt([c[0], c[1], c[2]], [l[0], l[1], l[2]]);
  }
}
const modeParam = params.get('mode');
if (modeParam === 'day' || modeParam === 'goldenHour' || modeParam === 'night') {
  setLight(modeParam);
}

// ?solar=0.18 places the sun anywhere on the continuous day, which the three
// discrete modes cannot express. Review and capture URLs need it to reach the
// hours the plates are framed at — the moonlit ones especially.
const solarParam = params.has('solar') ? Number(params.get('solar')) : NaN;
if (Number.isFinite(solarParam)) {
  sky.setSolarTime(solarParam);
  showLightState(sky.getMode());
}

// A normal arrival begins in late twilight: the sun a few degrees below the
// western horizon, violet still in the sky, moonlight just starting to take
// over. Explicit views, cameras, tours, and capture modes keep their authored
// lighting so review and rendering URLs remain repeatable.
const DEFAULT_ENTRY_SOLAR_TIME = 0.772;
const defaultArrival =
  !params.has('view') &&
  !params.has('mode') &&
  !params.has('solar') &&
  !params.has('cam') &&
  !params.has('look') &&
  !params.has('tour') &&
  params.get('blockout') !== '1' &&
  params.get('cinema') !== '1';
if (defaultArrival) {
  sky.setSolarTime(DEFAULT_ENTRY_SOLAR_TIME);
  showLightState(sky.getMode(), 'Late twilight');
}

/**
 * Long-exposure star trails. The raster path fades in baked arc geometry; the
 * traced path has no such geometry to fade, so it sweeps the celestial sphere
 * across a frame's samples and lets the accumulation buffer draw the arcs.
 */
const TRACED_TRAIL_ARC = 0.45;
let trails = params.get('trails') === '1' ? 1 : 0;

function applyTrails(): void {
  sky.setTrailAmount(trails);
  visualEffects.setStarTrail(trails > 0 ? TRACED_TRAIL_ARC : 0);
}

if (trails) applyTrails();

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

let immersive = false;

/**
 * Immersive hides every panel including the hints, so a keyboard toggle also
 * announces the way back for a few seconds. Scripted boots pass announce=false
 * so no text can drift into a capture.
 */
function setImmersive(on: boolean, announce = false): void {
  immersive = on;
  document.body.classList.toggle('immersive', immersive);
  if (immersiveHint) immersiveHint.dataset.show = String(on && announce);
}

// ?cinema=1 is how build/capture-shot.mjs opens the page: hide the chrome and
// hold the camera before the first frame is stepped, so no interface or
// interactive framing can leak into a capture.
const cinemaBoot = params.get('cinema') === '1';
if (cinemaBoot) {
  setImmersive(true);
  setNav('orbit');
  controls.enabled = false;
}

// ---------------------------------------------------------------- gate
// A browser will not open an AudioContext without a gesture, so the entrance
// has to be a click either way; making it a door rather than a dialog costs
// nothing and gives the work a threshold. Any scripted URL — captures, plates,
// direct camera framing — walks straight through it.
const scriptedBoot =
  cinemaBoot ||
  params.has('cam') ||
  params.has('look') ||
  params.has('view') ||
  params.has('tour') ||
  params.has('solar') ||
  params.get('blockout') === '1';

function closeGate(withSound: boolean): void {
  if (!gate || gate.dataset.open === 'false') return;
  gate.dataset.open = 'false';
  gate.setAttribute('aria-hidden', 'true');
  document.body.classList.add('entered'); // fades the hints card in behind it
  window.setTimeout(() => gate.remove(), 1000);
  if (withSound) void soundscape.start();
  updateConsole();
}

gateStart?.addEventListener('click', () => closeGate(true));
gateQuiet?.addEventListener('click', () => closeGate(false));
if (scriptedBoot) closeGate(false);
else gateStart?.focus({ preventScroll: true });

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
  if (PRESETS[k]) applyPreset(PRESETS[k], nav === 'orbit');
  else if (k === 'c') {
    if (nav === 'fp') setNav('orbit');
    else enterFirstPerson();
  }
  else if (k === 'f' && nav === 'fp') {
    fp.toggleFly();
    updateConsole();
  } else if (k === 'd') setLight('day');
  else if (k === 'g') setLight('goldenHour');
  else if (k === 'h' || (k === 'n' && e.shiftKey)) setLight('night');
  else if (k === 'n' && !e.repeat) {
    visualEffects.toggleCinematic();
    updateConsole();
  } else if (k === 'p' && !e.repeat) {
    visualEffects.togglePathTracing();
    updateConsole();
  } else if (k === 't') {
    trails = trails > 0 ? 0 : 1;
    applyTrails();
  } else if (k === 'k') {
    void soundscape.toggle();
  } else if (k === 'l' && !e.repeat) {
    visualEffects.togglePane();
  } else if (k === 'i' && !e.repeat) {
    setImmersive(!immersive, true);
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

// ---------------------------------------------------------------- console
// One line of state, and only the state that changes: where you are, or what
// the next click will do. Everything else lives behind "?".
soundscape.onChange((state) => {
  soundPlace = state.audible ? state.place : '';
  soundToggle?.setAttribute('aria-pressed', String(state.audible));
  if (soundLabel) soundLabel.textContent = state.audible ? 'Sound on' : 'Sound off';
  soundToggle?.setAttribute(
    'aria-label',
    state.audible ? 'Mute the soundscape' : 'Unmute the soundscape',
  );
  if (soundStatus) {
    soundStatus.textContent = state.audible
      ? `Generative soundscape sounding in ${state.place}`
      : 'Generative soundscape muted';
  }
  updateConsole();
});
soundToggle?.addEventListener('click', () => void soundscape.toggle());
soundVolume?.addEventListener('input', () => soundscape.setVolume(Number(soundVolume.value)));

// The hints card collapses to its one-word header and back.
hintsToggle?.addEventListener('click', () => {
  if (!hints) return;
  const open = hints.dataset.open !== 'true';
  hints.dataset.open = String(open);
  hintsToggle.setAttribute('aria-expanded', String(open));
});

consoleKeys?.addEventListener('click', () => {
  if (!consoleEl) return;
  const open = consoleEl.dataset.help !== 'true';
  consoleEl.dataset.help = String(open);
  consoleKeys.setAttribute('aria-expanded', String(open));
});

function updateConsole(): void {
  if (!consoleStatus) return;
  consoleStatus.textContent = tourOpen
    ? 'Guided tour · drag to orbit · [ and ] to move through'
    : nav === 'fp'
      ? fp.isLocked()
        ? soundPlace
          ? `Walking · ${soundPlace}`
          : `Walking${fp.fly ? ' · flying' : ''} · Esc to release`
        : 'Click to walk'
      : 'Drag to orbit · scroll to zoom · C to walk';
}

// ---------------------------------------------------------------- zone captions
// Naming the five elements as the visitor reaches them, per staraxis.org.
// On the Star Tunnel stair, each step advances through the 26,000-year
// precession cycle — Polaris's circle grows from dime-sized today to the
// whole sky ~13,000 years from now.
const captionEl = document.getElementById('caption') as HTMLDivElement | null;
let lastCaption = '';

function zoneCaption(x: number, z: number): string {
  if (
    Math.abs(x) < 2.8 &&
    z <= STAIR_TOP.z + 1 &&
    z >= APERTURE_REAR_Z - 2
  ) {
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
    return 'Hour Chamber — the north/front slit looks through the Solar Pyramid';
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
    // Cinematic moves its own pixel ratio to hold the frame budget, so the
    // stats overlay reports where the adaptive controller has landed.
    `${nav}${fp.fly ? ' · fly' : ''} · ${sky.getMode()} · ${visualEffects.getMode()} @ ${renderer
      .getPixelRatio()
      .toFixed(2)}x<br>` +
    `pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
}
setInterval(updateDebug, 500);

// ---------------------------------------------------------------- loop
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  visualEffects.resize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
let frames = 0;
let fpsWindowStart = performance.now();
let lastFps = 0;
const previousCameraPosition = new Vector3().copy(camera.position);
const cameraFacing = new Vector3();

await renderer.init();
sand.initialize(renderer, camera.position);

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (nav === 'fp') fp.update(dt);
  else controls.update(dt);
  sky.update(dt);
  terrain.setDaylight(sky.getDaylight());
  // redraw the shadow map only while the sun is actually moving
  if (sky.sunLight.position.distanceToSquared(sunPrev) > 0.25) {
    sky.sunLight.shadow.needsUpdate = true;
    sunPrev.copy(sky.sunLight.position);
  }
  const cameraTravel = camera.position.distanceTo(previousCameraPosition);
  latestWind = mesaWind.update(dt, camera.position.x, camera.position.z, sky.getMode());
  if (visualEffects.getMode() !== 'path-traced') {
    sand.update(renderer, latestWind, camera.position, dt, sky.getMode());
  }
  camera.getWorldDirection(cameraFacing);
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
    windDirectionX: latestWind.directionX,
    windDirectionZ: latestWind.directionZ,
    forwardX: cameraFacing.x,
    forwardY: cameraFacing.y,
    forwardZ: cameraFacing.z,
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

// ---------------------------------------------------------------- offline capture
// Frame-stepped path-traced rendering for the 24 fps shot in cinema.ts. The
// animation loop is torn down first: every frame here is driven by an explicit
// call, so wall-clock time never enters the result and a frame can take as
// long as its sample budget needs.

interface CinemaOptions {
  samples?: number;
  bounces?: number;
}

export interface CapturedFrame {
  /** PNG data URL. */
  png: string;
  /** Mean luma and alpha of the PNG, 0-255, from a 32x32 downsample. */
  luma: number;
  alpha: number;
}

/**
 * Read the canvas and measure what was read.
 *
 * A capture that silently produced an empty drawing buffer encodes to a
 * perfectly valid blank PNG, so nothing downstream notices. The measurement
 * has to come from the encoded image rather than from the canvas afterwards:
 * reading a WebGPU canvas invalidates it, so a probe taken after toDataURL
 * always sees an empty surface and reports every frame as blank.
 */
async function presentAndProbe(): Promise<CapturedFrame> {
  // Wait for the GPU to finish before reading the canvas. Without the
  // animation loop there is nothing else driving presentation, and reading
  // while work is still queued yields the *previous* frame — which in a
  // sequence of stills shows up as two identical plates, and in a video as a
  // duplicated frame nobody notices.
  const queue = (renderer as unknown as {
    backend?: { device?: { queue?: { onSubmittedWorkDone?: () => Promise<void> } } };
  }).backend?.device?.queue;
  await queue?.onSubmittedWorkDone?.();

  const png = renderer.domElement.toDataURL('image/png');
  const image = new Image();
  image.src = png;
  await image.decode();
  const probe = document.createElement('canvas');
  probe.width = 32;
  probe.height = 32;
  const context = probe.getContext('2d', { willReadFrequently: true });
  if (!context) return { png, luma: -1, alpha: -1 };
  context.drawImage(image, 0, 0, 32, 32);
  const { data } = context.getImageData(0, 0, 32, 32);
  let luma = 0;
  let alpha = 0;
  for (let i = 0; i < data.length; i += 4) {
    luma += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    alpha += data[i + 3];
  }
  const pixels = data.length / 4;
  return {
    png,
    luma: Number((luma / pixels).toFixed(3)),
    alpha: Number((alpha / pixels).toFixed(3)),
  };
}

const cinema = {
  fps: SHOT_FPS,
  frames: SHOT_FRAMES,
  samples: 160,
  bounces: 4,
  ready: false,

  async begin(options: CinemaOptions = {}): Promise<boolean> {
    renderer.setAnimationLoop(null);
    if (options.samples) cinema.samples = options.samples;
    if (options.bounces) cinema.bounces = options.bounces;
    if (!cinemaBoot) {
      setImmersive(true);
      setNav('orbit');
      controls.enabled = false;
    }
    soundscape.setVolume(0);
    cinema.ready = await visualEffects.preparePathTracing();
    return cinema.ready;
  },

  /** Place the camera and the sun for `index`, then trace and return a PNG. */
  async frame(index: number): Promise<CapturedFrame> {
    const shot = shotAtFrame(index);
    camera.position.copy(shot.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(shot.target);
    camera.fov = shot.fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    sky.setSolarTime(shot.solarTime);
    // Settle the celestial opacities without advancing the star rotation.
    sky.update(0);
    terrain.setDaylight(sky.getDaylight());
    sky.sunLight.updateMatrixWorld(true);
    sky.moonLight.updateMatrixWorld(true);
    visualEffects.renderPathTracedFrame(cinema.samples, cinema.bounces);
    return presentAndProbe();
  },

  /** Render still plate `index` from plates.ts and return it as a PNG. */
  async plate(index: number): Promise<CapturedFrame> {
    const plate = PLATES[Math.min(PLATES.length - 1, Math.max(0, index))];
    camera.position.copy(plate.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(plate.target);
    camera.fov = plate.fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    sky.setSolarTime(plate.solarTime);
    sky.update(0);
    terrain.setDaylight(sky.getDaylight());
    sky.sunLight.updateMatrixWorld(true);
    sky.moonLight.updateMatrixWorld(true);
    visualEffects.setStarTrail(plate.trailArc ?? 0);
    visualEffects.renderPathTracedFrame(plate.samples, plate.bounces ?? cinema.bounces);
    return presentAndProbe();
  },

  plateInfo(index: number) {
    const plate = PLATES[Math.min(PLATES.length - 1, Math.max(0, index))];
    return {
      id: plate.id,
      title: plate.title,
      samples: plate.samples,
      solarTime: plate.solarTime,
      sunElevation: Number(
        ((Math.asin(sky.sunLight.position.clone().normalize().y) * 180) / Math.PI).toFixed(2),
      ),
      moonIntensity: Number(sky.moonLight.intensity.toFixed(4)),
      size: [renderer.domElement.width, renderer.domElement.height],
    };
  },

  plateCount: PLATES.length,
  clipCount: CLIPS.length,
  clipFps: CLIP_FPS,
  clipFrames: CLIP_FRAMES,

  /** Render one frame of time-lapse clip `clipIndex` and return it as a PNG. */
  async clip(clipIndex: number, frameIndex: number): Promise<CapturedFrame> {
    const frame = clipFrame(clipIndex, frameIndex);
    camera.position.copy(frame.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(frame.target);
    camera.fov = frame.fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    sky.setSolarTime(frame.solarTime);
    sky.update(0);
    terrain.setDaylight(sky.getDaylight());
    sky.sunLight.updateMatrixWorld(true);
    sky.moonLight.updateMatrixWorld(true);
    visualEffects.setCelestialRotation(frame.celestialRotation);
    visualEffects.setStarTrail(frame.trailArc);
    visualEffects.renderPathTracedFrame(frame.samples, frame.bounces);
    return presentAndProbe();
  },

  clipInfo(clipIndex: number) {
    const clip = CLIPS[Math.min(CLIPS.length - 1, Math.max(0, clipIndex))];
    return {
      id: clip.id,
      title: clip.title,
      frames: CLIP_FRAMES,
      fps: CLIP_FPS,
      samples: clip.samples,
      solar: [clip.solarFrom, clip.solarTo],
      size: [renderer.domElement.width, renderer.domElement.height],
    };
  },

  state(index: number) {
    const shot = shotAtFrame(index);
    return {
      index,
      spp: visualEffects.snapshot().pathSamples,
      solarTime: Number(shot.solarTime.toFixed(4)),
      sunElevation: Number(
        ((Math.asin(sky.sunLight.position.clone().normalize().y) * 180) / Math.PI).toFixed(2),
      ),
      sunIntensity: Number(sky.sunLight.intensity.toFixed(3)),
      moonIntensity: Number(sky.moonLight.intensity.toFixed(4)),
      mode: sky.getMode(),
      camera: shot.position.toArray().map((value) => Number(value.toFixed(2))),
      size: [renderer.domElement.width, renderer.domElement.height],
    };
  },
};

// Screenshot hook for the sculpt review pipeline (canvas → PNG data URL).
declare global {
  interface Window {
    __capture?: () => string;
    __setView?: (key: string) => void;
    __setTour?: (index: number) => void;
    __cinema?: typeof cinema;
  }
}
window.__cinema = cinema;
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
    __pick?: (ndcX: number, ndcY: number) => unknown;
    __audioProbe?: (
      position: [number, number, number],
      seconds?: number,
    ) => Promise<unknown>;
  }
}

// Hold the listener at one point on the site and report the settled output
// level there. Checking the mix by ear does not survive a code review; this
// makes "is the Star Tunnel louder than the mesa, and does either clip?" a
// measurement.
window.__audioProbe = async ([x, y, z], seconds = 7) => {
  const step = 1 / 60;
  const frames = Math.round(seconds / step);
  const settle = Math.round(frames * 0.7);
  let peak = 0;
  let rms = 0;
  let samples = 0;
  for (let i = 0; i < frames; i++) {
    soundscape.update({
      x,
      y,
      z,
      dt: step,
      mode: sky.getMode(),
      moving: false,
      windStrength: latestWind.strength,
      windGust: latestWind.gust,
      windTurbulence: latestWind.turbulence,
      windDirectionX: latestWind.directionX,
      windDirectionZ: latestWind.directionZ,
      forwardX: 0,
      forwardY: 0,
      forwardZ: -1,
    });
    if (i > settle) {
      const meter = soundscape.meter();
      peak = Math.max(peak, meter.peak);
      rms += meter.rms;
      samples++;
    }
    await new Promise((resolve) => setTimeout(resolve, step * 1000));
  }
  return {
    position: [x, y, z],
    place: soundscape.snapshot().place,
    peak: Number(peak.toFixed(4)),
    rms: Number((rms / Math.max(1, samples)).toFixed(4)),
  };
};

// Name whatever is under a normalized-device coordinate. Reviewing renders
// means asking "what is that shape?" constantly, and guessing from a builder's
// source is slower and less reliable than asking the scene.
const pickRaycaster = new Raycaster();
window.__pick = (ndcX, ndcY) => {
  pickRaycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
  return pickRaycaster
    .intersectObject(scene, true)
    .slice(0, 4)
    .map((hit) => ({
      name: hit.object.name || hit.object.type,
      parent: hit.object.parent?.name ?? null,
      distance: Number(hit.distance.toFixed(2)),
      point: hit.point.toArray().map((value) => Number(value.toFixed(2))),
    }));
};
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
  soundscape: { ...soundscape.snapshot(), meter: soundscape.meter() },
  visualEffects: visualEffects.snapshot(),
  sculptRuntime: monument.group.userData.sculptRuntime,
});
