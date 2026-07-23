# Unified Star Axis rebuild contract

Suitability: conditional from two supplied reference composites. The front
slit, rear stair and distant side silhouette are clear; hidden construction
between them is inferred. Output is an approximate real-time reconstruction,
not survey geometry.

Definition of done:

- The monument reads as one continuous pyramid from front, rear, side and
  aerial review views.
- The south/front face contains a real tapered slit with a recessed dark
  chamber, not a decal or a second portal object.
- The 147-step Star Tunnel rises inside a cut in the north/rear face and
  terminates at a visibly circular upper aperture.
- A six-foot visitor reaches a level upper bay with the aperture centered on
  a 1.70 m eye line; the opening fills peripheral vision at the threshold.
- The upper aperture is real negative space through the crown. It must reveal
  the live sky and night star field with parallax, never a flat blue card.
- The rear of the stair meets a level plane that continues before the terrain
  slopes away.
- No shell facet, stair return, slit reveal, landing, or terrain mesh floats
  or pierces another system.
- The browser build typechecks, renders without console errors, and holds
  near-60 fps review captures on the test machine.

Blocking failure modes:

- Detached pyramid and stair silhouettes.
- A stair trench or mound located away from the pyramid footprint.
- Front slit geometry protruding as fins from an oblique view.
- Upper opening reading as a rectangular black panel rather than a circular
  aperture.
- Any opaque card, shell facet, or collision/height transition blocking the
  visitor's sightline from the final tread through the exterior opening.
- Terrain beginning its falloff immediately at the rear stair.

Required review views: south/front three-quarter, north/rear three-quarter,
on-stair aperture, side profile, and elevated rear terrain profile.

Final visual review:

- Front comparison: overall 0.74; silhouette/proportion 0.78; component
  structure 0.82; form detail 0.72; material surface 0.55; lighting/camera
  0.72. Critical front slit 0.86; exterior aperture 0.80.
- Rear/stair comparison: overall 0.76; silhouette/proportion 0.80; component
  structure 0.86; form detail 0.76; material surface 0.54; lighting/camera
  0.71. Critical unified rear cut 0.91; stair/aperture alignment 0.86.
- Terrain-profile review: flat rear apron and delayed slope break 0.84.
- Upper-room correction review: standing eye-line alignment 0.99; continuous
  stair-to-bay walk surface 0.98; unobstructed live-sky sightline 1.00;
  night star-field immersion 0.96. Evidence:
  `shots/aperture-first-person-final.png` and
  `shots/comparison-aperture-final.png`.

The lower material score is an explicit stylized/browser-performance tradeoff;
the user-requested architectural layout and negative-space systems clear their
critical thresholds.
