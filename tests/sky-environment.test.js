import test from 'node:test';
import assert from 'node:assert/strict';
import { Color, Vector3 } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createSkyEnvironment } from '../src/render/sky-environment.js';

test('environment capture excludes solar disc and follows sky changes without mutating displayed sky', () => {
  const visible = new Sky();
  visible.scale.setScalar(1000);
  const environment = createSkyEnvironment(visible);
  const background = new Color(0xabcdef);
  let captured;
  const result = {};
  const pmrem = {
    fromScene(scene) {
      captured = scene.children[0];
      assert.equal(scene.background, background);
      assert.equal(captured.material.uniforms.showSunDisc.value, 0);
      assert.notEqual(captured.material, visible.material);
      assert.notEqual(captured.material.uniforms, visible.material.uniforms);
      assert.equal(visible.material.uniforms.showSunDisc.value, 1);
      return result;
    },
  };
  try {
    assert.equal(environment.capture(pmrem, background), result);
    assert.deepEqual(captured.matrix.elements, visible.matrixWorld.elements);
    const boundUniforms = captured.material.uniforms;
    const boundSunPosition = boundUniforms.sunPosition;
    visible.material.uniforms.sunPosition.value.set(12, 45, 9);
    visible.material.uniforms.rayleigh.value = 3;
    visible.visible = false;
    environment.capture(pmrem, background);
    assert.equal(captured.material.uniforms, boundUniforms);
    assert.equal(captured.material.uniforms.sunPosition, boundSunPosition);
    assert.deepEqual(
      captured.material.uniforms.sunPosition.value,
      new Vector3(12, 45, 9),
    );
    assert.notEqual(
      captured.material.uniforms.sunPosition.value,
      visible.material.uniforms.sunPosition.value,
    );
    assert.equal(captured.material.uniforms.rayleigh.value, 3);
    assert.equal(captured.visible, false);
    visible.visible = true;
    environment.capture(pmrem, background);
    assert.equal(captured.visible, true);
    assert.throws(() =>
      environment.capture(
        {
          fromScene() {
            throw Error('capture failed');
          },
        },
        background,
      ),
    );
    assert.equal(visible.material.uniforms.showSunDisc.value, 1);
  } finally {
    environment.dispose();
    visible.material.dispose();
    visible.geometry.dispose();
  }
});

test('disposing capture releases its material and preserves the visible sky resources', () => {
  const visible = new Sky();
  const environment = createSkyEnvironment(visible);
  let captureDisposed = 0,
    visibleDisposed = 0,
    geometryDisposed = 0;
  visible.material.addEventListener('dispose', () => visibleDisposed++);
  visible.geometry.addEventListener('dispose', () => geometryDisposed++);
  environment.capture(
    {
      fromScene(scene) {
        scene.children[0].material.addEventListener(
          'dispose',
          () => captureDisposed++,
        );
      },
    },
    new Color(),
  );
  environment.dispose();
  assert.equal(captureDisposed, 1);
  assert.equal(visibleDisposed, 0);
  assert.equal(geometryDisposed, 0);
  visible.material.dispose();
  visible.geometry.dispose();
});
