import fs from "node:fs";

const specPath = new URL("./sculpt-spec.json", import.meta.url);
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const baseComponent = spec.componentTree[0];
const baseMaterial = spec.materials[0];

const colorRecipes = {
  "pyramid-stone": {
    dominantAlbedo: "rgba(157, 125, 108, 1.0)",
    secondaryAlbedo: "rgba(111, 87, 78, 1.0)",
    materialClass: "stone",
    materialClassConfidence: 0.92,
  },
  "shadow-stone": {
    dominantAlbedo: "rgba(69, 63, 65, 1.0)",
    secondaryAlbedo: "rgba(99, 82, 76, 1.0)",
    materialClass: "stone",
    materialClassConfidence: 0.86,
  },
  stainless: {
    dominantAlbedo: "rgba(155, 160, 164, 1.0)",
    secondaryAlbedo: "rgba(92, 99, 105, 1.0)",
    materialClass: "metal",
    materialClassConfidence: 0.94,
  },
  "chamber-dark": {
    dominantAlbedo: "rgba(28, 24, 22, 1.0)",
    secondaryAlbedo: "rgba(48, 39, 34, 1.0)",
    materialClass: "stone",
    materialClassConfidence: 0.82,
  },
};

function attachment(parentId, start = [0, 0, 0], end = [0, 1, 0]) {
  return {
    parentId,
    parentSocket: `${parentId}-surface`,
    localStart: start,
    localEnd: end,
    contactNormal: [0, 0, 1],
    contactType: "embedded",
    embedDepth: 0.08,
    overlap: 0.04,
    gapTolerance: 0.01,
    evidenceRefs: ["full-object"],
  };
}

function component({
  id,
  name,
  level,
  parent = "site-root",
  primitive = "box",
  topologyClass = "assembled-solid",
  topologyRationale,
  material = "pyramid-stone",
  dimensions = { width: 1, height: 1, depth: 1 },
  localFeatures = [],
  role = "surface",
  attachmentData = null,
}) {
  const c = structuredClone(baseComponent);
  c.id = id;
  c.name = name;
  c.level = level;
  c.parent = parent;
  c.primitive = primitive;
  c.topologyClass = topologyClass;
  c.topologyRationale = topologyRationale;
  c.material = material;
  c.materialLayers = [material];
  c.dimensions = { ...dimensions, units: "meters", confidence: 0.76 };
  c.localFeatures = localFeatures.map((featureId) => ({
    id: featureId,
    type: "reference-observed",
    evidenceRefs: ["full-object"],
  }));
  c.role = role;
  c.attachment = parent ? (attachmentData ?? null) : null;
  c.actionProfile.animationRole = parent ? "static" : "root";
  c.actionProfile.collider.type = id === "hour-chamber" ? "compound" : "box";
  c.actionProfile.destruction.debrisMaterial = material;
  c.surfaceDetail = {
    macroRoughness: material.includes("stone") ? 0.18 : 0.04,
    microRoughness: material.includes("stone") ? 0.11 : 0.03,
    bumpAmplitude: material.includes("stone") ? 0.035 : 0.006,
    normalPattern: material.includes("stone") ? "irregular granite grain" : "fine brushed response",
    displacementPattern: "",
    occlusionPattern: "contact and cavity darkening",
    edgeWearPattern: "subtle exposed-edge lightening",
    notes: "Observed surface response is explicit but kept GPU-cheap for the 60fps target.",
  };
  c.colorMaterialRecipe = structuredClone(colorRecipes[material]);
  return c;
}

