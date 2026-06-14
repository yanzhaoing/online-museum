<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { displayTitle, fileUrl, previewPath } from "../lib/catalog";

const { virtualGallery, openDetail, showToast } = useMuseumContext();

const sectionRef = ref(null);
const canvasRef = ref(null);
const viewportRef = ref(null);
const activeIndex = ref(0);
const autoTour = ref(false);
const orbitView = ref(false);
const routeMapOpen = ref(false);
const viewerMode = ref("hallway");
const canvasReady = ref(false);
const sceneLoading = ref(false);
const sceneLoadLabel = ref("进入展馆时加载 3D 游览");
const sceneLoadProgress = ref(6);
const webglFailed = ref(false);
const sceneStatus = ref("拖动屏幕环顾展厅，使用底部控件沿默认游线移动。");
const galleryQaEnabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("qa");

const route = computed(() => virtualGallery.route);
const zones = computed(() => virtualGallery.zones.filter((zone) => zone.exhibits.length));
const activeItem = computed(() => route.value[activeIndex.value]);
const previousPreviewItem = computed(() => route.value[(activeIndex.value - 1 + route.value.length) % Math.max(1, route.value.length)]);
const activeZone = computed(() => zones.value.find((zone) => zone.category === activeItem.value?.galleryZone));
const activeProgress = computed(() => Math.round((activeIndex.value + 1) / Math.max(1, route.value.length) * 100));
const activeZoneIndex = computed(() => Math.max(0, zones.value.findIndex((zone) => zone.category === activeItem.value?.galleryZone)));
// Floor-plan contract: changing virtual room geometry requires updating placementFor,
// this floor plan, tour control behavior, visual QA, and decision-log.jsonl together.
const floorPlanStops = computed(() => route.value.map((item, index) => {
  const placement = placementFor(item, index);
  return {
    index,
    x: floorPlanX(placement),
    y: floorPlanY(index),
    side: placement.side,
    title: item.galleryShortTitle,
    zone: item.galleryZoneTitle,
  };
}));
const floorPlanPathPoints = computed(() => floorPlanStops.value.map((stop) => `${stop.x},${stop.y}`).join(" "));
const activeFloorStop = computed(() => floorPlanStops.value[activeIndex.value]);
const floorPlanZoneBands = computed(() => zones.value.map((zone) => {
  const startIndex = route.value.findIndex((item) => item.galleryZone === zone.category);
  const endIndex = startIndex + zone.exhibits.length - 1;
  return {
    category: zone.category,
    label: String(zone.index + 1).padStart(2, "0"),
    title: zone.title,
    y: floorPlanY(startIndex) - 8,
    height: Math.max(18, floorPlanY(endIndex) - floorPlanY(startIndex) + 16),
  };
}));
const activeZonePlan = computed(() => {
  if (!activeZone.value) return "默认展线从入口进入，沿固定顺序参观。";
  if (activeZone.value.layout === "paper-wall" || activeZone.value.layout === "archive-wall") {
    const leftCount = wallLeftCount(activeZone.value);
    const rightCount = activeZone.value.exhibits.length - leftCount;
    return `本区先看左墙 ${leftCount} 件，再转右墙 ${rightCount} 件。`;
  }
  if (activeZone.value.layout === "dark-wall") return "本区沿右侧深色墙面顺行。";
  if (activeZone.value.layout === "case") return "本区沿中央展柜顺行，展柜内放徽章、印章、奖章等小件，靠近时从上方向下看。";
  if (activeZone.value.layout === "plinth") return "本区沿中央台座顺行，靠近时以略俯视角查看器物轮廓。";
  return "本区沿默认展线顺行。";
});

let renderer;
let scene;
let camera;
let animationFrame = 0;
let resizeObserver;
let autoTimer = 0;
let textureLoader;
let routeGroup;
let startTime = 0;
let THREE;
let threeModulePromise;
let sceneObserver;
let sceneStarted = false;
let isDisposed = false;
let cameraPosition;
let cameraLookTarget;

const interactives = [];
const textureCache = new Map();
const texturePromises = new Map();
const placeholderTextureCache = new Map();
const artworkMaterials = new Map();
const artworkMeshes = new Map();
const materialTextureCache = new Map();
const placements = new Map();
const dragState = { active: false, x: 0, y: 0, moved: 0 };
const lookOffset = { yaw: 0, pitch: 0 };
const MIN_GALLERY_LOADER_MS = 650;
const qaToken = Symbol("museum-gallery-qa");
const GALLERY_SPACE = {
  floorWidth: 13.8,
  halfWidth: 6.9,
  wallX: 6.74,
  artworkX: 6.46,
  wallHeight: 5.72,
  wallCenterY: 2.68,
  ceilingY: 5.24,
};

function galleryLength() {
  return Math.max(72, route.value.length * 2.72 + 18);
}

function exhibitSrc(item) {
  return fileUrl(previewPath(item));
}

function setActive(index, announce = true) {
  if (!route.value.length) return;
  const next = (index + route.value.length) % route.value.length;
  activeIndex.value = next;
  viewerMode.value = "hallway";
  const item = route.value[next];
  sceneStatus.value = `正在观看：${item.galleryShortTitle}。${item.galleryIntro}`;
  warmRouteTextures(next);
  if (announce) showToast(`已移动到：${item.galleryShortTitle}`);
}

function nextStop() {
  stopAutoTour();
  setActive(activeIndex.value + 1);
}

function previousStop() {
  stopAutoTour();
  setActive(activeIndex.value - 1);
}

function continueTour() {
  setActive(activeIndex.value + 1);
}

function toggleAutoTour() {
  if (autoTour.value) {
    stopAutoTour();
    return;
  }
  autoTour.value = true;
  sceneStatus.value = "默认游线自动前进中。";
  autoTimer = window.setInterval(() => setActive(activeIndex.value + 1, false), 4800);
}

function stopAutoTour() {
  autoTour.value = false;
  if (autoTimer) window.clearInterval(autoTimer);
  autoTimer = 0;
}

function toggleOrbit() {
  orbitView.value = !orbitView.value;
  sceneStatus.value = orbitView.value ? "环视模式已开启，画面会围绕当前展品轻微移动。" : "环视模式已关闭。";
}

function approachActiveExhibit() {
  stopAutoTour();
  if (!activeItem.value) return;
  viewerMode.value = "close";
  orbitView.value = false;
  lookOffset.yaw = 0;
  lookOffset.pitch = 0;
  sceneStatus.value = `已靠近展品：${activeItem.value.galleryShortTitle}`;
}

function returnToHallway() {
  stopAutoTour();
  viewerMode.value = "hallway";
  lookOffset.yaw = 0;
  lookOffset.pitch = 0;
  sceneStatus.value = activeItem.value ? `已回到走廊，可继续选择展品：${activeItem.value.galleryShortTitle}` : "已回到走廊。";
}

function goToZone(category) {
  stopAutoTour();
  const index = route.value.findIndex((item) => item.galleryZone === category);
  if (index >= 0) setActive(index);
  routeMapOpen.value = false;
}

function resetView() {
  lookOffset.yaw = 0;
  lookOffset.pitch = 0;
  orbitView.value = false;
  viewerMode.value = "hallway";
  sceneStatus.value = "视角已回到默认游线方向。";
}

function openActiveDetail() {
  if (activeItem.value) openDetail(activeItem.value.id);
}

function onViewportPointerDown(event) {
  dragState.active = true;
  dragState.x = event.clientX;
  dragState.y = event.clientY;
  dragState.moved = 0;
  viewportRef.value?.setPointerCapture?.(event.pointerId);
}

