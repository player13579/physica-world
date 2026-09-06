# Compact streamside landscape — 2026-09-06

## Accepted scene

The production entry now creates a 12 m square creek with 128² cells, 9.4488 cm spacing, and approximately 1.0546 m relief. This replaces the 32 m square, 80² production valley: 85.94% less area and 4.29 times finer linear spatial sampling. The existing legacy valley API remains available for its regression tests.

Shrinking the old height function alone created almost 24 m relief and excessive slopes. The new creek profile instead includes a meandering shallow channel, a downstream pool, low shelves and soil undulations. The normalized 0.34 m spring footprint contributes 12 L/s at the default setting. Brush radius starts at 0.6 m (range 0.2–1.5 m); water and terrain brush amplitudes are scaled to this landscape. The initial creek is unlit; the dry preset still includes a small fire.

The same world arrays drive 2D orthographic and 3D perspective cameras. This remains an interactive heightfield approximation, not a full three-dimensional atmosphere, multiphase fluid or ecosystem solver.

## Procedural visual assets

Three variants of branching broadleaf trees have 2,800 separate folded leaves each, with variation and leaf-vein shading. Curved grass blades, 100 arching ferns, irregular smooth stones and shallow-water pebbles replace the primitive forest. All are geometry authored in `foliage-models.js` and `nature-environment.js`; no generated bitmap assets are used. Plant position, removal, tint, fuel loss and flooding follow the simulation, and tree crowns contribute to solar heating occlusion.

The scene retains DPR cap 2.5, a 4096² sun shadow, two 512² point-shadow slots for active fires, refraction, reflection and plant shadows. Unchanged plants no longer rewrite their instance buffers; wind still updates every frame through shared uniforms. Constant albedo colors are reused rather than allocated once per cell per frame.

The B rules were authenticated at player13579/B / Codex-honoo commit `34168f625e08d7f1d8b21d30f0a635cf436e04ec`; baseline blob `2106f184dd21a654312aa93b7034b3191a44f111`, extension blob `d09deba70f1625f3f5b4d91f7808cc6ab43aa302`. The technical code-native exception applies; no extensions activated and no image generation authorization was inferred.

## Scale and resource regressions

A fixed 0.95 m flame billboard became roughly ten grid cells wide after refinement, causing heavy additive overlap and a white fire patch. The flame width now follows cell spacing, the creek has a shorter flame height, smoke emission includes cell area, and flame layers use alpha compositing while physical point lights supply illumination. This change preserves the actual burning-cell state rather than hiding affected cells.

One Chrome WebGL context loss occurred during a development iframe session with hot replacement; a subsequent normal-page clean run rendered the creek and a 50-cell fire. Its underlying driver/HMR cause is not proven. Static review found 35.6 ms median vegetation update work before uploads, and up to 15.38 M expanded shadow triangles for a two-light refresh. State-driven uploads address the measured CPU waste. Cleanup now explicitly releases the owned context, and a real context loss stops rendering and pauses simulation.

A proposed permanently enabled two-shadow layout was not accepted: initialization increased cold-start load in browser QA. Production retains the known-safe optional-shadow contract: no inactive light samples an uninitialized map, and each activated source requests a map update before drawing. DPR, sun shadow size and grass/fern casting were not reduced.

## Verification evidence

- Specialist checks at production resolution cover creek relief, slope, channel width, pool depth, spring volume accounting, 0.04 s versus 0.005 s transport, and radiation at 1 m / beyond 1.2 m. The transport comparison is within 1% relative L1 and 1 cm maximum depth difference over 4 s.
- A comparison to pre-change `d15b89e` across 300 mixed steps found bit-for-bit identical legacy state arrays and statistics.
- Environment checks cover finite attributes, color-channel backing data, branch/leaf geometry, perimeter walls, fire/flood removal, disposal, and no instance-buffer upload for unchanged vegetation.
- Actual Chrome screenshots inspected: default 3D creek, close-up leaf/grass/stone detail, 2D channel, 1024×768 landscape and 768×1024 portrait CSS viewports, water addition with 7 cm sample depth and 0.3 m/s flow, 3D fire, and nighttime illumination.
- Tablet-size checks used a temporary same-origin iframe scaled to fit the desktop browser. These are CSS viewport and actual WebGL-image checks, not touch emulation or physical iOS tests. The fixture is excluded from the publication.
- Final acceptance and publication hashes are recorded in the release verification output; physical tablet performance and the user's prior target-device monochrome report remain unverified. `PHYSICA-FIELD-COLOR-001` stays open pending that device evidence.

## Model routing evidence

The current catalog cache was checked at `2026-09-06T00:54:40.413393100Z`. Actual accepted contributors: GPT-6-Astra (scene design, integration, visual acceptance, tests and publication), GPT-5.6-Sol (numerical review, compact regression proposals, resource and update-cost review), GPT-5.6-Terra (standalone foliage geometry), GPT-5.6-Luna (repository mapping and authenticated B-rule comparison). Geometry proposals and reviews stayed outside the Sites checkout; the primary integrated the accepted code.

Final local acceptance: all 45 automated tests, lint, SSR controls and production build passed. The final landscape viewport sustained two separated fire patches (60 burning cells shown), then reset to the rainy creek with zero burning cells and normal terrain/water/foliage. Final browser error-log query returned no entries. Shared abstractions recorded: `GAME-RENDER-GRID-VISUAL-SCALE-001` and `GAME-RENDER-UNCHANGED-INSTANCE-UPLOAD-001`.
