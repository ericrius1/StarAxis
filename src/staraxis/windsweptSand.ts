/**
 * Camera-centred GPU saltation field.
 *
 * Wind-blown grains are ballistic and terrain-bound, so a neighbour sort
 * would spend bandwidth without changing the image. Instead, particle IDs
 * encode an implicit uniform grid (cell + lane): the storage buffers begin
 * spatially coherent, respawn evenly, and never need a CPU-side rebuild.
 *
 * Three concentric bands are intentionally asymmetric:
 *   near — dense, terrain collision every frame
 *   mid  — fewer grains, a 30 Hz physics step
 *   far  — sparse, larger dust flecks at 15 Hz
 *
 * This is the same spatial-bucketing insight as counting-sort sand, with the
 * sort eliminated because this saltation model has no grain/grain forces.
 */

import {
  ClampToEdgeWrapping,
  DataTexture,
  DataUtils,
  FloatType,
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
  float,
  hash,
  instanceIndex,
  instancedArray,
  mix,
  shapeCircle,
  smoothstep,
  texture,
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

  private readonly heightTexture = buildHeightTexture();
  private readonly cameraPosition = uniform(new Vector3());
  private readonly windDirection = uniform(new Vector2(1, 0));
  private readonly windStrength = uniform(0.4);
  private readonly gust = uniform(0);
  private readonly turbulence = uniform(0.4);
  private readonly elapsed = uniform(0);
  private readonly light = uniform(1);
  private readonly bands: SandBand[];
  private initialized = false;

  constructor(quality = 1) {
    this.group.name = 'windswept-sand-clipmap';

    const laneScale = Math.max(0.55, quality);
    const bandConfigs: BandConfig[] = [
      {
        name: 'near',
        grid: 32,
        lanes: Math.max(10, Math.round(18 * laneScale)),
        radius: 56,
        innerRadius: 0,
        stepHz: 60,
        baseSize: 0.048,
        alpha: 0.72,
        hop: 1.25,
        drag: 3.8,
        speedScale: 1,
        gravity: 8.4,
      },
      {
        name: 'mid',
        grid: 28,
        lanes: Math.max(4, Math.round(8 * laneScale)),
        radius: 155,
        innerRadius: 42,
        stepHz: 30,
        baseSize: 0.095,
        alpha: 0.4,
        hop: 0.8,
        drag: 2.6,
        speedScale: 0.92,
        gravity: 7.6,
      },
      {
        name: 'far',
        grid: 24,
        lanes: Math.max(2, Math.round(3 * laneScale)),
        radius: 330,
        innerRadius: 120,
        stepHz: 15,
        baseSize: 0.19,
        alpha: 0.2,
        hop: 0.48,
        drag: 1.8,
        speedScale: 0.78,
        gravity: 6.4,
      },
    ];

    this.bands = bandConfigs.map((config) => this.createBand(config));
    this.totalCount = this.bands.reduce((sum, band) => sum + band.count, 0);
    this.bands.forEach((band) => this.group.add(band.sprite));
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
      strategy: 'implicit-grid-clipmap',
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
    const windVisibility = smoothstep(0.15, 0.58, this.windStrength)
      .mul(0.58)
      .add(this.gust.mul(0.42))
      .add(0.12);
    const sandColor = mix(color('#745037'), color('#e2c392'), seed)
      .mul(this.light)
      .mul(float(0.78).add(seed.mul(0.35)));

    material.positionNode = renderPosition;
    material.scaleNode = vec2(
      float(config.baseSize)
        .mul(float(0.7).add(seed.mul(0.8)))
        .mul(float(0.9).add(this.windStrength.mul(1.7))),
      float(config.baseSize).mul(float(0.42).add(seed.mul(0.42))),
    );
    material.rotationNode = float(-0.12).add(seed.sub(0.5).mul(0.34));
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
}
