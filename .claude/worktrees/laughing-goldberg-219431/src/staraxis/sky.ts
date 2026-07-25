/**
 * Sky rig for the Star Axis site.
 *
 * A single TSL-shaded dome cross-fades between three states (day, golden
 * hour, night). At night a procedural star field rotates about the Polaris
 * axis (34.5 degrees altitude, due north), with an optional long-exposure
 * star-trail effect done purely in the fragment shader. A DirectionalLight
 * sun and a HemisphereLight track the mode transitions.
 */

import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicNodeMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';
import {
  Fn,
  clamp,
  color,
  cameraPosition,
  dot,
  mix,
  normalize,
  positionWorld,
  pow,
  smoothstep,
  time,
  triNoise3D,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { LATITUDE_RAD, SKY_RADIUS, STAR_COUNT } from './constants';

export interface SkyRig {
  group: Group;
  sunLight: DirectionalLight;
  hemi: HemisphereLight;
  setMode(mode: 'day' | 'goldenHour' | 'night'): void;
  /** Scrub a continuous solar day; `deltaDays` is a fraction of a full cycle. */
  scrubSolar(deltaDays: number): void;
  setTrailAmount(a: number): void;
  update(dt: number): void;
  getMode(): 'day' | 'goldenHour' | 'night';
}

type SkyMode = 'day' | 'goldenHour' | 'night';

// ---------------------------------------------------------------- constants

/** Unit vector toward Polaris: up-tilted due north (-Z). */
const POLARIS_AXIS = new Vector3(
  0,
  Math.sin(LATITUDE_RAD),
  -Math.cos(LATITUDE_RAD),
).normalize();

/** Full star revolution in ~4 minutes so the motion is visible. */
const STAR_ROTATION_SPEED = (Math.PI * 2) / 240; // rad/s

/** Cross-fade duration between sky modes (seconds). */
const FADE_DURATION = 2;

/** Total trail arc (radians) at trailAmount = 1. */
const TRAIL_ARC = 0.45;

function hash01(i: number, salt: number): number {
  const s = Math.sin(i * 12.9898 + salt * 78.233 + 0.5) * 43758.5453123;
  return s - Math.floor(s);
}

// ---------------------------------------------------------------- mode targets

interface ModeState {
  dayNight: number; // 0 = night, 1 = day
  golden: number; // 0..1 golden-hour weight
  sunDir: Vector3; // unit vector toward the sun
  sunColor: Color;
  sunIntensity: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
}

function makeSunDir(elevationDeg: number, azimuthX: number, azimuthZ: number): Vector3 {
  const el = (elevationDeg * Math.PI) / 180;
  const horiz = Math.cos(el);
  return new Vector3(azimuthX * horiz, Math.sin(el), azimuthZ * horiz).normalize();
}

const MODES: Record<SkyMode, ModeState> = {
  day: {
    dayNight: 1,
    golden: 0,
    // Elevation ~55 deg, azimuth SSW (south = +Z, west = -X).
    sunDir: makeSunDir(55, -Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)),
    sunColor: new Color('#fff4e0'),
    sunIntensity: 3.0,
    hemiSky: new Color('#bcd4f5'),
    hemiGround: new Color('#c2a678'),
    hemiIntensity: 0.9,
  },
  goldenHour: {
    dayNight: 1,
    golden: 1,
    // Elevation ~8 deg, due WEST (-X).
    sunDir: makeSunDir(8, -1, 0),
    sunColor: new Color('#ffb865'),
    sunIntensity: 2.2,
    hemiSky: new Color('#ffd9a6'),
    hemiGround: new Color('#8a6b4d'),
    hemiIntensity: 0.55,
  },
  night: {
    dayNight: 0,
    golden: 0,
    sunDir: new Vector3(0, -0.35, 0.94).normalize(), // parked below the horizon
    sunColor: new Color('#8fa5cc'),
    sunIntensity: 0,
    hemiSky: new Color('#16233f'),
    hemiGround: new Color('#0a0d14'),
    hemiIntensity: 0.06,
  },
};

