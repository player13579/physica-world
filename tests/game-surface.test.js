import assert from 'node:assert/strict';
import test from 'node:test';
import { installGameSurfaceGuards } from '../src/input/game-surface.js';

test('native canvas gestures are cancelled without consuming game listeners', () => {
  const canvas = new EventTarget();
  const dispose = installGameSurfaceGuards(canvas);
  let accepted = 0;
  canvas.addEventListener('touchstart', () => accepted++);
  for (const type of [
    'touchstart',
    'contextmenu',
    'selectstart',
    'dragstart',
  ]) {
    const event = new Event(type, { cancelable: true });
    assert.equal(
      canvas.dispatchEvent(event),
      false,
      `${type} default cancelled`,
    );
    assert.equal(event.defaultPrevented, true);
  }
  assert.equal(accepted, 1, 'touch input still reaches other game listeners');
  dispose();
});

test('pointer hold/move/release/cancel and wheel remain owned by the game', () => {
  const canvas = new EventTarget();
  const dispose = installGameSurfaceGuards(canvas);
  let holding = false;
  let moves = 0;
  canvas.addEventListener('pointerdown', () => {
    holding = true;
  });
  canvas.addEventListener('pointermove', () => {
    if (holding) moves++;
  });
  canvas.addEventListener('pointerup', () => {
    holding = false;
  });
  canvas.addEventListener('pointercancel', () => {
    holding = false;
  });
  for (const type of [
    'pointerdown',
    'pointermove',
    'pointermove',
    'pointerup',
    'pointermove',
    'pointerdown',
    'pointercancel',
    'lostpointercapture',
    'wheel',
    'click',
  ]) {
    assert.equal(
      canvas.dispatchEvent(new Event(type, { cancelable: true })),
      true,
    );
  }
  assert.equal(moves, 2, 'release ends the hold without a swallowed event');
  assert.equal(holding, false, 'cancel also reaches the game');
  dispose();
});

test('controls outside the canvas keep native selection and touch defaults', () => {
  const canvas = new EventTarget();
  const control = new EventTarget();
  const dispose = installGameSurfaceGuards(canvas);
  for (const type of ['touchstart', 'contextmenu', 'selectstart', 'dragstart'])
    assert.equal(
      control.dispatchEvent(new Event(type, { cancelable: true })),
      true,
    );
  dispose();
});

test('unmount removes only owned guards, and remount installs them again', () => {
  const canvas = new EventTarget();
  let otherCalls = 0;
  canvas.addEventListener('touchstart', () => otherCalls++);
  const dispose = installGameSurfaceGuards(canvas);
  dispose();
  const disposeRemount = installGameSurfaceGuards(canvas);
  dispose(); // An old cleanup must not remove the new instance's handlers.
  assert.equal(
    canvas.dispatchEvent(new Event('touchstart', { cancelable: true })),
    false,
  );
  disposeRemount();
  for (const type of ['touchstart', 'contextmenu', 'selectstart', 'dragstart'])
    assert.equal(
      canvas.dispatchEvent(new Event(type, { cancelable: true })),
      true,
    );
  assert.equal(
    otherCalls,
    2,
    'unrelated touch listener survives both cleanups',
  );
});
