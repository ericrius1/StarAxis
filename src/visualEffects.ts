import {
  RenderPipeline,
  UnsignedByteType,
  type DirectionalLight,
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
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { Pane } from 'tweakpane';

type QualityProfile = 'efficient' | 'balanced' | 'cinematic';

export interface VisualEffectsSettings {
  enabled: boolean;
  quality: QualityProfile;
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
  exposure: number;
}

export interface VisualEffects {
  render(): void;
  toggle(): void;
  snapshot(): VisualEffectsSettings & {
    active: boolean;
    pipeline: boolean;
    shortcut: 'L';
  };
}

interface CreateVisualEffectsOptions {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  sunLight: DirectionalLight;
  constrainedDevice?: boolean;
  highQualityRequested?: boolean;
}

const QUALITY: Record<QualityProfile, { slices: number; steps: number }> = {
  efficient: { slices: 1, steps: 8 },
  balanced: { slices: 1, steps: 12 },
  cinematic: { slices: 3, steps: 16 },
};

/**
 * WebGPU-only screen-space lighting and finishing pipeline.
 *
 * The normal and diffuse MRT attachments use 8-bit storage to keep bandwidth
 * down. SSGI runs only while GI or AO is effectively enabled; with the master
 * switch off (or every post effect disabled), frames use the renderer's direct
 * path and avoid the off-screen pass entirely.
 */
export function createVisualEffects({
  renderer,
  scene,
  camera,
  sunLight,
  constrainedDevice = false,
  highQualityRequested = false,
}: CreateVisualEffectsOptions): VisualEffects {
  const settings: VisualEffectsSettings = {
    // Keep the normal experience on the direct, baked-material path. The
    // screen-space GI stack is still available in Light Lab (or through
    // ?quality=high), but making it opt-in holds the demanding aperture view
    // at 60 fps instead of spending every frame on hidden off-screen passes.
    enabled: highQualityRequested,
    quality: highQualityRequested ? 'cinematic' : constrainedDevice ? 'efficient' : 'balanced',
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
    exposure: 1,
  };

  const renderPipeline = new RenderPipeline(renderer);
  // TRAA supplies temporal filtering for SSGI. Keep this off-screen pass at
  // one sample while the direct renderer retains its 4x MSAA path.
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

  // Compact MRT formats save substantial memory traffic at full viewport size.
  scenePass.getTexture('diffuseColor').type = UnsignedByteType;
  scenePass.getTexture('normal').type = UnsignedByteType;

  const sceneNormal = sample((sampleUv: any) =>
    unpackRGBToNormal(sceneNormalTexture.sample(sampleUv)),
  );
  const indirect = ssgi(sceneColor, sceneDepth, sceneNormal, camera);
  indirect.useTemporalFiltering = true;
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
  stabilizedLighting.useSubpixelCorrection = false;

  const bloomStrength = uniform(settings.bloomStrength);
  const bloomRadius = uniform(0.42);
  const bloomThreshold = uniform(0.92);
  const vibranceAmount = uniform(settings.vibrance);
  const vignetteAmount = uniform(settings.vignette);

  const finish = (colorNode: any) => {
    const distanceFromCenter = uv().sub(0.5).length();
    const edge = smoothstep(0.28, 0.74, distanceFromCenter);
    const falloff = float(1).sub(edge.mul(vignetteAmount));
    return vec4(vibrance(colorNode.rgb, vibranceAmount).mul(falloff), colorNode.a);
  };

  const buildPostVariants = (source: any) => {
    const bloomPass = bloom(source, bloomStrength, bloomRadius, bloomThreshold);
    const withBloom = source.add(bloomPass);
    return {
      plain: source,
      bloom: withBloom,
      finish: finish(source),
      bloomAndFinish: finish(withBloom),
    };
  };

  const directPost = buildPostVariants(sceneColor);
  const indirectPost = buildPostVariants(stabilizedLighting);
  let pipelineActive = true;

  const pane = new Pane({
    title: 'LIGHT LAB  ·  L',
    expanded: false,
  });
  pane.element.classList.add('effects-pane');
  pane.element.setAttribute('aria-label', 'Lighting and post-processing controls');

  // Master switch for the expensive SSGI / finish stack. The stack stays off
  // until the lab is opened, L is pressed, or any control is edited.
  pane.addBinding(settings, 'enabled', {
    label: 'Enhanced light',
  });
  const lightingFolder = pane.addFolder({ title: 'LIGHTING' });
  lightingFolder.addBinding(settings, 'quality', {
    label: 'Quality',
    options: {
      Efficient: 'efficient',
      Balanced: 'balanced',
      Cinematic: 'cinematic',
    },
  });
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

  const finishFolder = pane.addFolder({ title: 'POST-PROCESSING' });
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
  finishFolder.addBinding(settings, 'exposure', {
    label: 'Exposure',
    min: 0.55,
    max: 1.65,
    step: 0.01,
  });

  const resetButton = pane.addButton({ title: 'Restore cinematic defaults' });

  const applyQuality = () => {
    const quality = QUALITY[settings.quality];
    indirect.sliceCount.value = quality.slices;
    indirect.stepCount.value = quality.steps;
  };

  const apply = (refreshPane = false) => {
    applyQuality();
    indirect.giIntensity.value = settings.giIntensity;
    indirect.aoIntensity.value = settings.aoIntensity;
    indirect.radius.value = settings.radius;
    giMix.value = settings.globalIllumination ? 1 : 0;
    aoMix.value = settings.ambientOcclusion ? 1 : 0;
    bloomStrength.value = settings.bloomStrength;
    vibranceAmount.value = settings.vibrance;
    vignetteAmount.value = settings.vignette;
    renderer.toneMappingExposure = settings.enabled ? settings.exposure : 1;

    const lightingActive =
      settings.enabled &&
      (settings.globalIllumination || settings.ambientOcclusion);
    const postActive = settings.enabled && settings.postProcessing;
    const bloomActive = postActive && settings.bloom;
    const finishActive = postActive && settings.colorFinish;
    const variants = lightingActive ? indirectPost : directPost;

    const nextOutput =
      bloomActive && finishActive
        ? variants.bloomAndFinish
        : bloomActive
          ? variants.bloom
          : finishActive
            ? variants.finish
            : variants.plain;
    if (renderPipeline.outputNode !== nextOutput) {
      renderPipeline.outputNode = nextOutput;
      renderPipeline.needsUpdate = true;
    }
    pipelineActive = lightingActive || bloomActive || finishActive;

    renderer.shadowMap.enabled = settings.enabled && settings.sunShadows;
    sunLight.castShadow = renderer.shadowMap.enabled;
    if (renderer.shadowMap.enabled) sunLight.shadow.needsUpdate = true;

    pane.element.dataset.active = String(settings.enabled);
    if (refreshPane) pane.refresh();
  };

  const enableStack = () => {
    if (settings.enabled) return false;
    settings.enabled = true;
    return true;
  };

  pane.on('change', (ev) => {
    // Editing any control while the stack is cold turns it on so sliders and
    // checkboxes always feel live. Compare by binding key — pane-level change
    // events wrap a fresh API instance, so object identity is unreliable.
    const key = 'key' in ev.target ? String(ev.target.key) : '';
    if (key !== 'enabled') enableStack();
    apply(true);
  });
  // Expanding the lab means the visitor wants to edit; unlock the stack.
  pane.on('fold', (ev) => {
    if (!ev.expanded || !enableStack()) return;
    apply(true);
  });
  resetButton.on('click', () => {
    Object.assign(settings, {
      enabled: true,
      quality: highQualityRequested
        ? 'cinematic'
        : constrainedDevice
          ? 'efficient'
          : 'balanced',
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
      exposure: 1,
    } satisfies VisualEffectsSettings);
    pane.expanded = true;
    apply(true);
  });

  const toggle = () => {
    settings.enabled = !settings.enabled;
    // L is advertised as "light lab": show the panel when enabling, hide it
    // when disabling so the shortcut and the UI stay in sync.
    pane.expanded = settings.enabled;
    apply(true);
  };

  const render = () => {
    if (pipelineActive) renderPipeline.render();
    else renderer.render(scene, camera);
  };

  const snapshot = () => ({
    ...settings,
    active: settings.enabled,
    pipeline: pipelineActive,
    shortcut: 'L' as const,
  });

  apply(true);

  return { render, toggle, snapshot };
}
