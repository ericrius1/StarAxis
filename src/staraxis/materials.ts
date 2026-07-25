/**
 * Procedural TSL materials for the Star Axis recreation.
 *
 * Every material builds independent node graphs per PBR channel
 * (albedo / roughness / bump-normal / AO) — no channel aliases another.
 * All patterns sample world-space position so detail density is stable
 * regardless of mesh scale, and every noise seed is deterministic.
 *
 * Families (from the sculpt spec):
 *   flagstone         — polygonal pink/tan/rust slab cladding (entry walls)
 *   fieldstone        — irregular buff/gray/rust rubble (crescent wall, terrace)
 *   granite           — pale speckled ashlar (treads, stringers, coping)
 *   pyramidSandstone  — salmon slab panels with seam grid (solar pyramid)
 *   stainless         — brushed low-roughness metal (aperture tube, railing)
 *   concrete          — pale cast panels (headwall, hood interior, chambers)
 *   desert            — caliche sand / gravel / rubble blend (terrain)
 */

import {
  Color,
  MeshStandardNodeMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
} from 'three/webgpu';
import {
  Fn,
  abs,
  add,
  bumpMap,
  clamp,
  color,
  float,
  hash,
  min,
  mix,
  mx_cell_noise_float,
  mx_fractal_noise_float,
  mx_worley_noise_vec2,
  normalWorld,
  positionWorld,
  smoothstep,
  sub,
  vec2,
  vec3,
} from 'three/tsl';

// ---------------------------------------------------------------- helpers

/**
 * Stone-cell field sampled on a 2D world projection.
 * Returns joint mask (1 inside a mortar joint), per-cell tint hash (0..1)
 * and a height signal (recessed joints + per-cell doming).
 */
const stoneField = /*@__PURE__*/ Fn(
  ([p, cellScale, jointWidth]: any[]) => {
    const q = p.mul(cellScale);
    const w = mx_worley_noise_vec2(q, 1.0);
    const border = w.y.sub(w.x); // 0 at cell borders, grows inward
    const joint = smoothstep(jointWidth, float(0.0), border);
    const tint = mx_cell_noise_float(q);
    const height = smoothstep(float(0.0), jointWidth.mul(2.5), border);
    return vec3(joint, tint, height);
  },
);

/** Three-band value breakup: macro zone drift + meso patching + micro grain. */
const bandNoise = /*@__PURE__*/ Fn(([p]: any[]) => {
  const macro = mx_fractal_noise_float(p.mul(0.045), 2, 2.0, 0.55, 1.0);
  const meso = mx_fractal_noise_float(p.mul(0.6), 3, 2.0, 0.5, 1.0);
  const micro = mx_fractal_noise_float(p.mul(9.0), 2, 2.0, 0.5, 1.0);
  return macro.mul(0.5).add(meso.mul(0.34)).add(micro.mul(0.16));
});

/** Pick among 3 palette colors by a 0..1 hash with soft borders. */
function palettePick(t: any, a: string, b: string, c: string) {
  const ab = mix(color(a), color(b), smoothstep(0.15, 0.5, t));
  return mix(ab, color(c), smoothstep(0.55, 0.9, t));
}

// ---------------------------------------------------------------- traced response
//
// The path tracer reads geometry, not fragment shaders, so it cannot sample
// `map` or a TSL colorNode. Each material therefore publishes the *effective*
// albedo a rasterized pixel would end up with — base color times the mean of
// its albedo texture — under `userData.traced`. Without this the mapped stone
// traces at its untextured tint and the monument renders bone white.

export interface TracedResponse {
  color: Color;
  roughness: number;
  metalness: number;
  /**
   * Traced emission. Publishing this suppresses the raster `emissive`, which
   * some materials use as a stand-in for effects the tracer computes for real
   * (the horizon mesas lift themselves to imitate haze).
   */
  emissive?: Color;
}

