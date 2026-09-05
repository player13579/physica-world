# PHYSICA-IOS-LONG-PRESS-001

- Date: 2026-09-05
- Classification: input / host gesture ownership
- Shared cause pattern: `GAME-INPUT-HOST-LONGPRESS-001` in the [game-development catalog](C:/Users/user/.codex/skills/game-development/references/bug-learning-catalog.md).
- State: corrective implementation and non-iOS regression checks complete; iOS native long-press outcome unverified.

## Report and reproduction boundary

The user reports that holding the field on iOS opens a native UI for copying the entire canvas. Expected: holding continues the selected game tool without browser selection/copy UI taking the gesture. This affects the canvas shared by 2D and 3D.

The report is user-observed. No physical iPhone/iPad or iOS Safari automation is available here. Desktop pointer input, DOM settings and synthetic EventTarget tests cannot establish that an iOS native menu no longer appears.

## Cause and invariant

Source inspection confirmed that `.world-canvas` had only `touch-action: none`; WebKit callout and selection policies were absent. `nature-view.js` prevented `contextmenu` only after the asynchronous renderer loaded. That does not cover all native iOS selection/callout paths. This is the confirmed policy gap and the mechanism addressed; exact iOS/browser version and the native gesture path remain unobserved locally.

Apple distinguishes [touch callout and user selection controls](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariCSSRef/Articles/StandardCSSProperties.html). [WebKit 194812](https://bugs.webkit.org/show_bug.cgi?id=194812) distinguishes touch-action pan/zoom from selection; [WebKit 231161](https://bugs.webkit.org/show_bug.cgi?id=231161) also documents the distinction between selection, callouts and loupe gestures. Historical browser bugs are supporting mechanism evidence, not claims about the user's unknown iOS version.

Invariant: the game owns gestures on its canvas while ordinary controls, text and browser behavior outside that canvas retain their intended behavior. Native default cancellation must not consume the game's PointerEvents or break release/cancel cleanup.

The original input contract covered pan/zoom and context menus but missed host selection/callout behavior. No evidence identifies agent delegation as the cause. Existing numeric physics and geometry tests did not exercise native input ownership.

## Repair

- `app/globals.css`: scoped WebKit callout, selection and drag policies on `.world-canvas`, retaining `touch-action: none`.
- `app/page.jsx`: canvas `draggable=false`; a layout-effect guard is installed before the asynchronously loaded renderer and removed on unmount.
- `src/input/game-surface.js`: native non-passive `touchstart`, `contextmenu`, `selectstart`, `dragstart` listeners cancel only cancelable native defaults. They do not stop propagation or cancel pointer/click/wheel events.
- Removed the duplicate contextmenu owner from `nature-view.js`; both camera modes use the same guarded canvas.
- No document/body blanket handler, user-agent sniffing, UI-wide selection ban, zoom metadata restriction or change to physics/visual quality.

## Focused checks and evidence limits

`tests/game-surface.test.js` executes the actual helper and checks native-default cancellation with surviving game listeners, pointer hold/move/release/cancel and wheel delivery, untouched controls on another target, and cleanup/remount without removing unrelated listeners. All 38 project tests and lint pass. These EventTarget tests verify event ownership and lifetime, not native iOS rendering of menus.

The production build and SSR/control check also pass. The built canvas CSS retains the WebKit-specific selection/callout rules.

The actual local in-app browser was exercised through normal UI:

- Canvas DOM/computed styles: draggable false, user-select none, touch-action none and WebKit drag none.
- Selected 2D and water tool; held-and-dragged on the field; sample UI reported water depth 4 cm / flow 0.5 m/s and later wet ground. No copied-canvas overlay appeared on this desktop path.
- Selected the look tool and 3D; a canvas drag visibly rotated the valley.
- Right-click on the canvas did not open a native context menu.
- Opened settings and changed wind from 2 to 4 m/s; the main world readout reflected 4 m/s.
- Browser console error list was empty.

These prove desktop pointer/UI regression coverage. They do not prove iOS multi-touch, long-press duration, callout suppression, or physical tablet performance.

## Remaining target-device check

On the user's iOS browser, hold a dry field location for at least two seconds with the water/fire tool in both modes. Verify no native copy/select/share UI, continuing tool application, normal stop on release, and normal two-finger camera gestures. Check settings/sliders and ordinary text outside the canvas separately. Record iOS/browser version and before/after outcome here; only then mark the native report verified. If it recurs, investigate the observed native path under the same incident/pattern rather than broadening prevention across the entire document.

## Reuse

Future games should consult the shared pattern when their input ownership and host gesture conditions match. Reuse the invariant, applicability check and focused regression cases; do not copy PHYSICA selectors or blanket CSS into unrelated games. Project-specific symptoms, exact fixes, release evidence and unresolved iOS checks remain in this record.
