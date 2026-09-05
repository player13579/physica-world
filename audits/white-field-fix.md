# White field regression — 2026-09-05

Shared causal pattern: `GAME-RENDER-OPTIONAL-SHADOW-INIT-001` in the [game-development catalog](C:/Users/user/.codex/skills/game-development/references/bug-learning-catalog.md). The project-specific evidence below remains authoritative.

## Reproduction and cause

The previous public build displayed a uniform white field in daylight and a flat gray field at night. UI, simulation, smoke and flame continued to run. Both 2D and 3D were affected in the Codex in-app browser, with `highp` supported.

Disabling the sky, fog, water, environment map or tone mapping individually did not restore the terrain. A basic terrain material worked, and disabling shadows restored all standard/physical meshes. Keeping the sun shadow while disabling only fire shadows also restored the scene.

Two inactive PointLights were created with `castShadow=true` and `shadow.autoUpdate=false`. In Three.js 0.185.1, these lights entered the lighting/shadow uniforms although their depth cubemaps were still null. The shadow pass skipped them until `needsUpdate` became true. With only one initial fire cluster, a second unused shadow light could remain uninitialized indefinitely. The affected lit draws disappeared; the sky alone filled the field. Switching PCFSoft to PCF alone did not fix this.

## Correction

- Fire lights start with shadow casting disabled.
- Source selection runs before the first draw and then every eight frames.
- Only assigned fire sources within the two-shadow budget enable casting and request a shadow update before that frame is rendered.
- Unassigned lights turn off intensity, casting and update requests together.
- Shadow maps are reused across source changes and disposed with the view.
- PCF is selected directly; this removes a deprecation warning without reducing the shadow quality (Three already mapped PCFSoft to PCF).

No resolution, reflection, refraction or shadow-budget reductions were made. Temporary diagnostic probes were removed before the build.

## Verification

- All 34 existing tests and source lint pass.
- Production build and SSR/control verification pass.
- Actual in-app browser screenshots visibly show terrain, trees and water with normal materials and shadows enabled.
- 1024×768: initial 3D, 2D, multiple brush fires (63 burning cells reported), nighttime 3D with fire illumination.
- Reset to rainy forest: zero active fire sources, landscape still visible.
- 768×1024: rainy 3D and dry-preset 2D with a fire source reactivated; landscape remains visible.
- No browser console errors in the final local verification.

These are browser viewport checks, not tests on a physical tablet. Numeric tests alone did not detect the original GPU draw failure; the visual regression checks above are required evidence for this repair.