function onViewportPointerMove(event) {
  if (!dragState.active) return;
  const dx = event.clientX - dragState.x;
  const dy = event.clientY - dragState.y;
  dragState.x = event.clientX;
  dragState.y = event.clientY;
  dragState.moved += Math.abs(dx) + Math.abs(dy);
  lookOffset.yaw = Math.max(-0.62, Math.min(0.62, lookOffset.yaw - dx / 420));
  lookOffset.pitch = Math.max(-0.22, Math.min(0.24, lookOffset.pitch + dy / 760));
}

function onViewportPointerUp(event) {
  if (!dragState.active) return;
  viewportRef.value?.releasePointerCapture?.(event.pointerId);
  dragState.active = false;
}

async function loadThreeModule() {
  if (THREE) return THREE;
  sceneLoadLabel.value = "加载 3D 展馆引擎";
  sceneLoadProgress.value = Math.max(sceneLoadProgress.value, 18);
  if (!threeModulePromise) threeModulePromise = import("../lib/three-gallery");
  THREE = await threeModulePromise;
  return THREE;
}

function scheduleSceneStart() {
  if (sceneStarted || !sectionRef.value) return;
  sceneLoading.value = true;
  sceneLoadLabel.value = "靠近展馆时加载 3D 游览";
  sceneLoadProgress.value = 6;

  if (window.location.hash === "#hall" || !("IntersectionObserver" in window)) {
    initScene();
    return;
  }

  sceneObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      sceneObserver?.disconnect();
      sceneObserver = null;
      initScene();
    },
    { rootMargin: "260px 0px" }
  );
  sceneObserver.observe(sectionRef.value);
}

function activateFallbackGallery() {
  webglFailed.value = true;
  canvasReady.value = true;
  sceneLoading.value = false;
  sceneLoadProgress.value = 100;
  sceneStatus.value = "当前浏览器使用轻量展馆视图，可继续按默认游线参观。";
  nextTick(() => setActive(0, false));
}

function createGalleryRenderer(canvas) {
  const attributes = {
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  };
  const context =
    canvas.getContext("webgl2", attributes) ||
    canvas.getContext("webgl", attributes) ||
    canvas.getContext("experimental-webgl", attributes);
  if (!context) return null;

  return new THREE.WebGLRenderer({
    canvas,
    context,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
}

async function initScene() {
  if (sceneStarted || !canvasRef.value || !viewportRef.value || !route.value.length) return;
  sceneStarted = true;
  const loadingStartedAt = performance.now();
  sceneLoading.value = true;
  sceneLoadLabel.value = "准备展馆空间";
  sceneLoadProgress.value = Math.max(sceneLoadProgress.value, 12);

  try {
    await loadThreeModule();
  } catch (error) {
    activateFallbackGallery();
    return;
  }
  if (isDisposed) return;

  cameraPosition = new THREE.Vector3(0, 1.7, 8);
  cameraLookTarget = new THREE.Vector3(0, 1.8, 0);
  sceneLoadLabel.value = "搭建展墙、天窗与游线";
  sceneLoadProgress.value = 38;

  try {
    renderer = createGalleryRenderer(canvasRef.value);
  } catch (error) {
    activateFallbackGallery();
    return;
  }
  if (!renderer) {
    activateFallbackGallery();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xf1e4cf, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.36;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf1e4cf, 30, 82);

  camera = new THREE.PerspectiveCamera(58, 1, 0.1, 110);
  camera.position.copy(cameraPosition);

  textureLoader = new THREE.TextureLoader();
  startTime = performance.now();

  buildLighting();
  buildArchitecture();
  buildExhibits();
  resizeRenderer();
  sceneLoadLabel.value = "加载首件展品影像";
  sceneLoadProgress.value = 74;
  await prepareInitialTextures();
  await waitForMinimumLoader(loadingStartedAt);
  if (isDisposed) return;

  resizeObserver = new ResizeObserver(resizeRenderer);
  resizeObserver.observe(viewportRef.value);
  animate();
  canvasReady.value = true;
  sceneLoading.value = false;
  sceneLoadProgress.value = 100;
  nextTick(() => setActive(0, false));
}

function waitForMinimumLoader(startedAt) {
  const remaining = MIN_GALLERY_LOADER_MS - (performance.now() - startedAt);
  if (remaining <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, remaining));
}

function makeMuseumMaterial(options) {
  const map = loadMaterialTexture(options.texturePath, options.repeat || [1, 1]);
  return new THREE.MeshStandardMaterial({
    color: options.base || 0xffffff,
    map,
    roughness: options.roughness ?? 0.84,
    metalness: options.metalness ?? 0,
    emissive: options.emissive || 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

function loadMaterialTexture(path, repeat = [1, 1]) {
  if (!path || !textureLoader) return null;
  const cacheKey = `${path}:${repeat.join("x")}`;
  if (materialTextureCache.has(cacheKey)) return materialTextureCache.get(cacheKey);
  const texture = configureTexture(textureLoader.load(fileUrl(path)));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  materialTextureCache.set(cacheKey, texture);
  return texture;
}

function buildLighting() {
  const length = galleryLength();
  scene.add(new THREE.AmbientLight(0xffead5, 0.18));
  scene.add(new THREE.HemisphereLight(0xfff4df, 0x7a6049, 1.18));

  const sun = new THREE.DirectionalLight(0xffdfae, 3.35);
  sun.position.set(-4.8, 10.8, 7.4);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 52;
  sun.shadow.bias = -0.00014;
  scene.add(sun);

  for (let z = -3.2; z > -length + 10; z -= 10.8) {
    const skylight = new THREE.RectAreaLight(0xfff0cd, 4.8, 4.8, 5.8);
    skylight.position.set(0, GALLERY_SPACE.ceilingY - 0.28, z);
    skylight.rotation.x = -Math.PI / 2;
    scene.add(skylight);
  }

  const leftWasher = new THREE.RectAreaLight(0xffddb0, 3.2, 1.55, length - 4);
  leftWasher.position.set(-GALLERY_SPACE.wallX + 0.32, 3.18, -length / 2 + 5);
  leftWasher.rotation.y = Math.PI / 2;
  scene.add(leftWasher);

  const rightWasher = new THREE.RectAreaLight(0xffddb0, 3.2, 1.55, length - 4);
  rightWasher.position.set(GALLERY_SPACE.wallX - 0.32, 3.18, -length / 2 + 5);
  rightWasher.rotation.y = -Math.PI / 2;
  scene.add(rightWasher);

  for (let z = -2.4; z > -length + 8; z -= 6.8) {
    const spot = new THREE.SpotLight(0xffe0ae, 1.45, 13, Math.PI / 8, 0.58, 1.65);
    spot.position.set(2.7, 4.86, z + 1.6);
    spot.target.position.set(0.45, 1.02, z - 0.2);
    scene.add(spot.target);
    scene.add(spot);
  }
}

function buildArchitecture() {
  const length = galleryLength();
  const centerZ = -length / 2 + 5;
  const stone = makeMuseumMaterial({
    texturePath: "textures/warm-limestone-wall.png",
    base: "#d5c8b4",
    repeat: [4.2, 12.6],
    roughness: 0.86,
  });
  const stonePanel = makeMuseumMaterial({
    texturePath: "textures/warm-limestone-wall.png",
    base: "#e0d4c1",
    repeat: [1.6, 3.2],
    roughness: 0.82,
  });
  const stoneDark = makeMuseumMaterial({
    texturePath: "textures/walnut-charcoal-slats.png",
    base: "#493626",
    repeat: [1.8, 3.8],
    roughness: 0.64,
    metalness: 0.02,
  });
  const floorMap = loadMaterialTexture("textures/polished-travertine-floor.png", [5.6, 20]);
  const floorMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd4c5ad,
    map: floorMap,
    roughness: 0.27,
    metalness: 0.02,
    clearcoat: 0.45,
    clearcoatRoughness: 0.32,
  });
  const ceilingMaterial = makeMuseumMaterial({
    texturePath: "textures/warm-limestone-wall.png",
    base: "#e8dccb",
    repeat: [2.2, 8.6],
    roughness: 0.72,
    emissive: "#715f46",
    emissiveIntensity: 0.34,
  });
  const slatFeatureMaterial = makeMuseumMaterial({
    texturePath: "textures/walnut-charcoal-slats.png",
    base: "#4f3322",
    repeat: [2.8, 1.1],
    roughness: 0.56,
    metalness: 0.04,
  });
  const ledgeMaterial = makeMuseumMaterial({
    texturePath: "textures/warm-limestone-wall.png",
    base: "#c7b79c",
    repeat: [1.2, 12],
    roughness: 0.76,
  });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xc8e2e7,
    transparent: true,
    opacity: 0.28,
    roughness: 0.08,
    metalness: 0,
    transmission: 0.22,
  });
  const bronzeLight = new THREE.MeshBasicMaterial({ color: 0xffd59a, transparent: true, opacity: 0.3 });

  addBox("floor", [GALLERY_SPACE.floorWidth, 0.08, length], [0, -0.05, centerZ], floorMaterial, { castShadow: false, receiveShadow: true });
  addBox("left-wall", [0.24, GALLERY_SPACE.wallHeight, length], [-GALLERY_SPACE.wallX, GALLERY_SPACE.wallCenterY, centerZ], stone, { castShadow: false, receiveShadow: true });
  addBox("right-wall", [0.24, GALLERY_SPACE.wallHeight, length], [GALLERY_SPACE.wallX, GALLERY_SPACE.wallCenterY, centerZ], stone, { castShadow: false, receiveShadow: true });
  addBox("dark-rubbing-wall", [0.24, 4.82, 17.4], [GALLERY_SPACE.wallX - 0.04, 2.42, -route.value.length * 1.95], stoneDark, { receiveShadow: true });
  addBox("end-wall", [GALLERY_SPACE.floorWidth, GALLERY_SPACE.wallHeight, 0.2], [0, GALLERY_SPACE.wallCenterY, -length + 5], stone, { castShadow: false, receiveShadow: true });
  addBox("end-slat-feature", [3.9, 3.96, 0.09], [0, 2.48, -length + 5.14], slatFeatureMaterial, { receiveShadow: true });
  addBox("left-stone-ledge", [0.62, 0.48, length - 6], [-GALLERY_SPACE.wallX + 0.48, 0.24, centerZ + 0.2], ledgeMaterial, { receiveShadow: true });
  addBox("right-stone-ledge", [0.62, 0.48, length - 6], [GALLERY_SPACE.wallX - 0.48, 0.24, centerZ + 0.2], ledgeMaterial, { receiveShadow: true });
  addBox("left-wall-washer-glow", [0.04, 0.075, length - 5], [-GALLERY_SPACE.wallX + 0.18, 3.34, centerZ], bronzeLight, { castShadow: false, receiveShadow: false });
  addBox("right-wall-washer-glow", [0.04, 0.075, length - 5], [GALLERY_SPACE.wallX - 0.18, 3.34, centerZ], bronzeLight, { castShadow: false, receiveShadow: false });
  addBox("left-floor-graze", [0.05, 0.05, length - 5], [-GALLERY_SPACE.wallX + 0.54, 0.17, centerZ], bronzeLight, { castShadow: false, receiveShadow: false });
  addBox("right-floor-graze", [0.05, 0.05, length - 5], [GALLERY_SPACE.wallX - 0.54, 0.17, centerZ], bronzeLight, { castShadow: false, receiveShadow: false });
  addBox("ceiling-left", [4.64, 0.16, length], [-4.4, GALLERY_SPACE.ceilingY, centerZ], ceilingMaterial, { castShadow: false, receiveShadow: true });
  addBox("ceiling-right", [4.64, 0.16, length], [4.4, GALLERY_SPACE.ceilingY, centerZ], ceilingMaterial, { castShadow: false, receiveShadow: true });

  addStonePaneling(length, centerZ, stonePanel);
  addSkylightWells(length, glassMaterial, ceilingMaterial);
  addTrackLights(length);
  addFloorInlays(length, centerZ);
  addEntranceDisplayCases(length);

  const pathMaterial = new THREE.MeshBasicMaterial({ color: 0xb98a36, transparent: true, opacity: 0.62 });
  for (let i = 0; i < route.value.length; i += 1) {
    const marker = floorRouteMarker(placementFor(route.value[i], i));
    addBox("route-dot", [0.34, 0.014, 0.34], [marker.x, 0.018, marker.z], pathMaterial, { castShadow: false, receiveShadow: false });
    if (i < route.value.length - 1) {
      const nextMarker = floorRouteMarker(placementFor(route.value[i + 1], i + 1));
      addRouteSegment(marker, nextMarker, pathMaterial);
    }
  }
}

