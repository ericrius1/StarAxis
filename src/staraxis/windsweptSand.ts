/**
 * Camera-centred GPU sand haze.
 *
 * The primary effect is a continuous, terrain-relative height volume injected
 * through Scene.fogNode. Long anisotropic density fields advect with the shared
 * wind and dissolve through turbulent edges, so sand reads as mist rather than
 * a cloud of billboards.
 *
 * A small GPU saltation field remains only for sub-pixel near-camera sparkle.
 * Particle IDs encode an implicit uniform grid (cell + lane), retaining even
 * coverage without a sort or any grain/grain force pass.
 */

import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DataUtils,
  Group,
  HalfFloatType,
  LinearFilter,
  RedFormat,
  Sprite,
  SpriteNodeMaterial,
  Vector2,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import {
  Fn,
  If,
  clamp,
  color,
  densityFogFactor,
  float,
  hash,
  instanceIndex,
  instancedArray,
  mix,
  output,
  positionWorld,
  rangeFogFactor,
  shapeCircle,
  smoothstep,
  texture,
  triNoise3D,
  uint,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import { TERRAIN_SIZE } from './constants';
import { terrainHeight } from './heightfield';
import type { MesaWindFrame } from './wind';

interface BandConfig {
  name: string;
  grid: number;
  lanes: number;
  radius: number;
  innerRadius: number;
  stepHz: number;
  baseSize: number;
  alpha: number;
  hop: number;
  drag: number;
  speedScale: number;
  gravity: number;
}

interface SandBand {
  config: BandConfig;
  count: number;
  sprite: Sprite;
  initialize: any;
  simulate: any;
  step: ReturnType<typeof uniform>;
  accumulator: number;
}

export interface SandFrame extends MesaWindFrame {
  light: number;
}

const HEIGHT_TEXTURE_SIZE = 512;
const DISTANCE_FOG_COLORS = {
  day: new Color('#cfd8e4'),
  goldenHour: new Color('#dcb28a'),
  night: new Color('#070a12'),
} as const;
const SAND_FOG_COLORS = {
  day: new Color('#cdb58e'),
  goldenHour: new Color('#c79a66'),
  night: new Color('#151412'),
} as const;

function buildHeightTexture(): DataTexture {
  const samples = new Uint16Array(HEIGHT_TEXTURE_SIZE * HEIGHT_TEXTURE_SIZE);
  const half = TERRAIN_SIZE * 0.5;
  for (let zIndex = 0; zIndex < HEIGHT_TEXTURE_SIZE; zIndex++) {
    const z = -half + (zIndex / (HEIGHT_TEXTURE_SIZE - 1)) * TERRAIN_SIZE;
    for (let xIndex = 0; xIndex < HEIGHT_TEXTURE_SIZE; xIndex++) {
      const x = -half + (xIndex / (HEIGHT_TEXTURE_SIZE - 1)) * TERRAIN_SIZE;
      samples[zIndex * HEIGHT_TEXTURE_SIZE + xIndex] = DataUtils.toHalfFloat(
        terrainHeight(x, z),
      );
    }
  }

  const map = new DataTexture(
    samples,
    HEIGHT_TEXTURE_SIZE,
    HEIGHT_TEXTURE_SIZE,
    RedFormat,
    HalfFloatType,
  );
  map.name = 'terrain-height-collision';
  map.wrapS = ClampToEdgeWrapping;
  map.wrapT = ClampToEdgeWrapping;
  map.minFilter = LinearFilter;
  map.magFilter = LinearFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return map;
}

function lightForMode(mode: 'day' | 'goldenHour' | 'night'): number {
  return mode === 'night' ? 0.11 : mode === 'goldenHour' ? 0.8 : 1;
}

export class WindsweptSand {
  readonly group = new Group();
  readonly totalCount: number;
  readonly fogNode: any;

  private readonly heightTexture = buildHeightTexture();
  private readonly cameraPosition = uniform(new Vector3());
  private readonly windDirection = uniform(new Vector2(1, 0));
  private readonly windStrength = uniform(0.4);
  private readonly gust = uniform(0);
  private readonly turbulence = uniform(0.4);
  private readonly elapsed = uniform(0);
  private readonly light = uniform(1);
  private readonly distanceFogColor = uniform(new Color('#cfd8e4'));
  private readonly sandFogColor = uniform(new Color('#cdb58e'));
  private readonly bands: SandBand[];
  private initialized = false;

  constructor(quality = 1) {
    this.group.name = 'windswept-sand-volume';

    const laneScale = Math.max(0.55, quality);
    const bandConfigs: BandConfig[] = [
      {
        name: 'micro',
        grid: 24,
        lanes: Math.max(3, Math.round(6 * laneScale)),
        radius: 42,
        innerRadius: 0,
        stepHz: 60,
        baseSize: 0.014,
        alpha: 0.12,
        hop: 0.32,
        drag: 4.2,
        speedScale: 1,
        gravity: 9.1,
      },
    ];

    this.bands = bandConfigs.map((config) => this.createBand(config));
    this.totalCount = this.bands.reduce((sum, band) => sum + band.count, 0);
    this.bands.forEach((band) => this.group.add(band.sprite));
    this.fogNode = this.createFogNode();
  }

  initialize(renderer: WebGPURenderer, position: Vector3): void {
    this.cameraPosition.value.copy(position);
    this.bands.forEach((band) => renderer.compute(band.initialize));
    this.initialized = true;
  }

  update(
    renderer: WebGPURenderer,
    frame: MesaWindFrame,
    position: Vector3,
    dt: number,
    mode: 'day' | 'goldenHour' | 'night',
  ): void {
    if (!this.initialized) return;

    this.cameraPosition.value.copy(position);
    this.windDirection.value.set(frame.directionX, frame.directionZ);
    this.windStrength.value = frame.strength;
    this.gust.value = frame.gust;
    this.turbulence.value = frame.turbulence;
    this.elapsed.value = frame.elapsed;
    this.light.value = lightForMode(mode);
    this.distanceFogColor.value.lerp(DISTANCE_FOG_COLORS[mode], Math.min(dt * 2, 1));
    this.sandFogColor.value.lerp(SAND_FOG_COLORS[mode], Math.min(dt * 2.8, 1));

    for (const band of this.bands) {
      band.accumulator += dt;
      const interval = 1 / band.config.stepHz;
      if (band.accumulator + 1e-6 < interval) continue;
      band.step.value = Math.min(band.accumulator, 0.1);
      band.accumulator = 0;
      renderer.compute(band.simulate);
    }
  }

  snapshot(): { particles: number; bands: number; strategy: string } {
    return {
      particles: this.totalCount,
      bands: this.bands.length,
      strategy: 'height-volume-plus-micro-saltation',
    };
  }

  dispose(): void {
    this.heightTexture.dispose();
    for (const band of this.bands) band.sprite.material.dispose();
  }

  private createBand(config: BandConfig): SandBand {
    const count = config.grid * config.grid * config.lanes;
    // Storage-buffer names become WGSL struct identifiers. Keep them free of
    // spaces so WebGPU validation does not reject the generated compute shader.
    const positions = instancedArray(count, 'vec3').setName(`Sand_${config.name}_positions`);
    const velocities = instancedArray(count, 'vec3').setName(`Sand_${config.name}_velocities`);
    const particleData = instancedArray(count, 'vec4').setName(`Sand_${config.name}_data`);
    const step = uniform(1 / config.stepHz);
    const diameter = config.radius * 2;

    const sampleTerrain = Fn(([xz]: any[]) => {
      const coord = xz.div(float(TERRAIN_SIZE)).add(0.5);
      return texture(this.heightTexture, coord).r;
    });

    const initialize = Fn(() => {
      const position = positions.element(instanceIndex);
      const velocity = velocities.element(instanceIndex);
      const data = particleData.element(instanceIndex);

      // Particle index = [cell index][lane], an implicit spatial counting sort.
      const cell = instanceIndex.div(uint(config.lanes));
      const cellX = cell.mod(uint(config.grid)).toFloat();
      const cellZ = cell.div(uint(config.grid)).toFloat();
      const seedA = hash(instanceIndex.mul(uint(17)).add(uint(11)));
      const seedB = hash(instanceIndex.mul(uint(29)).add(uint(47)));
      const seedC = hash(instanceIndex.mul(uint(43)).add(uint(101)));
      const center = this.cameraPosition;

      position.x.assign(
        center.x.add(
          cellX
            .add(seedA)
            .div(float(config.grid))
            .sub(0.5)
            .mul(diameter),
        ),
      );
      position.z.assign(
        center.z.add(
          cellZ
            .add(seedB)
            .div(float(config.grid))
            .sub(0.5)
            .mul(diameter),
        ),
      );
      const floor = sampleTerrain(position.xz);
      position.y.assign(
        floor.add(seedC.mul(seedC).mul(config.hop).mul(this.windStrength.add(0.25))),
      );

      const crosswind = vec2(this.windDirection.y.negate(), this.windDirection.x)
        .mul(seedB.sub(0.5))
        .mul(2.4);
      velocity.xz.assign(
        this.windDirection
          .mul(float(2.2).add(this.windStrength.mul(8.5)))
          .mul(config.speedScale)
          .add(crosswind),
      );
      velocity.y.assign(seedC.mul(config.hop).add(0.18));
      data.assign(vec4(seedA, seedB, seedC, 0));
    })()
      .compute(count, [128])
      .setName(`Initialize ${config.name} sand`);

    const simulate = Fn(() => {
      const position = positions.element(instanceIndex);
      const velocity = velocities.element(instanceIndex);
      const data = particleData.element(instanceIndex);
      const seed = data.x;

      const localPulse = position.x
        .mul(0.031)
        .add(position.z.mul(0.019))
        .add(this.elapsed.mul(float(0.74).add(seed.mul(0.55))))
        .sin()
        .mul(0.5)
        .add(0.5);
      const sideways = vec2(this.windDirection.y.negate(), this.windDirection.x)
        .mul(seed.sub(0.5))
        .mul(this.turbulence)
        .mul(4.8);
      const targetSpeed = float(1.7)
        .add(this.windStrength.mul(11.5))
        .add(this.gust.mul(4.2))
        .add(localPulse.mul(1.6))
        .mul(config.speedScale);
      const targetVelocity = this.windDirection.mul(targetSpeed).add(sideways);
      const response = clamp(step.mul(config.drag), 0, 1);
      velocity.xz.assign(mix(velocity.xz, targetVelocity, response));

      velocity.y.addAssign(step.mul(-config.gravity));
      position.addAssign(velocity.mul(step));

      // Toroidal clipmap wrap: camera travel never causes buffer rebuilds.
      const wrappedX = this.cameraPosition.x.add(
        position.x
          .sub(this.cameraPosition.x)
          .add(config.radius)
          .mod(diameter)
          .sub(config.radius),
      );
      const wrappedZ = this.cameraPosition.z.add(
        position.z
          .sub(this.cameraPosition.z)
          .add(config.radius)
          .mod(diameter)
          .sub(config.radius),
      );
      const teleported = wrappedX
        .sub(position.x)
        .abs()
        .greaterThan(config.radius)
        .or(wrappedZ.sub(position.z).abs().greaterThan(config.radius));
      position.x.assign(wrappedX);
      position.z.assign(wrappedZ);

      const floor = sampleTerrain(position.xz).add(0.025);
      If(teleported, () => {
        position.y.assign(
          floor.add(data.z.mul(data.z).mul(config.hop).mul(this.windStrength.add(0.2))),
        );
        velocity.y.assign(data.z.mul(config.hop).add(0.12));
      });

      If(position.y.lessThan(floor), () => {
        position.y.assign(floor);
        const burst = float(0.24)
          .add(this.windStrength.mul(0.82))
          .add(this.gust.mul(0.65))
          .add(localPulse.mul(0.2));
        const rareLift = smoothstep(0.82, 0.99, data.y).mul(1.35).add(1);
        velocity.y.assign(
          burst
            .mul(config.hop)
            .mul(float(0.55).add(data.z.mul(0.75)))
            .mul(rareLift),
        );
        velocity.xz.assign(mix(velocity.xz, targetVelocity, 0.46));
        data.w.addAssign(1);
      });
    })()
      .compute(count, [128])
      .setName(`Simulate ${config.name} sand`);

    const material = new SpriteNodeMaterial();
    const seed = hash(instanceIndex.mul(uint(37)).add(uint(5)));
    const renderPosition = positions.toAttribute();
    const distance = renderPosition.xz.distance(this.cameraPosition.xz);
    const outerFade = smoothstep(config.radius, config.radius * 0.72, distance);
    const innerFade =
      config.innerRadius > 0
        ? smoothstep(config.innerRadius * 0.74, config.innerRadius, distance)
        : float(1);
    const windVisibility = smoothstep(0.28, 0.72, this.windStrength)
      .mul(0.38)
      .add(this.gust.mul(0.52))
      .add(0.025);
    const sandColor = mix(color('#806247'), color('#b99a72'), seed)
      .mul(this.light)
      .mul(float(0.72).add(seed.mul(0.24)));

    material.positionNode = renderPosition;
    const grainSize = float(config.baseSize).mul(float(0.55).add(seed.mul(1.05)));
    material.scaleNode = vec2(grainSize);
    material.rotationNode = seed.mul(Math.PI * 2);
    material.colorNode = sandColor;
    material.opacityNode = (shapeCircle() as any)
      .mul(config.alpha)
      .mul(windVisibility)
      .mul(innerFade)
      .mul(outerFade);
    material.alphaToCoverage = true;
    material.transparent = true;
    material.depthWrite = false;
    material.depthTest = true;
    material.toneMapped = true;
    material.fog = false;

    const sprite = new Sprite(material);
    sprite.name = `windswept-sand-${config.name}`;
    sprite.count = count;
    sprite.frustumCulled = false;
    sprite.renderOrder = 2;

    return {
      config,
      count,
      sprite,
      initialize,
      simulate,
      step,
      accumulator: 0,
    };
  }

  /**
   * Continuous ground-relative sand density. The fog factor integrates along
   * the camera ray through densityFogFactor, while world-space anisotropic
   * noise breaks the top into long wind-aligned veils.
   */
  private createFogNode(): any {
    const sampleTerrain = Fn(([xz]: any[]) => {
      const coord = xz.div(float(TERRAIN_SIZE)).add(0.5);
      return texture(this.heightTexture, coord).r;
    });

    return Fn(() => {
      const groundY = sampleTerrain(positionWorld.xz);
      const altitude = positionWorld.y.sub(groundY).max(0).toVar();
      const sandFactor = float(0).toVar();

      // The branch keeps the noise march off the full-screen sky and upper
      // architecture. Only fragments inside the shallow ground layer pay for
      // the volumetric density evaluation.
      If(altitude.lessThan(6), () => {
        const acrossDirection = vec2(this.windDirection.y.negate(), this.windDirection.x);
        const along = positionWorld.xz.dot(this.windDirection);
        const across = positionWorld.xz.dot(acrossDirection);
        const travel = this.elapsed.mul(float(1.8).add(this.windStrength.mul(8.2)));
        const flowPosition = vec3(
          along.sub(travel).mul(0.009),
          across.mul(0.044).add(this.elapsed.mul(0.012)),
          altitude.mul(0.22),
        );
        const volumeNoise = triNoise3D(
          flowPosition,
          float(0.08).add(this.turbulence.mul(0.12)),
          this.elapsed.mul(0.07),
        );
        const filament = across
          .mul(0.19)
          .add(along.mul(0.018))
          .sub(this.elapsed.mul(float(0.8).add(this.windStrength.mul(2.4))))
          .sin()
          .mul(0.055);
        const wisps = smoothstep(0.18, 0.55, volumeNoise.add(filament));
        const heightFalloff = smoothstep(
          float(3.6).add(this.gust.mul(1.2)),
          0,
          altitude,
        );
        const opticalDepth = densityFogFactor(
          float(0.007)
            .add(this.windStrength.mul(0.0085))
            .add(this.gust.mul(0.006)),
        );
        const windGate = smoothstep(0.18, 0.62, this.windStrength)
          .mul(0.72)
          .add(this.gust.mul(0.28));

        sandFactor.assign(
          opticalDepth
            .mul(heightFalloff)
            .mul(wisps)
            .mul(windGate)
            .mul(float(0.55).add(this.gust.mul(0.4))),
        );
      });

      const sanded = mix(output.rgb, this.sandFogColor, sandFactor);
      const distanceHaze = rangeFogFactor(500, 1500);
      return vec4(mix(sanded, this.distanceFogColor, distanceHaze), output.a);
    })();
  }
}
