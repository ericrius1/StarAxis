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

export interface VisualEffectsSettings {
  mode: RenderMode;
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
  hemisphereLight: HemisphereLight;
  traceRoots: Object3D[];
  highQualityRequested?: boolean;
}

const CINEMATIC_SSGI = {
  slices: 4,
  steps: 24,
};

const CINEMATIC_DEFAULTS = {
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
  exposure: 1,
} as const;

/**
 * Three deliberately separate WebGPU render paths:
 *
 * - Performance: the original low-DPR direct raster path for walking.
 * - Cinematic: full device DPR, HDR MRTs, high-sample SSGI, temporal AA,
 *   bloom, color finishing, vignette, and contrast-adaptive sharpening.
 * - Path Traced: an explicitly requested, lazy-built progressive WebGPU BVH
 *   path tracer intended for stills and locked-off capture.
 */
export function createVisualEffects({
  renderer,
  scene,
  camera,
  sunLight,
  hemisphereLight,
  traceRoots,
  highQualityRequested = false,
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
  indirect.sliceCount.value = CINEMATIC_SSGI.slices;
  indirect.stepCount.value = CINEMATIC_SSGI.steps;
  indirect.thickness.value = 1.35;

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
    title: 'RENDER LAB  ·  N / P',
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

  const currentPixelRatio = () =>
    settings.mode === 'performance'
      ? Math.min(window.devicePixelRatio, 0.5)
      : window.devicePixelRatio;

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
          hemisphereLight,
        });
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

  const render = () => {
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
    applyResolution(width, height);
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
    snapshot,
  };
}