function addStonePaneling(length, centerZ, panelMaterial) {
  const seamMaterial = new THREE.MeshBasicMaterial({ color: 0x7d715f, transparent: true, opacity: 0.2 });
  for (let z = 0.2; z > -length + 8; z -= 4.9) {
    addBox("left-recessed-wall-panel", [0.045, 2.92, 3.82], [-GALLERY_SPACE.artworkX - 0.08, 2.34, z - 2.4], panelMaterial, { castShadow: false, receiveShadow: true });
    addBox("right-recessed-wall-panel", [0.045, 2.92, 3.82], [GALLERY_SPACE.artworkX + 0.08, 2.34, z - 2.4], panelMaterial, { castShadow: false, receiveShadow: true });
    addBox("left-stone-vertical-seam", [0.018, 4.34, 0.018], [-GALLERY_SPACE.artworkX - 0.035, 2.46, z], seamMaterial, { castShadow: false, receiveShadow: false });
    addBox("right-stone-vertical-seam", [0.018, 4.34, 0.018], [GALLERY_SPACE.artworkX + 0.035, 2.46, z], seamMaterial, { castShadow: false, receiveShadow: false });
  }
  [1.32, 3.46].forEach((y) => {
    addBox("left-stone-horizontal-seam", [0.02, 0.018, length - 6], [-GALLERY_SPACE.artworkX - 0.025, y, centerZ], seamMaterial, { castShadow: false, receiveShadow: false });
    addBox("right-stone-horizontal-seam", [0.02, 0.018, length - 6], [GALLERY_SPACE.artworkX + 0.025, y, centerZ], seamMaterial, { castShadow: false, receiveShadow: false });
  });
}

