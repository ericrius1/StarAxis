# Star Axis — a procedural Three.js recreation

A code-only recreation of Charles Ross's land-art observatory **Star Axis**
(New Mexico high desert, under construction since 1976), built with the
latest three.js **WebGPU renderer** and **TSL** node materials. Everything is
procedural — no downloaded models or textures.

> This is an approximate, stylized homage derived from published facts and
> reference photographs, not survey data. Star Axis is © Charles Ross;
> learn more at [staraxis.org](https://www.staraxis.org/).

## Run

```bash
npm install
npm run dev        # http://localhost:5173 — needs a WebGPU browser (Chrome/Edge)
```

## Controls

It opens in **first person** — click to lock the pointer and walk the site.
Climbing the 147-step stair carved into the rear of the pyramid and emerging
at the aperture is the experience the piece is built around, so walk it. The
front route instead approaches the narrow Hour Chamber slit. Architecture is
solid (capsule-vs-BVH collision via
three-mesh-bvh), and zone captions name each of the five elements as you
reach them — on the stair, each step advances the readout through the
26,000-year precession cycle, Polaris's circle growing from dime-sized
today toward the whole sky ±13,000 years out. The Hour Chamber is a true
passage through the Solar Pyramid: its 15° north opening frames one hour of
Earth's rotation.

| Key | Action |
| --- | --- |
| click | Lock pointer (first person) · `Esc` releases |
| `W` `A` `S` `D` | Walk · `Shift` sprint |
| `F` | Toggle fly · `Space` / `Q` up/down while flying |
| arrows | Look, for touring without a mouse |
| **`C`** | **Switch first person ⇄ orbit** |
| **`M`** | **Open the eight-stop guided tour** |
| `[` / `]` | Previous / next guided-tour stop |
| **`K`** | **Start or pause the generative soundscape** |
| `1` | South/front slit |
| `2` | North/rear stair and level apron |
| `3` | On the Star Tunnel stair, sighting the aperture |
| `4` | High aerial overview |
| `5` | Night, due north — star trails around Polaris |
| `D` / `G` / `H` | Day / golden hour / night (`Shift+N` also selects night) |
| `T` | Toggle long-exposure star trails |
| **`N`** | **Toggle Performance ⇄ Cinematic rendering** |
| **`P`** | **Explicitly enter or leave progressive Path Traced rendering** |
| **`L`** | **Open or close the Render Lab** |
| `/` | Debug stats (fps, frame ms, draw calls, triangles) |

Presets `1`–`5` work in both modes; in first person they are spawn points,
and a vantage well off the ground (the aerial view) spawns you flying.

Walking casts directly against a static `three-mesh-bvh` built from the
rendered terrain, architectural meshes, and every instanced stair tread.
A separate solid-geometry BVH resolves the full-height visitor capsule
against visible walls, parapets, and continuous stair stringers, while
bounded movement substeps stop at ledges instead of falling through seams.
Scatter rocks and grass remain non-solid set dressing.

URL params for scripted captures: `?nav=orbit&view=1..5&mode=day|goldenHour|night&trails=1&blockout=1`
or a free camera `?cam=x,y,z&look=x,y,z&fov=55`. `nav=fp|orbit` picks the
navigation mode; a free camera or blockout implies `orbit`. `?tour=1..8`
opens the field guide at a specific stop.

## What's modeled

- **Unified pyramid shell** — one long, tapered stone mass. The south/front
  face contains the needle-like Hour Chamber slit; the north/rear face parts
  around the Star Tunnel stair; both terminate at the same upper room.
- **Rear Star Tunnel** — 147 instanced granite steps rise through a deep cut
  in the back of the pyramid. The stair bed, pale stringers, dark return
  walls and exterior shell meet continuously rather than reading as a
  detached causeway.
- **Front Hour Chamber slit** — a true negative space in the facade with
  bronze reveals, a recessed floor and deep shadowed sightline.
- **Upper Room** — a level viewing bay is centered on a 1.70 m eye line for
  an approximately six-foot visitor. Its broad steel-lined aperture opens
  through a flared passage to the live procedural sky and star field; no
  opaque sky card blocks the view.
- **Earthwork apron** — level graded terrain continues behind the stair and
  only then transitions into a broad natural slope, matching the reference
  profile.
- **Guided tour** — eight teleporting viewpoints for the approach,
  Equatorial Chamber, Star Tunnel, Upper Room, Solar Pyramid, Hour Chamber,
  and Shadow Field, with concise reference-based interpretation.
- **Generative soundscape** — synthesized in the browser from mesa wind,
  near-subsonic earth tones, caliche and stone footsteps, chamber resonance,
  solar harmonics, and sparse nocturnal bells. The mix changes continuously
  with position, movement, elevation, and light.
- **Windswept sand** — a shared deterministic wind field drives both the
  soundscape and an animated, terrain-relative height volume. Wind-aligned
  density noise forms broad translucent veils with turbulent edges; only a
  sparse implicit-grid saltation field remains for near-camera micro-grains.
- **Sky rig** — TSL sky dome with day/golden/night states; at night the star
  field physically rotates about the Polaris axis, with a fragment-shader
  long-exposure trail mode recreating the famous concentric-arc photograph.
- **Three WebGPU render modes** — Performance preserves the responsive
  half-DPR walking path; Cinematic switches to full device DPR, HDR buffers,
  high-sample screen-space global illumination, temporal AA, bloom, color
  finishing and adaptive sharpening; Path Traced lazily builds a scene BVH and
  progressively accumulates multi-bounce HDR lighting for locked-off captures.
  `N` toggles Performance/Cinematic, while `P` explicitly enters or leaves the
  separate Path Traced mode.
- **Terrain** — analytic heightfield with a flat rectangular apron, authored
  front/rear/side break lines, broad slope transitions, and deterministic
  talus, gravel, and grass.

## Materials

All materials are TSL node graphs with independent albedo / roughness /
normal / AO channels sampled in world space: Worley-cell masonry (flagstone,
rubble, ashlar), speckled granite, seamed pyramid sandstone, brushed
stainless, patinated bronze (the five build materials of the real work,
plus earth), cast concrete, and a slope-masked desert blend. Palettes were
derived from reference-photo PBR extraction (see `sculpt/`).

## Render modes and performance

The terrain is an 8×8 chunk grid with analytic (seam-free) normals so the
frustum culls most of the ground. Entry-wall segments, coping and the layered
horizon mesas are merged into single draws. Rubble and gravel are grouped into
eight fixed `InstancedMesh` shape variants, replacing a WebGPU `BatchedMesh`
path that submitted thousands of visible sub-draws. Physically large boulders
select denser smooth variants while ordinary scatter stays cheaper. The sun's
shadow map redraws only while the sun is moving. The pyramid-front review runs
about 95 total scene draws / 0.93M triangles and targets 60 fps. `/` shows live
stats. Cinematic and Path Traced intentionally trade frame rate for native
device resolution and capture quality; the path tracer excludes tiny grass
blades from its acceleration structure but retains the monument, terrain,
horizon, rocks, gravel, instance colors, and material response.

## Source layout

| File | Role |
| --- | --- |
| `src/staraxis/constants.ts` | Unified pyramid, slit, rear stair, aperture, and apron layout |
| `src/staraxis/heightfield.ts` | Analytic terrain: flat apron followed by broad falloffs |
| `src/staraxis/createStarAxis.ts` | The rebuilt monument factory (30 named runtime components) |
| `src/staraxis/materials.ts` | TSL procedural material families |
| `src/staraxis/terrain.ts` | Terrain mesh, horizon mesas, instanced scatter |
| `src/staraxis/sky.ts` | Sky dome, sun/hemisphere rig, Polaris star field + trails |
| `src/staraxis/walk.ts` | Walkable-surface query (terrain + stair override) |
| `src/staraxis/firstPerson.ts` | Pointer-lock visitor rig |

## Sculpt pipeline

Built with the `img2threejs` staged pipeline: validated reference intake →
quality contract → 28-component sculpt spec (strict validation) → eight
locked build passes (blockout → optimization), each gated by a
screenshot-vs-reference review. The spec, assessment, and per-pass
comparison sheets live in `sculpt/`.
