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
import { BVHComputeData } from 'three-mesh-bvh/webgpu';
import * as BVHWebGPU from 'three-mesh-bvh/webgpu';

const ndcToCameraRay = (
  BVHWebGPU as unknown as { ndcToCameraRay: unknown }
).ndcToCameraRay;
const wgslTagFn = (
  BVHWebGPU as unknown as { wgslTagFn: (tokens: TemplateStringsArray, ...args: any[]) => any }
).wgslTagFn;

const WORKGROUP_SIZE: [number, number, number] = [8, 8, 1];
const _drawingBufferSize = new Vector2();
const _instanceColor = new Color();
const _sunDirection = new Vector3();
const _lastSunDirection = new Vector3(Number.NaN, Number.NaN, Number.NaN);
const _lastSunColor = new Color(Number.NaN, Number.NaN, Number.NaN);
const _lastSkyColor = new Color(Number.NaN, Number.NaN, Number.NaN);
const _lastGroundColor = new Color(Number.NaN, Number.NaN, Number.NaN);

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

    const baseColor = material?.color?.clone() ?? new Color(1, 1, 1);
    if (info.object.getColorAt && info.instanceId >= 0) {
      info.object.getColorAt(info.instanceId, _instanceColor);
      baseColor.multiply(_instanceColor);
    }

    const emission = material?.emissive?.clone() ?? new Color(0, 0, 0);
    emission.multiplyScalar(material?.emissiveIntensity ?? 0);

    const stride = pathTransformStruct.getLength();
    const offset = writeOffset * stride;
    const target = new Float32Array(targetBuffer);
    target[offset + 36] = baseColor.r;
    target[offset + 37] = baseColor.g;
    target[offset + 38] = baseColor.b;
    target[offset + 39] = material?.metalness ?? 0;
    target[offset + 40] = emission.r;
    target[offset + 41] = emission.g;
    target[offset + 42] = emission.b;
    target[offset + 43] = material?.roughness ?? 0.85;
  }
}

export interface PathTracer {
  render(samplesPerFrame: number, maxBounces: number): void;
  reset(): void;
  readonly samples: number;
}

interface CreatePathTracerOptions {
  renderer: WebGPURenderer;
  camera: PerspectiveCamera;
  roots: Object3D[];
  sunLight: DirectionalLight;
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
  const skyColor = uniform(new Color(0.55, 0.68, 0.9));
  const groundColor = uniform(new Color(0.25, 0.18, 0.12));
  const skyIntensity = uniform(1);
  const sampleIndex = uniform(0);
  const maxBounceCount = uniform(3);
  const workgroupSize = uniform(new Vector3().fromArray(WORKGROUP_SIZE));

