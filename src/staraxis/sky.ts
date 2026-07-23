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
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicNodeMaterial,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';
import {
  Fn,
  Loop,
  clamp,
  color,
  cameraPosition,
  cos,
  cross,
  dot,
  exp,
  float,
  floor,
  fract,
  length,
  max,
  mix,
  normalize,
  positionWorld,
  pow,
  sin,
  smoothstep,
  step,
  time,
  triNoise3D,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { LATITUDE_RAD, SKY_RADIUS } from './constants';

export interface SkyRig {
  group: Group;
  sunLight: DirectionalLight;
  hemi: HemisphereLight;
  setMode(mode: 'day' | 'goldenHour' | 'night'): void;
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

/** Star-cell density: cells per unit of direction space. */
const STAR_DENSITY = 64;

/** Number of rotated samples used to draw star trails. */
const TRAIL_SAMPLES = 24;

/** Total trail arc (radians) at trailAmount = 1. */
const TRAIL_ARC = 0.45;

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

// ---------------------------------------------------------------- entry point

export function createSky(): SkyRig {
  const group = new Group();
  group.name = 'sky';

  // ------------------------------------------------------------- uniforms
  const uDayNight = uniform(1); // 0 = night, 1 = day
  const uGolden = uniform(0);
  const uTrail = uniform(0);
  const uStarAngle = uniform(0);
  const uSunDir = uniform(MODES.day.sunDir.clone());

  // ------------------------------------------------------------- TSL helpers
  /** Hash a cell coordinate (vec3) + scalar seed to [0, 1). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hash3 = (p: any, seed: number): any =>
    fract(sin(dot(p, vec3(127.1, 311.7, 74.7)).add(seed)).mul(43758.5453123));

  /** Rodrigues rotation of v about a unit axis by angle ang. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rotateAboutAxis = (v: any, axis: any, ang: any): any => {
    const c = cos(ang);
    const s = sin(ang);
    return v
      .mul(c)
      .add(cross(axis, v).mul(s))
      .add(axis.mul(dot(axis, v)).mul(c.oneMinus()));
  };

  // ------------------------------------------------------------- sky dome
  const skyColor = Fn(() => {
    const axis = vec3(POLARIS_AXIS.x, POLARIS_AXIS.y, POLARIS_AXIS.z);
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

    // ---- NIGHT: near-black gradient + rotating star field + trails.
    const night = mix(color('#0a1024'), color('#050810'), smoothstep(0.0, 0.5, up)).toVar();
    const starMask = smoothstep(-0.02, 0.1, dir.y).toVar();

    // Star trails: sample the star hash at rotated offsets along the
    // rotation direction. Each sample is smeared along the local rotation
    // tangent so consecutive samples fuse into continuous arcs.
    const stepAngle = uTrail.mul(TRAIL_ARC / TRAIL_SAMPLES);
    const stretch = uTrail.mul(8.0).add(1.0);
    const starAcc = vec3(0.0).toVar();

    Loop(TRAIL_SAMPLES, ({ i }) => {
      const fi = float(i);
      const angle = uStarAngle.sub(fi.mul(stepAngle));
      const rd = rotateAboutAxis(dir, axis, angle).toVar();
      // Local direction of star motion (tangent of rotation about the axis).
      const tangent = normalize(cross(axis, rd).add(vec3(1e-4, 0.0, 0.0))).toVar();

      const p = rd.mul(STAR_DENSITY);
      const cell = floor(p).toVar();
      const f = fract(p).sub(0.5).toVar();

      const presence = step(0.7, hash3(cell, 5.0));
      const offset = vec3(hash3(cell, 1.0), hash3(cell, 2.0), hash3(cell, 3.0))
        .sub(0.5)
        .mul(0.72);
      const mag = hash3(cell, 4.0);
      const brightness = pow(mag, 14.0).mul(2.2).add(pow(mag, 4.0).mul(0.28));
      const radius = pow(mag, 6.0).mul(0.1).add(0.055);

      // Anisotropic distance: compress along the tangent to elongate stars.
      const delta = f.sub(offset).toVar();
      const dT = dot(delta, tangent);
      const dP = delta.sub(tangent.mul(dT));
      const distEff = length(dP.add(tangent.mul(dT.div(stretch))));
      const disc = smoothstep(radius, radius.mul(0.25), distEff);

      // Color temperature: blue-white to amber.
      const starCol = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.85, 0.62), hash3(cell, 6.0));
      const falloff = fi.div(TRAIL_SAMPLES).oneMinus().mul(0.85).add(0.15);
      starAcc.assign(max(starAcc, starCol.mul(disc.mul(brightness).mul(presence).mul(falloff))));
    });

    // Faint Milky-Way band, rotating with the star field.
    const rd0 = rotateAboutAxis(dir, axis, uStarAngle).toVar();
    const mwNormal = normalize(vec3(0.62, 0.18, 0.76));
    const mwBand = exp(pow(dot(rd0, mwNormal), 2.0).mul(-28.0));
    const mwNoise = triNoise3D(rd0.mul(2.6), 0.0, float(0.0));
    const milkyWay = vec3(0.62, 0.68, 0.85).mul(mwBand).mul(mwNoise.mul(0.7).add(0.3)).mul(0.14);

    // Polaris: one bright fixed star exactly on the rotation axis.
    const pd = dot(dir, axis);
    const polarisDisc = smoothstep(Math.cos(0.006), Math.cos(0.002), pd);
    const polarisGlow = smoothstep(0.99988, 1.0, pd).mul(0.3);
    const polaris = vec3(1.0, 0.97, 0.9).mul(polarisDisc.mul(2.0).add(polarisGlow));

    night.addAssign(starAcc.add(milkyWay).add(polaris).mul(starMask));

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

  // ------------------------------------------------------------- lights
  const sunLight = new DirectionalLight(MODES.day.sunColor, MODES.day.sunIntensity);
  sunLight.name = 'sun';
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
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
  let fadeT = 1; // 1 = fade complete
  let fromState = cloneState(MODES.day);
  let toState = cloneState(MODES.day);
  const current = cloneState(MODES.day);
  let starAngle = 0;

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

  applyState(current);

  const setMode = (next: SkyMode): void => {
    if (next === mode && fadeT >= 1) return;
    mode = next;
    fromState = cloneState(current);
    toState = cloneState(MODES[next]);
    fadeT = 0;
  };

  const setTrailAmount = (a: number): void => {
    uTrail.value = Math.min(1, Math.max(0, a));
  };

  const update = (dt: number): void => {
    // Star rotation: full revolution in ~4 minutes.
    starAngle = (starAngle + dt * STAR_ROTATION_SPEED) % (Math.PI * 2);
    uStarAngle.value = starAngle;

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
  };

  const getMode = (): SkyMode => mode;

  return { group, sunLight, hemi, setMode, setTrailAmount, update, getMode };
}