function cloneState(s: ModeState): ModeState {
  return {
    dayNight: s.dayNight,
    golden: s.golden,
    sunDir: s.sunDir.clone(),
    sunColor: s.sunColor.clone(),
    sunIntensity: s.sunIntensity,
    hemiSky: s.hemiSky.clone(),
    hemiGround: s.hemiGround.clone(),
    hemiIntensity: s.hemiIntensity,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Representative solar times for the discrete D / G / N presets. */
const MODE_SOLAR_TIME: Record<SkyMode, number> = {
  day: 0.5,
  goldenHour: 0.73,
  night: 0,
};

/** Peak solar elevation at local noon (degrees). */
const NOON_ELEVATION_DEG = 58;

/**
 * Continuous day cycle: t=0 midnight, 0.25 sunrise (east), 0.5 noon (south),
 * 0.75 sunset (west). Scene axes: +X east, +Z south, -X west.
 */
function stateFromSolarTime(t: number): ModeState {
  const phase = ((t % 1) + 1) % 1;
  const elevDeg = NOON_ELEVATION_DEG * Math.sin(Math.PI * 2 * (phase - 0.25));
  const az = Math.PI * 2 * (phase - 0.25);
  const sunDir = makeSunDir(elevDeg, Math.cos(az), Math.sin(az));

  const dayNight = smoothstep01(-6, 14, elevDeg);
  // Warm lobe around ~8° elevation (sunrise / sunset), off at night and noon.
  const golden = dayNight * Math.exp(-(((elevDeg - 8) / 14) ** 2));

  const day = MODES.day;
  const gold = MODES.goldenHour;
  const night = MODES.night;
  const s = cloneState(night);
  s.dayNight = dayNight;
  s.golden = Math.min(1, golden);
  s.sunDir.copy(sunDir);
  s.sunColor.lerpColors(night.sunColor, day.sunColor, dayNight).lerp(gold.sunColor, s.golden);
  s.sunIntensity = lerp(
    lerp(night.sunIntensity, day.sunIntensity, dayNight),
    gold.sunIntensity,
    s.golden,
  );
  s.hemiSky.lerpColors(night.hemiSky, day.hemiSky, dayNight).lerp(gold.hemiSky, s.golden);
  s.hemiGround
    .lerpColors(night.hemiGround, day.hemiGround, dayNight)
    .lerp(gold.hemiGround, s.golden);
  s.hemiIntensity = lerp(
    lerp(night.hemiIntensity, day.hemiIntensity, dayNight),
    gold.hemiIntensity,
    s.golden,
  );
  return s;
}

function nearestMode(dayNight: number, golden: number): SkyMode {
  if (dayNight < 0.35) return 'night';
  if (golden > 0.45) return 'goldenHour';
  return 'day';
}

// ---------------------------------------------------------------- entry point

export function createSky(): SkyRig {
  const group = new Group();
  group.name = 'sky';

  // ------------------------------------------------------------- uniforms
  const uDayNight = uniform(1); // 0 = night, 1 = day
  const uGolden = uniform(0);
  const uSunDir = uniform(MODES.day.sunDir.clone());

  // ------------------------------------------------------------- sky dome
  const skyColor = Fn(() => {
    const dir = normalize(positionWorld.sub(cameraPosition)).toVar();
    const up = clamp(dir.y, 0.0, 1.0).toVar();
    const sunDot = clamp(dot(dir, uSunDir), 0.0, 1.0).toVar();
    const groundFade = smoothstep(0.05, -0.08, dir.y).toVar();

    // Soft procedural cloud bands, shared by day and golden hour.
    const cloudNoise = triNoise3D(vec3(dir.x, dir.y.mul(2.6), dir.z).mul(1.35), 0.06, time);
    const cloudBand = smoothstep(0.02, 0.18, dir.y).mul(smoothstep(0.85, 0.28, dir.y));
    const cloud = smoothstep(0.5, 0.82, cloudNoise).mul(cloudBand).toVar();

    // ---- DAY: zenith blue to pale warm horizon + sun glow.
    const day = mix(color('#dfe9f5'), color('#3d6cb5'), pow(up, 0.6)).toVar();
    day.assign(mix(day, color('#d9c8aa'), groundFade.mul(0.55))); // sand tint at grade
    day.addAssign(vec3(1.0, 1.0, 1.0).mul(cloud.mul(0.13)));
    day.addAssign(
      color('#fff2d8').mul(pow(sunDot, 900.0).mul(2.2).add(pow(sunDot, 10.0).mul(0.16))),
    );

    // ---- GOLDEN HOUR: warm horizon, dusky zenith, strong low-sun lobe.
    const golden = mix(color('#f5c07a'), color('#4a5f8f'), pow(up, 0.75)).toVar();
    golden.assign(mix(golden, color('#cf9a68'), groundFade.mul(0.5)));
    golden.addAssign(vec3(1.0, 0.85, 0.7).mul(cloud.mul(0.1)));
    golden.addAssign(color('#ff9a4d').mul(pow(sunDot, 4.0).mul(0.5)));
    golden.addAssign(color('#ffd9a8').mul(pow(sunDot, 700.0).mul(3.0)));

    // ---- NIGHT: near-black gradient. Stars and trails are baked once into
    // geometry below instead of being searched per pixel in this shader.
    const night = mix(color('#0a1024'), color('#050810'), smoothstep(0.0, 0.5, up)).toVar();

    // ---- Blend the three states.
    const base = mix(night, day, uDayNight);
    return vec4(mix(base, golden, uGolden), 1.0);
  })();

  const domeMaterial = new MeshBasicNodeMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  domeMaterial.colorNode = skyColor;

  const dome = new Mesh(new SphereGeometry(SKY_RADIUS, 48, 24), domeMaterial);
  dome.name = 'sky-dome';
  dome.frustumCulled = false;
  group.add(dome);

  // ------------------------------------------------------------- baked stars
  // One deterministic point cloud replaces the old full-screen hash loop.
  // Rotating this group around POLARIS_AXIS preserves the celestial motion
  // at a tiny fraction of the fragment cost.
  const celestial = new Group();
  celestial.name = 'baked-celestial-field';
  const starPositions = new Float32Array(STAR_COUNT * 3);
  const starColors = new Float32Array(STAR_COUNT * 3);
  const cool = new Color('#b7ccff');
  const warm = new Color('#ffe0ad');
  const starColor = new Color();
  const starDirs: Vector3[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const starRadius = SKY_RADIUS * 0.94;
  for (let i = 0; i < STAR_COUNT; i++) {
    const y = 1 - (2 * (i + 0.5)) / STAR_COUNT;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * goldenAngle + (hash01(i, 1) - 0.5) * 0.18;
    const dir = new Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r);
    starDirs.push(dir);
    starPositions[i * 3] = dir.x * starRadius;
    starPositions[i * 3 + 1] = dir.y * starRadius;
    starPositions[i * 3 + 2] = dir.z * starRadius;
    const magnitude = Math.pow(hash01(i, 2), 5);
    starColor
      .lerpColors(cool, warm, hash01(i, 3))
      .multiplyScalar(0.5 + magnitude * 1.6);
    starColors[i * 3] = starColor.r;
    starColors[i * 3 + 1] = starColor.g;
    starColors[i * 3 + 2] = starColor.b;
  }
  const starGeometry = new BufferGeometry();
  starGeometry.setAttribute('position', new BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new BufferAttribute(starColors, 3));
  const starMaterial = new PointsMaterial({
    size: 1.45,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const stars = new Points(starGeometry, starMaterial);
  stars.name = 'baked-stars';
  stars.frustumCulled = false;
  celestial.add(stars);

  const polarisGeometry = new BufferGeometry();
  polarisGeometry.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([
        POLARIS_AXIS.x * starRadius,
        POLARIS_AXIS.y * starRadius,
        POLARIS_AXIS.z * starRadius,
      ]),
      3,
    ),
  );
  const polarisMaterial = new PointsMaterial({
    color: '#fff5d9',
    size: 4,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const polaris = new Points(polarisGeometry, polarisMaterial);
  polaris.name = 'polaris';
  polaris.frustumCulled = false;
  celestial.add(polaris);

  // Bake short arc segments for a representative bright subset. The entire
  // trail layer is a single line draw and only appears when T is enabled.
  const trailPositions: number[] = [];
  const trailColors: number[] = [];
  const trailSegments = 5;
  for (let i = 0; i < STAR_COUNT; i++) {
    if (hash01(i, 4) < 0.965) continue;
    for (let segment = 0; segment < trailSegments; segment++) {
      const a0 = -(TRAIL_ARC * segment) / trailSegments;
      const a1 = -(TRAIL_ARC * (segment + 1)) / trailSegments;
      const p0 = starDirs[i].clone().applyAxisAngle(POLARIS_AXIS, a0).multiplyScalar(starRadius);
      const p1 = starDirs[i].clone().applyAxisAngle(POLARIS_AXIS, a1).multiplyScalar(starRadius);
      trailPositions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      const fade0 = 1 - segment / trailSegments;
      const fade1 = 1 - (segment + 1) / trailSegments;
      trailColors.push(fade0, fade0 * 0.9, fade0 * 0.75, fade1, fade1 * 0.9, fade1 * 0.75);
    }
  }
  const trailGeometry = new BufferGeometry();
  trailGeometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(trailPositions), 3),
  );
  trailGeometry.setAttribute(
    'color',
    new BufferAttribute(new Float32Array(trailColors), 3),
  );
  const trailMaterial = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const trails = new LineSegments(trailGeometry, trailMaterial);
  trails.name = 'baked-star-trails';
  trails.frustumCulled = false;
  trails.visible = false;
  celestial.add(trails);
  group.add(celestial);

  // ------------------------------------------------------------- lights
  const sunLight = new DirectionalLight(MODES.day.sunColor, MODES.day.sunIntensity);
  sunLight.name = 'sun';
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -140;
  sunLight.shadow.camera.right = 140;
  sunLight.shadow.camera.top = 140;
  sunLight.shadow.camera.bottom = -140;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 600;
  sunLight.shadow.bias = -0.0005;
  sunLight.position.copy(MODES.day.sunDir).multiplyScalar(300);
  sunLight.target.position.set(0, 0, 0);
  group.add(sunLight);
  group.add(sunLight.target);

  const hemi = new HemisphereLight(
    MODES.day.hemiSky,
    MODES.day.hemiGround,
    MODES.day.hemiIntensity,
  );
  hemi.name = 'hemi';
  group.add(hemi);

  // ------------------------------------------------------------- state
  let mode: SkyMode = 'day';
  let solarTime = MODE_SOLAR_TIME.day;
  let fadeT = 1; // 1 = fade complete
  let fromState = cloneState(MODES.day);
  let toState = cloneState(MODES.day);
  const current = cloneState(MODES.day);
  let starAngle = 0;
  let trailAmount = 0;

  const applyState = (s: ModeState): void => {
    uDayNight.value = s.dayNight;
    uGolden.value = s.golden;
    uSunDir.value.copy(s.sunDir);
    sunLight.color.copy(s.sunColor);
    sunLight.intensity = s.sunIntensity;
    sunLight.position.copy(s.sunDir).multiplyScalar(300);
    hemi.color.copy(s.hemiSky);
    hemi.groundColor.copy(s.hemiGround);
    hemi.intensity = s.hemiIntensity;
  };

  const copyStateInto = (target: ModeState, source: ModeState): void => {
    target.dayNight = source.dayNight;
    target.golden = source.golden;
    target.sunDir.copy(source.sunDir);
    target.sunColor.copy(source.sunColor);
    target.sunIntensity = source.sunIntensity;
    target.hemiSky.copy(source.hemiSky);
    target.hemiGround.copy(source.hemiGround);
    target.hemiIntensity = source.hemiIntensity;
  };

  applyState(current);

  const setMode = (next: SkyMode): void => {
    mode = next;
    solarTime = MODE_SOLAR_TIME[next];
    fromState = cloneState(current);
    toState = cloneState(MODES[next]);
    fadeT = 0;
  };

  const scrubSolar = (deltaDays: number): void => {
    if (deltaDays === 0) return;
    solarTime = ((solarTime + deltaDays) % 1 + 1) % 1;
    fadeT = 1; // cancel any in-flight discrete fade
    copyStateInto(current, stateFromSolarTime(solarTime));
    mode = nearestMode(current.dayNight, current.golden);
    applyState(current);
  };

  const setTrailAmount = (a: number): void => {
    trailAmount = Math.min(1, Math.max(0, a));
  };

  const update = (dt: number): void => {
    // Star rotation: full revolution in ~4 minutes.
    starAngle = (starAngle + dt * STAR_ROTATION_SPEED) % (Math.PI * 2);
    celestial.setRotationFromAxisAngle(POLARIS_AXIS, starAngle);

    // Mode cross-fade over ~FADE_DURATION seconds, smoothstep-eased.
    if (fadeT < 1) {
      fadeT = Math.min(1, fadeT + dt / FADE_DURATION);
      const e = fadeT * fadeT * (3 - 2 * fadeT);

      current.dayNight = lerp(fromState.dayNight, toState.dayNight, e);
      current.golden = lerp(fromState.golden, toState.golden, e);
      current.sunDir.lerpVectors(fromState.sunDir, toState.sunDir, e).normalize();
      current.sunColor.lerpColors(fromState.sunColor, toState.sunColor, e);
      current.sunIntensity = lerp(fromState.sunIntensity, toState.sunIntensity, e);
      current.hemiSky.lerpColors(fromState.hemiSky, toState.hemiSky, e);
      current.hemiGround.lerpColors(fromState.hemiGround, toState.hemiGround, e);
      current.hemiIntensity = lerp(fromState.hemiIntensity, toState.hemiIntensity, e);

      applyState(current);
    }

    const nightOpacity = 1 - current.dayNight;
    starMaterial.opacity = nightOpacity;
    polarisMaterial.opacity = nightOpacity;
    stars.visible = nightOpacity > 0.002;
    polaris.visible = stars.visible;
    trailMaterial.opacity = nightOpacity * trailAmount * 0.5;
    trails.visible = trailMaterial.opacity > 0.002;
  };

  const getMode = (): SkyMode => mode;

  return { group, sunLight, hemi, setMode, scrubSolar, setTrailAmount, update, getMode };
}