/** Mean of a decoded image in the renderer's linear working space. */
function averageLinearColor(image: CanvasImageSource): Color {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return new Color(1, 1, 1);
  context.drawImage(image, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const samples = data.length / 4;
  return new Color().setRGB(
    r / (samples * 255),
    g / (samples * 255),
    b / (samples * 255),
    SRGBColorSpace,
  );
}

/**
 * Publish a material's traced response. `mapAverage` folds in the mean of the
 * albedo texture the tracer cannot sample.
 */
function publishTraced(
  material: MeshStandardNodeMaterial,
  mapAverage?: Color,
): MeshStandardNodeMaterial {
  const albedo = material.color.clone();
  if (mapAverage) albedo.multiply(mapAverage);
  material.userData.traced = {
    color: albedo,
    roughness: material.roughness,
    metalness: material.metalness,
  };
  return material;
}

// ---------------------------------------------------------------- masonry

export interface MasonryOptions {
  cellScale: number;
  jointWidth: number;
  paletteA: string;
  paletteB: string;
  paletteC: string;
  jointColor: string;
  roughnessBase: number;
  roughnessVar: number;
  bumpScale: number;
  tintAmplitude: number;
}

function masonryMaterial(opts: MasonryOptions): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();

  // Project world position onto a plane facing the surface normal
  // (cheap triplanar: vertical surfaces use their dominant tangent plane).
  const p = positionWorld;
  const n = normalWorld;
  const horiz = abs(n.y);
  // vertical walls: mix XZ-driven coordinate by facing; flat tops: use xz.
  const wallU = mix(p.x, p.z, smoothstep(0.4, 0.6, abs(n.x)));
  const planar = vec2(wallU, p.y);
  const flat = vec2(p.x, p.z);
  const uvw = mix(planar, flat, smoothstep(0.55, 0.8, horiz));

  const field = (stoneField as any)(uvw, float(opts.cellScale), float(opts.jointWidth)).toVar();
  const joint = field.x;
  const tint = field.y;
  const relief = field.z;

  const breakup = bandNoise(p).toVar();

  // ---- albedo: per-stone palette pick, macro drift, joint mortar darkening
  const stone = palettePick(tint, opts.paletteA, opts.paletteB, opts.paletteC);
  const drifted = stone.mul(float(1.0).add(breakup.sub(0.5).mul(opts.tintAmplitude)));
  const albedo = mix(drifted, color(opts.jointColor), joint.mul(0.85));
  mat.colorNode = albedo;

  // ---- roughness: independent fbm seed + rougher joints
  const rSeed = mx_fractal_noise_float(p.mul(1.35).add(vec3(31.7, 7.3, 19.1)), 3, 2.0, 0.5, 1.0);
  const rough = float(opts.roughnessBase)
    .add(rSeed.sub(0.5).mul(opts.roughnessVar * 2))
    .add(joint.mul(0.08));
  mat.roughnessNode = clamp(rough, 0.35, 1.0);

  // ---- relief: recessed joints + per-cell doming + micro grain
  const grain = mx_fractal_noise_float(p.mul(14.0).add(vec3(5.1, 77.7, 2.2)), 2, 2.0, 0.5, 1.0);
  const heightNode = relief.mul(0.75).add(tint.mul(0.15)).add(grain.mul(0.1));
  mat.normalNode = bumpMap(heightNode, float(opts.bumpScale));

  // ---- AO: darken joints and low-frequency cavities
  const cavity = mx_fractal_noise_float(p.mul(0.22).add(vec3(11.1, 3.3, 8.8)), 2, 2.0, 0.5, 1.0);
  mat.aoNode = clamp(
    float(1.0).sub(joint.mul(0.35)).sub(cavity.sub(0.6).max(0.0).mul(0.3)),
    0.4,
    1.0,
  );

  return mat;
}

// ---------------------------------------------------------------- factories

export interface StarAxisMaterials {
  flagstone: MeshStandardNodeMaterial;
  fieldstone: MeshStandardNodeMaterial;
  ashlar: MeshStandardNodeMaterial;
  granite: MeshStandardNodeMaterial;
  graniteCoping: MeshStandardNodeMaterial;
  pyramidSandstone: MeshStandardNodeMaterial;
  stainless: MeshStandardNodeMaterial;
  bronze: MeshStandardNodeMaterial;
  concrete: MeshStandardNodeMaterial;
  concreteDark: MeshStandardNodeMaterial;
  desert: MeshStandardNodeMaterial;
}

