import {
  Color,
  HalfFloatType,
  Matrix4,
  MeshBasicNodeMaterial,
  StorageTexture,
  StructTypeNode,
  Vector2,
  Vector3,
  type DirectionalLight,
  type HemisphereLight,
  type Material,
  type Object3D,
  type PerspectiveCamera,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  attribute,
  float,
  localId,
  smoothstep,
  texture,
  textureStore,
  uniform,
  uv,
  varyingProperty,
  vec4,
  vibrance,
  wgslFn,
  workgroupId,
} from 'three/tsl';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { LATITUDE_RAD } from './staraxis/constants';
import { BVHComputeData } from 'three-mesh-bvh/webgpu';
import * as BVHWebGPU from 'three-mesh-bvh/webgpu';

const ndcToCameraRay = (
  BVHWebGPU as unknown as { ndcToCameraRay: unknown }
).ndcToCameraRay;
const wgslTagFn = (
  BVHWebGPU as unknown as { wgslTagFn: (tokens: TemplateStringsArray, ...args: any[]) => any }
).wgslTagFn;

const WORKGROUP_SIZE: [number, number, number] = [8, 8, 1];
/** Ceiling for one render() call. Offline capture asks for the whole budget. */
const MAX_SAMPLES_PER_CALL = 1024;
const _drawingBufferSize = new Vector2();
const _instanceColor = new Color();
const _sunDirection = new Vector3();
const _moonDirection = new Vector3();
const _lastSunDirection = new Vector3(Number.NaN, Number.NaN, Number.NaN);
const _lastMoonDirection = new Vector3(Number.NaN, Number.NaN, Number.NaN);
const _lastSunColor = new Color(Number.NaN, Number.NaN, Number.NaN);
const _lastSkyColor = new Color(Number.NaN, Number.NaN, Number.NaN);
const _lastGroundColor = new Color(Number.NaN, Number.NaN, Number.NaN);