function addSkylightWells(length, glassMaterial, ceilingMaterial) {
  const skyMaterial = new THREE.MeshBasicMaterial({ color: 0xc8e7f3 });
  for (let z = 1.2; z > -length + 9; z -= 9.2) {
    const center = z - 3.2;
    addBox("skylight-sky", [3.92, 0.045, 4.3], [0, GALLERY_SPACE.ceilingY + 0.16, center], skyMaterial, { castShadow: false, receiveShadow: false });
    addBox("skylight-glass", [3.74, 0.035, 4.02], [0, GALLERY_SPACE.ceilingY + 0.08, center], glassMaterial, { castShadow: false, receiveShadow: false });
    addBox("skylight-inner-left", [0.18, 0.5, 4.18], [-2.14, GALLERY_SPACE.ceilingY - 0.2, center], ceilingMaterial, { receiveShadow: true });
    addBox("skylight-inner-right", [0.18, 0.5, 4.18], [2.14, GALLERY_SPACE.ceilingY - 0.2, center], ceilingMaterial, { receiveShadow: true });
    for (let offset = -1.34; offset <= 1.35; offset += 1.34) {
      addBox("skylight-crossbar", [4.18, 0.11, 0.08], [0, GALLERY_SPACE.ceilingY + 0.12, center + offset], ceilingMaterial, { castShadow: true, receiveShadow: true });
    }
  }
}

function addTrackLights(length) {
  const trackMaterial = new THREE.MeshStandardMaterial({ color: 0x16120f, roughness: 0.48, metalness: 0.42 });
  [-2.55, 2.55].forEach((x) => {
    addBox("ceiling-track", [0.08, 0.08, length - 9], [x, GALLERY_SPACE.ceilingY - 0.18, -length / 2 + 4.2], trackMaterial, { castShadow: true, receiveShadow: false });
  });
  for (let z = -1.2; z > -length + 10; z -= 4.2) {
    [-2.55, 2.55].forEach((x, sideIndex) => {
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.26, 16), trackMaterial);
      head.name = "track-light-head";
      head.position.set(x + (sideIndex ? -0.18 : 0.18), GALLERY_SPACE.ceilingY - 0.38, z);
      head.rotation.z = Math.PI / 2;
      head.castShadow = true;
      scene.add(head);
    });
  }
}

function addFloorInlays(length, centerZ) {
  const seamMaterial = new THREE.MeshBasicMaterial({ color: 0x8f7c62, transparent: true, opacity: 0.18 });
  const lightPatchMaterial = new THREE.MeshBasicMaterial({ color: 0xffe3ad, transparent: true, opacity: 0.13, depthWrite: false });
  const softShadowMaterial = new THREE.MeshBasicMaterial({ color: 0x4e3e2f, transparent: true, opacity: 0.13, depthWrite: false });

  for (let x = -4.6; x <= 4.61; x += 2.3) {
    addBox("floor-long-stone-seam", [0.018, 0.012, length - 5.8], [x, 0.012, centerZ], seamMaterial, { castShadow: false, receiveShadow: false });
  }
  for (let z = 2.2; z > -length + 8; z -= 3.2) {
    addBox("floor-cross-stone-seam", [GALLERY_SPACE.floorWidth - 1.6, 0.012, 0.018], [0, 0.013, z], seamMaterial, { castShadow: false, receiveShadow: false });
  }
  for (let z = -3.2; z > -length + 10; z -= 9.2) {
    addFloorPlane("skylight-floor-glow", 3.8, 5.2, -0.52, z - 0.9, lightPatchMaterial, -0.18);
    addFloorPlane("skylight-soft-shadow", 2.9, 4.4, 1.1, z - 1.6, softShadowMaterial, -0.18);
  }
}

function addEntranceDisplayCases(length) {
  const caseItems = route.value.filter((item) => item.galleryLayout !== "dark-wall").slice(0, 4);
  caseItems.forEach((item, index) => {
    const z = -4.2 - index * 5.25;
    if (z < -length + 12) return;
    addAmbientDisplayCase(item, { x: 0, z, index });
  });
}

function addAmbientDisplayCase(item, placement) {
  const baseMaterial = makeMuseumMaterial({
    texturePath: "textures/walnut-charcoal-slats.png",
    base: "#684429",
    repeat: [1.1, 0.72],
    roughness: 0.48,
    metalness: 0.1,
    emissive: "#1f1208",
    emissiveIntensity: 0.14,
  });
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0xd9c9af, roughness: 0.62, metalness: 0 });
  const bronzeMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6236, roughness: 0.38, metalness: 0.38 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xc8e5e7,
    transparent: true,
    opacity: 0.34,
    roughness: 0.03,
    metalness: 0,
    transmission: 0.36,
  });

  addBox("entrance-case-base", [3.12, 0.46, 1.62], [placement.x, 0.28, placement.z], baseMaterial, { castShadow: true, receiveShadow: true });
  addBox("entrance-case-deck", [2.48, 0.05, 1.14], [placement.x, 0.74, placement.z], deckMaterial, { castShadow: true, receiveShadow: true });
  addBox("entrance-case-top-glass", [3.16, 0.035, 1.66], [placement.x, 1.16, placement.z], glassMaterial, { castShadow: true, receiveShadow: false });
  addBox("entrance-case-front-glass", [3.16, 0.42, 0.028], [placement.x, 0.96, placement.z + 0.82], glassMaterial, { castShadow: false, receiveShadow: false });
  addBox("entrance-case-back-glass", [3.16, 0.42, 0.028], [placement.x, 0.96, placement.z - 0.82], glassMaterial, { castShadow: false, receiveShadow: false });
  addBox("entrance-case-left-glass", [0.028, 0.42, 1.66], [placement.x - 1.58, 0.96, placement.z], glassMaterial, { castShadow: false, receiveShadow: false });
  addBox("entrance-case-right-glass", [0.028, 0.42, 1.66], [placement.x + 1.58, 0.96, placement.z], glassMaterial, { castShadow: false, receiveShadow: false });
  [
    [3.26, 0.045, 0.045, placement.x, 1.18, placement.z + 0.86],
    [3.26, 0.045, 0.045, placement.x, 1.18, placement.z - 0.86],
    [0.045, 0.045, 1.76, placement.x - 1.62, 1.18, placement.z],
    [0.045, 0.045, 1.76, placement.x + 1.62, 1.18, placement.z],
  ].forEach(([sx, sy, sz, x, y, z]) => addBox("entrance-case-bronze-rail", [sx, sy, sz], [x, y, z], bronzeMaterial, { castShadow: true, receiveShadow: false }));

  const artwork = makeCaseArtworkPlane(item, 1.68, 0.92);
  artwork.position.set(placement.x, 0.97, placement.z + (placement.index % 2 ? -0.08 : 0.08));
  artwork.rotation.x = -Math.PI / 2;
  artwork.rotation.z = placement.index % 2 ? -0.08 : 0.08;
  artwork.receiveShadow = true;
  scene.add(artwork);
}

function buildExhibits() {
  routeGroup = new THREE.Group();
  scene.add(routeGroup);

  route.value.forEach((item, index) => {
    const placement = placementFor(item, index);
    placements.set(index, placement);
    if (placement.localIndex === 0) addZoneSign(item, placement);
    if (item.galleryLayout === "case") addDisplayCase(placement);
    if (item.galleryLayout === "plinth") addPlinth(placement);
    addArtwork(item, placement, index);
  });
}