spec.suitability = "pass";
spec.silhouette = {
  boundingShape: "tall truncated trapezoidal pylon with a narrow flat summit",
  aspectRatios: ["height:base-width approximately 1.45:1", "top-width:base-width approximately 0.18:1"],
  symmetry: "near bilateral symmetry about the south-north axis with an edge stair on the photographed left slope",
  dominantCurves: ["circular oculus rim contrasts with planar tapered stone faces"],
  negativeSpaces: ["grade-to-midheight triangular entry", "upper rectangular sight box", "circular sky aperture"],
  landmarks: ["flat summit cap", "paired summit rods", "protruding steel oculus", "left sloping edge stair"],
};
spec.qualityTargets.reviewViewpoints = [
  "front-three-quarter exterior",
  "south-entry walk-up",
  "aperture close-up from visitor eye height",
  "interior through-passage toward north daylight",
];
spec.featureReviewTargets = [
  {
    id: "truncated-pylon-silhouette",
    name: "Truncated pylon silhouette and flat summit",
    tier: "critical",
    passIds: ["blockout"],
    minimumScore: 0.8,
    mustPass: true,
    componentRefs: ["pyramid-shell"],
    evidenceRefs: ["full-object"],
  },
  {
    id: "dual-sighting-openings",
    name: "Rectangular sight box and shallow circular oculus",
    tier: "critical",
    passIds: ["structural-pass", "form-refinement"],
    minimumScore: 0.8,
    mustPass: true,
    componentRefs: ["upper-sight-box", "solar-oculus", "star-tunnel"],
    evidenceRefs: ["full-object"],
  },
  {
    id: "hour-chamber-entry",
    name: "Triangular entry and complete through-passage",
    tier: "critical",
    passIds: ["structural-pass", "interaction-pass"],
    minimumScore: 0.8,
    mustPass: true,
    componentRefs: ["south-entrance", "hour-chamber"],
    evidenceRefs: ["full-object"],
  },
  {
    id: "granite-cladding-system",
    name: "Irregular coursed granite cladding",
    tier: "important",
    passIds: ["material-pass", "surface-pass"],
    minimumScore: 0.72,
    mustPass: true,
    componentRefs: ["stone-cladding", "west-shell"],
    evidenceRefs: ["full-object"],
  },
  {
    id: "edge-stair-and-summit",
    name: "Left edge stair and paired summit rods",
    tier: "important",
    passIds: ["form-refinement"],
    minimumScore: 0.72,
    mustPass: true,
    componentRefs: ["edge-stair", "summit-rods"],
    evidenceRefs: ["full-object"],
  },
];

