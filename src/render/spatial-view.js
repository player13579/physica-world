import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createSpatialView(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor('#121d24');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(43, 1, 0.1, 120);
  camera.position.set(14, 11, 16);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 2.6, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.minDistance = 7;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();
  scene.add(new THREE.AmbientLight(0xbed2e1, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(5, 12, 6);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x89cafa, 1.5);
  rim.position.set(-7, 4, -6);
  scene.add(rim);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 8),
    new THREE.MeshStandardMaterial({ color: '#1d303a', roughness: 0.92 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.035;
  scene.add(ground);
  const points = [];
  for (let x = -6; x <= 6; x++) {
    points.push(x, 0, -4, x, 0, 4);
  }
  for (let z = -4; z <= 4; z++) {
    points.push(-6, 0, z, 6, 0, z);
  }
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3),
    ),
    new THREE.LineBasicMaterial({
      color: '#3b5361',
      transparent: true,
      opacity: 0.6,
    }),
  );
  scene.add(grid);
  const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(12, 8, 8));
  const bounds = new THREE.LineSegments(
    boxEdges,
    new THREE.LineBasicMaterial({
      color: '#4c6879',
      transparent: true,
      opacity: 0.32,
    }),
  );
  bounds.position.y = 4;
  scene.add(bounds);
  const group = new THREE.Group();
  scene.add(group);
  const batches = new Map(),
    sphere = new THREE.SphereGeometry(1, 18, 12),
    box = new THREE.BoxGeometry(1, 1, 1),
    dummy = new THREE.Object3D(),
    color = new THREE.Color();
  const raycaster = new THREE.Raycaster(),
    mouse = new THREE.Vector2();
  let lineObject = null,
    objectLookup = new Map(),
    lastW = 0,
    lastH = 0;
  function draw(s, visual = {}) {
    const r = canvas.getBoundingClientRect();
    if (r.width !== lastW || r.height !== lastH) {
      lastW = r.width;
      lastH = r.height;
      renderer.setSize(Math.max(1, lastW), Math.max(1, lastH), false);
      camera.aspect = lastW / Math.max(1, lastH);
      camera.updateProjectionMatrix();
    }
    grid.visible = visual.grid !== false;
    const grouped = new Map();
    objectLookup = new Map();
    for (const item of s.instances || []) {
      const opacity = item.opacity ?? 1;
      const level = opacity < 0.4 ? 0.3 : opacity < 0.8 ? 0.72 : 1;
      const key = item.shape + '-' + level;
      const arr = grouped.get(key) || [];
      arr.push(item);
      grouped.set(key, arr);
      objectLookup.set(item.id, item);
    }
    for (const b of batches.values()) b.mesh.count = 0;
    for (const [key, items] of grouped) {
      let batch = batches.get(key);
      if (!batch) {
        const shape = items[0].shape,
          opacity = Number(key.split('-').at(-1));
        const material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: shape === 'sphere' ? 0.3 : 0.7,
          metalness: shape === 'sphere' ? 0.08 : 0,
          transparent: opacity < 1,
          opacity,
          depthWrite: opacity === 1,
        });
        const mesh = new THREE.InstancedMesh(
          shape === 'sphere' ? sphere : box,
          material,
          3200,
        );
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        batch = { mesh, ids: [] };
        batches.set(key, batch);
        group.add(mesh);
      }
      batch.mesh.count = Math.min(items.length, 3200);
      batch.ids = [];
      for (let i = 0; i < batch.mesh.count; i++) {
        const a = items[i];
        dummy.position.fromArray(a.position);
        if (a.quaternion) dummy.quaternion.fromArray(a.quaternion);
        else dummy.quaternion.identity();
        if (a.shape === 'sphere') dummy.scale.setScalar(a.size[0]);
        else dummy.scale.fromArray(a.size);
        dummy.updateMatrix();
        batch.mesh.setMatrixAt(i, dummy.matrix);
        batch.mesh.setColorAt(i, color.set(a.color));
        batch.ids.push(a.id);
      }
      batch.mesh.instanceMatrix.needsUpdate = true;
      if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
    }
    if (lineObject) {
      scene.remove(lineObject);
      lineObject.geometry.dispose();
      lineObject.material.dispose();
      lineObject = null;
    }
    if (s.lines?.length) {
      const p = [],
        c = [];
      for (const l of s.lines) {
        p.push(...l.a, ...l.b);
        color.set(l.color || '#ffefa8');
        c.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      lineObject = new THREE.LineSegments(
        geom,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.95,
        }),
      );
      scene.add(lineObject);
    }
    controls.update();
    renderer.render(scene, camera);
  }
  function pick(clientX, clientY, height, preferObjects = false) {
    const r = canvas.getBoundingClientRect();
    mouse.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      (-(clientY - r.top) / r.height) * 2 + 1,
    );
    raycaster.setFromCamera(mouse, camera);
    if (preferObjects) {
      const hit = raycaster.intersectObjects(
        [...batches.values()].map((b) => b.mesh),
        false,
      )[0];
      if (hit) {
        const b = [...batches.values()].find((b) => b.mesh === hit.object);
        const item = objectLookup.get(b.ids[hit.instanceId]);
        if (item) return item.position.slice();
      }
    }
    const p = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
    if (!raycaster.ray.intersectPlane(plane, p)) return null;
    if (p.x < -6 || p.x > 6 || p.z < -4 || p.z > 4) return null;
    return [p.x, height, p.z];
  }
  return {
    draw,
    pick,
    setInteraction(tool) {
      controls.enableRotate = tool === 'orbit';
      controls.enablePan = tool === 'orbit';
      canvas.style.touchAction = 'none';
    },
    dispose() {
      controls.dispose();
      for (const b of batches.values()) b.mesh.material.dispose();
      sphere.dispose();
      box.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      grid.geometry.dispose();
      grid.material.dispose();
      boxEdges.dispose();
      bounds.material.dispose();
      if (lineObject) {
        lineObject.geometry.dispose();
        lineObject.material.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