function placementFor(item, index) {
  const zone = zones.value.find((entry) => entry.category === item.galleryZone);
  const localIndex = zone?.exhibits.findIndex((entry) => entry.id === item.id) ?? 0;
  const z = exhibitZ(index);
  if (item.galleryLayout === "paper-wall" || item.galleryLayout === "archive-wall") {
    const left = localIndex < wallLeftCount(zone);
    return {
      side: left ? "left" : "right",
      x: left ? -GALLERY_SPACE.artworkX : GALLERY_SPACE.artworkX,
      y: item.galleryLayout === "archive-wall" ? 2.48 : 2.28,
      z,
      rotationY: left ? Math.PI / 2 : -Math.PI / 2,
      localIndex,
    };
  }
  if (item.galleryLayout === "dark-wall") {
    return { side: "right", x: GALLERY_SPACE.artworkX, y: 2.42, z, rotationY: -Math.PI / 2, localIndex };
  }
  if (item.galleryLayout === "case") {
    return { side: "case", x: localIndex % 2 ? 1.6 : -1.6, y: 1.02, z, rotationY: 0, localIndex };
  }
  if (item.galleryLayout === "plinth") {
    return { side: "plinth", x: localIndex % 2 ? 1.95 : -1.95, y: 1.74, z, rotationY: 0, localIndex };
  }
  return { side: "left", x: -5.88, y: 2.28, z, rotationY: Math.PI / 2, localIndex };
}

function exhibitZ(index) {
  return -index * 2.65 - 2.1;
}

function wallLeftCount(zone) {
  return Math.ceil((zone?.exhibits.length || 1) / 2);
}

function floorRouteMarker(placement) {
  const x = hallwayX(placement);
  return { x, z: placement.z + 1.1 };
}

function hallwayX(placement) {
  if (placement.side === "left") return -0.62;
  if (placement.side === "right") return 0.62;
  if (placement.side === "case" || placement.side === "plinth") return 0;
  return 0;
}

function floorPlanY(index) {
  const denominator = Math.max(1, route.value.length - 1);
  return 24 + index / denominator * 272;
}

function floorPlanX(placement) {
  if (placement.side === "left") return 22;
  if (placement.side === "right") return 78;
  if (placement.side === "case" || placement.side === "plinth") return 50;
  return 50;
}

function addArtwork(item, placement, index) {
  const { width, height } = artworkSize(item);
  const textureSrc = exhibitSrc(item);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: makeArtworkPlaceholderTexture(item, width, height),
    side: THREE.DoubleSide,
  });
  material.userData.textureSrc = textureSrc;
  artworkMaterials.set(index, material);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  art.position.set(placement.x, placement.y, placement.z);
  art.rotation.y = placement.rotationY;
  art.userData.routeIndex = index;
  art.castShadow = false;
  art.receiveShadow = true;
  artworkMeshes.set(index, art);

  if (placement.side === "case") {
    art.rotation.x = -Math.PI / 2;
    art.rotation.z = 0;
    art.position.y = 1.02;
  }
  if (placement.side === "plinth") {
    art.position.y = 1.84;
    art.rotation.y = placement.x < 0 ? Math.PI / 9 : -Math.PI / 9;
  }

  const frame = makeFrame(width, height, item.galleryAccent);
  frame.position.copy(art.position);
  frame.rotation.copy(art.rotation);
  frame.userData.routeIndex = index;
  frame.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });

  routeGroup.add(frame);
  routeGroup.add(art);
  interactives.push(art, frame);

  const label = makeLabelPlane(item.galleryShortTitle, `${item.collector} / ${item.category}`, {
    width: Math.max(1.42, width * 0.94),
    height: 0.42,
    background: "rgba(25,23,20,0.82)",
    accent: item.galleryAccent,
  });
  label.position.set(placement.x, placement.y - height / 2 - 0.32, placement.z);
  label.rotation.y = placement.rotationY;
  if (placement.side === "case" || placement.side === "plinth") {
    label.position.set(placement.x, 0.74, placement.z + 0.72);
    label.rotation.y = 0;
  }
  routeGroup.add(label);
}

function artworkSize(item) {
  if (item.galleryLayout === "paper-wall") return { width: 1.72, height: 1.18 };
  if (item.galleryLayout === "archive-wall") return { width: 1.22, height: 1.72 };
  if (item.galleryLayout === "dark-wall") return { width: 1.28, height: 2.06 };
  if (item.galleryLayout === "case") return { width: 1.08, height: 0.78 };
  return { width: 1.44, height: 1.06 };
}

function makeFrame(width, height, accent) {
  const frame = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: hexColor(accent) });
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.18, height + 0.18, 0.045),
    new THREE.MeshLambertMaterial({ color: 0xf5eedf })
  );
  back.position.z = -0.055;
  frame.add(back);
  const top = new THREE.Mesh(new THREE.BoxGeometry(width + 0.24, 0.052, 0.068), mat);
  const bottom = top.clone();
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.052, height + 0.2, 0.068), mat);
  const right = left.clone();
  top.position.y = height / 2 + 0.08;
  bottom.position.y = -height / 2 - 0.08;
  left.position.x = -width / 2 - 0.08;
  right.position.x = width / 2 + 0.08;
  top.position.z = 0.025;
  bottom.position.z = 0.025;
  left.position.z = 0.025;
  right.position.z = 0.025;
  frame.add(top, bottom, left, right);
  return frame;
}

function hexColor(value, fallback = 0xb98a36) {
  const parsed = Number.parseInt(String(value || "").replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function addZoneSign(item, placement) {
  const sign = makeLabelPlane(item.galleryZoneTitle, item.gallerySubtitle, {
    width: 2.6,
    height: 0.92,
    background: item.galleryLayout === "dark-wall" ? "rgba(20,20,19,0.92)" : "rgba(247,240,226,0.92)",
    foreground: item.galleryLayout === "dark-wall" ? "#fff4df" : "#2a2721",
    muted: item.galleryLayout === "dark-wall" ? "rgba(255,244,223,0.72)" : "#766a58",
    accent: item.galleryAccent,
  });
  const wallSide = placement.side === "right" ? "right" : "left";
  sign.position.set(wallSide === "left" ? -GALLERY_SPACE.artworkX : GALLERY_SPACE.artworkX, 3.82, placement.z + 1.25);
  sign.rotation.y = wallSide === "left" ? Math.PI / 2 : -Math.PI / 2;
  routeGroup.add(sign);
}

function addDisplayCase(placement) {
  const baseMaterial = makeMuseumMaterial({
    texturePath: "textures/walnut-charcoal-slats.png",
    base: "#634229",
    repeat: [1.2, 0.8],
    roughness: 0.5,
    metalness: 0.08,
    emissive: "#1c1008",
    emissiveIntensity: 0.12,
  });
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0xd9cbb5, roughness: 0.74, metalness: 0 });
  const bronzeMaterial = new THREE.MeshStandardMaterial({ color: 0x8e6636, roughness: 0.42, metalness: 0.34 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd8f2f3,
    transparent: true,
    opacity: 0.2,
    roughness: 0.02,
    metalness: 0,
    transmission: 0.42,
  });

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.36, 0.4, 1.52),
    baseMaterial
  );
  base.position.set(placement.x, 0.28, placement.z);
  base.castShadow = true;
  base.receiveShadow = true;
  routeGroup.add(base);

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(1.86, 0.045, 1.08),
    deckMaterial
  );
  deck.position.set(placement.x, 0.74, placement.z);
  deck.castShadow = true;
  deck.receiveShadow = true;
  routeGroup.add(deck);

  const topGlass = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.035, 1.56), glassMaterial);
  topGlass.position.set(placement.x, 1.12, placement.z);
  topGlass.castShadow = true;
  topGlass.receiveShadow = false;
  routeGroup.add(topGlass);

  const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.36, 0.028), glassMaterial);
  frontGlass.position.set(placement.x, 0.94, placement.z + 0.78);
  frontGlass.castShadow = false;
  frontGlass.receiveShadow = false;
  routeGroup.add(frontGlass);

  const backGlass = frontGlass.clone();
  backGlass.position.z = placement.z - 0.78;
  routeGroup.add(backGlass);

  const leftGlass = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.36, 1.56), glassMaterial);
  leftGlass.position.set(placement.x - 1.21, 0.94, placement.z);
  leftGlass.castShadow = false;
  leftGlass.receiveShadow = false;
  routeGroup.add(leftGlass);

  const rightGlass = leftGlass.clone();
  rightGlass.position.x = placement.x + 1.21;
  routeGroup.add(rightGlass);

  const railSpecs = [
    { size: [2.5, 0.045, 0.045], position: [placement.x, 1.15, placement.z + 0.82] },
    { size: [2.5, 0.045, 0.045], position: [placement.x, 1.15, placement.z - 0.82] },
    { size: [0.045, 0.045, 1.66], position: [placement.x - 1.25, 1.15, placement.z] },
    { size: [0.045, 0.045, 1.66], position: [placement.x + 1.25, 1.15, placement.z] },
  ];
  railSpecs.forEach((spec) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(...spec.size), bronzeMaterial);
    rail.position.set(...spec.position);
    rail.castShadow = true;
    rail.receiveShadow = false;
    routeGroup.add(rail);
  });
}

