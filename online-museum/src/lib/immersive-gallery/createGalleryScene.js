import { artworkSize, galleryLength, GALLERY_SPACE, placementFor } from "./layout";
import { createGalleryPrimitives } from "./primitives";

export async function createGalleryScene(options) {
  const { THREE, canvas, viewport, route, zones, assetUrl, itemImageUrl, getViewState } = options;
  const renderer = createRenderer(THREE, canvas);
  if (!renderer) throw new Error("WebGL is not available");

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xf1e4cf, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  THREE.RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf1e4cf, 30, 82);
  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  const environmentTexture = environmentGenerator.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  environmentGenerator.dispose();
  scene.environment = environmentTexture;
  scene.environmentIntensity = 0.38;

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 110);
  const cameraPosition = new THREE.Vector3(0, 1.7, 8);
  const cameraTarget = new THREE.Vector3(0, 1.8, 0);
  camera.position.copy(cameraPosition);

  const textureLoader = new THREE.TextureLoader();
  const primitives = createGalleryPrimitives({ THREE, scene, textureLoader, assetUrl });
  const routeGroup = new THREE.Group();
  const placements = new Map();
  const artworkMeshes = new Map();
  const artworkMaterials = new Map();
  const interactives = [];
  const textureCache = new Map();
  const texturePromises = new Map();
  let animationFrame = 0;
  let resizeObserver;
  const startedAt = performance.now();

  buildLighting({ THREE, scene, route });
  buildArchitecture({ THREE, scene, route, zones, primitives });
  scene.add(routeGroup);
  route.forEach((item, index) => addExhibit(item, index));
  resize();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(viewport);
  warmTextures(0);
  await Promise.race([
    Promise.all([ensureTexture(0), ensureTexture(routeIndex(1))]),
    new Promise((resolve) => window.setTimeout(resolve, 1800)),
  ]);
  animate();

  function addExhibit(item, index) {
    const placement = placementFor(item, index, zones);
    const { width, height } = artworkSize(item);
    placements.set(index, placement);
    if (placement.localIndex === 0) addGroupSign(item, placement);
    if (placement.side === "case") addDisplayCase(placement);
    if (placement.side === "plinth") addPlinth(placement);

    const placeholder = primitives.artworkPlaceholder(item, width, height);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: placeholder,
      emissive: 0xffffff,
      emissiveMap: placeholder,
      emissiveIntensity: 0.32,
      roughness: 0.94,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    artworkMaterials.set(index, material);
    const artwork = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    artwork.position.set(placement.x, placement.y, placement.z);
    artwork.rotation.y = placement.rotationY;
    artwork.userData.routeIndex = index;
    artwork.receiveShadow = true;
    if (placement.side === "case") {
      artwork.rotation.x = -Math.PI / 2;
      artwork.position.y = 1.02;
    } else if (placement.side === "plinth") {
      artwork.position.y = 1.84;
      artwork.rotation.y = placement.x < 0 ? Math.PI / 9 : -Math.PI / 9;
    }
    artworkMeshes.set(index, artwork);

    const frame = primitives.frame(width, height);
    frame.position.copy(artwork.position);
    frame.rotation.copy(artwork.rotation);
    frame.userData.routeIndex = index;
    frame.traverse((object) => {
      object.castShadow = true;
      object.receiveShadow = true;
    });
    routeGroup.add(frame, artwork);
    interactives.push(frame, artwork);

    const label = primitives.labelPlane(item.galleryShortTitle, `${item.collector} / ${item.category}`, {
      width: Math.max(1.42, width * 0.94),
      height: 0.42,
      accent: item.galleryAccent,
    });
    label.position.set(placement.x, placement.y - height / 2 - 0.52, placement.z);
    label.rotation.y = placement.rotationY;
    if (placement.side === "case" || placement.side === "plinth") {
      label.position.set(placement.x, 0.74, placement.z + 0.72);
      label.rotation.y = 0;
    }
    routeGroup.add(label);
  }

  function addGroupSign(item, placement) {
    const dark = item.galleryLayout === "dark-wall";
    const sign = primitives.labelPlane(item.galleryZoneTitle, item.gallerySubtitle, {
      width: 2.6,
      height: 0.92,
      background: dark ? "rgba(20,20,19,0.92)" : "rgba(247,240,226,0.92)",
      foreground: dark ? "#fff4df" : "#2a2721",
      muted: dark ? "rgba(255,244,223,0.72)" : "#766a58",
      accent: item.galleryAccent,
    });
    const right = placement.side === "right";
    sign.position.set(right ? GALLERY_SPACE.artworkX : -GALLERY_SPACE.artworkX, 3.82, placement.z + 1.25);
    sign.rotation.y = right ? -Math.PI / 2 : Math.PI / 2;
    routeGroup.add(sign);
  }

  function addDisplayCase(placement) {
    const base = primitives.museumMaterial({ texturePath: "textures/walnut-charcoal-slats.png", base: "#8f6130", repeat: [1.2, 0.8], roughness: 0.54 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xe6f4f2, transparent: true, opacity: 0.12, roughness: 0.04, transmission: 0.5, depthWrite: false });
    primitives.addBox("case-base", [2.36, 0.74, 1.52], [placement.x, 0.38, placement.z], base, { parent: routeGroup });
    primitives.addBox("case-glass", [2.42, 0.36, 1.56], [placement.x, 0.96, placement.z], glass, { parent: routeGroup, castShadow: false, receiveShadow: false });
  }

  function addPlinth(placement) {
    const material = new THREE.MeshLambertMaterial({ color: 0xcac0ad });
    primitives.addBox("plinth", [1.16, 1.12, 1.16], [placement.x, 0.56, placement.z], material, { parent: routeGroup });
  }

  function ensureTexture(index) {
    const item = route[index];
    if (!item) return Promise.resolve(null);
    const src = itemImageUrl(item);
    if (textureCache.has(src)) {
      applyTexture(index, textureCache.get(src));
      return Promise.resolve(textureCache.get(src));
    }
    if (texturePromises.has(src)) return texturePromises.get(src);
    const promise = new Promise((resolve) => {
      textureLoader.load(src, (texture) => {
        const configured = primitives.configureTexture(texture);
        textureCache.set(src, configured);
        texturePromises.delete(src);
        route.forEach((entry, routeItemIndex) => {
          if (itemImageUrl(entry) === src) applyTexture(routeItemIndex, configured);
        });
        resolve(configured);
      }, undefined, () => {
        texturePromises.delete(src);
        resolve(null);
      });
    });
    texturePromises.set(src, promise);
    return promise;
  }

  function applyTexture(index, texture) {
    const material = artworkMaterials.get(index);
    if (!material) return;
    material.map = texture;
    material.emissiveMap = texture;
    material.needsUpdate = true;
  }

  function routeIndex(index) {
    return route.length ? (index + route.length) % route.length : 0;
  }

  function warmTextures(center) {
    [-1, 0, 1, 2].forEach((offset) => ensureTexture(routeIndex(center + offset)));
  }

  function resize() {
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(420, Math.round(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function targetPose(activeIndex, viewerMode) {
    const placement = placements.get(activeIndex);
    if (!placement) return { position: new THREE.Vector3(0, 1.7, 8), target: new THREE.Vector3(0, 1.8, 0) };
    if (viewerMode === "hallway" && activeIndex === 0) {
      return { position: new THREE.Vector3(0.82, 2.28, 5.45), target: new THREE.Vector3(-0.62, 1.22, -13.4) };
    }
    const close = viewerMode === "close";
    const wall = placement.side === "left" || placement.side === "right";
    const position = new THREE.Vector3(0, 1.72, placement.z + (close && wall ? 1.02 : close ? 0.62 : 2.65));
    if (placement.side === "left" || placement.side === "right") {
      const direction = placement.side === "left" ? 1 : -1;
      position.x = close ? placement.x + direction * 2.1 : direction * -0.22;
      if (close) position.set(position.x, placement.y, placement.z);
    } else if (placement.side === "case") {
      position.set(close ? placement.x : placement.x * 0.16, close ? 3.18 : 1.72, placement.z + (close ? 0 : 2.8));
    } else if (placement.side === "plinth") {
      position.set(close ? placement.x : placement.x * 0.18, close ? placement.y : 1.72, placement.z + (close ? 1.08 : 2.8));
    }
    const target = new THREE.Vector3(placement.x, placement.y, placement.z);
    if (placement.side === "case") target.set(close ? placement.x : placement.x * 0.72, close ? 1.02 : 0.96, placement.z);
    if (placement.side === "plinth") target.y = 1.52;
    if (!close && wall) {
      target.x = placement.x * 0.58;
      target.y = placement.y - 0.18;
    }
    return { position, target };
  }

  function animate() {
    const state = getViewState();
    const placement = placements.get(state.activeIndex);
    const pose = targetPose(state.activeIndex, state.viewerMode);
    const topDownCase = state.viewerMode === "close" && placement?.side === "case";
    const orbitYaw = state.orbitView ? Math.sin((performance.now() - startedAt) / 1000 * 0.55) * 0.28 : 0;
    const target = pose.target.clone();
    if (!topDownCase) {
      target.x += Math.sin(state.lookOffset.yaw + orbitYaw) * 2.25;
      target.y += state.lookOffset.pitch;
    }
    const close = state.viewerMode === "close";
    cameraPosition.lerp(pose.position, close ? 0.18 : 0.075);
    cameraTarget.lerp(target, close ? 0.2 : 0.09);
    camera.position.copy(cameraPosition);
    camera.up.set(0, topDownCase ? 0 : 1, topDownCase ? -1 : 0);
    const targetZoom = topDownCase ? 2.15 : close ? 1.08 : 1;
    camera.zoom += (targetZoom - camera.zoom) * 0.16;
    camera.updateProjectionMatrix();
    camera.lookAt(cameraTarget);
    interactives.forEach((object) => {
      const scale = object.userData.routeIndex === state.activeIndex ? 1.08 : 1;
      object.scale.x += (scale - object.scale.x) * 0.1;
      object.scale.y += (scale - object.scale.y) * 0.1;
    });
    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(animate);
  }

  function getActiveArtworkProjection() {
    const { activeIndex, viewerMode } = getViewState();
    const placement = placements.get(activeIndex);
    const artwork = artworkMeshes.get(activeIndex);
    if (!placement || !artwork) return { ready: false, reason: "gallery scene is not ready" };
    artwork.updateWorldMatrix(true, false);
    artwork.geometry.computeBoundingBox();
    const box = artwork.geometry.boundingBox;
    const rect = viewport.getBoundingClientRect();
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, 0),
      new THREE.Vector3(box.max.x, box.min.y, 0),
      new THREE.Vector3(box.max.x, box.max.y, 0),
      new THREE.Vector3(box.min.x, box.max.y, 0),
    ];
    const points = corners.map((corner) => {
      const projected = corner.applyMatrix4(artwork.matrixWorld).project(camera);
      return { x: (projected.x * 0.5 + 0.5) * rect.width, y: (-projected.y * 0.5 + 0.5) * rect.height };
    });
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const bounds = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
    bounds.width = bounds.right - bounds.left;
    bounds.height = bounds.bottom - bounds.top;
    return {
      ready: true,
      index: activeIndex,
      itemId: route[activeIndex]?.id,
      itemTitle: route[activeIndex]?.galleryShortTitle,
      mode: viewerMode,
      side: placement.side,
      expectedAspect: (box.max.x - box.min.x) / Math.max(0.001, box.max.y - box.min.y),
      projectedAspect: bounds.width / Math.max(0.001, bounds.height),
      rect: bounds,
      points,
      canvas: { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height },
    };
  }

  function dispose() {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
    texturePromises.clear();
    textureCache.forEach((texture) => texture.dispose());
    textureCache.clear();
    scene.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
    primitives.dispose();
    environmentTexture.dispose();
    renderer.dispose();
  }

  return { dispose, getActiveArtworkProjection, warmTextures };
}

