import { artworkSize, galleryLength, GALLERY_SPACE, placementFor } from "./layout";
import { createGalleryPrimitives } from "./primitives";

export async function createGalleryScene(options) {
  const { THREE, canvas, viewport, route, zones, assetUrl, itemImageUrl, getViewState } = options;
  const renderer = createRenderer(THREE, canvas);
  if (!renderer) throw new Error("WebGL is not available");

  // 初始化中途抛错时也必须回收 renderer，避免 WebGL 上下文泄漏（调用方拿不到场景句柄）
  let disposed = false;
  try {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xf4ecda, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.7;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  THREE.RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xddcbb0, 28, 66);
  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  const environmentTexture = environmentGenerator.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  environmentGenerator.dispose();
  scene.environment = environmentTexture;
  scene.environmentIntensity = 0.3;

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
  const cameraPosition = new THREE.Vector3(0, 1.7, 8);
  const cameraTarget = new THREE.Vector3(0, 1.8, 0);
  camera.position.copy(cameraPosition);

  // 泛光后处理：暖光镀层与高光漫射。
  // 软件渲染器（SwiftShader/llvmpipe 等）对 bloom 的 render target 支持不稳定，
  // 直接跳过；真实硬件 GPU 正常启用。任何异常都安静回退到直接渲染。
  let composer = null;
  let bloomPass = null;
  let glRendererName = "";
  try {
    const gl = renderer.getContext();
    glRendererName = String(gl.getParameter(gl.RENDERER) || "").toLowerCase();
  } catch (error) {
    glRendererName = "";
  }
  const softwareGL = /swiftshader|llvmpipe|software|angle \(software/i.test(glRendererName);
  try {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    if (!softwareGL) {
      bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(1, 1), 0.05, 0.84, 0.7);
      composer.addPass(bloomPass);
    }
  } catch (error) {
    composer = null;
    bloomPass = null;
  }

  const textureLoader = new THREE.TextureLoader();
  const primitives = createGalleryPrimitives({ THREE, scene, textureLoader, assetUrl });
  // 带倒角的盒子：棱边真实高光过渡，外包络与普通盒子完全一致
  function addBeveledBox(name, size, position, material, options = {}, bevel = 0.02) {
    const mesh = new THREE.Mesh(primitives.beveledGeometry(size[0], size[1], size[2], bevel), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    (options.parent || scene).add(mesh);
    return mesh;
  }
  // 展陈系统级共享材质：展柜铣线、展台裙边、展签背板（跨展品复用）
  const caseRimMat = new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.28, metalness: 0.55, envMapIntensity: 1.2 });
  const plinthSkirtMat = new THREE.MeshStandardMaterial({ color: 0x272019, roughness: 0.52, metalness: 0.05 });
  const routeGroup = new THREE.Group();
  const placements = new Map();
  const artworkMeshes = new Map();
  const artworkMaterials = new Map();
  const frameMeshes = new Map();
  const interactives = [];
  const textureCache = new Map();
  const texturePromises = new Map();
  let animationFrame = 0;
  let resizeObserver;
  let qaCaptureLeft = 0;
  const qaFrames = [];
  const startedAt = performance.now();

  buildLighting({ THREE, scene, route });
  buildArchitecture({ THREE, scene, route, zones, primitives });
  const atmosphere = buildAtmosphere({ THREE, scene, route, primitives });
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
      emissiveIntensity: 0.65,
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 1.25,
      side: THREE.DoubleSide,
    });
    artworkMaterials.set(index, material);
    const artwork = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    artwork.name = `artwork-${item.id}`;
    artwork.position.set(placement.x, placement.y, placement.z);
    artwork.rotation.y = placement.rotationY;
    artwork.userData.routeIndex = index;
    artwork.receiveShadow = true;
    if (placement.side === "case") {
      artwork.position.y = 1.02;
    } else if (placement.side === "plinth") {
      // 展台（器物类）展品：无画框的立牌，底部贴展台面（展台顶 1.12），
      // 避免"展品夹在画框与展台两块板之间、画框悬空"的视觉
      artwork.position.y = 1.14 + height / 2;
    }
    artworkMeshes.set(index, artwork);

    // 画框只用于墙面与展柜内展品；展台立牌无框
    let frame = null;
    if (placement.side !== "plinth") {
      frame = primitives.frame(width, height);
      frame.position.copy(artwork.position);
      frame.rotation.copy(artwork.rotation);
      frame.userData.routeIndex = index;
      frame.traverse((object) => {
        // 玻璃反光等叠加材质不投影
        if (object.material?.blending === THREE.AdditiveBlending) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      routeGroup.add(frame);
      if (frame.children) frame.name = `frame-${item.id}`;
      frameMeshes.set(index, frame);
      interactives.push(frame);
    }
    routeGroup.add(artwork);
    interactives.push(artwork);

    // 墙面展品：洗墙光晕 + 展签灯
    if (placement.side === "left" || placement.side === "right") {
      const direction = placement.side === "left" ? 1 : -1;
      const wash = primitives.glowPlane(width * 1.14, height * 1.3, 0xffdca8, 0.26);
      wash.name = `wash-${item.id}`;
      wash.position.set(placement.x - direction * 0.14, placement.y, placement.z);
      wash.rotation.y = placement.rotationY;
      routeGroup.add(wash);
      const lamp = primitives.pictureLight(width);
      lamp.name = `lamp-${item.id}`;
      lamp.position.set(placement.x + direction * 0.17, placement.y + height / 2 + 0.32, placement.z);
      lamp.rotation.y = placement.rotationY;
      routeGroup.add(lamp);
    }

    const label = primitives.labelPlane(item.galleryShortTitle, `${item.collector} / ${item.category}`, {
      width: placement.side === "plinth" ? 1.08 : Math.max(1.42, width * 0.94),
      height: 0.42,
      accent: item.galleryAccent,
    });
    label.name = `label-${item.id}`;
    label.position.set(placement.x, placement.y - height / 2 - 0.52, placement.z);
    label.rotation.y = placement.rotationY;
    if (placement.side === "case") {
      label.position.set(placement.x, 0.74, placement.z + 0.72);
      label.rotation.y = 0;
    } else if (placement.side === "plinth") {
      // 展台展签：立在展台前方地面（宽 1.08 完全在展台外，不高出基座、不嵌入），
      // z+1.5 超出 close 视角（相机 z+1.08），特写时不会挡镜头
      label.position.set(placement.x, 0.28, placement.z + 1.5);
      label.rotation.y = 0;
    }
    routeGroup.add(label);
    // 墙面展品：仅保留轻薄展签，贴墙安装；不再使用任何背板/衬板实体
    if (placement.side === "left" || placement.side === "right") {
      const contact = primitives.contactShadowPlane(2.4, 0.62, 0.12);
      contact.name = `wall-contact-${item.id}`;
      contact.position.set(placement.x * 1.02, 0.012, placement.z);
      routeGroup.add(contact);
      // 组内首展品（重点展品）：极克制的屋顶射灯，让展品比墙面稍亮，形成自然视觉层级
      if (placement.localIndex === 0) {
        const spot = new THREE.SpotLight(0xffd9a8, 0.85, 7, 0.5, 0.85, 1.4);
        spot.position.set(placement.x * 0.42, 4.45, placement.z);
        spot.target.position.set(placement.x, placement.y, placement.z);
        scene.add(spot);
        scene.add(spot.target);
      }
    }
  }

  function addGroupSign(item, placement) {
    const dark = item.galleryLayout === "dark-wall";
    const sign = primitives.labelPlane(item.galleryZoneTitle, item.gallerySubtitle, {
      width: 2.2,
      height: 0.8,
      background: dark ? "rgba(20,20,19,0.92)" : "rgba(247,240,226,0.92)",
      foreground: dark ? "#fff4df" : "#2a2721",
      muted: dark ? "rgba(255,244,223,0.72)" : "#766a58",
      accent: item.galleryAccent,
    });
    const right = placement.side === "right";
    // 组标题牌：贴墙高挂于组首展品正上方（避免悬在展品前方造成视觉重叠），
    // 底部与展品顶部保持足够垂直间隙
    sign.position.set(right ? GALLERY_SPACE.artworkX : -GALLERY_SPACE.artworkX, 4.5, placement.z + 0.5);
    sign.rotation.y = right ? -Math.PI / 2 : Math.PI / 2;
    routeGroup.add(sign);
  }

  function addDisplayCase(placement) {
    const base = primitives.museumMaterial({ texturePath: "textures/walnut-charcoal-slats.png", base: "#8f6130", repeat: [1.2, 0.8], roughness: 0.54 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xe6f4f2,
      transparent: true,
      opacity: 0.07,
      roughness: 0.09,
      metalness: 0,
      clearcoat: 0.4,
      clearcoatRoughness: 0.45,
      transmission: 0.55,
      specularIntensity: 0.3,
      ior: 1.45,
      depthWrite: false,
      envMapIntensity: 0.25,
    });
    primitives.addBox("case-base", [2.36, 0.74, 1.52], [placement.x, 0.38, placement.z], base, { parent: routeGroup });
    // 玻璃罩：必须完整包住展品（展品 1.08×0.78 居中安装，玻璃加高到 0.9 覆盖顶底）
    primitives.addBox("case-glass", [2.42, 0.9, 1.56], [placement.x, 0.99, placement.z], glass, { parent: routeGroup, castShadow: false, receiveShadow: false });
    // 底座与玻璃交接处的细铣线 + 玻璃顶收口：方盒变“展柜结构”（带微小倒角）
    addBeveledBox("case-rim", [2.3, 0.05, 1.5], [placement.x, 0.93, placement.z], caseRimMat, { parent: routeGroup, castShadow: false }, 0.012);
    addBeveledBox("case-top-rim", [2.06, 0.05, 1.28], [placement.x, 1.44, placement.z], caseRimMat, { parent: routeGroup, castShadow: false }, 0.012);
    // 柜内柔和展品光：贴玻璃后壁、尺寸收进玻璃内，只衬展品轮廓（纯叠加，不溢出柜外、不遮展品）
    const insideGlow = primitives.glowPlane(1.6, 0.5, 0xffe6bd, 0.11);
    insideGlow.name = "case-glow";
    insideGlow.rotation.x = -Math.PI / 2;
    insideGlow.position.set(placement.x, 1.28, placement.z - 0.02);
    routeGroup.add(insideGlow);
    // 展柜与地面的接触阴影
    const contact = primitives.contactShadowPlane(2.5, 1.85, 0.24);
    contact.name = "case-contact";
    contact.position.set(placement.x, 0.01, placement.z);
    routeGroup.add(contact);
  }

  function addPlinth(placement) {
    const material = new THREE.MeshPhysicalMaterial({ color: 0xd8ceb8, roughness: 0.42, metalness: 0.02, clearcoat: 0.28, clearcoatRoughness: 0.3, envMapIntensity: 0.85 });
    // 展台主体：微小倒角让棱边吃光
    addBeveledBox("plinth", [1.16, 1.12, 1.16], [placement.x, 0.56, placement.z], material, { parent: routeGroup }, 0.02);
    // 深炭裙边 + 底部接触阴影：让展台像装嵌在地坪里的展陈系统
    primitives.addBox("plinth-skirt", [1.34, 0.09, 1.34], [placement.x, 0.045, placement.z], plinthSkirtMat, { parent: routeGroup, castShadow: false });
    const contact = primitives.contactShadowPlane(1.7, 1.7, 0.2);
    contact.name = "plinth-contact";
    contact.position.set(placement.x, 0.012, placement.z);
    routeGroup.add(contact);
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
        if (disposed) {
          texture.dispose();
          resolve(null);
          return;
        }
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
    // 展柜/展台中的实物展品：按图片真实宽高比重设立幅。
    // 竖图（印谱、册页、琴谱）不再被压进横框，避免横向拉伸、看起来“躺倒”；
    // 高度保持不变，宽度按比例收窄，画框同步等比缩放。
    const placement = placements.get(index);
    if (!placement || (placement.side !== "case" && placement.side !== "plinth")) return;
    const image = texture.image;
    if (!image?.width || !image?.height) return;
    const artwork = artworkMeshes.get(index);
    if (!artwork) return;
    const { width: baseW, height: baseH } = artworkSize(route[index]);
    const aspect = image.width / image.height;
    const maxW = placement.side === "case" ? 1.66 : 1.8;
    const minW = 0.44;
    const newW = Math.min(maxW, Math.max(minW, baseH * aspect));
    if (Math.abs(newW - baseW) < 0.02) return;
    artwork.geometry?.dispose?.();
    artwork.geometry = new THREE.PlaneGeometry(newW, baseH);
    const frame = frameMeshes.get(index);
    if (frame) {
      // 基础缩放存入 userData，与 active 展品的放大动画相乘，互不覆盖
      frame.userData.baseScale = { x: newW / baseW, y: 1, z: 1 };
      frame.scale.set(newW / baseW, 1, 1);
    }
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
    composer?.setSize(width, height);
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
      position.set(close ? placement.x : placement.x * 0.16, close ? 1.08 : 1.72, placement.z + (close ? 1.15 : 2.8));
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
    const elapsed = (performance.now() - startedAt) / 1000;
    const orbitYaw = state.orbitView ? Math.sin(elapsed * 0.55) * 0.28 : 0;
    atmosphere.dust.rotation.y = elapsed * 0.005;
    atmosphere.dust.position.y = Math.sin(elapsed * 0.12) * 0.16;
    atmosphere.shafts.forEach((shaft, shaftIndex) => {
      shaft.material.opacity = 0.04 + Math.sin(elapsed * 0.3 + shaftIndex * 1.7) * 0.015;
    });
    const target = pose.target.clone();
    target.x += Math.sin(state.lookOffset.yaw + orbitYaw) * 2.25;
    target.y += state.lookOffset.pitch;
    const close = state.viewerMode === "close";
    cameraPosition.lerp(pose.position, close ? 0.18 : 0.075);
    cameraTarget.lerp(target, close ? 0.2 : 0.09);
    camera.position.copy(cameraPosition);
    camera.up.set(0, 1, 0);
    const targetZoom = close ? 1.1 : 1;
    camera.zoom += (targetZoom - camera.zoom) * 0.16;
    camera.updateProjectionMatrix();
    camera.lookAt(cameraTarget);
    interactives.forEach((object) => {
      const zoom = object.userData.routeIndex === state.activeIndex ? 1.08 : 1;
      const base = object.userData.baseScale || null;
      const targetX = base ? zoom * base.x : zoom;
      const targetY = base ? zoom * base.y : zoom;
      object.scale.x += (targetX - object.scale.x) * 0.1;
      object.scale.y += (targetY - object.scale.y) * 0.1;
    });
    try {
      if (composer) composer.render();
      else renderer.render(scene, camera);
    } catch (error) {
      // 渲染异常（软件渲染器 shader 失败等）：降级为直接渲染，保证画面不黑屏
      composer = null;
      bloomPass?.dispose?.();
      bloomPass = null;
      try {
        renderer.render(scene, camera);
      } catch (fallbackError) {
        // 极端情况：连直接渲染也失败，保持上一帧画面，不抛出（动画继续尝试）
      }
    }
    if (qaCaptureLeft > 0) {
      qaCaptureLeft--;
      qaFrames.push(canvas.toDataURL("image/png"));
      if (qaFrames.length > 12) qaFrames.shift();
    }
    animationFrame = window.requestAnimationFrame(animate);
  }

  function captureFrames(count) { qaCaptureLeft = Math.max(0, count | 0); return qaCaptureLeft; }
  function drainFrames() { const frames = qaFrames.slice(); qaFrames.length = 0; return frames; }
  let qaRt = null;
  function readFrame() {
    if (composer) {
      const stored = composer.renderToScreen;
      composer.renderToScreen = false;
      composer.render();
      composer.renderToScreen = stored;
      const out = composer.readBuffer;
      return readBufferAsB64(out);
    }
    if (!qaRt) qaRt = new THREE.WebGLRenderTarget(canvas.width, canvas.height, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat });
    renderer.setRenderTarget(qaRt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    return readBufferAsB64(qaRt);
  }
  function readBufferAsB64(target) {
    const px = new Uint8Array(target.width * target.height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, px);
    let binary = "";
    for (let i = 0; i < px.length; i += 8192) binary += String.fromCharCode.apply(null, px.subarray(i, i + 8192));
    return { w: target.width, h: target.height, b64: btoa(binary) };
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

  function getSceneInfo() {
    const list = [];
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (!object.isMesh || !object.visible) return;
      object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox.clone();
      const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const center = box.getCenter(new THREE.Vector3()).applyMatrix4(object.matrixWorld);
      const entry = {
        name: object.name || "mesh",
        x: +center.x.toFixed(2),
        y: +center.y.toFixed(2),
        z: +center.z.toFixed(2),
        w: +half.x.toFixed(2),
        h: +half.y.toFixed(2),
        d: +half.z.toFixed(2),
        renderOrder: object.renderOrder || 0,
      };
      // QA 调试：关键材质（天花板/地毯/面板）附带贴图与颜色摘要，便于像素验证
      if (/^(ceiling|runner|floor-tile|skylight-panel)/.test(object.name)) {
        const material = object.material;
        if (material) {
          entry.materialInfo = {
            type: material.type,
            color: material.color ? `#${material.color.getHexString()}` : "",
            map: material.map?.image ? `${material.map.image.width}x${material.map.image.height}` : null,
          };
        }
      }
      list.push(entry);
    });
    return list;
  }

  function probePixel(points) {
    const rect = viewport.getBoundingClientRect();
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    camera.updateMatrixWorld();
    const out = [];
    for (const [x, y] of points) {
      const ndc = new THREE.Vector3((x / rect.width) * 2 - 1, (-y / rect.height) * 2 + 1, 0.5);
      ndc.unproject(camera);
      origin.copy(camera.position);
      dir.copy(ndc).sub(camera.position).normalize();
      raycaster.set(origin, dir);
      const hits = raycaster
        .intersectObjects(scene.children, true)
        .filter((h) => h.object.visible && !h.object.isPoints && h.object.material?.blending !== THREE.AdditiveBlending);
      const first = hits[0]?.object;
      let pixel = null;
      try {
        const gl = renderer.getContext();
        if (gl) {
          const buf = new Uint8Array(4);
          const dpr = renderer.getPixelRatio();
          gl.readPixels(Math.min(canvas.width - 1, Math.round(x * dpr)), Math.max(0, canvas.height - 1 - Math.round(y * dpr)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          pixel = [buf[0], buf[1], buf[2]];
        }
      } catch (e) {
        pixel = ["ERR", String(e && e.message).slice(0, 18), 0];
      }
      out.push({
        x, y,
        hit: first ? `${first.name || "mesh"}@${hits[0].distance.toFixed(1)}m` : "none",
        parent: first?.parent?.name || "",
        material: first?.material
          ? (first.material.color ? `#${first.material.color.getHexString()} r${(first.material.roughness ?? 0)}` : first.material.type || "")
          : "",
        all: hits.slice(0, 4).map((h) => `${h.object.name || "mesh"}@${h.distance.toFixed(1)}m`).join("|"),
      });
    }
    return out;
  }

  function dispose() {
    disposed = true;
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
    bloomPass?.dispose?.();
    composer?.dispose?.();
    environmentTexture.dispose();
    renderer.dispose();
  }

  return { dispose, getActiveArtworkProjection, warmTextures, getSceneInfo, probePixel, captureFrames, drainFrames, readFrame };
  } catch (error) {
    disposed = true;
    renderer.dispose();
    throw error;
  }
}

