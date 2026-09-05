import { Mesh, Scene, UniformsUtils } from 'three';

// Sky's solar disc can exceed the half-float range used by PMREM. Capture
// atmospheric light separately; the visible disc and direct sun keep their
// own rendering paths. Lowering environmentIntensity after capture is too late.
export function createSkyEnvironment(visibleSky) {
  const scene = new Scene();
  const material = visibleSky.material.clone();
  const sky = new Mesh(visibleSky.geometry, material);
  sky.matrixAutoUpdate = false;
  scene.add(sky);
  return {
    capture(pmrem, background) {
      visibleSky.updateWorldMatrix(true, false);
      sky.matrix.copy(visibleSky.matrixWorld);
      sky.visible = visibleSky.visible;
      // Preserve the uniform containers already bound to the GPU program.
      const snapshot = UniformsUtils.clone(visibleSky.material.uniforms);
      for (const [name, uniform] of Object.entries(snapshot)) {
        material.uniforms[name].value = uniform.value;
      }
      material.uniforms.showSunDisc.value = 0;
      material.uniformsNeedUpdate = true;
      scene.background = background;
      return pmrem.fromScene(scene, 0.04, 0.1, 1200);
    },
    dispose() {
      scene.clear();
      material.dispose();
      // The displayed Sky owns the shared geometry.
    },
  };
}