function addPlinth(placement) {
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 1.12, 1.16),
    new THREE.MeshLambertMaterial({ color: 0xcac0ad })
  );
  plinth.position.set(placement.x, 0.56, placement.z);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  routeGroup.add(plinth);
}

function makeCaseArtworkPlane(item, width, height) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: makeArtworkPlaceholderTexture(item, width, height),
    side: THREE.DoubleSide,
  });
  const src = exhibitSrc(item);
  textureLoader?.load(
    src,
    (texture) => {
      material.map = configureTexture(texture);
      material.needsUpdate = true;
    },
    undefined,
    () => {}
  );
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

function addFloorPlane(name, width, depth, x, z, material, rotationZ = 0) {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  plane.name = name;
  plane.position.set(x, 0.019, z);
  plane.rotation.x = -Math.PI / 2;
  plane.rotation.z = rotationZ;
  plane.receiveShadow = false;
  scene.add(plane);
  return plane;
}

function addBox(name, size, position, material, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  (options.parent || scene).add(mesh);
  return mesh;
}

function addRouteSegment(from, to, material) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, length), material);
  mesh.name = "route-line";
  mesh.position.set((from.x + to.x) / 2, 0.014, (from.z + to.z) / 2);
  mesh.rotation.y = Math.atan2(dx, dz);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
  return mesh;
}

function configureTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

function applyArtworkTexture(src, texture) {
  artworkMaterials.forEach((material) => {
    if (material.userData.textureSrc !== src) return;
    material.map = texture;
    material.needsUpdate = true;
  });
}

function ensureArtworkTexture(index) {
  if (!textureLoader) return Promise.resolve(null);
  const item = route.value[index];
  if (!item) return Promise.resolve(null);
  const src = exhibitSrc(item);
  if (textureCache.has(src)) {
    applyArtworkTexture(src, textureCache.get(src));
    return Promise.resolve(textureCache.get(src));
  }
  if (texturePromises.has(src)) return texturePromises.get(src);

  const promise = new Promise((resolve) => {
    textureLoader.load(
      src,
      (texture) => {
        const configured = configureTexture(texture);
        textureCache.set(src, configured);
        texturePromises.delete(src);
        applyArtworkTexture(src, configured);
        resolve(configured);
      },
      undefined,
      () => {
        texturePromises.delete(src);
        resolve(null);
      }
    );
  });
  texturePromises.set(src, promise);
  return promise;
}

function routeIndex(index) {
  if (!route.value.length) return 0;
  return (index + route.value.length) % route.value.length;
}

function warmRouteTextures(center = activeIndex.value) {
  if (!textureLoader) return;
  [-1, 0, 1, 2].forEach((offset) => {
    ensureArtworkTexture(routeIndex(center + offset));
  });
}

async function prepareInitialTextures() {
  warmRouteTextures(activeIndex.value);
  await Promise.race([
    Promise.all([ensureArtworkTexture(activeIndex.value), ensureArtworkTexture(routeIndex(activeIndex.value + 1))]),
    new Promise((resolve) => window.setTimeout(resolve, 1800)),
  ]);
}

function makeArtworkPlaceholderTexture(item, width, height) {
  const key = `${item.id}:${width}:${height}`;
  if (placeholderTextureCache.has(key)) return placeholderTextureCache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = Math.max(420, Math.round(768 * height / width));
  const ctx = canvas.getContext("2d");
  const accent = item.galleryAccent || "#b98a36";

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#fbf4e6");
  gradient.addColorStop(1, "#ded2bd");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 12;
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);
  ctx.fillStyle = "rgba(42,39,33,0.78)";
  ctx.font = "700 54px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  wrapCanvasText(ctx, item.galleryShortTitle, 72, 138, canvas.width - 144, 62, 2);
  ctx.fillStyle = "rgba(42,39,33,0.5)";
  ctx.font = "400 32px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  wrapCanvasText(ctx, "影像沿游线加载中", 72, canvas.height - 104, canvas.width - 144, 42, 1);

  const texture = configureTexture(new THREE.CanvasTexture(canvas));
  placeholderTextureCache.set(key, texture);
  return texture;
}

function makeLabelPlane(title, subtitle, options = {}) {
  const width = options.width || 2.2;
  const height = options.height || 0.64;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.round(1024 * height / width);
  const ctx = canvas.getContext("2d");
  const bg = options.background || "rgba(25,23,20,0.82)";
  const fg = options.foreground || "#fff4df";
  const muted = options.muted || "rgba(255,244,223,0.76)";
  const accent = options.accent || "#b98a36";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 18, canvas.height);
  ctx.fillStyle = fg;
  ctx.font = "700 72px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.fillText(title, 54, 104);
  ctx.fillStyle = muted;
  ctx.font = "400 38px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  wrapCanvasText(ctx, subtitle, 54, 168, canvas.width - 92, 48, 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = Array.from(String(text || ""));
  let line = "";
  let lines = 0;
  for (const char of chars) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = char;
      y += lineHeight;
      lines += 1;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y);
}