export async function createMaterials(): Promise<StarAxisMaterials> {
  // The large masonry surfaces previously evaluated several Worley/FBM
  // stacks per pixel. One baked granite albedo now supplies their mineral
  // breakup, with geometry and lighting carrying the larger-scale variation.
  const stoneBake = await new TextureLoader().loadAsync(
    '/textures/pyramid-granite-albedo.png',
  );
  stoneBake.wrapS = RepeatWrapping;
  stoneBake.wrapT = RepeatWrapping;
  stoneBake.repeat.set(3, 3);
  stoneBake.colorSpace = SRGBColorSpace;
  stoneBake.anisotropy = 4;
  const stoneAverage = averageLinearColor(stoneBake.image as CanvasImageSource);

  const flagstone = new MeshStandardNodeMaterial({
    map: stoneBake,
    color: '#caa487',
    roughness: 0.86,
    metalness: 0,
  });
  const fieldstone = new MeshStandardNodeMaterial({
    map: stoneBake,
    color: '#aa9a82',
    roughness: 0.92,
    metalness: 0,
  });
  const ashlar = new MeshStandardNodeMaterial({
    map: stoneBake,
    color: '#c9bda7',
    roughness: 0.84,
    metalness: 0,
  });

  // -- granite: pale speckled, subtle joints (used for treads/stringers)
  const granite = new MeshStandardNodeMaterial({
    map: stoneBake,
    color: '#d4cec4',
    roughness: 0.64,
    metalness: 0,
  });

  // -- coping variant: palest, smoother — reads near-white in sun
  const graniteCoping = new MeshStandardNodeMaterial({
    map: stoneBake,
    color: '#eee8df',
    roughness: 0.56,
    metalness: 0,
  });

  // -- solar pyramid: the slab layout is modeled explicitly on the face.
  // Keeping this base response constant removes a relatively expensive
  // full-screen procedural shader from the monument's largest surfaces.
  const pyramidSandstone = new MeshStandardNodeMaterial();
  const pyramidGrain = stoneBake.clone();
  pyramidGrain.wrapS = RepeatWrapping;
  pyramidGrain.wrapT = RepeatWrapping;
  pyramidGrain.repeat.set(5, 8);
  pyramidGrain.colorSpace = SRGBColorSpace;
  pyramidGrain.anisotropy = 8;
  pyramidGrain.needsUpdate = true;
  pyramidSandstone.map = pyramidGrain;
  pyramidSandstone.color.set('#f0ded9');
  pyramidSandstone.roughness = 0.82;
  pyramidSandstone.metalness = 0;

  // -- stainless: brushed metal, circumferential streaks. Metalness is kept
  // moderate: with no environment map a full metal goes black in shadow,
  // while the reference bore reads as bright sky-lit brushed steel.
  const stainless = new MeshStandardNodeMaterial({
    color: '#dbe2e8',
    roughness: 0.27,
    metalness: 0.38,
  });

  // -- bronze: warm aged metal for the chamber edgings (Star Axis is built
  // of earth, granite, sandstone, stainless steel and bronze)
  const bronze = new MeshStandardNodeMaterial({
    color: '#76583a',
    roughness: 0.43,
    metalness: 0.5,
  });

  // -- concrete: pale form-cast panels, faint streaking
  const concrete = new MeshStandardNodeMaterial({
    color: '#b8b2a7',
    roughness: 0.78,
    metalness: 0,
  });

  // -- darker concrete/granite for shadowed interiors (hood, chambers)
  const concreteDark = new MeshStandardNodeMaterial({
    color: '#77716a',
    roughness: 0.88,
    metalness: 0,
  });

  // -- desert ground: its procedural breakup is baked into terrain vertex
  // colors once at construction time, eliminating several FBM evaluations
  // for every ground pixel on every frame.
  const desert = new MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0,
    vertexColors: true,
  });

  // Mapped stone traces at base × mean(map); flat materials trace at base.
  // The desert stays white because the tracer already multiplies by the
  // terrain's baked vertex colors.
  [flagstone, fieldstone, ashlar, granite, graniteCoping, pyramidSandstone].forEach(
    (material) => publishTraced(material, stoneAverage),
  );
  [stainless, bronze, concrete, concreteDark, desert].forEach((material) =>
    publishTraced(material),
  );

  return {
    flagstone,
    fieldstone,
    ashlar,
    granite,
    graniteCoping,
    pyramidSandstone,
    stainless,
    bronze,
    concrete,
    concreteDark,
    desert,
  };
}

// Re-export unused-symbol guards for tree-shaking friendliness
export const __tslSymbols = { add, sub, min, hash, Fn };