  const computeShaderParams = {
    outputTex: textureStore(accumulation[0]),
    previousTex: texture(accumulation[1]),
    inverseProjectionMatrix,
    cameraToWorldMatrix,
    sunDirection,
    sunColor,
    sunIntensity,
    skyColor,
    groundColor,
    skyIntensity,
    sampleIndex,
    maxBounceCount,
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

  const sampleSunDirection = wgslFn(
    /* wgsl */ `
      fn sampleSunDirection(direction: vec3f, state: ptr<function, u32>) -> vec3f {
        let helper = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(direction.y) > 0.92);
        let tangent = normalize(cross(helper, direction));
        let bitangent = cross(direction, tangent);
        let angle = 6.28318530718 * hashRandom(state);
        let radius = sqrt(hashRandom(state)) * 0.0064;
        return normalize(direction + tangent * cos(angle) * radius + bitangent * sin(angle) * radius);
      }
    `,
    [hashRandom] as any,
  );

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

  const starField = wgslFn(
    /* wgsl */ `
      fn starField(direction: vec3f) -> vec3f {
        let sphericalUv = vec2f(
          atan2(direction.z, direction.x) * 0.15915494309 + 0.5,
          acos(clamp(direction.y, -1.0, 1.0)) * 0.31830988618
        );
        let starGrid = sphericalUv * vec2f(900.0, 450.0);
        let cell = floor(starGrid);
        let cellUv = fract(starGrid) - 0.5;
        let seed = hashPosition(vec3f(cell, 19.17));
        let temperature = hashPosition(vec3f(cell, 73.41));
        let exists = smoothstep(0.994, 1.0, seed);
        let core = 1.0 - smoothstep(0.025, 0.19, length(cellUv));
        let rareSparkle = smoothstep(0.9992, 1.0, seed);
        let starColor = mix(
          vec3f(0.56, 0.72, 1.0),
          vec3f(1.0, 0.72, 0.42),
          pow(temperature, 5.0)
        );
        return starColor * exists * core * (4.5 + rareSparkle * 10.0);
      }
    `,
    [hashPosition] as any,
  );

  const environmentRadiance = wgslFn(
    /* wgsl */ `
      fn environmentRadiance(
        direction: vec3f,
        sunDirection: vec3f,
        sunColor: vec3f,
        sunIntensity: f32,
        skyColor: vec3f,
        groundColor: vec3f,
        skyIntensity: f32
      ) -> vec3f {
        let sunElevation = sunDirection.y;
        let dayAmount = smoothstep(-0.08, 0.12, sunElevation);
        let nightAmount = 1.0 - dayAmount;
        let goldenAmount =
          dayAmount * (1.0 - smoothstep(0.16, 0.52, sunElevation));
        let horizon = smoothstep(-0.22, 0.68, direction.y);
        let skyMask = smoothstep(-0.08, 0.12, direction.y);

        let daylight = mix(groundColor, skyColor, horizon) * skyIntensity;
        let sunset = mix(
          vec3f(0.48, 0.14, 0.032),
          vec3f(0.065, 0.095, 0.24),
          smoothstep(-0.04, 0.78, direction.y)
        );
        var atmosphere = mix(daylight, sunset, goldenAmount * 0.76);

        let sunFacing = max(dot(direction, sunDirection), 0.0);
        atmosphere +=
          vec3f(0.9, 0.26, 0.045) *
          pow(sunFacing, 7.0) *
          goldenAmount;

        // Two differently scaled density fields give the clouds a layered,
        // volumetric silhouette without adding another scene render pass.
        let broadClouds = cloudFbm(
          direction * vec3f(3.7, 8.5, 3.7) + vec3f(1.4, -0.8, 2.1)
        );
        let fineClouds = cloudFbm(
          direction * vec3f(8.2, 18.0, 8.2) + vec3f(-4.3, 2.7, 1.2)
        );
        let cloudNoise = broadClouds * 0.72 + fineClouds * 0.28;
        let cloudBand =
          skyMask *
          (1.0 - smoothstep(0.68, 0.96, direction.y));
        let cloudDensity =
          smoothstep(0.48, 0.69, cloudNoise) * cloudBand;
        let cloudPresence = mix(0.24, 0.94, goldenAmount) * dayAmount;
        let cloudLight = 0.28 + 0.72 * pow(sunFacing, 1.4);
        let dayCloud = mix(
          vec3f(0.16, 0.20, 0.28),
          vec3f(0.92, 0.96, 1.0),
          cloudLight
        );
        let sunsetCloud = mix(
          vec3f(0.12, 0.035, 0.065),
          vec3f(1.25, 0.38, 0.055),
          cloudLight
        );
        let cloudColor = mix(dayCloud, sunsetCloud, goldenAmount);
        atmosphere = mix(
          atmosphere,
          cloudColor,
          cloudDensity * cloudPresence * 0.78
        );
        atmosphere +=
          cloudDensity *
          goldenAmount *
          pow(sunFacing, 5.0) *
          vec3f(1.4, 0.38, 0.055);

        // Night has a real exposure floor, cool horizon-to-zenith color, a
        // textured Milky Way band, and stable sub-pixel procedural stars.
        var nightSky = mix(
          vec3f(0.014, 0.018, 0.032),
          vec3f(0.038, 0.075, 0.19),
          smoothstep(-0.20, 0.72, direction.y)
        );
        let galacticAxis = normalize(vec3f(0.31, 0.91, -0.27));
        let galacticBand = pow(
          max(1.0 - abs(dot(direction, galacticAxis)) * 4.2, 0.0),
          2.0
        );
        let milkyTexture = cloudFbm(
          direction * 21.0 + vec3f(8.4, -3.1, 6.7)
        );
        nightSky +=
          vec3f(0.035, 0.055, 0.11) *
          galacticBand *
          (0.35 + milkyTexture);
        nightSky += starField(direction) * skyMask;

        let sunDisc = pow(sunFacing, 32000.0);
        let daytimeSky =
          atmosphere + sunColor * sunIntensity * sunDisc * 4.0;
        return mix(daytimeSky, nightSky, nightAmount);
      }
    `,
    [cloudFbm, starField] as any,
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
        skyColor: vec3f,
        groundColor: vec3f,
        skyIntensity: f32,
        sampleIndex: u32,
        maxBounceCount: u32,
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
        let jitter = vec2f(hashRandom(&randomState), hashRandom(&randomState)) - 0.5;
        let pixelUV = (vec2f(indexUV) + vec2f(0.5) + jitter) / vec2f(dimensions);
        let ndc = pixelUV * 2.0 - vec2f(1.0);

        var ray = ndcToCameraRay(ndc, cameraToWorldMatrix * inverseProjectionMatrix);
        ray.direction = normalize(ray.direction);

        var radiance = vec3f(0.0);
        var throughput = vec3f(1.0);

        for (var bounce = 0u; bounce < 5u; bounce = bounce + 1u) {
          if (bounce >= maxBounceCount) {
            break;
          }

          var hit: IntersectionResult;
          bvh_RaycastFirstHit(ray, &hit);
          if (!hit.didHit) {
            radiance += throughput * environmentRadiance(
              ray.direction,
              sunDirection,
              sunColor,
              sunIntensity,
              skyColor,
              groundColor,
              skyIntensity
            );
            break;
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
          let sampledSun = sampleSunDirection(sunDirection, &randomState);
          let sunCosine = max(dot(normal, sampledSun), 0.0);
          if (sunCosine > 0.0) {
            var shadowRay: Ray;
            shadowRay.origin = hitPoint + normal * 0.025;
            shadowRay.direction = sampledSun;
            var shadowHit: IntersectionResult;
            bvh_RaycastFirstHit(shadowRay, &shadowHit);
            if (!shadowHit.didHit) {
              radiance +=
                throughput *
                baseColor *
                (1.0 - metalness) *
                sunColor *
                sunIntensity *
                // Lambertian BRDF normalization, matching Three's raster lights.
                0.31830988618 *
                sunCosine;
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

          ray.origin = hitPoint + normal * 0.025;

          if (bounce >= 2u) {
            let survival = clamp(max(throughput.r, max(throughput.g, throughput.b)), 0.12, 0.92);
            if (hashRandom(&randomState) > survival) {
              break;
            }
            throughput /= survival;
          }
        }

        let previous = textureLoad(previousTex, vec2u(indexUV), 0).rgb;
        let weight = 1.0 / f32(sampleIndex + 1u);
        let accumulated = mix(previous, radiance, weight);
        textureStore(outputTex, indexUV, vec4f(accumulated, 1.0));
      }
    `,
    [
      hashRandom,
      cosineHemisphere,
      sampleSunDirection,
      environmentRadiance,
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
  const vignette = float(1).sub(smoothstep(0.32, 0.75, edgeDistance).mul(0.12));
  displayMaterial.colorNode = vec4(
    vibrance(tracedColor.rgb.mul(displayExposure), 0.06).mul(vignette),
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
    _sunDirection
      .subVectors(sunLight.position, sunLight.target.position)
      .normalize();

    const lightingChanged =
      !_lastSunDirection.equals(_sunDirection) ||
      !_lastSunColor.equals(sunLight.color) ||
      !_lastSkyColor.equals(hemisphereLight.color) ||
      !_lastGroundColor.equals(hemisphereLight.groundColor) ||
      lastSunIntensity !== sunLight.intensity ||
      lastSkyIntensity !== hemisphereLight.intensity;
    const cameraChanged =
      !lastCameraWorld.equals(camera.matrixWorld) ||
      !lastProjection.equals(camera.projectionMatrix);

    if (lightingChanged || cameraChanged) reset();

    lastCameraWorld.copy(camera.matrixWorld);
    lastProjection.copy(camera.projectionMatrix);
    _lastSunDirection.copy(_sunDirection);
    _lastSunColor.copy(sunLight.color);
    _lastSkyColor.copy(hemisphereLight.color);
    _lastGroundColor.copy(hemisphereLight.groundColor);
    lastSunIntensity = sunLight.intensity;
    lastSkyIntensity = hemisphereLight.intensity;

    inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
    cameraToWorldMatrix.value.copy(camera.matrixWorld);
    sunDirection.value.copy(_sunDirection);
    sunColor.value.copy(sunLight.color);
    sunIntensity.value = sunLight.intensity;
    skyColor.value.copy(hemisphereLight.color);
    groundColor.value.copy(hemisphereLight.groundColor);
    skyIntensity.value = hemisphereLight.intensity;
    if (sunLight.intensity < 0.05) {
      displayExposure.value = 1.55;
    } else {
      const highSun = Math.min(
        1,
        Math.max(0, (_sunDirection.y - 0.16) / 0.42),
      );
      displayExposure.value = 0.98 + (0.58 - 0.98) * highSun;
    }
  };

  const render = (samplesPerFrame: number, maxBounces: number) => {
    resizeIfNeeded();
    syncSceneState();

    const bounceCount = Math.min(5, Math.max(1, Math.round(maxBounces)));
    if (bounceCount !== lastBounces) {
      lastBounces = bounceCount;
      reset();
    }

    const frameSamples = Math.min(4, Math.max(1, Math.round(samplesPerFrame)));
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
      parameters.skyColor.value = skyColor.value;
      parameters.groundColor.value = groundColor.value;
      parameters.skyIntensity.value = skyIntensity.value;
      parameters.sampleIndex.value = sampleCount;
      parameters.maxBounceCount.value = bounceCount;
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
    get samples() {
      return sampleCount;
    },
  };
}
