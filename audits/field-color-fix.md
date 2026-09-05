# PHYSICA-FIELD-COLOR-001

- Date: 2026-09-05
- Classification: renderer / material color contract and HDR lighting
- Shared patterns: `GAME-RENDER-COLOR-CHANNEL-CONTRACT-001` and `GAME-RENDER-HDR-ENV-CALIBRATION-001` in the [game-development catalog](C:/Users/user/.codex/skills/game-development/references/bug-learning-catalog.md).
- State: reopened after the user's report that the field is still wrong. Earlier desktop corrections remain valid; resolution on the user's tablet is unverified. Additional HDR capture correction described below.

## Report and scope

The user reports a field containing only black and white. The preceding shadow-resource repair restored the geometry, but the forest and ground still appeared gray or washed out. Expected: natural material colors remain distinguishable under lighting in both camera modes, including green vegetation, brown soil/cliffs and blue water.

This incident is separate from the earlier missing-field shadow initialization defect and the iOS native long-press report. The present visual observations use a desktop in-app WebGL browser at 1280 x 720. Physical iOS/tablet rendering is not verified.

## Confirmed causes

1. `nature-environment.js` enabled `MeshStandardMaterial.vertexColors` for primitive geometries without a `color` attribute. All ten tree/grass/reed/rock instance batches had valid chromatic `instanceColor` data, but no per-vertex color buffer. Three.js 0.185.1 enables and multiplies these channels separately; instance colors do not supply the missing vertex attribute. Its WebGL binding code only supplies a missing-attribute fallback when the material defines one, which MeshStandardMaterial does not. The missing channel therefore erased the diffuse tint on the observed path, leaving mostly neutral/specular light.
2. After correcting that flag, the leaves became pale mint/near-white. The HDR Sky PMREM environment was still applied at the default intensity of 1 alongside the explicit sun. Lowering this scene's environment intensity to 0.08 restored visible hue and brightness differences. This was observed after the channel repair, establishing that both problems contributed. PMREM's renderer-state save/restore was inspected; no persistent tone-mapping state leak was found in that path.

The earlier acceptance checked whether geometry was visible and interactions worked, but did not require authored material hues to remain visible. That verification gap allowed this defect to survive. There is no evidence that model handoff caused the rendering bug.

## Repair and invariants

- Environment primitives now leave vertex colors disabled and retain their per-instance palette. The terrain's actual vertex color buffer remains enabled.
- The HDR environment intensity is calibrated against this scene's sun, exposure and materials. The value 0.08 is scene-specific, not a universal lighting constant or a prescription for other games.
- Existing shadow resolution/budgets, physical materials, water reflection/refraction and render resolution are preserved.
- Invariant: every enabled color channel has finite backing data in the same draw path. A separate instance palette cannot stand in for missing vertex data. Correct data must also produce distinguishable intended colors in the actual lit camera view.

## Focused verification

The new environment test builds the actual scene, checks enabled vertex colors against geometry attributes/counts/finite values, and checks all ten active instance batches for valid, chromatic palette data. All 39 project tests and lint pass. CPU data checks do not prove the GPU's final appearance.

A negative-control copy restored only the old `vertexColors=true` default. The color-contract check failed on `tree-trunks: missing color`, while the corrected scene passes. The production build and SSR/control compilation check also pass.

Actual browser observations through normal UI:

- 3D after the color-channel change alone: foliage regained a mint hue but remained heavily washed out.
- 3D with both changes: green tree crowns, brown cutaway soil/cliffs and blue water are visibly distinct, with lit and shadowed surfaces still present.
- 2D: green forest, brown/olive land, blue river and orange fire/light are visible.
- Temperature overlay: the deliberate blue temperature colors and legend appear; turning the overlay off restores the natural palette.
- Midnight: the valley and vegetation become dark under reduced sunlight, rather than remaining uniformly bright. This check does not establish visibility of every fire or material at night.
- World reset returns the time to 15:00 and restores the colored daytime scene; the browser console error list is empty.

The initial slate-gray appearance was observed in the preceding published build's browser checks. The two intermediate correction states and final daytime/2D/night states were observed during this repair. No claim is made that an additional old-commit baseline capture or a physical iOS A/B was performed.

## Reuse

The shared skill records two causal patterns with applicability, counterexamples and regression checks. Future games should inspect actual material/attribute contracts and calibrate their own HDR lighting when those mechanisms apply. Do not globally disable vertex colors, copy this intensity to unrelated scenes, or treat every black/white field as the same cause. Project-specific implementation and verification remain in this incident record.

## Reopened report and HDR capture investigation

The user reported "still not fixed" after release `4afdb99`. The preceding desktop screenshots did not establish the user's tablet outcome. Device/browser name and whether 2D, 3D or both are affected were requested; no answer was available during this investigation. Keep the symptom open until the user's actual view is identified and checked.

The published HTML and renderer bundle matched the local release exactly. There is no service worker or app-owned persistent cache. GitHub Pages serves HTML with a 600-second cache lifetime, but there is no evidence that the user was viewing a stale copy. Do not attribute this report to caching without device-side evidence.

A separate unsafe numeric path was found: PMREM uses HalfFloat render targets and captures with NoToneMapping, while Sky's solar-disc radiance exceeds binary16's finite maximum of 65,504. Evaluating the actual Sky 0.185.1 equations at the initial hour 15 gives sun-centre RGB approximately (281814, 232417, 153816), before storing the environment. Scaling scene.environmentIntensity later cannot repair values that have already overflowed. Sky's own documentation recommends excluding the sun disc during environment-map generation to avoid artifacts.

The new `sky-environment.js` captures atmospheric light through an isolated material with showSunDisc=0. The visible sky's sun disc and the directional sun remain intact. Capture uniforms follow the displayed sky while retaining the uniform containers bound to the GPU program. The capture owns only its material; geometry ownership stays with the displayed sky. The earlier vertex-color and environment-intensity corrections remain in place.

This is shared candidate `GAME-RENDER-HDR-CAPTURE-RANGE-001`. Numeric range mismatch is confirmed by source and CPU evaluation. Its role in the user's continued white/black rendering is a hypothesis, not a reproduced iOS cause.

### Additional verification and its limits

- All 41 automated tests and lint pass. The two new tests execute the capture helper and check sun-disc isolation, source preservation, setting changes, stable uniform binding, capture failure and resource disposal.
- `scripts/sky-gpu-check.html`, served through Vite, executes real Sky/PMREM captures and reads the half-float target. The desktop browser reported highp and valid readbacks with zero GL errors. At hours 12 and 15, the old final PMREM already had zero non-finite components (maximum values 4116 and 2060). The corrected capture also has zero non-finite components, with maxima 52.8125 and 38.53125. These observations show finite corrected data and time-dependent updates, but do not reproduce the user's failure; the CPU's solar-centre value and the GPU's filtered/sampled final PMREM are different stages.
- Actual local game UI: the corrected 3D daytime scene shows green foliage, brown cliffs and blue water; 2D at a 768 x 1024 viewport shows green foliage, blue water and orange fire. Changing the time to 00:00 darkens the scene while the fire and its orange local lighting remain visible. Reset restores the 15:00 state. This is a desktop viewport test, not an iPad GPU test. Production build and SSR/control checks pass.
- Do not close this incident based on a test count, a desktop screenshot or successful publication. Next evidence needed is the affected device/browser and actual field image after the additional correction.
