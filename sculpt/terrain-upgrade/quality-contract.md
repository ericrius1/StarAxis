# Terrain and horizon upgrade quality contract

## Suitability

Conditional, accepted as a view-prioritized real-time environment refinement.
The supplied image is a scene rather than a single isolated object, but it
clearly exposes both target systems: foreground stone scatter and distant mesa
silhouettes. Hidden sides are approximate and procedural; the landscape must
hold from the normal ground-level tour views, not as a survey-accurate terrain
reconstruction.

The existing `sculpt/staraxis-sculpt-spec.json` remains the governing strict
spec. This contract narrows the refinement target for its `terrain-mesa`,
`rock-rubble-scatter`, and gravel repetition systems.

## Regional evidence

- Star Axis is an earthwork on a mesa in eastern New Mexico and uses earth,
  granite, and sandstone.
- San Miguel County transitions between plains, the Las Vegas Plateau,
  Glorieta Mesa, and the Sangre de Cristo Mountains. Its plains contain mesas
  and cuestas left by erosion, while plateau rocks are commonly near-horizontal.
- Nearby Glorieta/Yeso exposures support a restrained palette of light gray to
  brown sandstone, thin yellow/red/gray bands, and red-orange lower beds.

These cues set the form language: broad low plateaus, broken caprock rims,
terraced talus shoulders, thin horizontal color bands, and angular
rust/tan/gray fragments. They do not justify importing unrelated red-rock
arches or monumental western-New-Mexico cliff forms.

## Definition of done

- Distant landforms read as overlapping eroded mesas/cuestas, never primitive
  cylinders or clean trapezoids.
- Each skyline mass has a broken rim, uneven plateau, cliff band, and talus
  shoulder; silhouettes remain convincing from the front and rear ground
  presets.
- Distance is legible through cooler/desaturated far colors and subdued
  contrast, with no texture download or transparency overdraw.
- Foreground rubble uses at least three distinct continuous-sculpt stone
  geometries with sloped shoulders, chipped crowns, and darker embedded bases.
- Rock transforms follow the terrain normal and stay partially embedded; no
  stones balance on points or visibly float.
- Scatter forms irregular drifts and gaps instead of uniform confetti, with a
  small number of larger anchor fragments among mostly small stones.
- Horizon mesas remain one merged draw call. Each stone scatter family remains
  one draw call by batching its geometry variants, with per-object frustum
  culling and no collision cost.
- The change adds no runtime image assets, no animation work, and no new shadow
  update loop.

## Minimum feature depth

- Macro: horizon ring, near terrain, monument relationship.
- Meso: eroded plateau, caprock ledge, cliff face, talus shoulder, clustered
  rock drift.
- Micro: chipped rock crown, stratified face tint, dusty embedded base,
  sun-bleached upper face, per-instance hue/value variation.
- Repetition systems: one multi-geometry batch for slope rubble and one for
  forecourt gravel.
- Review views: supplied ground-level point of view plus the opposite-side
  ground preset.

## Performance budget

- Horizon: one material, one merged mesh, one draw call.
- Rubble: one material, one `BatchedMesh`, no more than 1,600 instances.
- Gravel: one material, one `BatchedMesh`, no more than 1,500 instances.
- Total scatter draw calls must not increase over the previous two instanced
  draws.
- Unique rock geometry should stay below 500 vertices per scatter batch;
  per-object culling must be enabled and opaque-object sorting disabled.

## Blocking failure modes

- A mesa still reads as an extruded regular polygon or isolated trapezoid.
- Caprock bands are vertical, wavy at terrain scale, or visually louder than
  the monument.
- Rock variants are distinguishable only by color, not silhouette.
- Repetition, floating, point contacts, or uniform spacing remain obvious in a
  ground-level screenshot.
- The upgrade increases terrain/scatter draw calls or adds network-loaded art.
- A ground preset shows missing geometry due to an invalid batch bound.