spec.componentTree = [
  component({
    id: "site-root",
    name: "Star Axis site assembly",
    level: "macro",
    parent: null,
    primitive: "box",
    topologyRationale: "Stable scene root groups the observatory and walkable visitor spaces.",
    dimensions: { width: 24, height: 18, depth: 24 },
  }),
  component({
    id: "pyramid-shell",
    name: "Truncated solar pylon shell",
    level: "macro",
    primitive: "extrude",
    topologyClass: "conforming-shell",
    topologyRationale: "Four planar tapered faces terminate at a visibly flat cap rather than an apex.",
    dimensions: { width: 23, height: 16.8, depth: 19 },
    localFeatures: ["truncated-cap"],
  }),
  component({
    id: "star-tunnel",
    name: "Star Tunnel sightline assembly",
    level: "macro",
    primitive: "extrude",
    topologyClass: "assembled-solid",
    topologyRationale: "Walkable stair, trench walls, headwall, and steel sight tube form one aligned visitor route.",
    dimensions: { width: 8, height: 12, depth: 44 },
    material: "shadow-stone",
  }),
  component({
    id: "hour-chamber",
    name: "Complete Hour Chamber through-passage",
    level: "meso",
    primitive: "extrude",
    topologyClass: "conforming-shell",
    topologyRationale: "Floor, walls, and ceiling form a continuous south-to-north chamber around the triangular void.",
    dimensions: { width: 4.8, height: 9.6, depth: 18 },
    material: "chamber-dark",
  }),
  component({
    id: "south-entrance",
    name: "South triangular entrance",
    level: "meso",
    primitive: "extrude",
    topologyClass: "conforming-shell",
    topologyRationale: "A tall narrow triangular opening is cut from grade through the south face.",
    dimensions: { width: 3.2, height: 9.4, depth: 0.8 },
    material: "chamber-dark",
    localFeatures: ["hour-slot", "entry-reveals"],
  }),
  component({
    id: "upper-sight-box",
    name: "Upper rectangular sight box",
    level: "meso",
    primitive: "box",
    topologyRationale: "A deep rectangular recess interrupts the upper front face below the cap.",
    dimensions: { width: 3.8, height: 2.7, depth: 1.2 },
    material: "chamber-dark",
    localFeatures: ["rectangular-opening", "sight-box-reveal"],
  }),
  component({
    id: "solar-oculus",
    name: "Protruding circular solar oculus",
    level: "meso",
    parent: "upper-sight-box",
    primitive: "tube",
    topologyClass: "assembled-solid",
    topologyRationale: "A separately built short metal tube protrudes from the lower half of the rectangular recess.",
    dimensions: { radius: 0.68, length: 0.8 },
    material: "stainless",
    localFeatures: ["protruding-tube", "brushed-lip"],
    attachmentData: attachment("upper-sight-box", [0, -0.35, -0.5], [0, -0.35, 0.3]),
  }),
  component({
    id: "summit-rods",
    name: "Paired summit alignment rods",
    level: "meso",
    parent: "pyramid-shell",
    primitive: "instanced-cluster",
    topologyRationale: "Two thin repeated metal rods rise independently from the photographed summit.",
    dimensions: { radius: 0.04, height: 0.9, depth: 0.04 },
    material: "stainless",
    localFeatures: ["paired-rods"],
  }),
  component({
    id: "stone-cladding",
    name: "Irregular granite slab cladding",
    level: "meso",
    parent: "pyramid-shell",
    primitive: "instanced-cluster",
    topologyClass: "surface-relief",
    topologyRationale: "Shallow slab modules and joint grooves add photograph-visible masonry relief without duplicating the structural shell.",
    dimensions: { width: 23, height: 16.8, depth: 0.08 },
    localFeatures: ["irregular-slab-joints", "horizontal-courses"],
  }),
  component({
    id: "edge-stair",
    name: "Left sloping edge stair",
    level: "meso",
    parent: "pyramid-shell",
    primitive: "instanced-cluster",
    topologyRationale: "Repeated treads climb the photographed left exterior edge and break the side silhouette.",
    dimensions: { width: 0.75, height: 16.8, depth: 0.55 },
    localFeatures: ["repeated-treads"],
  }),
  component({
    id: "west-shell",
    name: "Cool shadowed west face",
    level: "meso",
    parent: "pyramid-shell",
    primitive: "extrude",
    topologyClass: "conforming-shell",
    topologyRationale: "The photographed side is a broad planar tapered face with a cooler, darker stone response.",
    dimensions: { width: 19, height: 16.8, depth: 0.4 },
    material: "shadow-stone",
  }),
  component({
    id: "north-shell",
    name: "North tapered shell and exit",
    level: "meso",
    parent: "pyramid-shell",
    primitive: "extrude",
    topologyClass: "conforming-shell",
    topologyRationale: "The inferred rear shell completes the pylon while preserving an aligned daylight exit.",
    dimensions: { width: 23, height: 16.8, depth: 0.4 },
  }),
];

function material(id, name, color, secondary, qualityTier = "utility") {
  const m = structuredClone(baseMaterial);
  m.id = id;
  m.name = name;
  m.baseColor = color;
  m.color = color;
  m.qualityTier = qualityTier;
  m.albedo.dominant = color;
  m.albedo.secondary = [secondary, color];
  m.colorVariation.palette = [color, secondary, "#C2A99A"];
  m.roughness = {
    base: id === "stainless" ? 0.34 : 0.78,
    variation: id === "stainless" ? 0.08 : 0.16,
    map: `${id}-independent-roughness`,
    localResponse: "cavities stay rougher; exposed edges catch broader highlights",
  };
  m.normal = {
    pattern: id === "stainless" ? "fine-brushed-rings" : "granite-grain-independent-height",
    strength: id === "stainless" ? 0.12 : 0.34,
    scale: id === "stainless" ? 80 : 22,
    space: "tangent",
  };
  m.ambientOcclusion = {
    cavityStrength: id === "stainless" ? 0.12 : 0.38,
    contactShadowBias: 0.4,
    notes: "Independent contact and seam occlusion; never reused from albedo.",
  };
  m.localOverrides = id === "pyramid-stone" ? [
    { id: "cool-shadow-face", region: "west-facing shell", color: "#4F4748", roughness: 0.82 },
    { id: "cavity-seams", region: "slab joints", color: "#352A28", roughness: 0.91 },
    { id: "weathering", region: "lower courses and vertical runoff", color: "#765A50", roughness: 0.86 },
  ] : [
    { id: `${id}-contact-zone`, region: "contacts and recesses", color: secondary, roughness: 0.82 },
  ];
  return m;
}

