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

import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  Fn,
  abs,
  add,
  bumpMap,
  clamp,
  color,
  float,
  fract,
  hash,
  max,
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

export function createMaterials(): StarAxisMaterials {
  // -- flagstone: big polygonal slabs, pink/tan with occasional rust
  const flagstone = masonryMaterial({
    cellScale: 0.52,
    jointWidth: 0.035,
    paletteA: '#c2a084',
    paletteB: '#ad805f',
    paletteC: '#d6bda1',
    jointColor: '#a99680',
    roughnessBase: 0.82,
    roughnessVar: 0.14,
    bumpScale: 0.11,
    tintAmplitude: 0.28,
  });

  // -- fieldstone: smaller irregular rubble, buff/gray, deep joints
  const fieldstone = masonryMaterial({
    cellScale: 1.35,
    jointWidth: 0.075,
    paletteA: '#b3a184',
    paletteB: '#96876d',
    paletteC: '#a89a8c',
    jointColor: '#79705f',
    roughnessBase: 0.88,
    roughnessVar: 0.1,
    bumpScale: 0.16,
    tintAmplitude: 0.34,
  });

  // -- ashlar: neat coursed blocks, lighter band along the crescent rim
  const ashlar = masonryMaterial({
    cellScale: 2.3,
    jointWidth: 0.05,
    paletteA: '#c8bba4',
    paletteB: '#b5a88f',
    paletteC: '#d4c9b4',
    jointColor: '#948a76',
    roughnessBase: 0.8,
    roughnessVar: 0.1,
    bumpScale: 0.04,
    tintAmplitude: 0.2,
  });

  // -- granite: pale speckled, subtle joints (used for treads/stringers)
  const granite = new MeshStandardNodeMaterial();
  {
    const p = positionWorld;
    const speck = mx_fractal_noise_float(p.mul(24.0), 2, 2.0, 0.5, 1.0);
    const drift = mx_fractal_noise_float(p.mul(0.35).add(vec3(9.0, 1.0, 4.0)), 3, 2.0, 0.5, 1.0);
    const base = mix(color('#cfc8bc'), color('#b9b2a6'), smoothstep(0.35, 0.75, drift));
    granite.colorNode = base.mul(float(0.92).add(speck.mul(0.16)));
    const rSeed = mx_fractal_noise_float(p.mul(2.2).add(vec3(3.7, 8.8, 1.2)), 2, 2.0, 0.5, 1.0);
    granite.roughnessNode = clamp(float(0.6).add(rSeed.sub(0.5).mul(0.3)), 0.4, 0.85);
    granite.normalNode = bumpMap(speck, float(0.015));
    granite.aoNode = float(1.0);
  }

  // -- coping variant: palest, smoother — reads near-white in sun
  const graniteCoping = new MeshStandardNodeMaterial();
  {
    const p = positionWorld;
    const speck = mx_fractal_noise_float(p.mul(30.0).add(vec3(2.0, 6.0, 12.0)), 2, 2.0, 0.5, 1.0);
    graniteCoping.colorNode = color('#e2dcd2').mul(float(0.95).add(speck.mul(0.1)));
    graniteCoping.roughnessNode = float(0.5).add(speck.sub(0.5).mul(0.12));
    graniteCoping.normalNode = bumpMap(speck, float(0.008));
  }

  // -- solar pyramid: salmon sandstone slabs with rectangular seam grid
  const pyramidSandstone = new MeshStandardNodeMaterial();
  {
    const p = positionWorld;
    const n = normalWorld;
    // panel grid on the face plane: u along horizontal contour, v along height
    const u = mix(p.x, p.z, smoothstep(0.4, 0.6, abs(n.x)));
    const gu = abs(fract(u.mul(0.66)).sub(0.5));
    const gv = abs(fract(p.y.mul(1.35)).sub(0.5));
    const seam = max(
      smoothstep(0.485, 0.5, gu),
      smoothstep(0.47, 0.5, gv),
    );
    const drift = mx_fractal_noise_float(p.mul(0.14), 3, 2.0, 0.55, 1.0);
    const patch = mx_cell_noise_float(vec2(u.mul(0.66), p.y.mul(1.35)));
    const base = palettePick(patch, '#d5a287', '#cb9270', '#e0b498');
    pyramidSandstone.colorNode = mix(
      base.mul(float(0.95).add(drift.mul(0.1))),
      color('#b08363'),
      seam.mul(0.35),
    );
    const rSeed = mx_fractal_noise_float(p.mul(1.9).add(vec3(17.0, 3.0, 5.0)), 2, 2.0, 0.5, 1.0);
    pyramidSandstone.roughnessNode = clamp(float(0.78).add(rSeed.sub(0.5).mul(0.24)), 0.5, 1.0);
    const grain = mx_fractal_noise_float(p.mul(11.0), 2, 2.0, 0.5, 1.0);
    pyramidSandstone.normalNode = bumpMap(
      float(1.0).sub(seam.mul(0.6)).add(grain.mul(0.12)),
      float(0.02),
    );
  }

  // -- stainless: brushed metal, circumferential streaks. Metalness is kept
  // moderate: with no environment map a full metal goes black in shadow,
  // while the reference bore reads as bright sky-lit brushed steel.
  const stainless = new MeshStandardNodeMaterial();
  {
    const p = positionWorld;
    const streak = mx_fractal_noise_float(
      vec3(p.x.mul(2.0), p.y.mul(60.0), p.z.mul(2.0)),
      2,
      2.0,
      0.5,
      1.0,
    );
    stainless.colorNode = mix(color('#c3c9ce'), color('#eef2f5'), streak.mul(0.7));
    stainless.roughnessNode = clamp(float(0.24).add(streak.sub(0.5).mul(0.16)), 0.12, 0.4);
    stainless.metalnessNode = float(0.35);
  }

  // -- bronze: warm aged metal for the chamber edgings (Star Axis is built
  // of earth, granite, sandstone, stainless steel and bronze)
  const bronze = new MeshStandardNodeMaterial();
  {
    const p = positionWorld;
    const patina = mx_fractal_noise_float(p.mul(4.5).add(vec3(13.0, 5.5, 21.0)), 3, 2.0, 0.5, 1.0);
    bronze.colorNode = mix(color('#8c6a3f'), color('#5f4a30'), patina.mul(0.6));
    bronze.roughnessNode = clamp(float(0.38).add(patina.sub(0.5).mul(0.2)), 0.25, 0.6);
    bronze.metalnessNode = float(0.55);
  }

  // -- concrete: pale form-cast panels, faint streaking
  const concrete = new MeshStandardNodeMaterial();
  {
    const p = positionWorld;
    const streakDown = mx_fractal_noise_float(vec3(p.x.mul(3.0), p.y.mul(0.3), p.z.mul(3.0)), 3, 2.0, 0.5, 1.0);
    const drift = mx_fractal_noise_float(p.mul(0.4).add(vec3(4.4, 9.9, 0.5)), 3, 2.0, 0.5, 1.0);
    concrete.colorNode = mix(color('#c2bdb2'), color('#a9a498'), streakDown.mul(0.45).add(drift.mul(0.25)));
    concrete.roughnessNode = clamp(float(0.72).add(drift.sub(0.5).mul(0.24)), 0.5, 0.95);
    const grain = mx_fractal_noise_float(p.mul(8.0).add(vec3(1.0, 2.0, 3.0)), 2, 2.0, 0.5, 1.0);
    concrete.normalNode = bumpMap(grain, float(0.006));
  }

  // -- darker concrete/granite for shadowed interiors (hood, chambers)
  const concreteDark = new MeshStandardNodeMaterial();
  {
    const p = positionWorld;
    const drift = mx_fractal_noise_float(p.mul(0.5), 3, 2.0, 0.5, 1.0);
    concreteDark.colorNode = mix(color('#8d8880'), color('#6f6a62'), drift.mul(0.7));
    concreteDark.roughnessNode = float(0.85);
    const grain = mx_fractal_noise_float(p.mul(6.0), 2, 2.0, 0.5, 1.0);
    concreteDark.normalNode = bumpMap(grain, float(0.008));
  }

  // -- desert ground: caliche path / gravel / rubble slope blend
  const desert = new MeshStandardNodeMaterial();
  {
    const p = positionWorld;
    const n = normalWorld;
    const slope = clamp(float(1.0).sub(n.y), 0.0, 1.0);
    const patch = mx_fractal_noise_float(p.mul(0.08), 3, 2.0, 0.55, 1.0);
    const pebble = mx_fractal_noise_float(p.mul(3.2).add(vec3(7.0, 0.0, 13.0)), 2, 2.0, 0.5, 1.0);

    // path corridor mask: pale compacted band along the entry trench + bowl floor
    const inTrench = smoothstep(float(9.0), float(5.0), abs(p.x))
      .mul(smoothstep(float(6.0), float(12.0), p.z))
      .mul(smoothstep(float(62.0), float(50.0), p.z));
    const inBowl = smoothstep(float(20.0), float(14.0), p.xz.length());
    const path = max(inTrench, inBowl);

    const sand = mix(color('#d3bda0'), color('#c0a480'), patch);
    const rubble = mix(color('#b5a488'), color('#996f4d'), smoothstep(0.4, 0.8, pebble));
    const slopeMix = mix(sand, rubble, clamp(slope.mul(5.0).add(patch.mul(0.4)).sub(0.25), 0.0, 1.0));
    desert.colorNode = mix(slopeMix, color('#e2d3b8'), path.mul(0.75));

    const rSeed = mx_fractal_noise_float(p.mul(1.1).add(vec3(21.0, 8.0, 2.0)), 2, 2.0, 0.5, 1.0);
    desert.roughnessNode = clamp(float(0.94).add(rSeed.sub(0.5).mul(0.1)).sub(path.mul(0.06)), 0.7, 1.0);
    desert.normalNode = bumpMap(pebble.mul(float(1.0).sub(path.mul(0.7))), float(0.05));
    const cav = mx_fractal_noise_float(p.mul(0.3).add(vec3(2.0, 5.0, 9.0)), 2, 2.0, 0.5, 1.0);
    desert.aoNode = clamp(float(1.0).sub(cav.sub(0.6).max(0.0).mul(0.35)), 0.55, 1.0);
  }

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
