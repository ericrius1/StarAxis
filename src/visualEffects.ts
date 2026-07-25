import {
  HalfFloatType,
  RenderPipeline,
  type DirectionalLight,
  type HemisphereLight,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  diffuseColor,
  float,
  mix,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  pass,
  sample,
  smoothstep,
  uniform,
  unpackRGBToNormal,
  uv,
  vec4,
  velocity,
  vibrance,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { Pane } from 'tweakpane';
import type { PathTracer } from './pathTracer';

export type RenderMode = 'performance' | 'cinematic' | 'path-traced';

export type GiQuality = 'low' | 'medium' | 'high';

export interface VisualEffectsSettings {
  mode: RenderMode;
  adaptiveResolution: boolean;
  resolutionScale: number;
  giQuality: GiQuality;
  globalIllumination: boolean;
  ambientOcclusion: boolean;
  sunShadows: boolean;
  giIntensity: number;
  aoIntensity: number;
  radius: number;
  postProcessing: boolean;
  bloom: boolean;
  bloomStrength: number;
  colorFinish: boolean;
  vibrance: number;
  vignette: number;
  sharpening: boolean;
  detail: number;
  exposure: number;
  pathBounces: number;
  pathSamplesPerFrame: number;
  pathStatus: string;
}

export interface VisualEffects {
  render(): void;
  resize(width: number, height: number): void;
  toggleCinematic(): void;
  togglePathTracing(): void;
  togglePane(): void;
  setMode(mode: RenderMode): void;
  getMode(): RenderMode;
  /**
   * Enter path tracing and resolve once the BVH and compute pipeline exist.
   * Offline capture needs a hard "ready" signal; the interactive path only
   * has a status string that updates whenever the animation loop happens to
   * run, which is not something a headless frame stepper can wait on.
   */
  preparePathTracing(): Promise<boolean>;
  /** Accumulate `samples` fresh path-traced samples and present the result. */
  renderPathTracedFrame(samples: number, bounces: number): void;
  /**
   * Long-exposure star trails for the traced path, in radians of celestial
   * rotation. The raster path draws trails as baked arc geometry, which the
   * tracer never sees — it integrates them out of the sky instead.
   */
  setStarTrail(arc: number): void;
  /** Absolute sky rotation about the Polaris axis, radians. */
  setCelestialRotation(radians: number): void;
  snapshot(): VisualEffectsSettings & {
    active: boolean;
    pipeline: boolean;
    pixelRatio: number;
    pathSamples: number;
    shortcut: 'N / P';
  };
}

interface CreateVisualEffectsOptions {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  sunLight: DirectionalLight;
  moonLight: DirectionalLight;
  hemisphereLight: HemisphereLight;
  traceRoots: Object3D[];
  highQualityRequested?: boolean;
  /**
   * Pin Cinematic to its most expensive settings: full device DPR, no adaptive
   * resolution, densest SSGI. For offline stills, not for walking around.
   */
  maxQuality?: boolean;
}

/**
 * SSGI costs `slices * steps * 2` samples per pixel and is by a wide margin the
 * most expensive thing in Cinematic. Three's own guidance for temporally
 * filtered SSGI puts "high" at 3 slices / 16 steps, so the former 4 / 24 was
 * paying double the top preset. AO and GI are both low-frequency signals, so
 * the pass also runs in a fraction-resolution target and is bilinearly
 * upsampled by the composite — a further saving TRAA and the sharpen pass hide.
 */
const SSGI_QUALITY: Record<
  GiQuality,
  { slices: number; steps: number; scale: number }
> = {
  low: { slices: 1, steps: 10, scale: 0.5 },
  medium: { slices: 2, steps: 12, scale: 0.5 },
  high: { slices: 3, steps: 16, scale: 0.75 },
};

/**
 * Cinematic rendered at the device's full DPR unconditionally, which on a
 * Retina panel is four times the pixels of a 1x buffer pushed through the most
 * expensive shading path in the app — and 22 fps on the machine this was
 * measured on. It now renders at a rung of this ladder, clamped to the device
 * DPR and moved at runtime to hold the frame budget: a GPU with the headroom
 * still climbs all the way to native, one without it degrades gracefully
 * instead of stuttering. Even the floor rung is above Performance's 0.5 and
 * keeps everything Performance does not have: GI, AO, sun shadows, TRAA, bloom
 * and the finishing chain.
 */
const RESOLUTION_LADDER = [0.6, 0.75, 0.9, 1.05, 1.25, 1.5, 1.75, 2];

/**
 * Where Cinematic starts before the adaptive controller has an opinion. A
 * middle rung: high enough to read as the quality mode from the first frame,
 * low enough that a modest GPU is not stuttering while the controller walks
 * down to what it can hold.
 */
export const CINEMATIC_RESOLUTION_SCALE = 1.5;

const ADAPTIVE = {
  /** Frames averaged per decision. */
  window: 32,
  /** Average frame time that means 60 fps is being missed. */
  slowMs: 20.5,
  /** Average frame time that means there is headroom to spend. */
  fastMs: 17.6,
  /** Shader compiles, GC pauses and tab wake-ups are not a resolution problem. */
  outlierMs: 120,
  /** Wall clock enforced between two resolution changes. */
  cooldownMs: 1500,
  /** Comfortable windows required before probing one rung up. */
  probeWindows: 6,
  /** Ceiling for the probe interval once rungs start failing. */
  maxProbeWindows: 48,
};

const CINEMATIC_DEFAULTS = {
  adaptiveResolution: true,
  resolutionScale: CINEMATIC_RESOLUTION_SCALE,
  giQuality: 'medium' as GiQuality,
  globalIllumination: true,
  ambientOcclusion: true,
  sunShadows: true,
  giIntensity: 6,
  aoIntensity: 1.15,
  radius: 10,
  postProcessing: true,
  bloom: true,
  bloomStrength: 0.14,
  colorFinish: true,
  vibrance: 0.08,
  vignette: 0.16,
  sharpening: true,
  detail: 0.62,
  exposure: 1.65,
} as const;

/**
 * Three deliberately separate WebGPU render paths:
 *
 * - Performance: the original low-DPR direct raster path for walking.
 * - Cinematic: adaptive resolution above Performance's, HDR MRTs, SSGI in a
 *   reduced-resolution target, temporal AA, bloom, color finishing, vignette,
 *   and contrast-adaptive sharpening.
 * - Path Traced: an explicitly requested, lazy-built progressive WebGPU BVH
 *   path tracer intended for stills and locked-off capture.
 */
export function createVisualEffects({
  renderer,
  scene,
  camera,
  sunLight,
  moonLight,
  hemisphereLight,
  traceRoots,
  highQualityRequested = true,
  maxQuality = false,
}: CreateVisualEffectsOptions): VisualEffects {
  const initialMode: RenderMode = highQualityRequested
    ? 'cinematic'
    : 'performance';
  const settings: VisualEffectsSettings = {
    mode: initialMode,
    ...CINEMATIC_DEFAULTS,
    pathBounces: 3,
    pathSamplesPerFrame: 1,
    pathStatus: 'Ready on demand',
  };
  if (maxQuality) {
    settings.adaptiveResolution = false;
    settings.resolutionScale = window.devicePixelRatio;
    settings.giQuality = 'high';
  }

  const renderPipeline = new RenderPipeline(renderer);
  const scenePass = pass(scene, camera, { samples: 0 });
  scenePass.setMRT(
    mrt({
      output,
      diffuseColor,
      normal: packNormalToRGB(normalView),
      velocity,
    }),
  );

  const sceneColor = scenePass.getTextureNode('output');
  const sceneDiffuse = scenePass.getTextureNode('diffuseColor');
  const sceneNormalTexture = scenePass.getTextureNode('normal');
  const sceneDepth = scenePass.getTextureNode('depth');
  const sceneVelocity = scenePass.getTextureNode('velocity');

  // The off-screen pass exists only in Cinematic mode, so favor precision
  // over the 8-bit bandwidth-saving formats used by the former mixed mode.
  scenePass.getTexture('diffuseColor').type = HalfFloatType;
  scenePass.getTexture('normal').type = HalfFloatType;

  const sceneNormal = sample((sampleUv: any) =>
    unpackRGBToNormal(sceneNormalTexture.sample(sampleUv)),
  );
  const indirect = ssgi(sceneColor, sceneDepth, sceneNormal, camera);
  indirect.useTemporalFiltering = true;
  indirect.thickness.value = 1.35;

  // SSGINode re-sizes its target to the drawing buffer on every frame, so
  // scaling the size it asks for is the only way to run the effect below
  // native resolution. Its screen-space step radius is derived inside the same
  // call, so the pass stays self-consistent; the depth, normal and beauty
  // inputs it reads are sampled by UV and do not care about the mismatch.
  const sizableIndirect = indirect as unknown as {
    setSize(width: number, height: number): void;
  };
  const nativeSetSize = sizableIndirect.setSize.bind(sizableIndirect);
  let ssgiScale = SSGI_QUALITY[settings.giQuality].scale;
  sizableIndirect.setSize = (width: number, height: number) => {
    nativeSetSize(
      Math.max(1, Math.round(width * ssgiScale)),
      Math.max(1, Math.round(height * ssgiScale)),
    );
  };

  const giMix = uniform(1);
  const aoMix = uniform(1);
  const ao = indirect.getAONode();
  const bouncedLight = indirect.getGINode();
  const occlusion = mix(float(1), ao.r, aoMix);
  const indirectComposite = vec4(
    sceneColor.rgb
      .mul(occlusion)
      .add(sceneDiffuse.rgb.mul(bouncedLight.rgb).mul(giMix)),
    sceneColor.a,
  );
  const stabilizedLighting = traa(
    indirectComposite,
    sceneDepth,
    sceneVelocity,
    camera,
  );
  stabilizedLighting.useSubpixelCorrection = true;

  const bloomStrength = uniform(settings.bloomStrength);
  const bloomRadius = uniform(0.42);
  const bloomThreshold = uniform(0.92);
  const vibranceAmount = uniform(settings.vibrance);
  const vignetteAmount = uniform(settings.vignette);
  // SharpenNode uses 0 as strongest and 2 as disabled. Expose an intuitive
  // 0..1 "Detail" control and invert it here.
  const sharpenAmount = uniform(2 - settings.detail * 2);

  const finish = (colorNode: any) => {
    const distanceFromCenter = uv().sub(0.5).length();
    const edge = smoothstep(0.28, 0.74, distanceFromCenter);
    const falloff = float(1).sub(edge.mul(vignetteAmount));
    return vec4(vibrance(colorNode.rgb, vibranceAmount).mul(falloff), colorNode.a);
  };

  const buildPostVariants = (source: any) => {
    const bloomPass = bloom(source, bloomStrength, bloomRadius, bloomThreshold);
    const withBloom = source.add(bloomPass);
    const base = {
      plain: source,
      bloom: withBloom,
      finish: finish(source),
      bloomAndFinish: finish(withBloom),
    };
    return {
      base,
      sharp: {
        plain: sharpen(base.plain, sharpenAmount, true),
        bloom: sharpen(base.bloom, sharpenAmount, true),
        finish: sharpen(base.finish, sharpenAmount, true),
        bloomAndFinish: sharpen(base.bloomAndFinish, sharpenAmount, true),
      },
    };
  };

  const directPost = buildPostVariants(sceneColor);
  const indirectPost = buildPostVariants(stabilizedLighting);
  let pipelineActive = false;
  let previousRasterMode: Exclude<RenderMode, 'path-traced'> = initialMode;
  let pathTracer: PathTracer | null = null;
  let pathTracerPromise: Promise<void> | null = null;
  let lastReportedSamples = -1;

  const pane = new Pane({
    title: 'RENDER LAB',
    expanded: false,
  });
  pane.element.classList.add('effects-pane');
  pane.element.setAttribute(
    'aria-label',
    'Render mode, lighting, post-processing, and path tracing controls',
  );

  pane.addBinding(settings, 'mode', {
    label: 'Render mode',
    options: {
      Performance: 'performance',
      Cinematic: 'cinematic',
      'Path traced': 'path-traced',
    },
  });
  const pathStatusBinding = pane.addBinding(settings, 'pathStatus', {
    label: 'Tracer',
    readonly: true,
  });

  const budgetFolder = pane.addFolder({ title: 'CINEMATIC BUDGET' });
  budgetFolder.addBinding(settings, 'adaptiveResolution', {
    label: 'Adaptive res',
  });
  const resolutionBinding = budgetFolder.addBinding(settings, 'resolutionScale', {
    label: 'Resolution',
    min: 0.6,
    max: 2,
    step: 0.05,
  });
  budgetFolder.addBinding(settings, 'giQuality', {
    label: 'GI quality',
    options: {
      Low: 'low',
      Medium: 'medium',
      High: 'high',
    },
  });

  const lightingFolder = pane.addFolder({ title: 'CINEMATIC LIGHTING' });
  lightingFolder.addBinding(settings, 'globalIllumination', {
    label: 'Global illumination',
  });
  lightingFolder.addBinding(settings, 'ambientOcclusion', {
    label: 'Ambient occlusion',
  });
  lightingFolder.addBinding(settings, 'sunShadows', {
    label: 'Sun shadows',
  });
  lightingFolder.addBinding(settings, 'giIntensity', {
    label: 'GI strength',
    min: 0,
    max: 18,
    step: 0.1,
  });
  lightingFolder.addBinding(settings, 'aoIntensity', {
    label: 'AO strength',
    min: 0,
    max: 3,
    step: 0.05,
  });
  lightingFolder.addBinding(settings, 'radius', {
    label: 'Light radius',
    min: 1,
    max: 25,
    step: 0.5,
  });

  const finishFolder = pane.addFolder({ title: 'CINEMATIC FINISH' });
  finishFolder.addBinding(settings, 'postProcessing', {
    label: 'Post-processing',
  });
  finishFolder.addBinding(settings, 'bloom', {
    label: 'Sun bloom',
  });
  finishFolder.addBinding(settings, 'bloomStrength', {
    label: 'Bloom strength',
    min: 0,
    max: 0.8,
    step: 0.01,
  });
  finishFolder.addBinding(settings, 'colorFinish', {
    label: 'Color finish',
  });
  finishFolder.addBinding(settings, 'vibrance', {
    label: 'Vibrance',
    min: -0.2,
    max: 0.35,
    step: 0.01,
  });
  finishFolder.addBinding(settings, 'vignette', {
    label: 'Vignette',
    min: 0,
    max: 0.5,
    step: 0.01,
  });
  finishFolder.addBinding(settings, 'sharpening', {
    label: 'Adaptive sharpen',
  });
  finishFolder.addBinding(settings, 'detail', {
    label: 'Detail',
    min: 0,
    max: 1,
    step: 0.01,
  });
  finishFolder.addBinding(settings, 'exposure', {
    label: 'Exposure',
    min: 0.55,
    max: 1.65,
    step: 0.01,
  });

  const pathFolder = pane.addFolder({
    title: 'PATH TRACING  ·  P',
    expanded: false,
  });
  pathFolder.addBinding(settings, 'pathBounces', {
    label: 'Light bounces',
    min: 1,
    max: 5,
    step: 1,
  });
  pathFolder.addBinding(settings, 'pathSamplesPerFrame', {
    label: 'Samples / frame',
    min: 1,
    max: 4,
    step: 1,
  });
  const restartPathButton = pathFolder.addButton({
    title: 'Restart accumulation',
  });
  const resetButton = pane.addButton({
    title: 'Restore cinematic defaults',
  });

  const refreshModeChrome = () => {
    pane.element.dataset.active = String(settings.mode !== 'performance');
    pane.element.dataset.mode = settings.mode;
    pathStatusBinding.hidden =
      settings.mode !== 'path-traced' &&
      settings.pathStatus === 'Ready on demand';
    pathStatusBinding.refresh();
  };

  const currentPixelRatio = () => {
    if (settings.mode === 'performance') {
      return Math.min(window.devicePixelRatio, 0.5);
    }
    // Path tracing is an explicitly requested stills mode; it keeps the full
    // device DPR and pays for it in accumulation time rather than frame rate.
    if (settings.mode === 'path-traced') return window.devicePixelRatio;
    return Math.min(window.devicePixelRatio, settings.resolutionScale);
  };

  const applyResolution = (width = window.innerWidth, height = window.innerHeight) => {
    renderer.setPixelRatio(currentPixelRatio());
    renderer.setSize(width, height);
    pathTracer?.reset();
  };

  const chooseVariant = (
    variants: ReturnType<typeof buildPostVariants>,
    bloomEnabled: boolean,
    finishEnabled: boolean,
    sharpenEnabled: boolean,
  ) => {
    const selected = sharpenEnabled ? variants.sharp : variants.base;
    if (bloomEnabled && finishEnabled) return selected.bloomAndFinish;
    if (bloomEnabled) return selected.bloom;
    if (finishEnabled) return selected.finish;
    return selected.plain;
  };

  const apply = (refreshPane = false) => {
    const giQuality = SSGI_QUALITY[settings.giQuality];
    indirect.sliceCount.value = giQuality.slices;
    indirect.stepCount.value = giQuality.steps;
    ssgiScale = giQuality.scale;
    indirect.giIntensity.value = settings.giIntensity;
    indirect.aoIntensity.value = settings.aoIntensity;
    indirect.radius.value = settings.radius;
    giMix.value = settings.globalIllumination ? 1 : 0;
    aoMix.value = settings.ambientOcclusion ? 1 : 0;
    bloomStrength.value = settings.bloomStrength;
    vibranceAmount.value = settings.vibrance;
    vignetteAmount.value = settings.vignette;
    sharpenAmount.value = 2 - settings.detail * 2;
    renderer.toneMappingExposure =
      settings.mode === 'performance' ? 1 : settings.exposure;

    const cinematic = settings.mode === 'cinematic';
    const lightingActive =
      cinematic &&
      (settings.globalIllumination || settings.ambientOcclusion);
    const postActive = cinematic && settings.postProcessing;
    const bloomActive = postActive && settings.bloom;
    const finishActive = postActive && settings.colorFinish;
    const variants = lightingActive ? indirectPost : directPost;

    const sharpenActive = postActive && settings.sharpening;
    const nextOutput = chooseVariant(
      variants,
      bloomActive,
      finishActive,
      sharpenActive,
    );

    if (renderPipeline.outputNode !== nextOutput) {
      renderPipeline.outputNode = nextOutput;
      renderPipeline.needsUpdate = true;
    }
    pipelineActive =
      cinematic &&
      (lightingActive ||
        bloomActive ||
        finishActive ||
        sharpenActive);

    renderer.shadowMap.enabled =
      cinematic && settings.sunShadows;
    sunLight.castShadow = renderer.shadowMap.enabled;
    if (renderer.shadowMap.enabled) sunLight.shadow.needsUpdate = true;

    // The Resolution slider and the adaptive controller both land here, so
    // reconcile the backing buffer whenever the requested ratio has moved.
    if (renderer.getPixelRatio() !== currentPixelRatio()) applyResolution();

    refreshModeChrome();
    if (refreshPane) pane.refresh();
  };

  const reportPathStatus = (status: string) => {
    settings.pathStatus = status;
    pathStatusBinding.hidden = false;
    pathStatusBinding.refresh();
  };

  const ensurePathTracer = () => {
    if (pathTracer || pathTracerPromise) return;

    reportPathStatus('Loading WebGPU tracer…');
    pathTracerPromise = (async () => {
      try {
        const { createPathTracer } = await import('./pathTracer');
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        if (settings.mode !== 'path-traced') {
          reportPathStatus('Ready on demand');
          return;
        }

        reportPathStatus('Building scene BVH…');
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        pathTracer = createPathTracer({
          renderer,
          camera,
          roots: traceRoots,
          sunLight,
          moonLight,
          hemisphereLight,
        });
        pathTracer.setStarTrail(requestedStarTrail);
        pathTracer.setCelestialRotation(requestedCelestialRotation);
        lastReportedSamples = -1;
        reportPathStatus('Accumulating · 0 spp');
      } catch (error) {
        console.error('Unable to initialize the WebGPU path tracer.', error);
        reportPathStatus('Unavailable on this GPU');
        settings.mode = 'cinematic';
        previousRasterMode = 'cinematic';
        applyResolution();
        apply(true);
      } finally {
        pathTracerPromise = null;
      }
    })();
  };

  const setMode = (mode: RenderMode) => {
    if (mode !== 'path-traced') previousRasterMode = mode;
    settings.mode = mode;
    resetAdaptive();
    applyResolution();
    apply(true);
    if (mode === 'path-traced') ensurePathTracer();
  };

  const toggleCinematic = () => {
    if (settings.mode === 'path-traced') {
      setMode(previousRasterMode);
      return;
    }
    setMode(settings.mode === 'performance' ? 'cinematic' : 'performance');
  };

  const togglePathTracing = () => {
    if (settings.mode === 'path-traced') {
      setMode(previousRasterMode);
      return;
    }
    previousRasterMode = settings.mode;
    setMode('path-traced');
  };

  pane.on('change', (event) => {
    const key = 'key' in event.target ? String(event.target.key) : '';
    // Readonly bindings are monitors in Tweakpane. Refreshing one emits a
    // pane-level change event, so treating it like user input would recurse
    // through apply() -> refreshModeChrome() -> pathStatusBinding.refresh().
    if (key === 'pathStatus') return;

    if (key === 'mode') {
      setMode(settings.mode);
      return;
    }

    if (key === 'pathBounces') pathTracer?.reset();
    apply(true);
  });
  resetButton.on('click', () => {
    Object.assign(settings, CINEMATIC_DEFAULTS);
    setMode('cinematic');
    pane.expanded = true;
  });
  restartPathButton.on('click', () => {
    pathTracer?.reset();
    lastReportedSamples = -1;
    reportPathStatus(
      pathTracer ? 'Accumulating · 0 spp' : settings.pathStatus,
    );
  });

  // ------------------------------------------------------- adaptive resolution
  // Cinematic is fill-bound: SSGI, TRAA, bloom and the finishing chain all cost
  // in proportion to pixels. Rather than guess one ratio for every GPU this
  // walks the ladder to whatever the machine can actually hold at 60 fps.
  let frameStamp = 0;
  let windowFrames = 0;
  let windowMs = 0;
  let comfortableWindows = 0;
  let probeWindows = ADAPTIVE.probeWindows;
  let lastResolutionChange = 0;

  // Switching modes, resizing or resetting invalidates every frame time
  // measured so far — the first frames afterwards are pipeline rebuilds.
  function resetAdaptive(): void {
    frameStamp = 0;
    windowFrames = 0;
    windowMs = 0;
    comfortableWindows = 0;
    probeWindows = ADAPTIVE.probeWindows;
  }

  const nearestRung = (scale: number) => {
    let nearest = 0;
    for (let i = 1; i < RESOLUTION_LADDER.length; i++) {
      const closer =
        Math.abs(RESOLUTION_LADDER[i] - scale) <
        Math.abs(RESOLUTION_LADDER[nearest] - scale);
      if (closer) nearest = i;
    }
    return nearest;
  };

  const stepResolution = (direction: 1 | -1, now: number) => {
    const rung = nearestRung(settings.resolutionScale);
    const next = Math.min(
      RESOLUTION_LADDER.length - 1,
      Math.max(0, rung + direction),
    );
    const effective = (scale: number) =>
      Math.min(window.devicePixelRatio, scale);
    // On a 1x display the upper rungs all clamp to the same buffer, so a step
    // that changes nothing would still burn the cooldown and a reallocation.
    if (effective(RESOLUTION_LADDER[next]) === effective(settings.resolutionScale)) {
      return false;
    }
    settings.resolutionScale = RESOLUTION_LADDER[next];
    lastResolutionChange = now;
    applyResolution();
    resolutionBinding.refresh();
    return true;
  };

  const adaptResolution = (now: number) => {
    if (!settings.adaptiveResolution || settings.mode !== 'cinematic') {
      frameStamp = 0;
      return;
    }
    const previous = frameStamp;
    frameStamp = now;
    if (previous === 0) return;

    const elapsed = now - previous;
    if (elapsed > ADAPTIVE.outlierMs) return;
    windowMs += elapsed;
    windowFrames++;
    if (windowFrames < ADAPTIVE.window) return;

    const average = windowMs / windowFrames;
    windowFrames = 0;
    windowMs = 0;
    // Resizing costs a render-target reallocation and a TRAA history reset, so
    // never react to two windows in a row.
    if (now - lastResolutionChange < ADAPTIVE.cooldownMs) return;

    if (average > ADAPTIVE.slowMs) {
      comfortableWindows = 0;
      // Each rung that fails buys a longer stretch of calm before it is tried
      // again, so a scene the GPU cannot hold settles instead of oscillating.
      if (stepResolution(-1, now)) {
        probeWindows = Math.min(probeWindows * 2, ADAPTIVE.maxProbeWindows);
      }
      return;
    }

    if (average > ADAPTIVE.fastMs) {
      comfortableWindows = 0;
      return;
    }

    comfortableWindows++;
    if (comfortableWindows >= probeWindows) {
      comfortableWindows = 0;
      stepResolution(1, now);
    }
  };

  const render = () => {
    adaptResolution(performance.now());

    if (settings.mode === 'path-traced') {
      if (pathTracer) {
        pathTracer.render(
          settings.pathSamplesPerFrame,
          settings.pathBounces,
        );
        const samples = pathTracer.samples;
        if (
          samples !== lastReportedSamples &&
          (samples < 8 || samples % 8 === 0)
        ) {
          lastReportedSamples = samples;
          reportPathStatus(`Accumulating · ${samples} spp`);
        }
      } else {
        // Keep a clean full-resolution raster frame visible while the lazy BVH
        // and compute pipeline are being prepared.
        renderer.render(scene, camera);
      }
      return;
    }

    if (pipelineActive) renderPipeline.render();
    else renderer.render(scene, camera);
  };

  const resize = (width: number, height: number) => {
    resetAdaptive();
    applyResolution(width, height);
  };

  const preparePathTracing = async (): Promise<boolean> => {
    if (settings.mode !== 'path-traced') setMode('path-traced');
    ensurePathTracer();
    // ensurePathTracer() yields through requestAnimationFrame, which a hidden
    // or headless tab may serve slowly; keep waiting on its own promise rather
    // than polling a status string.
    while (pathTracerPromise) await pathTracerPromise;
    return pathTracer !== null;
  };

  let requestedStarTrail = 0;
  let requestedCelestialRotation = 0;

  const setStarTrail = (arc: number) => {
    requestedStarTrail = arc;
    pathTracer?.setStarTrail(arc);
  };

  const setCelestialRotation = (radians: number) => {
    requestedCelestialRotation = radians;
    pathTracer?.setCelestialRotation(radians);
  };

  const renderPathTracedFrame = (samples: number, bounces: number) => {
    if (!pathTracer) return;
    // syncSceneState() inside render() resets accumulation whenever the camera
    // or the lighting moved, which is every frame of a capture. Reset here too
    // so a frame that happens to reuse the previous state still starts clean.
    pathTracer.reset();
    pathTracer.render(samples, bounces);
    reportPathStatus(`Frame · ${pathTracer.samples} spp`);
  };

  const togglePane = () => {
    pane.expanded = !pane.expanded;
  };

  const snapshot = () => ({
    ...settings,
    active: settings.mode !== 'performance',
    pipeline: pipelineActive || settings.mode === 'path-traced',
    pixelRatio: renderer.getPixelRatio(),
    pathSamples: pathTracer?.samples ?? 0,
    shortcut: 'N / P' as const,
  });

  applyResolution();
  apply(true);

  return {
    render,
    resize,
    toggleCinematic,
    togglePathTracing,
    togglePane,
    setMode,
    getMode: () => settings.mode,
    preparePathTracing,
    renderPathTracedFrame,
    setStarTrail,
    setCelestialRotation,
    snapshot,
  };
}