function createRenderer(THREE, canvas) {
  const attributes = { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" };
  const context = canvas.getContext("webgl2", attributes) || canvas.getContext("webgl", attributes) || canvas.getContext("experimental-webgl", attributes);
  return context ? new THREE.WebGLRenderer({ canvas, context, ...attributes }) : null;
}

function buildLighting({ THREE, scene, route }) {
  const length = galleryLength(route);
  // 环境光层：低强度的天光 + 地面反弹，统一暖中性，不喧宾夺主
  scene.add(new THREE.AmbientLight(0xfff1de, 0.1));
  scene.add(new THREE.HemisphereLight(0xfff4de, 0xc9b59a, 0.2));
  // 主光：柔和的洗墙日光，负责整体雕像般的光影关系（软边阴影）
  const sun = new THREE.DirectionalLight(0xffe6bd, 2.1);
  sun.position.set(-4.8, 10.8, 7.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -8;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.045;
  sun.shadow.radius = 9;
  scene.add(sun);
  // 悬垂吊灯：暖点光。强度随进深递减，营造前亮后暗的空间纵深感（只发光，无实体）
  for (let z = -3.2; z > -length + 10; z -= 10.8) {
    const depthFactor = 1 - Math.min(0.45, Math.max(0, (-z - 3.2) / length) * 0.85);
    const pendant = new THREE.PointLight(0xffd9a0, 4.0 * depthFactor, 22, 2);
    pendant.position.set(0, 4.3, z);
    scene.add(pendant);
  }
  // 天窗通道内的长条灯带：同样按进深递减，远端厅堂自然压暗
  for (let z = -3.2; z > -length + 10; z -= 10.8) {
    const depthFactor = 1 - Math.min(0.5, Math.max(0, (-z - 3.2) / length) * 0.9);
    const light = new THREE.RectAreaLight(0xfff0cd, 0.9 * depthFactor, 4.8, 5.8);
    light.position.set(0, GALLERY_SPACE.ceilingY + 0.56, z);
    light.rotation.x = -Math.PI / 2;
    scene.add(light);
  }
}

// 体积光柱 + 浮尘：便宜但最出氛围的两件套
function buildAtmosphere({ THREE, scene, route, primitives }) {
  const length = galleryLength(route);
  const shafts = [];
  for (let index = 0; index < 4; index += 1) {
    const shaft = primitives.glowPlane(3.6, 6.4, 0xffe2b0, 0.05);
    shaft.position.set(index % 2 ? 1.1 : -1.1, 2.9, -9 - index * (length / 5));
    shaft.rotation.set(-0.16, 0, index % 2 ? 0.06 : -0.06);
    scene.add(shaft);
    shafts.push(shaft);
  }

  const dustCount = 560;
  const positions = new Float32Array(dustCount * 3);
  for (let index = 0; index < dustCount; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * 11;
    positions[index * 3 + 1] = 0.4 + Math.random() * 4.6;
    positions[index * 3 + 2] = 4 - Math.random() * length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xffe0b0,
    size: 0.02,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  scene.add(dust);
  return { dust, shafts };
}

function buildArchitecture({ THREE, scene, route, zones, primitives }) {
  const length = galleryLength(route);
  const centerZ = -length / 2 + 5;
  const { wallX, wallHeight, wallCenterY, ceilingY, floorWidth } = GALLERY_SPACE;
  const stone = primitives.museumMaterial({ texturePath: "textures/warm-limestone-wall.png", base: "#e4dbc6", repeat: [4.2, 12.6], roughness: 0.9 });
  stone.envMapIntensity = 0.72;
  const dark = primitives.museumMaterial({ texturePath: "textures/walnut-charcoal-slats.png", base: "#493626", repeat: [1.8, 3.8], roughness: 0.64 });
  const walnut = primitives.museumMaterial({ texturePath: "textures/walnut-charcoal-slats.png", base: "#3d2c1e", repeat: [1.2, 6], roughness: 0.5, metalness: 0.08 });
  // 地面：微水泥/哑光石材。低粗糙度起伏 + 极弱环境回光，绝无镜面
  const floorMap = primitives.museumMaterial({ texturePath: "textures/polished-travertine-floor.png", base: "#ded2b8", repeat: [5.6, 20], roughness: 0.5, envMapIntensity: 0.55 });
  floorMap.bumpMap = primitives.noiseClone([5.6, 20]);
  floorMap.bumpScale = 0.22;

  // 地面（微水泥哑光地坪，只保留极柔和的环境回光）
  primitives.addBox("floor", [floorWidth, 0.08, length], [0, -0.05, centerZ], floorMap, { castShadow: false, receiveShadow: true });

  // 中央绛红织锦地毯（行走道）+ 两侧镶边：哑光软材质、织锦经纬纹理
  const runner = primitives.museumMaterial({ base: "#8a4536", roughness: 0.85, envMapIntensity: 0.5 });
  runner.map = primitives.carpetTexture();
  runner.map.repeat.set(1.8, 90);
  runner.bumpMap = primitives.noiseClone([9, 90]);
  runner.bumpScale = 0.22;
  const runnerTrim = primitives.museumMaterial({ base: "#a98b45", roughness: 0.36, metalness: 0.22, envMapIntensity: 1.15 });
  primitives.addBox("runner", [1.72, 0.026, length], [0, 0.006, centerZ], runner, { castShadow: false, receiveShadow: true });
  primitives.addBox("runner-trim-l", [0.05, 0.028, length], [-0.885, 0.008, centerZ], runnerTrim, { castShadow: false, receiveShadow: true });
  primitives.addBox("runner-trim-r", [0.05, 0.028, length], [0.885, 0.008, centerZ], runnerTrim, { castShadow: false, receiveShadow: true });

  // 红地毯两侧米色大理石地砖带（自外沿延伸到墙线）
  for (const side of [-1, 1]) {
    const tileMat = new THREE.MeshStandardMaterial({
      map: primitives.tileTexture(),
      roughness: 0.58,
      metalness: 0,
      envMapIntensity: 0.6,
    });
    const bandWidth = wallX - 0.16 - 0.95;
    const band = new THREE.Mesh(new THREE.PlaneGeometry(bandWidth, length), tileMat);
    band.name = side < 0 ? "floor-tile-l" : "floor-tile-r";
    band.rotation.x = -Math.PI / 2;
    band.position.set(side * (0.95 + bandWidth / 2), 0.019, centerZ);
    band.receiveShadow = true;
    scene.add(band);
  }
  // 三段墙体
  primitives.addBox("left-wall", [0.24, wallHeight, length], [-wallX, wallCenterY, centerZ], stone, { castShadow: false });
  primitives.addBox("right-wall", [0.24, wallHeight, length], [wallX, wallCenterY, centerZ], stone, { castShadow: false });
  primitives.addBox("end-wall", [floorWidth, wallHeight, 0.2], [0, wallCenterY, -length + 5], stone, { castShadow: false });

  // 踢脚线：仅一条 6cm 浅色窄条收口，避免大面积深色横带
  for (const side of [-1, 1]) {
    const x = side * (wallX - 0.03);
    primitives.addBox("baseboard", [0.06, 0.09, length], [x, 0.045, centerZ], stone, { castShadow: false });
  }

  // 墙面拼接缝：极细的暗缝，模拟石材/板材水平逐段拼接（近看才有，远看是光缝）
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.04 });
  const seamGeo = new THREE.BoxGeometry(0.02, wallHeight, 0.08);
  for (const side of [-1, 1]) {
    const x = side * (wallX - 0.11);
    for (let z = -2.4; z > -length + 4; z -= 5.8) {
      const seam = new THREE.Mesh(seamGeo, seamMat);
      seam.position.set(x, wallCenterY, z);
      scene.add(seam);
    }
  }

  // 墙脚环境遮蔽带：沿两道墙脚的通长暗带，模拟墙角 GI 收口（低低调）
  const stripStrip = primitives.stripShadowTexture();
  for (const side of [-1, 1]) {
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, length),
      new THREE.MeshBasicMaterial({
        map: stripStrip,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    band.rotation.x = -Math.PI / 2;
    band.position.set(side * (wallX - 0.115), 0.012, centerZ);
    band.renderOrder = 1;
    scene.add(band);
  }

  // 壁柱：沿墙每 5.3m 一根，浅色同墙身，只作节奏不抢戏
  for (const side of [-1, 1]) {
    const x = side * (wallX - 0.08);
    for (let z = -3.42; z > -length + 6; z -= 5.3) {
      primitives.addBox("pilaster", [0.3, wallHeight, 0.12], [x, wallCenterY, z], stone, { castShadow: false });
    }
  }

  // 深色字画展区背景：暖深棕石面（非纯黑），单侧收束，突出展品但不做黑墙
  const darkZone = zones.find((zone) => zone.layout === "dark-wall");
  const darkStart = darkZone?.exhibits[0]?.routeIndex ?? Math.floor(route.length * 0.65);
  const darkWallMat = primitives.museumMaterial({ base: "#6a4f3f", roughness: 0.72, envMapIntensity: 0.9 });
  darkWallMat.bumpMap = primitives.noiseClone([3, 3]);
  darkWallMat.bumpScale = 0.1;
  primitives.addBox("dark-wall", [0.24, wallHeight, Math.max(11, (darkZone?.exhibits.length || 4) * 3.1)], [wallX - 0.02, wallCenterY, -darkStart * 2.65 - 6], darkWallMat, { castShadow: false });

  // 吊顶：两侧贴博物馆氛围的大马士革雕花墙纸（暖金棕 damask，无缝贴图）
  // + 中央抬升天窗（无光照底面，用基础材质保证不压黑；color 微暗让吊顶退后，突出展品带）
  const ceilingWallpaper = primitives.loadMaterialTexture("textures/wallpaper-damask.png", [2.6, 28]);
  const ceiling = new THREE.MeshBasicMaterial({ map: ceilingWallpaper, color: 0xcdb78e });
  primitives.addBox("ceiling-left", [4.64, 0.16, length], [-4.4, ceilingY, centerZ], ceiling, { castShadow: false });
  primitives.addBox("ceiling-right", [4.64, 0.16, length], [4.4, ceilingY, centerZ], ceiling, { castShadow: false });
  // 天窗侧壁（凹槽）：基础材质浅暖木色，不压顶
  const fasciaMat = new THREE.MeshBasicMaterial({ color: 0x9a846c });
  primitives.addBox("skylight-fascia-l", [0.12, 0.66, length], [-1.92, ceilingY + 0.33, centerZ], fasciaMat, { castShadow: false });
  primitives.addBox("skylight-fascia-r", [0.12, 0.66, length], [1.92, ceilingY + 0.33, centerZ], fasciaMat, { castShadow: false });
  // 磨砂发光板：相邻面板亮度略有差异，弱化机械重复感；横梁现为倒角暖木梁（无贴图，观感更整）
  const panelGeometry = new THREE.PlaneGeometry(3.6, 3.9);
  const beamBevelMat = new THREE.MeshStandardMaterial({ color: 0x6a5138, roughness: 0.5, metalness: 0.04, envMapIntensity: 1, emissive: 0x2b2117, emissiveIntensity: 0.5 });
  let panelIndex = 0;
  for (let z = -2.4; z > -length + 6; z -= 4.4) {
    const panelMaterial = new THREE.MeshBasicMaterial({
      color: 0xb9a173,
    });
    panelMaterial.color.offsetHSL(0, 0, (panelIndex % 3) * 0.018 - 0.018);
    panelIndex += 1;
    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
    panel.rotation.x = Math.PI / 2;
    panel.position.set(0, ceilingY + 0.62, z);
    scene.add(panel);
    const beam = new THREE.Mesh(primitives.beveledGeometry(4.0, 0.6, 0.22, 0.035), beamBevelMat);
    beam.name = "skylight-beam";
    beam.position.set(0, ceilingY + 0.32, z - 2.2);
    beam.receiveShadow = true;
    scene.add(beam);
  }

  // 天窗凹槽内的连续 LED 线槽（长条暗藏光带，托出天花纵深感）
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xb8a173 });
  for (const side of [-1, 1]) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, length), ledMat);
    led.name = "skylight-led";
    led.position.set(side * 1.58, ceilingY + 0.5, centerZ);
    scene.add(led);
  }

  // 端景：圆形采光窗（暖光晕 + 胡桃环）
  const halo = primitives.glowPlane(4.6, 4.6, 0xffe0ae, 0.25);
  halo.position.set(0, 3.3, -length + 5.14);
  scene.add(halo);
  const oculus = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.1, 12, 48),
    new THREE.MeshStandardMaterial({ color: 0x3d2b1d, roughness: 0.7, metalness: 0.06 }),
  );
  oculus.position.set(0, 3.3, -length + 5.16);
  scene.add(oculus);

  // 休息长凳 ×2（纵深参照物）+ 底部接触阴影
  const benchMaterial = walnut;
  for (const [benchX, benchZ] of [[-2.7, -length * 0.34], [2.7, -length * 0.68]]) {
    primitives.addBox("bench-seat", [1.7, 0.12, 0.52], [benchX, 0.5, benchZ], benchMaterial, { castShadow: true });
    primitives.addBox("bench-leg", [0.1, 0.44, 0.46], [benchX - 0.68, 0.22, benchZ], benchMaterial, { castShadow: false });
    primitives.addBox("bench-leg", [0.1, 0.44, 0.46], [benchX + 0.68, 0.22, benchZ], benchMaterial, { castShadow: false });
    const contact = primitives.contactShadowPlane(1.9, 0.72, 0.12);
    contact.position.set(benchX, 0.014, benchZ);
    scene.add(contact);
  }

  // 游线路径点（朱砂）
  const pathMaterial = new THREE.MeshBasicMaterial({ color: 0xa63c2a, transparent: true, opacity: 0.62 });
  route.forEach((item, index) => {
    const placement = placementFor(item, index, zones);
    const x = placement.side === "left" ? -0.62 : placement.side === "right" ? 0.62 : 0;
    primitives.addBox("route-dot", [0.34, 0.014, 0.34], [x, 0.018, placement.z + 1.1], pathMaterial, { castShadow: false, receiveShadow: false });
  });
}