const pyramidStone = material("pyramid-stone", "Warm irregular granite", "#9D7D6C", "#6F574E", "reference-fidelity");
pyramidStone.referencePbr = {
  version: "1",
  sourceImage: spec.sourceImage,
  extractor: "extract_pbr_evidence.py",
  method: "single-image reference-pixel estimate",
  verdict: "pass",
  usable: true,
  confidence: 0.86,
  estimatedFidelity: 0.86,
  targetThreshold: 0.7,
  hardLimit: "Source contains sky; maps are evidence and palette guidance, not direct full-face textures.",
  maps: {
    albedo: { path: "/Users/eric/codeprojects/StarAxis/sculpt/reference-review/pbr/pyramid-stone_albedo.png", channel: "albedo" },
    roughness: { path: "/Users/eric/codeprojects/StarAxis/sculpt/reference-review/pbr/pyramid-stone_roughness.png", channel: "roughness" },
    height: { path: "/Users/eric/codeprojects/StarAxis/sculpt/reference-review/pbr/pyramid-stone_height.png", channel: "height" },
    normal: { path: "/Users/eric/codeprojects/StarAxis/sculpt/reference-review/pbr/pyramid-stone_normal.png", channel: "normal" },
    ao: { path: "/Users/eric/codeprojects/StarAxis/sculpt/reference-review/pbr/pyramid-stone_ao.png", channel: "ao" },
  },
};
spec.materials = [
  pyramidStone,
  material("shadow-stone", "Cool shadowed granite", "#454042", "#2F2B2D"),
  material("stainless", "Brushed stainless sight metal", "#9BA0A4", "#5C6369"),
  material("chamber-dark", "Dark interior masonry", "#1C1816", "#302722"),
];

spec.repetitionSystems = [
  {
    id: "edge-stair-treads",
    name: "Left edge stair treads",
    componentRef: "edge-stair",
    primitive: "box",
    count: 54,
    distribution: "linear along the left sloped exterior edge",
    variation: "fixed tread rhythm with a narrow landing near the summit",
    evidenceRefs: ["full-object"],
  },
  {
    id: "irregular-slab-courses",
    name: "Irregular granite slab courses",
    componentRef: "stone-cladding",
    primitive: "instanced-cluster",
    count: 96,
    distribution: "staggered horizontal courses clipped to the tapered front and side faces",
    variation: "deterministic width, height, inset, and warm/cool value changes",
    evidenceRefs: ["full-object"],
  },
];

spec.preSpecAssessment.unknownsToResolveBeforeImplementation = [];
for (const detail of spec.preSpecAssessment.detailInventory.details) {
  const ref = detail.mapsTo?.ref;
  if (typeof ref === "string") {
    detail.mapsTo.ref = ref.replace(".", "/");
  }
}
spec.assumptions = [
  "Rear-face geometry is inferred as a matching tapered shell so the established south-to-north visitor passage remains complete.",
  "Existing site scale is retained while photograph-visible ratios control the new silhouette.",
  "The oculus close-up is used for shallow-bore framing and metal response, while the exterior photo controls placement and outer scale.",
];
spec.viewEvidence[0].observations = [
  "The body terminates at a narrow flat summit rather than an apex.",
  "A deep rectangular opening contains a short protruding circular metal sight tube.",
  "The triangular entrance begins at grade and extends to around mid-height.",
  "Irregular coursed granite slabs and a left edge stair create the dominant surface and silhouette detail.",
];
spec.viewEvidence[0].confidence = 0.86;
spec.lightingFromPhoto = [
  "Warm high key light from camera-right reveals the sunlit front stone and casts a cool west-face shadow.",
  "Soft blue-sky fill preserves readable side-face values without flattening the deep entry and sight-box cavities.",
  "Low neutral environment rim separates the truncated cap and summit rods from the blue sky.",
  "ACES filmic tone mapping with controlled exposure preserves stone highlights and deep cavity blacks.",
  "Contact shadows and ambient occlusion anchor slab seams, oculus attachment, stairs, and the grade line.",
];

for (const pass of spec.buildPasses) {
  pass.componentRefs = spec.componentTree.map((c) => c.id);
}

fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
