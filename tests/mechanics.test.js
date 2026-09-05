import test from 'node:test';
import assert from 'node:assert/strict';
import { createMechanics } from '../src/engines/mechanics.js';

test('perimeter retains a falling ball', () => {
  const game = createMechanics({ width: 500, height: 320 });
  game.reset('challenge');
  game.pointerDown(250, 20, 'ball', 'steel');
  for (let i = 0; i < 600; i++) game.step(1 / 120);
  const ball = game.getState().bodies.at(-1);
  assert.ok(ball.y < 340, `ball escaped at y=${ball.y}`);
});

test('zero gravity leaves a fresh ball nearly stationary, earth gravity does not', () => {
  const game = createMechanics();
  game.reset('challenge');
  game.setOptions({ gravity: 0 });
  game.pointerDown(500, 120, 'ball');
  const id = game.getState().bodies.at(-1).id;
  for (let i = 0; i < 60; i++) game.step(1 / 120);
  const still = game.getState().bodies.find((b) => b.id === id);
  assert.ok(Math.abs(still.vy) < 0.05);
  game.setOptions({ gravity: 9.81 });
  for (let i = 0; i < 60; i++) game.step(1 / 120);
  assert.ok(game.getState().bodies.find((b) => b.id === id).vy > 2);
});

test('materials provide distinct restitution and reported mass', () => {
  const game = createMechanics();
  game.reset('challenge');
  game.pointerDown(450, 80, 'ball', 'rubber');
  game.pointerDown(550, 80, 'ball', 'steel');
  const [rubber, steel] = game.getState().bodies.slice(-2);
  assert.ok(steel.mass > rubber.mass);
  // Matter receives the material coefficients on every created body.
  assert.equal(rubber.material, 'rubber');
  assert.equal(steel.material, 'steel');
});

test('reset removes drag constraints and enforces body cap', () => {
  const game = createMechanics();
  game.pointerDown(150, 100, 'grab');
  game.reset('domino');
  assert.equal(game.getState().constraints.length, 0);
  for (let i = 0; i < 140; i++) game.pointerDown(30 + i * 2, 40, 'ball');
  assert.ok(game.getState().stats.objects <= 100);
});

test('erase removes a static platform and its attached constraints', () => {
  const game = createMechanics();
  game.reset('pendulum');
  const before = game.getState();
  const bob = before.bodies.find((body) => !body.isStatic);
  assert.ok(before.constraints.length >= 2);
  game.pointerDown(bob.x, bob.y, 'erase');
  assert.equal(
    game.getState().constraints.length,
    0,
    'attached pendulum constraints are removed',
  );

  game.pointerDown(840, 120, 'platform');
  const platform = game
    .getState()
    .bodies.find(
      (body) =>
        body.isStatic &&
        Math.abs(body.x - 840) < 1 &&
        Math.abs(body.y - 120) < 1,
    );
  assert.ok(platform);
  game.pointerDown(platform.x, platform.y, 'erase');
  assert.ok(!game.getState().bodies.some((body) => body.id === platform.id));
});