function resizeRenderer() {
  if (!renderer || !camera || !viewportRef.value) return;
  const rect = viewportRef.value.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(420, Math.round(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function targetPose() {
  const placement = placements.get(activeIndex.value);
  if (!placement) {
    return {
      position: new THREE.Vector3(0, 1.7, 8),
      target: new THREE.Vector3(0, 1.8, 0),
    };
  }
  const mode = viewerMode.value;
  if (mode === "hallway" && activeIndex.value === 0) {
    return {
      position: new THREE.Vector3(0.82, 2.28, 5.45),
      target: new THREE.Vector3(-0.62, 1.22, -13.4),
    };
  }
  const isWallSide = placement.side === "left" || placement.side === "right";
  const zOffset = mode === "close" && isWallSide ? 1.02 : mode === "close" ? 0.62 : 2.65;
  const position = new THREE.Vector3(0, 1.72, placement.z + zOffset);
  if (placement.side === "left") {
    position.x = mode === "close" ? placement.x + 2.1 : -0.22;
    if (mode === "close") {
      position.y = placement.y;
      position.z = placement.z;
    }
  }
  if (placement.side === "right") {
    position.x = mode === "close" ? placement.x - 2.1 : 0.22;
    if (mode === "close") {
      position.y = placement.y;
      position.z = placement.z;
    }
  }
  if (placement.side === "case") {
    position.x = mode === "close" ? placement.x : placement.x * 0.16;
    position.y = mode === "close" ? 3.18 : 1.72;
    position.z = placement.z + (mode === "close" ? 0 : 2.8);
  }
  if (placement.side === "plinth") {
    position.x = mode === "close" ? placement.x : placement.x * 0.18;
    position.y = mode === "close" ? placement.y : position.y;
    position.z = placement.z + (mode === "close" ? 1.08 : 2.8);
  }
  const target = new THREE.Vector3(placement.x, placement.y, placement.z);
  if (placement.side === "case") {
    target.x = mode === "close" ? placement.x : placement.x * 0.72;
    target.y = mode === "close" ? 1.02 : 0.96;
    target.z = placement.z;
  }
  if (placement.side === "plinth") target.y = 1.52;
  if (mode === "hallway" && (placement.side === "left" || placement.side === "right")) {
    target.x = placement.x * 0.58;
    target.y = placement.y - 0.18;
  }
  return { position, target };
}

function getActiveArtworkProjection() {
  const placement = placements.get(activeIndex.value);
  const artwork = artworkMeshes.get(activeIndex.value);
  const canvas = canvasRef.value;
  const viewport = viewportRef.value;
  if (!placement || !artwork || !camera || !canvas || !viewport) {
    return { ready: false, reason: "gallery scene is not ready" };
  }

  artwork.updateWorldMatrix(true, false);
  artwork.geometry.computeBoundingBox();
  const box = artwork.geometry.boundingBox;
  if (!box) return { ready: false, reason: "active artwork has no bounds" };

  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, 0),
    new THREE.Vector3(box.max.x, box.min.y, 0),
    new THREE.Vector3(box.max.x, box.max.y, 0),
    new THREE.Vector3(box.min.x, box.max.y, 0),
  ];
  const viewportRect = viewport.getBoundingClientRect();
  const points = corners.map((corner) => {
    const projected = corner.applyMatrix4(artwork.matrixWorld).project(camera);
    return {
      x: (projected.x * 0.5 + 0.5) * viewportRect.width,
      y: (-projected.y * 0.5 + 0.5) * viewportRect.height,
    };
  });
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const rect = {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
  rect.width = rect.right - rect.left;
  rect.height = rect.bottom - rect.top;

  return {
    ready: true,
    index: activeIndex.value,
    itemId: activeItem.value?.id,
    itemTitle: activeItem.value?.galleryShortTitle,
    mode: viewerMode.value,
    side: placement.side,
    expectedAspect: (box.max.x - box.min.x) / Math.max(0.001, box.max.y - box.min.y),
    projectedAspect: rect.width / Math.max(0.001, rect.height),
    rect,
    points,
    canvas: {
      width: canvas.width,
      height: canvas.height,
      cssWidth: viewportRect.width,
      cssHeight: viewportRect.height,
    },
  };
}

function exposeGalleryQa() {
  if (!galleryQaEnabled) return;
  window.__museumGalleryQa = {
    token: qaToken,
    getActiveArtworkProjection,
    getState: () => ({
      ready: canvasReady.value,
      loading: sceneLoading.value,
      webglFailed: webglFailed.value,
      activeIndex: activeIndex.value,
      viewerMode: viewerMode.value,
      activeSide: activeFloorStop.value?.side || "",
      activeTitle: activeItem.value?.galleryShortTitle || "",
    }),
  };
}

function clearGalleryQa() {
  if (!galleryQaEnabled) return;
  if (window.__museumGalleryQa?.token === qaToken) delete window.__museumGalleryQa;
}

function updateActiveMeshes() {
  interactives.forEach((object) => {
    const active = object.userData.routeIndex === activeIndex.value;
    const targetScale = active ? 1.08 : 1;
    object.scale.x += (targetScale - object.scale.x) * 0.1;
    object.scale.y += (targetScale - object.scale.y) * 0.1;
    object.scale.z += (1 - object.scale.z) * 0.1;
  });
}

function animate() {
  const elapsed = (performance.now() - startTime) / 1000;
  const pose = targetPose();
  const placement = placements.get(activeIndex.value);
  const topDownCase = viewerMode.value === "close" && placement?.side === "case";
  const orbitYaw = orbitView.value ? Math.sin(elapsed * 0.55) * 0.28 : 0;
  const yaw = lookOffset.yaw + orbitYaw;
  const target = pose.target.clone();
  if (!topDownCase) {
    target.x += Math.sin(yaw) * 2.25;
    target.y += lookOffset.pitch;
  }

  const closeMode = viewerMode.value === "close";
  cameraPosition.lerp(pose.position, closeMode ? 0.18 : 0.075);
  cameraLookTarget.lerp(target, closeMode ? 0.2 : 0.09);
  camera.position.copy(cameraPosition);
  if (topDownCase) camera.up.set(0, 0, -1);
  else camera.up.set(0, 1, 0);
  const targetZoom = topDownCase ? 2.15 : closeMode ? 1.08 : 1;
  if (Math.abs(camera.zoom - targetZoom) > 0.002) {
    camera.zoom += (targetZoom - camera.zoom) * 0.16;
    camera.updateProjectionMatrix();
  }
  camera.lookAt(cameraLookTarget);
  updateActiveMeshes();
  renderer?.render(scene, camera);
  animationFrame = window.requestAnimationFrame(animate);
}

function disposeScene() {
  isDisposed = true;
  stopAutoTour();
  if (animationFrame) window.cancelAnimationFrame(animationFrame);
  sceneObserver?.disconnect();
  resizeObserver?.disconnect();
  texturePromises.clear();
  textureCache.forEach((texture) => texture.dispose());
  textureCache.clear();
  placeholderTextureCache.forEach((texture) => texture.dispose());
  placeholderTextureCache.clear();
  if (scene) {
    scene.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
  }
  renderer?.dispose?.();
  interactives.length = 0;
  artworkMaterials.clear();
  artworkMeshes.clear();
  placements.clear();
}

watch(activeIndex, () => {
  lookOffset.yaw = 0;
  lookOffset.pitch = 0;
  viewerMode.value = "hallway";
});

onMounted(() => {
  isDisposed = false;
  exposeGalleryQa();
  scheduleSceneStart();
});
onBeforeUnmount(() => {
  clearGalleryQa();
  disposeScene();
});
</script>

<template>
  <section ref="sectionRef" class="museum-section virtual-gallery-section" id="hall" aria-labelledby="virtualGalleryTitle">
    <div class="section-heading virtual-heading">
      <div>
        <p class="eyebrow">Virtual Gallery</p>
        <h2 id="virtualGalleryTitle">虚拟展馆</h2>
        <p>从 {{ virtualGallery.total }} 件精选展品进入五个展区，按默认游线完成一次手机端沉浸参观。</p>
      </div>
      <div class="tour-controls" aria-label="虚拟展馆控制">
        <button class="ghost-action" type="button" :class="{ 'is-live': autoTour }" @click="toggleAutoTour">
          {{ autoTour ? "暂停游线" : "默认游线" }}
        </button>
        <button class="ghost-action" type="button" @click="routeMapOpen = !routeMapOpen">导览图</button>
      </div>
    </div>

    <div class="virtual-gallery">
      <div
        ref="viewportRef"
        class="virtual-viewport"
        :class="{ 'is-ready': canvasReady, 'is-loading': sceneLoading }"
        :data-active-side="activeFloorStop?.side || 'unknown'"
        :data-viewer-mode="viewerMode"
        @pointerdown="onViewportPointerDown"
        @pointermove="onViewportPointerMove"
        @pointerup="onViewportPointerUp"
        @pointercancel="onViewportPointerUp"
      >
        <canvas ref="canvasRef" class="virtual-canvas" aria-hidden="true"></canvas>
        <div v-if="sceneLoading && !webglFailed" class="gallery-loader" role="status" aria-live="polite">
          <div class="gallery-loader-mark" aria-hidden="true">
            <span></span>
            <span></span>
          </div>
          <div class="gallery-loader-copy">
            <strong>{{ sceneLoadLabel }}</strong>
            <span>先加载展厅，再按游线加载附近展品影像。</span>
          </div>
          <div class="gallery-loader-bar" aria-hidden="true">
            <span :style="{ width: `${sceneLoadProgress}%` }"></span>
          </div>
        </div>
        <div v-if="webglFailed && activeItem" class="fallback-gallery-scene" aria-hidden="true">
          <div class="fallback-skylight"></div>
          <div class="fallback-wall-sign">
            <strong>{{ activeZone?.title }}</strong>
            <span>{{ activeZone?.subtitle }}</span>
          </div>
          <figure v-if="previousPreviewItem" class="fallback-frame fallback-frame-side">
            <img :src="exhibitSrc(previousPreviewItem)" :alt="displayTitle(previousPreviewItem)" />
          </figure>
          <figure class="fallback-frame fallback-frame-main">
            <img :src="exhibitSrc(activeItem)" :alt="displayTitle(activeItem)" />
            <figcaption>
              <strong>{{ activeItem.galleryShortTitle }}</strong>
              <span>{{ activeItem.collector }} / {{ activeItem.category }}</span>
            </figcaption>
          </figure>
          <div class="fallback-floor"></div>
        </div>
        <div class="gallery-screen-top">
          <div>
            <strong>民间收藏博物馆</strong>
            <span>{{ activeZone?.title || "默认游线" }}</span>
          </div>
          <button class="icon-action gallery-reset" type="button" aria-label="重置视角" title="重置视角" @click.stop="resetView">⌖</button>
        </div>
        <div class="viewport-item-hud" v-if="activeItem">
          <span>{{ String(activeIndex + 1).padStart(2, "0") }} / {{ String(route.length).padStart(2, "0") }} · {{ activeZone?.title }}</span>
          <strong>{{ activeItem.galleryShortTitle }}</strong>
        </div>
        <div
          class="phone-controls"
          aria-label="手机游览控制"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
          @pointercancel.stop
          @click.stop
        >
          <div class="path-controls" role="group" aria-label="默认展线移动">
            <button class="path-step" type="button" aria-label="上一件展品" title="上一件展品" @click.stop="previousStop">
              <span aria-hidden="true">‹</span>
              <small>上一件</small>
            </button>
            <button class="path-step is-primary" type="button" aria-label="下一件展品" title="下一件展品" @click.stop="nextStop">
              <small>下一件</small>
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <div class="distance-controls" role="group" aria-label="观看距离">
            <button class="distance-control" type="button" aria-label="靠近当前展品" title="靠近当前展品" @click.stop="approachActiveExhibit">
              <span aria-hidden="true">▲</span>
              <small>靠近</small>
            </button>
            <button class="distance-control" type="button" aria-label="回到走廊" title="回到走廊" @click.stop="returnToHallway">
              <span aria-hidden="true">▼</span>
              <small>走廊</small>
            </button>
          </div>
          <button class="round-control" type="button" :class="{ 'is-active': orbitView }" aria-label="环视" @click.stop="toggleOrbit">
            <span aria-hidden="true">◎</span>
            <small>环视</small>
          </button>
        </div>
        <div class="sr-only" aria-live="polite">{{ sceneStatus }}</div>
      </div>

      <aside class="gallery-info" aria-live="polite">
        <div class="gallery-card" v-if="activeItem">
          <img :src="exhibitSrc(activeItem)" :alt="displayTitle(activeItem)" />
          <div class="gallery-card-copy">
            <span>{{ String(activeIndex + 1).padStart(2, "0") }} / {{ String(route.length).padStart(2, "0") }} · {{ activeZone?.title }}</span>
            <h3>{{ activeItem.galleryShortTitle }}</h3>
            <p>{{ activeItem.galleryIntro }}</p>
          </div>
          <div class="gallery-actions">
            <button class="ghost-action" type="button" @click="openActiveDetail">查看展品</button>
            <button class="primary-action" type="button" @click="continueTour">继续前进</button>
          </div>
        </div>

        <div class="route-progress" aria-label="默认游线进度">
          <span class="route-progress-fill" :style="{ width: `${activeProgress}%` }"></span>
        </div>

        <div class="floor-plan-card" :class="{ 'is-open': routeMapOpen }" aria-label="虚拟展馆平面图与参观线路">
          <div class="floor-plan-copy">
            <span>展厅平面</span>
            <strong>入口沿左墙顺行，再转向右墙与中央展柜</strong>
            <p>{{ activeZonePlan }}</p>
          </div>
          <svg class="floor-plan-map" viewBox="0 0 100 320" role="img" aria-label="虚拟展馆平面图，金色线条表示默认参观路线">
            <rect class="floor-plan-room" x="8" y="8" width="84" height="304" rx="8"></rect>
            <line class="floor-plan-axis" x1="50" y1="18" x2="50" y2="302"></line>
            <text class="floor-plan-label" x="50" y="20" text-anchor="middle">入口</text>
            <text class="floor-plan-label" x="50" y="308" text-anchor="middle">尾厅</text>
            <g class="floor-plan-zones">
              <rect
                v-for="band in floorPlanZoneBands"
                :key="band.category"
                x="11"
                :y="band.y"
                width="78"
                :height="band.height"
                rx="5"
              ></rect>
            </g>
            <polyline class="floor-plan-path" :points="floorPlanPathPoints"></polyline>
            <g class="floor-plan-stops">
              <circle
                v-for="stop in floorPlanStops"
                :key="stop.index"
                :class="{ 'is-active': stop.index === activeIndex, 'is-past': stop.index < activeIndex }"
                :cx="stop.x"
                :cy="stop.y"
                :r="stop.index === activeIndex ? 5 : 3.5"
                tabindex="0"
                role="button"
                :aria-label="`跳转到 ${stop.title}`"
                @click="setActive(stop.index)"
                @keydown.enter.prevent="setActive(stop.index)"
                @keydown.space.prevent="setActive(stop.index)"
              ></circle>
            </g>
            <g class="floor-plan-band-labels">
              <text
                v-for="band in floorPlanZoneBands"
                :key="`${band.category}-label`"
                x="14"
                :y="band.y + 12"
              >{{ band.label }}</text>
            </g>
          </svg>
        </div>

        <div class="zone-rail" :class="{ 'is-open': routeMapOpen }" aria-label="展区导览">
          <button
            v-for="(zone, index) in zones"
            :key="zone.category"
            class="zone-node"
            :class="{ 'is-active': index === activeZoneIndex, 'is-past': index < activeZoneIndex }"
            type="button"
            @click="goToZone(zone.category)"
          >
            <span>{{ String(index + 1).padStart(2, "0") }}</span>
            <strong>{{ zone.title }}</strong>
            <small>{{ zone.exhibits.length }} 件 / {{ zone.imageItems }} 张影像</small>
          </button>
        </div>

      </aside>
    </div>
  </section>
</template>
