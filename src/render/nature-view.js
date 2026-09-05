import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { createEnvironment } from './nature-environment.js';
import { getSunState } from '../engines/nature-engine.js';

const clamp = THREE.MathUtils.clamp;
const noiseGLSL = `
float hash31(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return .53*noise3(p)+.27*noise3(p*2.03)+.13*noise3(p*4.01)+.07*noise3(p*8.03);}
`;

function temperatureColor(t, target) {
  const colors = [0x17286a, 0x147b94, 0x74ad67, 0xefc454, 0xe46027, 0xffffff];
  const v = clamp((t - 12) / 140, 0, 1) * 5;
  target.setHex(colors[Math.floor(v)]);
  if (v < 5) target.lerp(new THREE.Color(colors[Math.floor(v) + 1]), v % 1);
  return target;
}

export function createNatureView(
  canvas,
  world,
  { onSample, onBrush, onError } = {},
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.debug.onShaderError = () => {
    onError?.(
      'この端末で水や炎を描画できませんでした。ブラウザを更新して再度開いてください。',
    );
  };
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaecbd3);
  scene.fog = new THREE.FogExp2(0xaecbd3, 0.009);
  const perspective = new THREE.PerspectiveCamera(42, 1, 0.1, 1800);
  const ortho = new THREE.OrthographicCamera(-23, 23, 23, -23, 0.1, 1800);
  perspective.position.set(32, 29, 37);
  ortho.position.set(0, 70, 0.001);
  let camera = perspective;
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 9;
  controls.maxDistance = 85;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minPolarAngle = 0.15;
  controls.screenSpacePanning = true;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.update();

  const sky = new Sky();
  sky.scale.setScalar(1000);
  sky.material.uniforms.turbidity.value = 3.2;
  sky.material.uniforms.rayleigh.value = 2.1;
  sky.material.uniforms.mieCoefficient.value = 0.006;
  sky.material.uniforms.mieDirectionalG.value = 0.82;
  scene.add(sky);
  const hemisphere = new THREE.HemisphereLight(0xc7e5ff, 0x474128, 1.2);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff0d0, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -23,
    right: 23,
    top: 23,
    bottom: -23,
    near: 1,
    far: 130,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.08;
  sun.shadow.radius = 3;
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  let environmentTarget = null;
  let lastSkyKey = '';
  const sunDirection = new THREE.Vector3();

  const { n, size } = world;
  const terrainGeo = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
  terrainGeo.rotateX(-Math.PI / 2);
  const groundColors = new Float32Array(n * n * 3);
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(groundColors, 3));
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
  });
  terrainMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vTerrainPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvTerrainPosition=position;',
    );
    shader.fragmentShader =
      'varying vec3 vTerrainPosition;\n' + noiseGLSL + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float grain=fbm(vTerrainPosition*18.);float patches=fbm(vTerrainPosition*.85);
      diffuseColor.rgb*=.78+.30*grain+.15*patches;`,
    );
  };
  const terrain = new THREE.Mesh(terrainGeo, terrainMaterial);
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  scene.add(terrain);

  const waterGeo = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.setAttribute(
    'waterDepth',
    new THREE.BufferAttribute(new Float32Array(n * n), 1),
  );
  waterGeo.setAttribute(
    'waterFlow',
    new THREE.BufferAttribute(new Float32Array(n * n * 2), 2),
  );
  waterGeo.setAttribute(
    'waterHeat',
    new THREE.BufferAttribute(new Float32Array(n * n), 1),
  );
  const waterUniforms = { uTime: { value: 0 }, uThermal: { value: 0 } };
  const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x309dac,
    roughness: 0.13,
    metalness: 0.03,
    transmission: 0.32,
    thickness: 0.65,
    ior: 1.333,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.1,
  });
  waterMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, waterUniforms);
    shader.vertexShader =
      `attribute float waterDepth;attribute vec2 waterFlow;attribute float waterHeat;varying float vHeat;varying float vDepth;varying vec2 vFlow;varying vec3 vWaterPosition;uniform float uTime;\n` +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vDepth=waterDepth;vFlow=waterFlow;vHeat=waterHeat;vWaterPosition=position;
      transformed.y+=min(waterDepth,.2)*.09*(sin(position.x*5.5+position.z*3.2-uTime*2.3)+sin(position.z*9.1-position.x*1.7+uTime*1.6));`,
    );
    shader.fragmentShader =
      `uniform float uTime;uniform float uThermal;varying float vHeat;varying float vDepth;varying vec2 vFlow;varying vec3 vWaterPosition;\n${noiseGLSL}\n` +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      if(vDepth<.005) discard;
      vec2 advected=vWaterPosition.xz-vFlow*uTime*.35;
      float wave=fbm(vec3(advected*5.,uTime*.35));
      float foam=smoothstep(.61,.80,wave)*clamp(length(vFlow)*.23,0.,.6)*(1.-smoothstep(.03,.6,vDepth));
      diffuseColor.rgb=mix(vec3(.16,.40,.35),vec3(.018,.20,.27),1.-exp(-vDepth*2.8));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.84,.94,.92),foam);
      if(uThermal>.5){float t=clamp((vHeat-12.)/140.,0.,1.)*5.;
        vec3 c0=vec3(.09,.16,.42),c1=vec3(.08,.48,.58),c2=vec3(.45,.68,.40),c3=vec3(.94,.77,.33),c4=vec3(.89,.38,.15);
        diffuseColor.rgb=t<1.?mix(c0,c1,t):t<2.?mix(c1,c2,t-1.):t<3.?mix(c2,c3,t-2.):t<4.?mix(c3,c4,t-3.):mix(c4,vec3(1.),t-4.);}
      diffuseColor.a*=smoothstep(.005,.05,vDepth);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      vec2 q=vWaterPosition.xz-vFlow*uTime*.18;
      normal=normalize(normal+vec3(sin(q.x*9.+q.y*5.+uTime*2.)*.065,cos(q.y*8.-q.x*3.+uTime)*.065,0.));`,
    );
  };
  const waterMesh = new THREE.Mesh(waterGeo, waterMaterial);
  waterMesh.receiveShadow = true;
  waterMesh.renderOrder = 2;
  waterMesh.frustumCulled = false;
  scene.add(waterMesh);
  const dressing = createEnvironment(scene, world);

  const fireCapacity = n * n;
  const fireGeometry = new THREE.PlaneGeometry(1, 1);
  fireGeometry.translate(0, 0.5, 0);
  fireGeometry.setAttribute(
    'strength',
    new THREE.InstancedBufferAttribute(new Float32Array(fireCapacity), 1),
  );
  fireGeometry.setAttribute(
    'seed',
    new THREE.InstancedBufferAttribute(
      new Float32Array(fireCapacity).map((_, i) => (i * 0.618034) % 1),
      1,
    ),
  );
  const fireUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2() },
  };
  const fireMaterial = new THREE.ShaderMaterial({
    uniforms: fireUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `attribute float strength;attribute float seed;varying vec2 vUv;varying float vStrength;varying float vSeed;uniform vec2 uWind;
      void main(){vUv=uv;vStrength=strength;vSeed=seed;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
      float h=.35+strength*2.2;vec3 offset=vec3(position.x*.95,position.y*h,0.);
      vec4 drift=viewMatrix*vec4(uWind.x,0.,uWind.y,0.);offset+=drift.xyz*position.y*position.y*.16;
      gl_Position=projectionMatrix*(center+vec4(offset,0.));}`,
    fragmentShader: `varying vec2 vUv;varying float vStrength;varying float vSeed;uniform float uTime;${noiseGLSL}
      void main(){vec2 p=vUv;float t=uTime*(2.+vStrength)+vSeed*30.;
      float n=fbm(vec3(p.x*5.,p.y*5.-t,t*.25));float warp=(n-.5)*.5*p.y;
      float edge=abs(p.x-.5+warp)*2.;float shape=(1.-p.y)*.80-edge+n*.32;
      float a=smoothstep(.03,.22,shape)*(1.-smoothstep(.04,1.,p.y))*clamp(vStrength*3.,0.,1.);
      if(a<.015)discard;float hot=clamp(shape*2.1+(1.-p.y)*.2,0.,1.);
      vec3 col=mix(vec3(2.,.14,.015),vec3(3.6,1.7,.15),hot);col=mix(col,vec3(4.4,3.5,1.4),pow(hot,4.));
      gl_FragColor=vec4(col,a*.88);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const flames = new THREE.InstancedMesh(
    fireGeometry,
    fireMaterial,
    fireCapacity,
  );
  flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  flames.count = 0;
  flames.frustumCulled = false;
  flames.renderOrder = 4;
  scene.add(flames);
  const fireLights = Array.from({ length: 6 }, (_, i) => {
    const light = new THREE.PointLight(0xff6821, 0, 9, 2);
    // Only active fire sources may enter the shadow pass. An inactive light has
    // no depth cubemap; sampling it can invalidate every lit draw on WebGL.
    light.castShadow = false;
    if (i < 2) {
      light.shadow.mapSize.set(512, 512);
      light.shadow.normalBias = 0.08;
      light.shadow.autoUpdate = false;
    }
    scene.add(light);
    return light;
  });

  // Smoke is persistent emitted mass, advected by wind and thermal buoyancy.
  const smokeCapacity = 2200;
  const smokePositions = new Float32Array(smokeCapacity * 3);
  const smokeAge = new Float32Array(smokeCapacity).fill(100);
  const smokeLife = new Float32Array(smokeCapacity);
  const smokeHeat = new Float32Array(smokeCapacity);
  const smokeSizes = new Float32Array(smokeCapacity);
  const smokeAlpha = new Float32Array(smokeCapacity);
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(smokePositions, 3),
  );
  smokeGeo.setAttribute('size', new THREE.BufferAttribute(smokeSizes, 1));
  smokeGeo.setAttribute('alpha', new THREE.BufferAttribute(smokeAlpha, 1));
  const smokeMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uScale: { value: 500 },
      uLight: { value: 0.7 },
      uOrtho: { value: 0 },
    },
    vertexShader: `attribute float size;attribute float alpha;varying float vAlpha;uniform float uScale;uniform float uOrtho;
      void main(){vAlpha=alpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*uScale/mix(max(1.,-p.z),40.,uOrtho),1.,180.);}`,
    fragmentShader: `varying float vAlpha;uniform float uLight;void main(){vec2 p=gl_PointCoord*2.-1.;float d=dot(p,p);if(d>1.||vAlpha<.001)discard;float a=pow(1.-d,2.)*vAlpha;gl_FragColor=vec4(vec3(.19+.38*uLight),a);}`,
  });
  const smoke = new THREE.Points(smokeGeo, smokeMaterial);
  smoke.frustumCulled = false;
  smoke.renderOrder = 5;
  scene.add(smoke);
  let smokeCursor = 0;
  let emitCredit = 0;

  const rainCount = 1800;
  const rainPositions = new Float32Array(rainCount * 6);
  for (let i = 0; i < rainCount; i++) {
    rainPositions[i * 6] = Math.random() * size - size / 2;
    rainPositions[i * 6 + 1] = Math.random() * 20;
    rainPositions[i * 6 + 2] = Math.random() * size - size / 2;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMaterial = new THREE.LineBasicMaterial({
    color: 0xc9e4ef,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const rainMesh = new THREE.LineSegments(rainGeo, rainMaterial);
  rainMesh.frustumCulled = false;
  rainMesh.renderOrder = 6;
  scene.add(rainMesh);

  const cursor = new THREE.Mesh(
    new THREE.RingGeometry(0.97, 1, 64),
    new THREE.MeshBasicMaterial({
      color: 0xe7f5c6,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      side: THREE.DoubleSide,
    }),
  );
  cursor.rotation.x = -Math.PI / 2;
  cursor.renderOrder = 10;
  cursor.visible = false;
  scene.add(cursor);
  let mode = '3d',
    tool = 'look',
    radius = 1.2,
    thermal = false,
    disposed = false,
    seenRevision = -1;
  let frame = 0,
    lastWidth = 0,
    lastHeight = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointers = new Map();
  let activeStroke = false,
    strokePoint = null,
    brushCredit = 0;
  const color = new THREE.Color();
  const object = new THREE.Object3D();
  const burnSites = [];
  const burnWeights = [];
  let burnWeightTotal = 0,
    lastWorldTime = 0,
    seenVegetationRevision = -1;

  function configureGestures() {
    controls.enabled = true;
    controls.enableRotate = mode === '3d' && tool === 'look';
    controls.touches.ONE =
      tool === 'look' && mode === '2d' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    controls.mouseButtons.LEFT =
      tool === 'look' && mode === '2d' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  }

  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(terrain, false)[0];
    return hit ? hit.point : null;
  }
  function locate(event) {
    const p = pick(event);
    cursor.visible = Boolean(p) && tool !== 'look';
    if (p) {
      cursor.position.set(p.x, p.y + 0.075, p.z);
      cursor.scale.setScalar(radius);
      onSample?.(world.sample(p.x, p.z));
    }
    return p;
  }
  function pointerDown(event) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size > 1) {
      activeStroke = false;
      strokePoint = null;
      return;
    }
    const p = locate(event);
    if (tool !== 'look' && p && event.button === 0) {
      activeStroke = true;
      strokePoint = p;
      brushCredit = 0;
      canvas.setPointerCapture(event.pointerId);
      world.brush(tool, p.x, p.z, radius, 1);
      onBrush?.(tool);
    }
  }
  function pointerMove(event) {
    const p = locate(event);
    if (activeStroke && pointers.size === 1 && p) strokePoint = p;
  }
  function pointerUp(event) {
    pointers.delete(event.pointerId);
    activeStroke = false;
    strokePoint = null;
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    configureGestures();
    if (!pointers.size) cursor.visible = false;
  }
  const lostContext = (e) => {
    e.preventDefault();
    onError?.('描画を再開するには、世界を開き直してください。');
  };
  // OrbitControls still records every touch; one-finger rotation is gated separately.
  canvas.addEventListener('pointerdown', pointerDown, true);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('webglcontextlost', lostContext);

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height || (width === lastWidth && height === lastHeight))
      return;
    lastWidth = width;
    lastHeight = height;
    renderer.setSize(width, height, false);
    perspective.aspect = width / height;
    perspective.updateProjectionMatrix();
    const aspect = width / height;
    const halfHeight = aspect < 1 ? 19 / aspect : 22;
    ortho.left = -halfHeight * aspect;
    ortho.right = halfHeight * aspect;
    ortho.top = halfHeight;
    ortho.bottom = -halfHeight;
    ortho.updateProjectionMatrix();
    smokeMaterial.uniforms.uScale.value = height * renderer.getPixelRatio();
  }
  function lighting() {
    const { hour, sunPower, rain } = world.settings;
    const key = `${hour}:${sunPower}:${rain}`;
    if (lastSkyKey === key) return;
    lastSkyKey = key;
    const sunState = getSunState(world.settings);
    sunDirection.fromArray(sunState.direction);
    sky.material.uniforms.sunPosition.value
      .copy(sunDirection)
      .multiplyScalar(200);
    const day = Math.max(0, sunState.daylight);
    const cloud = clamp(rain / 100, 0, 0.8);
    sun.position.copy(sunDirection).multiplyScalar(60);
    sun.intensity = (day > 0 ? 3.8 : 0) * sunState.irradianceMultiplier;
    sun.color.setHSL(0.11 - (1 - day) * 0.07, 0.16 + (1 - day) * 0.45, 0.92);
    hemisphere.intensity = 0.12 + day * 0.95 * (1 - cloud * 0.35);
    const fogColor = new THREE.Color().setHSL(
      0.55 + (1 - day) * 0.03,
      0.18,
      0.07 + day * 0.62 - cloud * 0.12,
    );
    scene.fog.color.copy(fogColor);
    scene.background.copy(fogColor);
    smokeMaterial.uniforms.uLight.value = day;
    sky.visible = day > 0.015;
    // Capture the atmospheric sky alone for Fresnel reflections on the water.
    const envScene = new THREE.Scene();
    const envSky = sky.clone();
    envSky.material = sky.material;
    envScene.add(envSky);
    envScene.background = fogColor;
    const next = pmrem.fromScene(envScene, 0.04, 0.1, 1200);
    scene.environment = next.texture;
    environmentTarget?.dispose();
    environmentTarget = next;
  }
  function updateFields() {
    const positions = terrainGeo.attributes.position.array;
    const waterPositions = waterGeo.attributes.position.array;
    const depths = waterGeo.attributes.waterDepth.array;
    const waterHeats = waterGeo.attributes.waterHeat.array;
    const flow = waterGeo.attributes.waterFlow.array;
    burnSites.length = 0;
    burnWeights.length = 0;
    burnWeightTotal = 0;
    for (let i = 0; i < n * n; i++) {
      const k = i * 3,
        h = world.height[i],
        d = world.water[i];
      positions[k + 1] = h;
      waterPositions[k + 1] = h + Math.max(0, d) + 0.008;
      depths[i] = d;
      waterHeats[i] = world.waterTemperature[i];
      flow[i * 2] = world.flowX[i];
      flow[i * 2 + 1] = world.flowZ[i];
      if (thermal) temperatureColor(world.temperature[i], color);
      else {
        const vegetation = clamp(world.fuel[i] / 2, 0, 1);
        const wet = world.moisture[i];
        const slope =
          Math.abs(world.height[Math.min(i + 1, n * n - 1)] - h) / world.dx;
        color.setHex(slope > 1.15 ? 0x737773 : 0x76684d);
        color.lerp(new THREE.Color(0x5c7431), vegetation * 0.85);
        color.multiplyScalar(1 - wet * 0.16);
        if (
          world.fire[i] > 0.01 ||
          (world.fuel[i] < 0.09 && world.temperature[i] > 70)
        )
          color.lerp(new THREE.Color(0x251c17), 0.85);
        if (d > 0.004) color.lerp(new THREE.Color(0x4c5b40), 0.35);
      }
      color.toArray(groundColors, k);
      if (world.fire[i] > 0.008) {
        burnSites.push(i);
        burnWeightTotal += world.burnRate[i] / 0.012;
        burnWeights.push(burnWeightTotal);
      }
    }
    terrainGeo.attributes.color.needsUpdate = true;
    if (seenRevision !== world.revision) {
      terrainGeo.attributes.position.needsUpdate = true;
      terrainGeo.computeVertexNormals();
      terrainGeo.computeBoundingSphere();
      if (seenRevision !== -1) dressing.rebuild();
      seenRevision = world.revision;
      seenVegetationRevision = world.vegetationRevision;
    }
    if (seenVegetationRevision !== world.vegetationRevision) {
      dressing.rebuild();
      seenVegetationRevision = world.vegetationRevision;
    }
    waterGeo.attributes.position.needsUpdate = true;
    waterGeo.attributes.waterDepth.needsUpdate = true;
    waterGeo.attributes.waterFlow.needsUpdate = true;
    waterGeo.attributes.waterHeat.needsUpdate = true;
    if (frame % 3 === 0) waterGeo.computeVertexNormals();
    for (let j = 0; j < burnSites.length; j++) {
      const i = burnSites[j];
      object.position.set(
        positions[i * 3],
        positions[i * 3 + 1] + 0.02,
        positions[i * 3 + 2],
      );
      object.updateMatrix();
      flames.setMatrixAt(j, object.matrix);
      fireGeometry.attributes.strength.array[j] = world.fire[i];
    }
    flames.count = burnSites.length;
    flames.instanceMatrix.needsUpdate = true;
    fireGeometry.attributes.strength.needsUpdate = true;
    if (frame === 1 || frame % 8 === 0) {
      const candidates = [...burnSites].sort(
        (a, b) => world.burnRate[b] - world.burnRate[a],
      );
      const chosen = [];
      for (const i of candidates) {
        const x = positions[i * 3],
          z = positions[i * 3 + 2];
        if (
          chosen.every(
            (j) =>
              Math.hypot(x - positions[j * 3], z - positions[j * 3 + 2]) > 2,
          )
        )
          chosen.push(i);
        if (chosen.length === fireLights.length) break;
      }
      fireLights.forEach((light, j) => {
        const i = chosen[j];
        if (i === undefined) {
          light.intensity = 0;
          light.castShadow = false;
          light.shadow.needsUpdate = false;
          return;
        }
        light.position.set(
          positions[i * 3],
          positions[i * 3 + 1] + 0.8,
          positions[i * 3 + 2],
        );
        light.intensity = world.burnRate[i] * 18000;
        light.castShadow = j < 2;
        light.shadow.needsUpdate = light.castShadow;
      });
    }
  }
  function atmosphericParticles(dt) {
    const angle = (world.settings.windAngle * Math.PI) / 180;
    const wx = Math.cos(angle) * world.settings.wind,
      wz = Math.sin(angle) * world.settings.wind;
    fireUniforms.uWind.value.set(wx, wz);
    emitCredit = Math.min(emitCredit + burnWeightTotal * dt * 12, 200);
    let emit = Math.min(100, Math.floor(emitCredit));
    emitCredit -= emit;
    while (emit-- > 0 && burnSites.length) {
      const weight = Math.random() * burnWeightTotal;
      let lo = 0,
        hi = burnWeights.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (burnWeights[mid] < weight) lo = mid + 1;
        else hi = mid;
      }
      const i = burnSites[lo];
      const j = smokeCursor++ % smokeCapacity,
        k = j * 3;
      smokePositions[k] =
        (i % n) * world.dx - size / 2 + (Math.random() - 0.5) * 0.3;
      smokePositions[k + 1] = world.height[i] + 0.5 + world.fire[i];
      smokePositions[k + 2] =
        Math.floor(i / n) * world.dx - size / 2 + (Math.random() - 0.5) * 0.3;
      smokeAge[j] = 0;
      smokeLife[j] = 5 + Math.random() * 5;
      smokeHeat[j] = world.fire[i];
    }
    for (let j = 0; j < smokeCapacity; j++) {
      smokeAge[j] += dt;
      if (smokeAge[j] >= smokeLife[j]) {
        smokeAlpha[j] = 0;
        continue;
      }
      const k = j * 3,
        age = smokeAge[j],
        life = smokeLife[j];
      smokePositions[k] += (wx * 0.45 + Math.sin(j + age * 1.7) * 0.3) * dt;
      smokePositions[k + 1] +=
        (0.4 + smokeHeat[j] * 1.1) * Math.exp(-age * 0.08) * dt;
      smokePositions[k + 2] += (wz * 0.45 + Math.cos(j * 0.8 + age) * 0.3) * dt;
      smokeSizes[j] = 0.35 + age * 0.36;
      smokeAlpha[j] = Math.min(1, age * 2) * (1 - age / life) * 0.2;
    }
    for (const attribute of Object.values(smokeGeo.attributes))
      attribute.needsUpdate = true;
    const drops = Math.floor(rainCount * clamp(world.settings.rain / 70, 0, 1));
    rainGeo.setDrawRange(0, drops * 2);
    for (let j = 0; j < drops; j++) {
      const k = j * 6;
      rainPositions[k] += wx * dt * 0.6;
      rainPositions[k + 1] -= dt * 12;
      rainPositions[k + 2] += wz * dt * 0.6;
      if (
        rainPositions[k + 1] < 0 ||
        Math.abs(rainPositions[k]) > size / 2 ||
        Math.abs(rainPositions[k + 2]) > size / 2
      ) {
        rainPositions[k] = Math.random() * size - size / 2;
        rainPositions[k + 1] = 17 + Math.random() * 5;
        rainPositions[k + 2] = Math.random() * size - size / 2;
      }
      rainPositions[k + 3] = rainPositions[k] - wx * 0.025;
      rainPositions[k + 4] = rainPositions[k + 1] + 0.45;
      rainPositions[k + 5] = rainPositions[k + 2] - wz * 0.025;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  return {
    render(dt = 0, inputDt = dt) {
      if (disposed) return;
      if (world.time < lastWorldTime) {
        smokeAge.fill(100);
        smokeAlpha.fill(0);
        emitCredit = 0;
        strokePoint = null;
        activeStroke = false;
      }
      lastWorldTime = world.time;
      frame++;
      resize();
      lighting();
      if (activeStroke && strokePoint && pointers.size === 1) {
        brushCredit += Math.min(inputDt, 0.1);
        while (brushCredit >= 0.1) {
          world.brush(tool, strokePoint.x, strokePoint.z, radius, 0.35);
          brushCredit -= 0.1;
        }
      }
      updateFields();
      waterUniforms.uTime.value = world.time;
      fireUniforms.uTime.value = world.time;
      atmosphericParticles(dt);
      dressing.update(world.time, world.settings, thermal);
      controls.update();
      renderer.render(scene, camera);
    },
    setMode(next) {
      mode = next;
      camera = mode === '2d' ? ortho : perspective;
      controls.object = camera;
      configureGestures();
      if (mode === '2d') {
        ortho.position.set(0, 70, 0.001);
        controls.target.set(0, 1, 0);
        ortho.zoom = 1;
        ortho.updateProjectionMatrix();
      } else {
        controls.target.set(0, 1.5, 0);
      }
      smokeMaterial.uniforms.uOrtho.value = mode === '2d' ? 1 : 0;
      lastWidth = 0;
      resize();
      controls.update();
    },
    setTool(next, nextRadius = radius) {
      tool = next;
      radius = nextRadius;
      cursor.visible = false;
      activeStroke = false;
      strokePoint = null;
      configureGestures();
    },
    setThermal(value) {
      thermal = value;
      waterUniforms.uThermal.value = value ? 1 : 0;
      waterMaterial.transmission = value ? 0 : 0.32;
      waterMaterial.opacity = value ? 1 : 0.88;
      waterMaterial.needsUpdate = true;
    },
    resetCamera() {
      perspective.position.set(32, 29, 37);
      ortho.position.set(0, 70, 0.001);
      ortho.zoom = 1;
      ortho.updateProjectionMatrix();
      controls.target.set(0, 1.5, 0);
      controls.update();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('pointerdown', pointerDown, true);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerUp);
      canvas.removeEventListener('webglcontextlost', lostContext);
      controls.dispose();
      dressing.dispose();
      const geometries = new Set(),
        materials = new Set();
      scene.traverse((obj) => {
        if (obj.geometry) geometries.add(obj.geometry);
        if (obj.material)
          for (const m of Array.isArray(obj.material)
            ? obj.material
            : [obj.material])
            materials.add(m);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      environmentTarget?.dispose();
      pmrem.dispose();
      sun.shadow.dispose();
      fireLights.forEach((light) => light.shadow.dispose());
      renderer.dispose();
    },
  };
}
