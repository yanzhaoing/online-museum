/**
 * Hero「藏品星河」：漂浮的藏品卡片场 + 金色尘埃。
 * 指针驱动相机视差，靠近指针的卡片被柔推开；滚出视口可 pause()。
 */
export function createHeroField({ THREE, canvas, viewport, items, imageUrl, count = 90 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c0e0b, 0.048);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 90);
  camera.position.set(0, 0.2, 15);

  scene.add(new THREE.AmbientLight(0xffe9c4, 0.55));
  const key = new THREE.DirectionalLight(0xffd9a0, 1.35);
  key.position.set(4, 6, 8);
  scene.add(key);
  const rim = new THREE.PointLight(0xb98a36, 26, 34);
  rim.position.set(-7, -3, 4);
  scene.add(rim);

  const group = new THREE.Group();
  scene.add(group);

  let disposed = false;
  let animationFrame = 0;
  let running = true;
  const pointer = { x: 0, y: 0 };
  const textureCache = new Map();

  // 金色尘埃层
  const dustCount = 260;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    dustPositions[i * 3] = (seeded(i, 3) - 0.5) * 26;
    dustPositions[i * 3 + 1] = (seeded(i, 5) - 0.5) * 13;
    dustPositions[i * 3 + 2] = (seeded(i, 7) - 0.5) * 18;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({
    color: 0xd7a851,
    size: 0.06,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  // 藏品卡片
  const textureLoader = new THREE.TextureLoader();
  const cards = [];
  const planeWidth = 1.72;
  const planeHeight = 1.2;
  const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
  const total = Math.max(1, Math.min(count, 140));

  for (let index = 0; index < total; index += 1) {
    const item = items[index % items.length];
    const material = new THREE.MeshStandardMaterial({
      color: 0x2c2a22,
      roughness: 0.86,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const column = index % 9;
    const baseX = (column - 4) * 2.55 + (seeded(index, 11) - 0.5) * 1.5;
    const baseY = (seeded(index, 13) - 0.5) * 8.6;
    const baseZ = -12.5 + seeded(index, 17) * 14.5;
    mesh.position.set(baseX, baseY, baseZ);
    mesh.rotation.y = (seeded(index, 19) - 0.5) * 0.5;
    group.add(mesh);

    const card = {
      mesh,
      material,
      src: imageUrl(item),
      phase: seeded(index, 23) * Math.PI * 2,
      amp: 0.22 + seeded(index, 29) * 0.42,
      speed: 0.32 + seeded(index, 31) * 0.4,
      baseX,
      baseY,
      push: { x: 0, y: 0 },
    };
    cards.push(card);
    loadTexture(card);
  }

  function loadTexture(card) {
    const { src } = card;
    if (textureCache.has(src)) {
      const cached = textureCache.get(src);
      if (cached) applyMap(card, cached);
      return;
    }
    textureCache.set(src, null);
    textureLoader.load(src, (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      textureCache.set(src, texture);
      cards.forEach((entry) => {
        if (entry.src === src) applyMap(entry, texture);
      });
    }, undefined, () => {
      textureCache.delete(src);
    });
  }

  function applyMap(card, texture) {
    const image = texture.image;
    const imageAspect = image && image.width && image.height ? image.width / image.height : 1.43;
    const planeAspect = planeWidth / planeHeight;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    if (imageAspect > planeAspect) {
      texture.repeat.set(planeAspect / imageAspect, 1);
      texture.offset.set((1 - planeAspect / imageAspect) / 2, 0);
    } else {
      texture.repeat.set(1, imageAspect / planeAspect);
      texture.offset.set(0, (1 - imageAspect / planeAspect) / 2);
    }
    card.material.map = texture;
    card.material.color.set(0xffffff);
    card.material.needsUpdate = true;
  }

  function resize() {
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(320, Math.round(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(viewport);
  resize();

  const startedAt = performance.now();
  function animate() {
    animationFrame = 0;
    if (disposed || !running) return;
    const t = (performance.now() - startedAt) / 1000;
    group.rotation.y = Math.sin(t * 0.05) * 0.07;
    group.position.y = Math.sin(t * 0.09) * 0.35;
    dust.rotation.y = t * 0.018;

    camera.position.x += (pointer.x * 1.7 - camera.position.x) * 0.035;
    camera.position.y += (0.2 - pointer.y * 1.15 - camera.position.y) * 0.035;
    camera.lookAt(0, 0, -3);

    const pointerWorldX = pointer.x * 9.5;
    const pointerWorldY = pointer.y * 5;
    for (const card of cards) {
      const { mesh } = card;
      const floatY = Math.sin(t * card.speed + card.phase) * card.amp;
      const dx = mesh.position.x - pointerWorldX;
      const dy = mesh.position.y - pointerWorldY;
      const distance = Math.hypot(dx, dy);
      const reach = 2.7;
      const targetPushX = distance < reach && distance > 0.001 ? (dx / distance) * (reach - distance) * 0.55 : 0;
      const targetPushY = distance < reach && distance > 0.001 ? (dy / distance) * (reach - distance) * 0.55 : 0;
      card.push.x += (targetPushX - card.push.x) * 0.08;
      card.push.y += (targetPushY - card.push.y) * 0.08;
      mesh.position.x = card.baseX + card.push.x;
      mesh.position.y = card.baseY + floatY + card.push.y;
      mesh.rotation.z = Math.sin(t * 0.28 + card.phase) * 0.03;
    }
    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(animate);
  }

  function kick() {
    if (!animationFrame && running && !disposed) animationFrame = window.requestAnimationFrame(animate);
  }

  function pause() {
    running = false;
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function resume() {
    if (disposed || running) return;
    running = true;
    kick();
  }

  function setPointer(x, y) {
    pointer.x = Math.max(-1, Math.min(1, x));
    pointer.y = Math.max(-1, Math.min(1, y));
  }

  function dispose() {
    disposed = true;
    pause();
    resizeObserver.disconnect();
    textureCache.forEach((texture) => texture?.dispose?.());
    textureCache.clear();
    scene.traverse((object) => {
      if (object === dust || cards.some((card) => card.mesh === object)) return;
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
    cards.forEach((card) => card.material.dispose());
    dustGeometry.dispose();
    dustMaterial.dispose();
    geometry.dispose();
    renderer.dispose();
  }

  kick();
  return { pause, resume, setPointer, dispose };
}

/** 确定性伪随机（同一 index/salt 恒定），避免每次载入布局跳动。 */
function seeded(index, salt) {
  let value = (index + 1) * (salt + 3) * 2654435761;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