function createRenderer(THREE, canvas) {
  const attributes = { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" };
  const context = canvas.getContext("webgl2", attributes) || canvas.getContext("webgl", attributes) || canvas.getContext("experimental-webgl", attributes);
  return context ? new THREE.WebGLRenderer({ canvas, context, ...attributes }) : null;
}

function buildLighting({ THREE, scene, route }) {
  const length = galleryLength(route);
  scene.add(new THREE.AmbientLight(0xffead5, 0.1));
  scene.add(new THREE.HemisphereLight(0xfff4df, 0x7a6049, 0.4));
  const sun = new THREE.DirectionalLight(0xffdfae, 3.35);
  sun.position.set(-4.8, 10.8, 7.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -8;
  scene.add(sun);
  for (let z = -3.2; z > -length + 10; z -= 10.8) {
    const light = new THREE.RectAreaLight(0xfff0cd, 2.4, 4.8, 5.8);
    light.position.set(0, GALLERY_SPACE.ceilingY - 0.28, z);
    light.rotation.x = -Math.PI / 2;
    scene.add(light);
  }
}

function buildArchitecture({ THREE, scene, route, zones, primitives }) {
  const length = galleryLength(route);
  const centerZ = -length / 2 + 5;
  const stone = primitives.museumMaterial({ texturePath: "textures/warm-limestone-wall.png", base: "#d5c8b4", repeat: [4.2, 12.6], roughness: 0.86 });
  const dark = primitives.museumMaterial({ texturePath: "textures/walnut-charcoal-slats.png", base: "#493626", repeat: [1.8, 3.8], roughness: 0.64 });
  const floorMap = primitives.museumMaterial({ texturePath: "textures/polished-travertine-floor.png", base: "#d4c5ad", repeat: [5.6, 20], roughness: 0.34 });
  primitives.addBox("floor", [GALLERY_SPACE.floorWidth, 0.08, length], [0, -0.05, centerZ], floorMap, { castShadow: false, receiveShadow: true });
  primitives.addBox("left-wall", [0.24, GALLERY_SPACE.wallHeight, length], [-GALLERY_SPACE.wallX, GALLERY_SPACE.wallCenterY, centerZ], stone, { castShadow: false });
  primitives.addBox("right-wall", [0.24, GALLERY_SPACE.wallHeight, length], [GALLERY_SPACE.wallX, GALLERY_SPACE.wallCenterY, centerZ], stone, { castShadow: false });
  primitives.addBox("end-wall", [GALLERY_SPACE.floorWidth, GALLERY_SPACE.wallHeight, 0.2], [0, GALLERY_SPACE.wallCenterY, -length + 5], stone, { castShadow: false });
  const darkZone = zones.find((zone) => zone.layout === "dark-wall");
  const darkStart = darkZone?.exhibits[0]?.routeIndex ?? Math.floor(route.length * 0.65);
  primitives.addBox("dark-wall", [0.25, 4.82, Math.max(11, (darkZone?.exhibits.length || 4) * 3.1)], [GALLERY_SPACE.wallX - 0.04, 2.42, -darkStart * 2.65 - 6], dark);
  const ceiling = new THREE.MeshStandardMaterial({ color: 0xe8dccb, roughness: 0.72, emissive: 0x715f46, emissiveIntensity: 0.18 });
  primitives.addBox("ceiling-left", [4.64, 0.16, length], [-4.4, GALLERY_SPACE.ceilingY, centerZ], ceiling, { castShadow: false });
  primitives.addBox("ceiling-right", [4.64, 0.16, length], [4.4, GALLERY_SPACE.ceilingY, centerZ], ceiling, { castShadow: false });
  const pathMaterial = new THREE.MeshBasicMaterial({ color: 0xb98a36, transparent: true, opacity: 0.62 });
  route.forEach((item, index) => {
    const placement = placementFor(item, index, zones);
    const x = placement.side === "left" ? -0.62 : placement.side === "right" ? 0.62 : 0;
    primitives.addBox("route-dot", [0.34, 0.014, 0.34], [x, 0.018, placement.z + 1.1], pathMaterial, { castShadow: false, receiveShadow: false });
  });
}
