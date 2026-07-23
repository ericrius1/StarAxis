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
experience the piece is built around, so walk it.

| Key | Action |
| --- | --- |
| click | Lock pointer (first person) · `Esc` releases |
| `W` `A` `S` `D` | Walk · `Shift` sprint |
| `F` | Toggle fly · `Space` / `Q` up/down while flying |
| arrows | Look, for touring without a mouse |
| **`C`** | **Switch first person ⇄ orbit** |
| `1` | Entry channel (matches the aerial reference photo) |
| `2` | Solar Pyramid at golden hour |
| `3` | Top of the stair, sighting up the aperture toward Polaris |
| `4` | High aerial overview |
| `5` | Night, due north — star trails around Polaris |
| `D` / `G` / `N` | Day / golden hour / night |
| `T` | Toggle long-exposure star trails |

Presets `1`–`5` work in both modes; in first person they are spawn points,
and a vantage well off the ground (the aerial view) spawns you flying.

The walker follows the terrain heightfield, with the Star Tunnel treads
overriding it inside the stair channel so you pass *under* the summit
hillside. It is free-walk, not a physics sim — there is no wall collision.

URL params for scripted captures: `?nav=orbit&view=1..5&mode=day|goldenHour|night&trails=1&blockout=1`
or a free camera `?cam=x,y,z&look=x,y,z&fov=55`. `nav=fp|orbit` picks the
navigation mode; a free camera or blockout implies `orbit`.

## What's modeled

- **Star Tunnel** — 147 instanced granite steps rising at the site latitude
  angle (34.5°) due north, parallel to Earth's axis; open causeway through
  the excavated bowl, dark tunnel mouth at the rim, buried upper run, summit
  headwall with a real slot and a brushed-stainless aperture tube aimed at
  Polaris.
- **Crescent wall** — fieldstone rubble arc with ashlar band, granite coping,
  and twin bastion pylons, notched by the stair slot.
- **Entry channel** — outward-leaning flagstone walls converging on the
  terrace and the A-frame triangular portal.
- **Solar Pyramid** — solstice-sloped faces in salmon sandstone panels, a
  granite edge stair to the apex, and the 15° Hour Chamber wedge (one hour
  of Earth's rotation) cut into the south face.
- **Sky rig** — TSL sky dome with day/golden/night states; at night the star
  field physically rotates about the Polaris axis, with a fragment-shader
  long-exposure trail mode recreating the famous concentric-arc photograph.
- **Terrain** — analytic heightfield (mesa plateau, bowl, entry trench,
  stair slot all carved in code) with instanced talus, gravel, and grass.

## Materials

All materials are TSL node graphs with independent albedo / roughness /
normal / AO channels sampled in world space: Worley-cell masonry (flagstone,
rubble, ashlar), speckled granite, seamed pyramid sandstone, brushed
stainless, cast concrete, and a slope-masked desert blend. Palettes were
derived from reference-photo PBR extraction (see `sculpt/`).

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