function smoothstepScalar(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface PathTracingTransformInfo {
  object: Object3D & {
    material?: Material | Material[];
    getColorAt?: (index: number, target: Color) => Color;
  };
  instanceId: number;
}

interface BVHComputeDataInternal {
  writeTransformData(
    info: PathTracingTransformInfo,
    premultiplyMatrix: Matrix4,
    writeOffset: number,
    targetBuffer: ArrayBuffer,
  ): void;
}

const pathTransformStruct = new StructTypeNode(
  {
    matrixWorld: 'mat4x4f',
    inverseMatrixWorld: 'mat4x4f',
    visible: 'uint',
    _alignment0: 'uint',
    _alignment1: 'uint',
    _alignment2: 'uint',
    baseColorMetalness: 'vec4f',
    emissionRoughness: 'vec4f',
  },
  'PathTracingTransformStruct',
);

/**
 * Extends three-mesh-bvh's WebGPU transform buffer with the small subset of
 * material data used by the path tracer. Geometry vertex colors and per-
 * instance colors are preserved; procedural fragment detail remains the
 * responsibility of the real-time cinematic renderer.
 */
class PathTracingBVHData extends BVHComputeData {
  constructor(objects: Object3D[]) {
    super(objects, {
      attributes: {
        position: 'vec4f',
        normal: 'vec4f',
        color: 'vec4f',
      },
    });
    this.structs.transform = pathTransformStruct;
  }

  writeTransformData(
    info: PathTracingTransformInfo,
    premultiplyMatrix: Matrix4,
    writeOffset: number,
    targetBuffer: ArrayBuffer,
  ): void {
    const baseWriter = BVHComputeData.prototype as unknown as BVHComputeDataInternal;
    baseWriter.writeTransformData.call(
      this,
      info,
      premultiplyMatrix,
      writeOffset,
      targetBuffer,
    );

    const materialValue = Array.isArray(info.object.material)
      ? info.object.material[0]
      : info.object.material;
    const material = materialValue as
      | (Material & {
          color?: Color;
          emissive?: Color;
          emissiveIntensity?: number;
          roughness?: number;
          metalness?: number;
        })
      | undefined;

    // `userData.traced` is the effective response a rasterized pixel resolves
    // to, including the mean of any albedo map the tracer cannot sample.
    // Falling back to the raw base color would trace mapped stone at its
    // untextured tint, which reads bone white under a low sun.
    const traced = material?.userData?.traced as
      | { color?: Color; roughness?: number; metalness?: number; emissive?: Color }
      | undefined;

    const baseColor = (traced?.color ?? material?.color)?.clone() ?? new Color(1, 1, 1);
    if (info.object.getColorAt && info.instanceId >= 0) {
      info.object.getColorAt(info.instanceId, _instanceColor);
      baseColor.multiply(_instanceColor);
    }

    // Raster-only emissive fakes (the horizon mesas lift themselves to imitate
    // haze) must not become real light here — the tracer has actual aerial
    // perspective. A material opts in by publishing a traced emissive.
    const emission = (traced ? traced.emissive : material?.emissive)?.clone() ??
      new Color(0, 0, 0);
    if (!traced) emission.multiplyScalar(material?.emissiveIntensity ?? 0);

    const stride = pathTransformStruct.getLength();
    const offset = writeOffset * stride;
    const target = new Float32Array(targetBuffer);
    target[offset + 36] = baseColor.r;
    target[offset + 37] = baseColor.g;
    target[offset + 38] = baseColor.b;
    target[offset + 39] = traced?.metalness ?? material?.metalness ?? 0;
    target[offset + 40] = emission.r;
    target[offset + 41] = emission.g;
    target[offset + 42] = emission.b;
    target[offset + 43] = traced?.roughness ?? material?.roughness ?? 0.85;
  }
}

export interface PathTracer {
  render(samplesPerFrame: number, maxBounces: number): void;
  reset(): void;
  /**
   * Sweep the celestial sphere through `arc` radians about the Polaris axis
   * over one frame's samples, which integrates to a true long exposure: each
   * star's energy spreads along the arc it actually travels. 0 freezes the sky.
   */
  setStarTrail(arc: number): void;
  /**
   * Absolute rotation of the celestial sphere about the Polaris axis. A time
   * lapse advances this with solar time, so the star field wheels for the same
   * reason the sun sets rather than as a separate animation.
   */
  setCelestialRotation(radians: number): void;
  readonly samples: number;
}

interface CreatePathTracerOptions {
  renderer: WebGPURenderer;
  camera: PerspectiveCamera;
  roots: Object3D[];
  sunLight: DirectionalLight;
  moonLight: DirectionalLight;
  hemisphereLight: HemisphereLight;
}

/**
 * Progressive WebGPU path tracer for still capture work.
 *
 * This deliberately builds on the scene-wide WebGPU BVH implementation that
 * ships with three-mesh-bvh. It traces the static monument and terrain, adds
 * direct sun sampling, and follows diffuse/specular paths through several
 * bounces. The result accumulates in HDR half-float textures until the camera
 * or lighting changes.
 */
export function createPathTracer({
  renderer,
  camera,
  roots,
  sunLight,
  moonLight,
  hemisphereLight,
}: CreatePathTracerOptions): PathTracer {
  roots.forEach((root) => root.updateWorldMatrix(true, true));

  const traceObjects: Object3D[] = [];
  roots.forEach((root) => {
    root.traverse((object) => {
      const candidate = object as Object3D & {
        isMesh?: boolean;
        geometry?: { attributes?: { position?: unknown } };
      };
      if (
        candidate.visible &&
        candidate.isMesh &&
        candidate.geometry?.attributes?.position &&
        candidate.name !== 'grass-tufts'
      ) {
        traceObjects.push(candidate);
      }
    });
  });

  const bvhData = new PathTracingBVHData(traceObjects);
  bvhData.update();
  const getPathTransform = wgslTagFn/* wgsl */`
    fn getPathTransform(objectIndex: u32) -> ${pathTransformStruct} {
      return ${bvhData.storage.transforms}[objectIndex];
    }
  `;

  const accumulation = [
    new StorageTexture(1, 1),
    new StorageTexture(1, 1),
  ];
  accumulation.forEach((target, index) => {
    target.name = `StarAxis.PathTrace.${index}`;
    target.type = HalfFloatType;
    target.generateMipmaps = false;
    (
      target as StorageTexture & { mipmapsAutoUpdate: boolean }
    ).mipmapsAutoUpdate = false;
  });

  const inverseProjectionMatrix = uniform(new Matrix4());
  const cameraToWorldMatrix = uniform(new Matrix4());
  const sunDirection = uniform(new Vector3(0, 1, 0));
  const sunColor = uniform(new Color(1, 1, 1));
  const sunIntensity = uniform(1);
  const moonDirection = uniform(new Vector3(0, -1, 0));
  const moonColor = uniform(new Color(0.66, 0.76, 0.91));
  const moonIntensity = uniform(0);
  const skyColor = uniform(new Color(0.55, 0.68, 0.9));
  const groundColor = uniform(new Color(0.25, 0.18, 0.12));
  const skyIntensity = uniform(1);
  const sampleIndex = uniform(0);
  const maxBounceCount = uniform(3);
  const starTrailArc = uniform(0);
  const celestialOffset = uniform(0);
  const exposureSamples = uniform(64);
  const polarisAxis = uniform(
    new Vector3(0, Math.sin(LATITUDE_RAD), -Math.cos(LATITUDE_RAD)).normalize(),
  );
  // Depth cueing. Tuned so the monument at ~100 m is essentially unhazed and
  // the horizon mesas at ~700 m sit clearly back — strong enough to separate
  // the planes, far short of the milky wash a literal fog value produces.
  const aerialDensity = uniform(0.00028);
  const workgroupSize = uniform(new Vector3().fromArray(WORKGROUP_SIZE));

  const computeShaderParams = {
    outputTex: textureStore(accumulation[0]),
    previousTex: texture(accumulation[1]),
    inverseProjectionMatrix,
    cameraToWorldMatrix,
    sunDirection,
    sunColor,
    sunIntensity,
    moonDirection,
    moonColor,
    moonIntensity,
    skyColor,
    groundColor,
    skyIntensity,
    sampleIndex,
    maxBounceCount,
    aerialDensity,
    starTrailArc,
    celestialOffset,
    exposureSamples,
    polarisAxis,
    workgroupSize,
    workgroupId,
    localId,
  };

  // wgslFn parses exactly one function declaration. Keep every helper in its
  // own FunctionNode so Three can resolve the inputs, register dependencies,
  // and strip the parser-only `-> void` return type before emitting WGSL.
  const hashRandom = wgslFn(/* wgsl */ `
    fn hashRandom(state: ptr<function, u32>) -> f32 {
      var value = (*state);
      value = value ^ 2747636419u;
      value = value * 2654435769u;
      value = value ^ (value >> 16u);
      value = value * 2654435769u;
      value = value ^ (value >> 16u);
      value = value * 2654435769u;
      (*state) = value;
      return f32(value) / 4294967296.0;
    }
  `);

  const cosineHemisphere = wgslFn(
    /* wgsl */ `
      fn cosineHemisphere(normal: vec3f, state: ptr<function, u32>) -> vec3f {
        let angle = 6.28318530718 * hashRandom(state);
        let radiusSquared = hashRandom(state);
        let radius = sqrt(radiusSquared);
        let local = vec3f(
          cos(angle) * radius,
          sin(angle) * radius,
          sqrt(max(0.0, 1.0 - radiusSquared))
        );
        let helper = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(normal.y) > 0.92);
        let tangent = normalize(cross(helper, normal));
        let bitangent = cross(normal, tangent);
        return normalize(tangent * local.x + bitangent * local.y + normal * local.z);
      }
    `,
    [hashRandom] as any,
  );

  const sampleConeDirection = wgslFn(
    /* wgsl */ `
      fn sampleConeDirection(direction: vec3f, spread: f32, state: ptr<function, u32>) -> vec3f {
        let helper = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(direction.y) > 0.92);
        let tangent = normalize(cross(helper, direction));
        let bitangent = cross(direction, tangent);
        let angle = 6.28318530718 * hashRandom(state);
        let radius = sqrt(hashRandom(state)) * spread;
        return normalize(direction + tangent * cos(angle) * radius + bitangent * sin(angle) * radius);
      }
    `,
    [hashRandom] as any,
  );

  // Halton stratification for the two camera-jitter dimensions. Every video
  // frame restarts accumulation, so low-discrepancy anti-aliasing matters far
  // more here than it does for a slowly refining still.
  const haltonSample = wgslFn(/* wgsl */ `
    fn haltonSample(index: u32, base: u32) -> f32 {
      var result = 0.0;
      var fraction = 1.0;
      var remaining = index;
      let divisor = f32(base);
      for (var step = 0u; step < 20u; step = step + 1u) {
        if (remaining == 0u) {
          break;
        }
        fraction = fraction / divisor;
        result = result + fraction * f32(remaining % base);
        remaining = remaining / base;
      }
      return result;
    }
  `);

  const hashPosition = wgslFn(/* wgsl */ `
    fn hashPosition(position: vec3f) -> f32 {
      var value = fract(position * 0.1031);
      value += dot(value, value.yzx + vec3f(33.33));
      return fract((value.x + value.y) * value.z);
    }
  `);

  const valueNoise = wgslFn(
    /* wgsl */ `
      fn valueNoise(position: vec3f) -> f32 {
        let cell = floor(position);
        var blend = fract(position);
        blend = blend * blend * (vec3f(3.0) - 2.0 * blend);

        let lower = mix(
          mix(
            hashPosition(cell),
            hashPosition(cell + vec3f(1.0, 0.0, 0.0)),
            blend.x
          ),
          mix(
            hashPosition(cell + vec3f(0.0, 1.0, 0.0)),
            hashPosition(cell + vec3f(1.0, 1.0, 0.0)),
            blend.x
          ),
          blend.y
        );
        let upper = mix(
          mix(
            hashPosition(cell + vec3f(0.0, 0.0, 1.0)),
            hashPosition(cell + vec3f(1.0, 0.0, 1.0)),
            blend.x
          ),
          mix(
            hashPosition(cell + vec3f(0.0, 1.0, 1.0)),
            hashPosition(cell + vec3f(1.0, 1.0, 1.0)),
            blend.x
          ),
          blend.y
        );
        return mix(lower, upper, blend.z);
      }
    `,
    [hashPosition] as any,
  );

  const cloudFbm = wgslFn(
    /* wgsl */ `
      fn cloudFbm(position: vec3f) -> f32 {
        var point = position;
        var amplitude = 0.5;
        var density = 0.0;
        for (var octave = 0u; octave < 4u; octave += 1u) {
          density += valueNoise(point) * amplitude;
          point = point * 2.03 + vec3f(7.1, 3.7, -5.4);
          amplitude *= 0.5;
        }
        return density;
      }
    `,
    [valueNoise] as any,
  );

  // Two magnitude tiers on independent grids: a sparse bright population that
  // reads as named stars, and a dense faint one that gives the sky depth
  // instead of a scatter of equal white dots.
  const starLayer = wgslFn(
    /* wgsl */ `
      fn starLayer(direction: vec3f, density: vec2f, salt: f32, threshold: f32, gain: f32) -> vec3f {
        let sphericalUv = vec2f(
          atan2(direction.z, direction.x) * 0.15915494309 + 0.5,
          acos(clamp(direction.y, -1.0, 1.0)) * 0.31830988618
        );
        let starGrid = sphericalUv * density;
        let cell = floor(starGrid);
        let cellUv = fract(starGrid) - 0.5;
        let seed = hashPosition(vec3f(cell, salt));
        let temperature = hashPosition(vec3f(cell, salt + 54.24));
        let exists = smoothstep(threshold, 1.0, seed);
        let core = 1.0 - smoothstep(0.02, 0.17, length(cellUv));
        let rareSparkle = smoothstep(threshold + (1.0 - threshold) * 0.87, 1.0, seed);
        let starColor = mix(
          vec3f(0.56, 0.72, 1.0),
          vec3f(1.0, 0.72, 0.42),
          pow(temperature, 5.0)
        );
        return starColor * exists * core * gain * (1.0 + rareSparkle * 2.2);
      }
    `,
    [hashPosition] as any,
  );

  const starField = wgslFn(
    /* wgsl */ `
      fn starField(direction: vec3f) -> vec3f {
        return starLayer(direction, vec2f(760.0, 380.0), 19.17, 0.9955, 4.6) +
               starLayer(direction, vec2f(1500.0, 750.0), 61.83, 0.977, 0.85);
      }
    `,
    [starLayer] as any,
  );

  /**
   * Pure scattered-light colour of the atmosphere in a direction: no sun disc,
   * no moon, no stars, no clouds. Used both as the base of the environment and
   * — unchanged — as the in-scatter colour for aerial perspective, so distant
   * geometry always dissolves into exactly the sky behind it.
   */
  const scatteringColor = wgslFn(/* wgsl */ `
    fn scatteringColor(
      direction: vec3f,
      sunDirection: vec3f,
      skyColor: vec3f,
      groundColor: vec3f,
      skyIntensity: f32,
      moonDirection: vec3f,
      moonAmount: f32
    ) -> vec3f {
      let sunElevation = sunDirection.y;
      let nightMix = 1.0 - smoothstep(-0.20, 0.02, sunElevation);
      let dayMix = smoothstep(0.02, 0.26, sunElevation);
      let duskMix = clamp(1.0 - nightMix - dayMix, 0.0, 1.0);

      let up = clamp(direction.y, -1.0, 1.0);
      let sky01 = smoothstep(-0.02, 0.62, up);
      let horizonBand = pow(clamp(1.0 - max(up, 0.0) * 3.1, 0.0, 1.0), 1.7);
      let sunFacing = max(dot(direction, sunDirection), 0.0);

      // Azimuthal alignment with the sun: 1 straight toward it, 0 behind.
      let flatView = normalize(vec3f(direction.x, 0.0, direction.z) + vec3f(1e-4, 0.0, 1e-4));
      let flatSun = normalize(vec3f(sunDirection.x, 0.0, sunDirection.z) + vec3f(1e-4, 0.0, 1e-4));
      let sunSide = clamp(dot(flatView, flatSun) * 0.5 + 0.5, 0.0, 1.0);

      // ---- DAY: Rayleigh blue holds the zenith and only the lower sky takes
      // the hemisphere light's tint. Driving the whole dome from that tint is
      // what turns a golden hour into a flat peach wash — at a real 8° sun the
      // top of the sky is still blue.
      let dayZenith =
        mix(vec3f(0.075, 0.155, 0.40), skyColor * 0.55, 0.35) * skyIntensity * 1.5;
      let dayHorizon =
        mix(groundColor * 0.9, skyColor * 1.25, 0.6) * skyIntensity;
      let dayColor =
        mix(dayHorizon, dayZenith, sky01) +
        vec3f(1.0, 0.88, 0.66) * pow(sunFacing, 6.0) * 0.16 * skyIntensity;

      // ---- DUSK: deep blue at the zenith through a violet mid-sky down to an
      // ember horizon on the sun's side, with the magenta anti-twilight arch
      // opposite. This band is the whole sunset.
      let ember = vec3f(1.30, 0.40, 0.095);
      let amber = vec3f(0.95, 0.40, 0.135);
      let violet = vec3f(0.235, 0.155, 0.315);
      let zenithDusk = vec3f(0.055, 0.085, 0.215);
      let counterGlow = vec3f(0.24, 0.145, 0.27);
      var duskColor = mix(violet, zenithDusk, smoothstep(0.12, 0.72, up));
      duskColor = mix(duskColor, amber, horizonBand * (0.18 + 0.82 * sunSide));
      duskColor += ember * pow(sunFacing, 5.0) * 0.9;
      duskColor += ember * horizonBand * pow(sunSide, 6.0) * 0.6;
      duskColor += counterGlow * horizonBand * (1.0 - sunSide) * 0.4;

      // ---- NIGHT: a real floor plus the moon's own glow in the sky.
      let moonFacing = max(dot(direction, moonDirection), 0.0);
      let nightColor =
        mix(vec3f(0.021, 0.029, 0.055), vec3f(0.006, 0.011, 0.028), sky01) +
        vec3f(0.055, 0.075, 0.135) * pow(moonFacing, 5.0) * moonAmount;

      var result = dayColor * dayMix + duskColor * duskMix + nightColor * nightMix;

      // Below grade the "sky" becomes lit ground haze, so downward bounce
      // rays pick up bounce light instead of a hard black hemisphere.
      let below = smoothstep(0.0, -0.16, up);
      let groundLit =
        groundColor * skyIntensity * (0.30 + 0.70 * (dayMix + duskMix * 0.55));
      return mix(result, groundLit, below * 0.85);
    }
  `);

  const rotateAboutAxis = wgslFn(/* wgsl */ `
    fn rotateAboutAxis(v: vec3f, axis: vec3f, angle: f32) -> vec3f {
      let c = cos(angle);
      let s = sin(angle);
      return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
    }
  `);

  const environmentRadiance = wgslFn(
    /* wgsl */ `
      fn environmentRadiance(
        direction: vec3f,
        sunDirection: vec3f,
        sunColor: vec3f,
        sunIntensity: f32,
        skyColor: vec3f,
        groundColor: vec3f,
        skyIntensity: f32,
        moonDirection: vec3f,
        moonColor: vec3f,
        moonAmount: f32,
        celestialPhase: f32,
        polarisAxis: vec3f
      ) -> vec3f {
        let sunElevation = sunDirection.y;
        let nightMix = 1.0 - smoothstep(-0.20, 0.02, sunElevation);
        let dayMix = smoothstep(0.02, 0.26, sunElevation);
        let duskMix = clamp(1.0 - nightMix - dayMix, 0.0, 1.0);
        let litMix = clamp(dayMix + duskMix, 0.0, 1.0);
        let skyMask = smoothstep(-0.06, 0.10, direction.y);
        let sunFacing = max(dot(direction, sunDirection), 0.0);

        var atmosphere = scatteringColor(
          direction,
          sunDirection,
          skyColor,
          groundColor,
          skyIntensity,
          moonDirection,
          moonAmount
        );

        // Two differently scaled density fields give the clouds a layered,
        // volumetric silhouette without adding another scene render pass.
        let broadClouds = cloudFbm(
          direction * vec3f(3.7, 8.5, 3.7) + vec3f(1.4, -0.8, 2.1)
        );
        let fineClouds = cloudFbm(
          direction * vec3f(8.2, 18.0, 8.2) + vec3f(-4.3, 2.7, 1.2)
        );
        let cloudNoise = broadClouds * 0.72 + fineClouds * 0.28;
        let cloudBand = skyMask * (1.0 - smoothstep(0.66, 0.95, direction.y));
        // Sparse high cirrus. Broader coverage grades the whole sky toward the
        // mean grey of the cloud colour and flattens the sunset behind it.
        let cloudDensity = smoothstep(0.53, 0.73, cloudNoise) * cloudBand;
        // Clouds catch the last light from below at dusk, so they stay lit
        // after the ground has gone into shadow.
        let cloudLight = 0.24 + 0.76 * pow(sunFacing, 1.3);
        let dayCloud = mix(vec3f(0.19, 0.23, 0.33), vec3f(1.05, 0.99, 0.91), cloudLight);
        let duskCloud = mix(vec3f(0.13, 0.05, 0.085), vec3f(1.45, 0.46, 0.085), cloudLight);
        let nightCloud = mix(
          vec3f(0.008, 0.011, 0.024),
          vec3f(0.10, 0.12, 0.17),
          cloudLight * moonAmount
        );
        let cloudColor =
          dayCloud * dayMix + duskCloud * duskMix + nightCloud * nightMix;
        // Thin the deck right down after dark: moonlit cloud sits only a
        // little above the night sky's own value, so at full coverage it does
        // nothing but erase the star field.
        let cloudPresence = mix(0.42, 0.95, duskMix) * (1.0 - nightMix * 0.62);
        atmosphere = mix(atmosphere, cloudColor, cloudDensity * cloudPresence * 0.8);
        atmosphere += cloudDensity * duskMix * pow(sunFacing, 5.0) * vec3f(1.5, 0.4, 0.06);

        // ---- Stars and the Milky Way, fading in as the sun goes down. The
        // whole celestial sphere is looked up through a rotation about the
        // Polaris axis: hold it still for a snapshot, or let the caller sweep
        // it across a frame's samples and the accumulation buffer integrates a
        // genuine long exposure, arcs and all.
        let celestial = rotateAboutAxis(direction, polarisAxis, celestialPhase);
        let galacticAxis = normalize(vec3f(0.82, 0.28, -0.50));
        let galacticBand = pow(
          max(1.0 - abs(dot(celestial, galacticAxis)) * 4.2, 0.0),
          2.0
        );
        let milkyTexture = cloudFbm(celestial * 21.0 + vec3f(8.4, -3.1, 6.7));
        let starVeil = nightMix * skyMask * (1.0 - cloudDensity * 0.85);
        atmosphere += vec3f(0.040, 0.060, 0.115) * galacticBand *
          (0.35 + milkyTexture) * starVeil;
        atmosphere += starField(celestial) * starVeil;

        // Polaris, on the axis the whole work is aimed at. It is sampled from
        // the unrotated direction so a long exposure leaves it a fixed point
        // with everything else wheeling around it — which is the photograph
        // the Star Tunnel exists to make.
        let polarisAngle = acos(clamp(dot(direction, polarisAxis), -1.0, 1.0));
        atmosphere +=
          vec3f(1.0, 0.96, 0.86) *
          (1.0 - smoothstep(0.0024, 0.0046, polarisAngle)) * 7.0 * starVeil;
        atmosphere +=
          vec3f(0.85, 0.90, 1.0) * exp(-polarisAngle * 150.0) * 0.55 * starVeil;

        // ---- Sun disc: a real angular size with limb darkening, reddening
        // and dimming through the thick air as it touches the horizon.
        let discOuter = cos(0.0135);
        let discInner = cos(0.0118);
        let discMask = smoothstep(discOuter, discInner, sunFacing);
        let limb = sqrt(max(0.0, 1.0 - pow(clamp(
          acos(clamp(sunFacing, -1.0, 1.0)) / 0.0135, 0.0, 1.0), 2.0)));
        // Thick air near the horizon reddens the disc and takes most of its
        // energy out — a low sun is dimmer as well as oranger.
        let lowSun = 1.0 - smoothstep(-0.02, 0.30, sunElevation);
        let discTint = mix(vec3f(1.0, 0.95, 0.88), vec3f(1.45, 0.42, 0.09), lowSun);
        // No hard horizon cut on the disc: the landscape itself occludes it as
        // it goes down, which is what makes the last sliver read.
        let discEnergy = mix(26.0, 3.6, lowSun) * smoothstep(-0.075, -0.008, sunElevation);
        atmosphere +=
          sunColor * discTint * discMask * (0.35 + 0.65 * limb) *
          sunIntensity * discEnergy;
        // Aureole: three lobes rather than one, so the glow grades away from
        // the limb instead of terminating in a hard bright ring.
        atmosphere +=
          sunColor * discTint * sunIntensity * litMix *
          (pow(sunFacing, 2600.0) * 0.6 +
           pow(sunFacing, 260.0) * 0.14 +
           pow(sunFacing, 30.0) * 0.03);

        // ---- Moon disc and halo.
        let moonFacing = max(dot(direction, moonDirection), 0.0);
        let moonOuter = cos(0.0125);
        let moonInner = cos(0.0104);
        let moonMask = smoothstep(moonOuter, moonInner, moonFacing);
        atmosphere +=
          moonColor * moonAmount *
          (moonMask * 3.2 + pow(moonFacing, 1400.0) * 0.9 + pow(moonFacing, 26.0) * 0.012);

        return atmosphere;
      }
    `,
    [cloudFbm, starField, scatteringColor, rotateAboutAxis] as any,
  );

  const computeShader = wgslFn(
    /* wgsl */ `
      fn compute(
        outputTex: texture_storage_2d<rgba16float, write>,
        previousTex: texture_2d<f32>,
        inverseProjectionMatrix: mat4x4f,
        cameraToWorldMatrix: mat4x4f,
        sunDirection: vec3f,
        sunColor: vec3f,
        sunIntensity: f32,
        moonDirection: vec3f,
        moonColor: vec3f,
        moonIntensity: f32,
        skyColor: vec3f,
        groundColor: vec3f,
        skyIntensity: f32,
        sampleIndex: u32,
        maxBounceCount: u32,
        aerialDensity: f32,
        starTrailArc: f32,
        celestialOffset: f32,
        exposureSamples: u32,
        polarisAxis: vec3f,
        workgroupSize: vec3u,
        workgroupId: vec3u,
        localId: vec3u,
      ) -> void {
        let dimensions = textureDimensions(outputTex);
        let indexUV = workgroupSize.xy * workgroupId.xy + localId.xy;
        if (any(indexUV >= dimensions)) {
          return;
        }

        var randomState =
          indexUV.x * 1973u +
          indexUV.y * 9277u +
          sampleIndex * 26699u +
          911u;

        // Stratified camera jitter, Cranley-Patterson rotated per pixel so the
        // shared Halton points do not print a visible lattice across the frame.
        let pixelOffset = vec2f(hashRandom(&randomState), hashRandom(&randomState));
        let stratified = vec2f(
          haltonSample(sampleIndex + 1u, 2u),
          haltonSample(sampleIndex + 1u, 3u)
        );
        let jitter = fract(stratified + pixelOffset) - vec2f(0.5);
        let pixelUV = (vec2f(indexUV) + vec2f(0.5) + jitter) / vec2f(dimensions);
        let ndc = pixelUV * 2.0 - vec2f(1.0);

        var ray = ndcToCameraRay(ndc, cameraToWorldMatrix * inverseProjectionMatrix);
        ray.direction = normalize(ray.direction);
        let viewDirection = ray.direction;

        // Where this sample sits in the exposure. Sweeping it across the
        // frame's samples is what turns the star field into trails.
        // celestialOffset is where the sky has turned to by this frame;
        // starTrailArc is how far it turns during the frame's own exposure.
        let exposureSpan = max(exposureSamples, 1u);
        let celestialPhase = celestialOffset +
          starTrailArc * (f32(sampleIndex % exposureSpan) / f32(exposureSpan));

        var radiance = vec3f(0.0);
        var throughput = vec3f(1.0);
        var primaryDistance = -1.0;

        for (var bounce = 0u; bounce < 5u; bounce = bounce + 1u) {
          if (bounce >= maxBounceCount) {
            break;
          }

          var hit: IntersectionResult;
          bvh_RaycastFirstHit(ray, &hit);
          if (!hit.didHit) {
            var escaped = environmentRadiance(
              ray.direction,
              sunDirection,
              sunColor,
              sunIntensity,
              skyColor,
              groundColor,
              skyIntensity,
              moonDirection,
              moonColor,
              moonIntensity,
              celestialPhase,
              polarisAxis
            );
            // A bounce ray that happens to land on the solar disc carries
            // hundreds of times the surrounding sky's energy and burns in a
            // permanent white speckle. Clamp indirect hits only — the camera's
            // own view of the disc has to stay unclipped.
            if (bounce > 0u) {
              escaped = min(escaped, vec3f(6.0));
            }
            radiance += throughput * escaped;
            break;
          }

          if (bounce == 0u) {
            primaryDistance = hit.dist;
          }

          let surface = bvh_sampleTrianglePoint(hit.barycoord, hit.indices.xyz);
          let transform = getPathTransform(hit.objectIndex);
          var normal = normalize(
            (transpose(transform.inverseMatrixWorld) * vec4f(surface.normal.xyz, 0.0)).xyz
          );
          if (dot(normal, ray.direction) > 0.0) {
            normal = -normal;
          }

          let baseColor = max(
            surface.color.rgb * transform.baseColorMetalness.rgb,
            vec3f(0.001)
          );
          let metalness = clamp(transform.baseColorMetalness.a, 0.0, 1.0);
          let roughness = clamp(transform.emissionRoughness.a, 0.04, 1.0);
          radiance += throughput * transform.emissionRoughness.rgb;

          let hitPoint = ray.origin + ray.direction * hit.dist;
          let shadowOrigin = hitPoint + normal * 0.025;
          // Lambertian BRDF normalization, matching Three's raster lights.
          let diffuse = throughput * baseColor * (1.0 - metalness) * 0.31830988618;

          // ---- Direct sun. The cone spread is the solar angular radius, so
          // contact shadows stay sharp and 200 m shadows go properly soft.
          // The raster rig keeps a below-horizon sun burning as a cheap
          // twilight fill; here the last direct light has to die exactly as
          // the disc goes under, or dusk lights the desert from underneath.
          let sunAboveHorizon = smoothstep(-0.035, 0.02, sunDirection.y);
          let directSun = sunIntensity * sunAboveHorizon;
          if (directSun > 0.002) {
            let sampledSun = sampleConeDirection(sunDirection, 0.0075, &randomState);
            let sunCosine = max(dot(normal, sampledSun), 0.0);
            if (sunCosine > 0.0) {
              var shadowRay: Ray;
              shadowRay.origin = shadowOrigin;
              shadowRay.direction = sampledSun;
              var shadowHit: IntersectionResult;
              bvh_RaycastFirstHit(shadowRay, &shadowHit);
              if (!shadowHit.didHit) {
                radiance += diffuse * sunColor * directSun * sunCosine;
              }
            }
          }

          // ---- Direct moonlight, which is the only key light after dusk.
          if (moonIntensity > 0.0005) {
            let sampledMoon = sampleConeDirection(moonDirection, 0.0085, &randomState);
            let moonCosine = max(dot(normal, sampledMoon), 0.0);
            if (moonCosine > 0.0) {
              var moonRay: Ray;
              moonRay.origin = shadowOrigin;
              moonRay.direction = sampledMoon;
              var moonHit: IntersectionResult;
              bvh_RaycastFirstHit(moonRay, &moonHit);
              if (!moonHit.didHit) {
                radiance += diffuse * moonColor * moonIntensity * moonCosine;
              }
            }
          }

          let specularChance = mix(0.08, 0.86, metalness);
          let chooseSpecular = hashRandom(&randomState) < specularChance;
          if (chooseSpecular) {
            let reflected = reflect(ray.direction, normal);
            let roughDirection = cosineHemisphere(normalize(reflected + normal * 0.08), &randomState);
            ray.direction = normalize(mix(reflected, roughDirection, roughness * roughness));
            throughput *= mix(vec3f(0.92), baseColor, metalness);
          } else {
            ray.direction = cosineHemisphere(normal, &randomState);
            throughput *= baseColor;
          }

          ray.origin = shadowOrigin;

          if (bounce >= 2u) {
            let survival = clamp(max(throughput.r, max(throughput.g, throughput.b)), 0.12, 0.92);
            if (hashRandom(&randomState) > survival) {
              break;
            }
            throughput /= survival;
          }
        }

        // ---- Aerial perspective. Everything the camera sees dissolves toward
        // exactly the sky colour behind it, which is what separates the
        // horizon mesas from the monument and carries the dusk colour into
        // the landscape.
        if (primaryDistance > 0.0) {
          let inScatter = scatteringColor(
            viewDirection,
            sunDirection,
            skyColor,
            groundColor,
            skyIntensity,
            moonDirection,
            moonIntensity
          );
          let haze = 1.0 - exp(-primaryDistance * aerialDensity);
          radiance = mix(radiance, inScatter, clamp(haze, 0.0, 0.94));
        }

        // A degenerate bounce — a grazing specular reflection that normalises
        // a near-zero vector, say — yields a non-finite sample. Every NaN
        // comparison is false, so such a sample slips past the clamp below,
        // and once one lands in the accumulation buffer every later sample
        // averages against it and the pixel is white forever. Longer paths hit
        // this often enough that five bounces rendered a blank frame.
        radiance = select(vec3f(0.0), radiance, radiance == radiance);
        radiance = max(radiance, vec3f(0.0));

        // Clamp the very brightest paths. A single specular chain onto the sun
        // disc otherwise leaves a permanent white pixel in a 200-sample frame.
        let peak = max(radiance.r, max(radiance.g, radiance.b));
        if (peak > 40.0) {
          radiance = radiance * (40.0 / peak);
        }

        let previous = textureLoad(previousTex, vec2u(indexUV), 0).rgb;
        let weight = 1.0 / f32(sampleIndex + 1u);
        let accumulated = mix(previous, radiance, weight);
        textureStore(outputTex, indexUV, vec4f(accumulated, 1.0));
      }
    `,
    [
      hashRandom,
      haltonSample,
      cosineHemisphere,
      sampleConeDirection,
      environmentRadiance,
      scatteringColor,
      getPathTransform,
      ndcToCameraRay,
      bvhData.fns.raycastFirstHit,
      bvhData.fns.sampleTrianglePoint,
    ] as any,
  );

  const computeKernel = computeShader(computeShaderParams).computeKernel(WORKGROUP_SIZE);
  const kernelParameters = (
    computeKernel as unknown as {
      computeNode: {
        parameters: Record<string, { value: any }>;
      };
    }
  ).computeNode.parameters;
  const vUv = varyingProperty('vec2', 'vUv');
  const displayVertex = wgslFn(
    /* wgsl */ `
      fn vertex(position: vec3f, uv: vec2f) -> vec3f {
        varyings.vUv = uv;
        return position;
      }
    `,
    [vUv],
  );
  const displayMaterial = new MeshBasicNodeMaterial();
  displayMaterial.name = 'StarAxis.PathTraceDisplay';
  displayMaterial.positionNode = displayVertex({
    position: attribute('position'),
    uv: attribute('uv'),
  });
  const tracedColor = texture(accumulation[0], vUv);
  const displayExposure = uniform(0.58);
  const edgeDistance = uv().sub(0.5).length();
  const vignette = float(1).sub(smoothstep(0.32, 0.75, edgeDistance).mul(0.14));
  // The renderer's own ACES curve runs after this and desaturates as it rolls
  // off, so a little vibrance going in is what keeps a dusk sky reading as
  // colour rather than as warm grey.
  displayMaterial.colorNode = vec4(
    vibrance(tracedColor.rgb.mul(displayExposure), 0.15).mul(vignette),
    tracedColor.a,
  );
  const fullscreenQuad = new FullScreenQuad(displayMaterial);

  let currentTarget = 0;
  let sampleCount = 0;
  let targetWidth = 0;
  let targetHeight = 0;
  let lastBounces = 3;
  const lastCameraWorld = new Matrix4().copy(camera.matrixWorld);
  const lastProjection = new Matrix4().copy(camera.projectionMatrix);
  let lastSunIntensity = Number.NaN;
  let lastMoonIntensity = Number.NaN;
  let lastSkyIntensity = Number.NaN;

  const reset = () => {
    sampleCount = 0;
  };

  const resizeIfNeeded = () => {
    renderer.getDrawingBufferSize(_drawingBufferSize);
    const width = Math.max(1, Math.floor(_drawingBufferSize.x));
    const height = Math.max(1, Math.floor(_drawingBufferSize.y));
    if (width === targetWidth && height === targetHeight) return;

    targetWidth = width;
    targetHeight = height;
    accumulation.forEach((target) => target.setSize(width, height, 1));
    reset();
  };

  const syncSceneState = () => {
    camera.updateMatrixWorld();
    sunLight.updateMatrixWorld();
    sunLight.target.updateMatrixWorld();
    moonLight.updateMatrixWorld();
    moonLight.target.updateMatrixWorld();
    _sunDirection
      .subVectors(sunLight.position, sunLight.target.position)
      .normalize();
    _moonDirection
      .subVectors(moonLight.position, moonLight.target.position)
      .normalize();

    const lightingChanged =
      !_lastSunDirection.equals(_sunDirection) ||
      !_lastMoonDirection.equals(_moonDirection) ||
      !_lastSunColor.equals(sunLight.color) ||
      !_lastSkyColor.equals(hemisphereLight.color) ||
      !_lastGroundColor.equals(hemisphereLight.groundColor) ||
      lastSunIntensity !== sunLight.intensity ||
      lastMoonIntensity !== moonLight.intensity ||
      lastSkyIntensity !== hemisphereLight.intensity;
    const cameraChanged =
      !lastCameraWorld.equals(camera.matrixWorld) ||
      !lastProjection.equals(camera.projectionMatrix);

    if (lightingChanged || cameraChanged) reset();

    lastCameraWorld.copy(camera.matrixWorld);
    lastProjection.copy(camera.projectionMatrix);
    _lastSunDirection.copy(_sunDirection);
    _lastMoonDirection.copy(_moonDirection);
    _lastSunColor.copy(sunLight.color);
    _lastSkyColor.copy(hemisphereLight.color);
    _lastGroundColor.copy(hemisphereLight.groundColor);
    lastSunIntensity = sunLight.intensity;
    lastMoonIntensity = moonLight.intensity;
    lastSkyIntensity = hemisphereLight.intensity;

    inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
    cameraToWorldMatrix.value.copy(camera.matrixWorld);
    sunDirection.value.copy(_sunDirection);
    sunColor.value.copy(sunLight.color);
    sunIntensity.value = sunLight.intensity;
    moonDirection.value.copy(_moonDirection);
    moonColor.value.copy(moonLight.color);
    moonIntensity.value = moonLight.intensity;
    skyColor.value.copy(hemisphereLight.color);
    groundColor.value.copy(hemisphereLight.groundColor);
    skyIntensity.value = hemisphereLight.intensity;

    // One continuous exposure ramp across the whole solar cycle. A stepped
    // "is it night?" branch would visibly jump mid-shot while the sun sets, so
    // this stays smooth in the sun's own elevation. The night lift only starts
    // once the sun is genuinely down: opening it at the horizon washes the
    // richest part of a sunset out to milk.
    const elevation = _sunDirection.y;
    const afterDusk = smoothstepScalar(-0.24, -0.02, elevation);
    const highSun = smoothstepScalar(0.03, 0.28, elevation);
    // night 1.90 → dusk 0.95 → full day 0.58
    displayExposure.value =
      1.9 + (0.95 - 1.9) * afterDusk + (0.58 - 0.95) * highSun;
  };

  const render = (samplesPerFrame: number, maxBounces: number) => {
    resizeIfNeeded();
    syncSceneState();

    const bounceCount = Math.min(5, Math.max(1, Math.round(maxBounces)));
    if (bounceCount !== lastBounces) {
      lastBounces = bounceCount;
      reset();
    }

    const frameSamples = Math.min(
      MAX_SAMPLES_PER_CALL,
      Math.max(1, Math.round(samplesPerFrame)),
    );
    for (let index = 0; index < frameSamples; index++) {
      const nextTarget = currentTarget === 0 ? 1 : 0;
      const parameters = kernelParameters;
      parameters.outputTex.value = accumulation[nextTarget];
      parameters.previousTex.value = accumulation[currentTarget];
      parameters.inverseProjectionMatrix.value = inverseProjectionMatrix.value;
      parameters.cameraToWorldMatrix.value = cameraToWorldMatrix.value;
      parameters.sunDirection.value = sunDirection.value;
      parameters.sunColor.value = sunColor.value;
      parameters.sunIntensity.value = sunIntensity.value;
      parameters.moonDirection.value = moonDirection.value;
      parameters.moonColor.value = moonColor.value;
      parameters.moonIntensity.value = moonIntensity.value;
      parameters.skyColor.value = skyColor.value;
      parameters.groundColor.value = groundColor.value;
      parameters.skyIntensity.value = skyIntensity.value;
      parameters.sampleIndex.value = sampleCount;
      parameters.maxBounceCount.value = bounceCount;
      parameters.aerialDensity.value = aerialDensity.value;
      parameters.starTrailArc.value = starTrailArc.value;
      parameters.celestialOffset.value = celestialOffset.value;
      // Offline capture asks for the whole exposure in one call, so the arc
      // sweeps across exactly those samples. Interactive accumulation arrives
      // a few samples at a time, so give it a fixed span to sweep instead.
      parameters.exposureSamples.value = Math.max(frameSamples, 64);
      parameters.polarisAxis.value = polarisAxis.value;
      parameters.workgroupSize.value.fromArray(WORKGROUP_SIZE);

      renderer.compute(computeKernel, [
        Math.ceil(targetWidth / WORKGROUP_SIZE[0]),
        Math.ceil(targetHeight / WORKGROUP_SIZE[1]),
      ]);
      currentTarget = nextTarget;
      sampleCount++;
    }

    tracedColor.value = accumulation[currentTarget];
    fullscreenQuad.render(renderer as never);
  };

  return {
    render,
    reset,
    setStarTrail: (arc: number) => {
      const next = Math.max(0, arc);
      if (next === starTrailArc.value) return;
      starTrailArc.value = next;
      reset();
    },
    setCelestialRotation: (radians: number) => {
      if (radians === celestialOffset.value) return;
      celestialOffset.value = radians;
      reset();
    },
    get samples() {
      return sampleCount;
    },
  };
}
