// This surface belongs to the game. Keep native browser selection/callouts
// separate from its PointerEvent stream (including multi-touch OrbitControls).
// CSS user-select/touch-callout is also required: iOS may show native UI without
// dispatching a contextmenu event. Never install this on document or the UI root.
export function installGameSurfaceGuards(surface) {
  const preventNativeGesture = (event) => {
    if (event.cancelable) event.preventDefault();
  };
  // A native non-passive listener is intentional. React's delegated touch
  // listener can be passive, in which case preventDefault has no effect.
  const options = { passive: false };
  const events = ['touchstart', 'contextmenu', 'selectstart', 'dragstart'];
  for (const type of events)
    surface.addEventListener(type, preventNativeGesture, options);

  return () => {
    for (const type of events)
      surface.removeEventListener(type, preventNativeGesture, options);
  };
}
