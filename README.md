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
Climbing all 147 steps into the tunnel and emerging at the aperture is the
experience the piece is built around, so walk it. The route is real: entry
channel → terrace stair → through the Equatorial Chamber portal → up the
Star Tunnel. Architecture is solid (capsule-vs-BVH collision via
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
| `1` | Entry channel (matches the aerial reference photo) |
| `2` | Solar Pyramid at golden hour |
| `3` | Top of the stair, sighting up the aperture toward Polaris |
| `4` | High aerial overview |
| `5` | Night, due north — star trails around Polaris |
| `D` / `G` / `N` | Day / golden hour / night |
| `T` | Toggle long-exposure star trails |
| `/` | Debug stats (fps, frame ms, draw calls, triangles) |

Presets `1`–`5` work in both modes; in first person they are spawn points,
and a vantage well off the ground (the aerial view) spawns you flying.

The walker follows the terrain heightfield (Star Tunnel treads and the
terrace flight override it in their channels), while a static BVH over the
monument blocks walls, parapets and pyramid faces. Knee-height steps pass
under the capsule so stairs stay climbable. No gravity/jumping — grounding
is eased, not simulated — and scatter rocks are set dressing, not solid.

URL params for scripted captures: `?nav=orbit&view=1..5&mode=day|goldenHour|night&trails=1&blockout=1`
or a free camera `?cam=x,y,z&look=x,y,z&fov=55`. `nav=fp|orbit` picks the
navigation mode; a free camera or blockout implies `orbit`. `?tour=1..8`
opens the field guide at a specific stop.

## What's modeled

- **Star Tunnel** — 147 instanced granite steps rising at the site latitude
  angle (34.5°) due north, parallel to Earth's axis; open causeway through
  the excavated bowl and an open-to-sky upper run between tall walls, ending
  at a summit headwall with a real slot and brushed-stainless aperture tube
  aimed at Polaris.
- **Crescent wall** — fieldstone rubble arc with ashlar band, granite coping,
  and twin bastion pylons, notched by the stair slot.
- **Entry channel** — outward-leaning flagstone walls converging on the
  terrace and the A-frame triangular portal.
- **Solar Pyramid** — solstice-sloped faces in salmon sandstone panels, a
  granite edge stair to the apex, and the **Hour Chamber**: a real 15° slit
  (one hour of Earth's rotation) cut through the south and north faces as a
  continuous, bronze-edged sightline — enterable on foot.
- **Guided tour** — eight teleporting viewpoints for the approach,
  Equatorial Chamber, Star Tunnel, Upper Room, Solar Pyramid, Hour Chamber,
  and Shadow Field, with concise reference-based interpretation.
- **Generative soundscape** — synthesized in the browser from mesa wind,
  near-subsonic earth tones, caliche and stone footsteps, chamber resonance,
  solar harmonics, and sparse nocturnal bells. The mix changes continuously
  with position, movement, elevation, and light.
- **Sky rig** — TSL sky dome with day/golden/night states; at night the star
  field physically rotates about the Polaris axis, with a fragment-shader
  long-exposure trail mode recreating the famous concentric-arc photograph.
- **Terrain** — analytic heightfield (mesa plateau, bowl, entry trench,
  stair slot all carved in code) with instanced talus, gravel, and grass.

## Materials

All materials are TSL node graphs with independent albedo / roughness /
normal / AO channels sampled in world space: Worley-cell masonry (flagstone,
rubble, ashlar), speckled granite, seamed pyramid sandstone, brushed
stainless, patinated bronze (the five build materials of the real work,
plus earth), cast concrete, and a slope-masked desert blend. Palettes were
derived from reference-photo PBR extraction (see `sculpt/`).

## Performance

The terrain is an 8×8 chunk grid with analytic (seam-free) normals so the
frustum culls most of its ~1.2M triangles; entry-wall segments, coping and
horizon mesas are merged into single draws; the sun's shadow map redraws
only while the sun is moving; everything repeated is instanced. Typical
ground-level frames run ~30–75 draw calls / 0.3–0.5M triangles at 60 fps.
`/` shows live stats.

## Source layout

| File | Role |
| --- | --- |
| `src/staraxis/constants.ts` | Site layout — the 34.5° stair axis, bowl, terrace, pyramid |
| `src/staraxis/heightfield.ts` | Analytic terrain: mesa, bowl, trench and stair-slot carves |
| `src/staraxis/createStarAxis.ts` | The monument factory (29 named component pivots) |
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
