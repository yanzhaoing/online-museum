import { mergeGeometries } from "../three-gallery";

export function createGalleryPrimitives({ THREE, scene, textureLoader, assetUrl }) {
  const materialTextures = new Map();
  const canvasTextures = new Map();
  const beveledCache = new Map();

  // 轻微倒角盒：棱边用圆柱/圆角球替代，获得真实高光过渡；外形包络不变（布局/尺寸零改动）
  function beveledGeometry(width, height, depth, bevel = 0.02) {
    const key = `bevel:${width}:${height}:${depth}:${bevel}`;
    if (beveledCache.has(key)) return beveledCache.get(key);
    const bx = width / 2 - bevel;
    const by = height / 2 - bevel;
    const bz = depth / 2 - bevel;
    const segments = 7;
    const parts = [];
    parts.push(new THREE.BoxGeometry(Math.max(0.001, bx * 2), Math.max(0.001, by * 2), Math.max(0.001, bz * 2)));
    const sphereGeo = new THREE.SphereGeometry(bevel, segments, Math.max(4, Math.round(segments * 0.7)));
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) {
        const edgeX = new THREE.CylinderGeometry(bevel, bevel, Math.max(0.001, width - bevel * 2), segments, 1);
        edgeX.rotateZ(Math.PI / 2);
        edgeX.translate(0, sy * by, sz * bz);
        parts.push(edgeX);
      }
    }
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const edgeY = new THREE.CylinderGeometry(bevel, bevel, Math.max(0.001, height - bevel * 2), segments, 1);
        edgeY.translate(sx * bx, 0, sz * bz);
        parts.push(edgeY);
      }
    }
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        const edgeZ = new THREE.CylinderGeometry(bevel, bevel, Math.max(0.001, depth - bevel * 2), segments, 1);
        edgeZ.rotateX(Math.PI / 2);
        edgeZ.translate(sx * bx, sy * by, 0);
        parts.push(edgeZ);
      }
    }
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        for (const sz of [1, -1]) {
          const sphere = sphereGeo.clone();
          sphere.translate(sx * bx, sy * by, sz * bz);
          parts.push(sphere);
        }
      }
    }
    const merged = mergeGeometries(parts.map((geometry) => geometry.toNonIndexed()));
    merged.computeBoundingBox();
    beveledCache.set(key, merged);
    return merged;
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

  function nameObject(object, name) {
    object.name = name;
    object.traverse?.((child) => {
      if (child.name === "" || child.name === "mesh") child.name = name;
    });
    return object;
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

  function configureTexture(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    return texture;
  }

  function loadMaterialTexture(path, repeat = [1, 1]) {
    if (!path) return null;
    const key = `${path}:${repeat.join("x")}`;
    if (materialTextures.has(key)) return materialTextures.get(key);
    const texture = configureTexture(textureLoader.load(assetUrl(path)));
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
    materialTextures.set(key, texture);
    return texture;
  }

  function museumMaterial(options = {}) {
    return new THREE.MeshStandardMaterial({
      color: options.base || 0xffffff,
      map: loadMaterialTexture(options.texturePath, options.repeat),
      roughness: options.roughness ?? 0.84,
      metalness: options.metalness ?? 0,
      emissive: options.emissive || 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
      envMapIntensity: options.envMapIntensity ?? 1,
    });
  }

  // 织锦地毯纹理：横向编织细纹 + 极淡的图案明暗起伏（模拟织锦经纬）
  function carpetTexture(key = "carpet") {
    const cacheKey = `carpet:${key}`;
    if (canvasTextures.has(cacheKey)) return canvasTextures.get(cacheKey);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    // 经纬编织：纵向纱线（细竖纹）叠横向行（横向微差）
    context.fillStyle = "#7c3a2e";
    context.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 256; row += 1) {
      const tone = 124 + ((row * 17 + 7) % 9) * 4;
      context.fillStyle = `rgb(${tone + 6},${tone - 14},${tone - 22})`;
      context.fillRect(0, row, 256, 1);
    }
    // 竖向纱线：细密竖纹（织锦纬密感）
    for (let col = 0; col < 256; col += 1) {
      const tone = ((col * 7 + 3) % 5) * 3;
      context.fillStyle = `rgba(255,235,200,${tone / 510})`;
      context.fillRect(col, 0, 1, 256);
    }
    // 织锦暗纹：菱形/团花节奏的极淡变化（远处不可见，近看有织物细节）
    for (let y = 0; y < 256; y += 32) {
      for (let x = 0; x < 256; x += 32) {
        const light = ((x / 32 + y / 32) % 2 === 0) ? 0.018 : 0;
        context.fillStyle = `rgba(255,245,225,${light})`;
        context.beginPath();
        context.moveTo(x + 16, y);
        context.lineTo(x + 32, y + 16);
        context.lineTo(x + 16, y + 32);
        context.lineTo(x, y + 16);
        context.closePath();
        context.fill();
      }
    }
    const texture = configureTexture(new THREE.CanvasTexture(canvas));
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    canvasTextures.set(cacheKey, texture);
    return texture;
  }

  // 共享径向渐变纹理：墙面洗墙光、天窗光柱、端景光晕都用它
  // 展厅两侧米色大理石地砖：每格轻微明度差 + 灰缝
  function tileTexture(key = "floor-tile") {
    const cacheKey = `tile:${key}`;
    if (canvasTextures.has(cacheKey)) return canvasTextures.get(cacheKey);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    const tiles = 4;
    const size = canvas.width / tiles;
    for (let i = 0; i < tiles; i += 1) {
      for (let j = 0; j < tiles; j += 1) {
        const v = 204 + ((i * 7 + j * 13 + 59) % 5) * 4;
        context.fillStyle = `rgb(${v},${v - 3},${v - 9})`;
        context.fillRect(i * size, j * size, size, size);
        const grout = 182 + ((i * 3 + j * 7) % 4) * 3;
        context.fillStyle = `rgb(${grout},${grout - 5},${grout - 11})`;
        context.fillRect(i * size + size - 2, j * size, 2, size);
        context.fillRect(i * size, j * size + size - 2, size, 2);
      }
    }
    const texture = configureTexture(new THREE.CanvasTexture(canvas));
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    canvasTextures.set(cacheKey, texture);
    return texture;
  }

  function gradientTexture(key, stops) {
    const cacheKey = `grad:${key}`;
    if (canvasTextures.has(cacheKey)) return canvasTextures.get(cacheKey);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 128);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    const texture = configureTexture(new THREE.CanvasTexture(canvas));
    canvasTextures.set(cacheKey, texture);
    return texture;
  }

  // 叠加发光的渐变面片（洗墙光 / 光柱 / 光晕）
  function glowPlane(width, height, color, opacity = 0.5) {
    const texture = gradientTexture("white-soft", [
      [0, "rgba(255,255,255,0.9)"],
      [0.45, "rgba(255,255,255,0.28)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.renderOrder = 2;
    return mesh;
  }

  // 展品上方的展签灯：深色金属横杆 + 暖光发光头（只发光不投影，成本极低）
  function pictureLight(width) {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x2c241c, roughness: 0.4, metalness: 0.65 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.34, width * 0.36), 0.035, 0.05), metal);
    group.add(bar);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.3, width * 0.32), 0.014, 0.014),
      new THREE.MeshBasicMaterial({ color: 0xffd9a8 }),
    );
    head.position.set(0, -0.028, 0.012);
    group.add(head);
    return group;
  }

  function artworkPlaceholder(item, width, height) {
    const key = `art:${item.id}:${width}:${height}`;
    if (canvasTextures.has(key)) return canvasTextures.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = Math.max(420, Math.round(768 * height / width));
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#fbf4e6");
    gradient.addColorStop(1, "#ded2bd");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = item.galleryAccent || "#b98a36";
    context.lineWidth = 12;
    context.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);
    context.fillStyle = "rgba(42,39,33,0.78)";
    context.font = "700 54px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    wrapCanvasText(context, item.galleryShortTitle, 72, 138, canvas.width - 144, 62, 2);
    context.fillStyle = "rgba(42,39,33,0.5)";
    context.font = "400 32px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    wrapCanvasText(context, "影像沿游线加载中", 72, canvas.height - 104, canvas.width - 144, 42, 1);
    const texture = configureTexture(new THREE.CanvasTexture(canvas));
    canvasTextures.set(key, texture);
    return texture;
  }

  function labelPlane(title, subtitle, options = {}) {
    const width = options.width || 2.2;
    const height = options.height || 0.64;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.round(1024 * height / width);
    const context = canvas.getContext("2d");
    context.fillStyle = options.background || "rgba(25,23,20,0.82)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = options.accent || "#b98a36";
    context.fillRect(0, 0, 18, canvas.height);
    context.fillStyle = options.foreground || "#fff4df";
    context.font = "700 72px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    context.fillText(title, 54, 104);
    context.fillStyle = options.muted || "rgba(255,244,223,0.76)";
    context.font = "400 38px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    wrapCanvasText(context, subtitle, 54, 168, canvas.width - 92, 48, 2);
    const texture = configureTexture(new THREE.CanvasTexture(canvas));
    canvasTextures.set(`label:${canvasTextures.size}`, texture);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  }

  function frame(width, height) {
    const group = new THREE.Group();
    const walnut = new THREE.MeshStandardMaterial({ color: 0x3d2b1d, roughness: 0.42, metalness: 0.12 });
    const liner = new THREE.MeshStandardMaterial({ color: 0x8a7358, roughness: 0.55, metalness: 0.22 });
    const board = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.94, metalness: 0 });
    const matMargin = 0.12;
    const halfWidth = width / 2 + matMargin;
    const halfHeight = height / 2 + matMargin;
    // 卡纸背板（画芯与画框之间的留白）
    const back = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2, halfHeight * 2, 0.04), board);
    back.position.z = -0.026;
    group.add(back);
    // 深胡桃外成型
    const molding = 0.078;
    const depth = 0.12;
    const top = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2 + molding * 2, molding, depth), walnut);
    const bottom = top.clone();
    const left = new THREE.Mesh(new THREE.BoxGeometry(molding, halfHeight * 2, depth), walnut);
    const right = left.clone();
    top.position.set(0, halfHeight + molding / 2, 0.014);
    bottom.position.set(0, -halfHeight - molding / 2, 0.014);
    left.position.set(-halfWidth - molding / 2, 0, 0.014);
    right.position.set(halfWidth + molding / 2, 0, 0.014);
    group.add(top, bottom, left, right);
    // 内衬细木线
    const linerWidth = 0.02;
    const linerTop = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2, linerWidth, 0.05), liner);
    const linerBottom = linerTop.clone();
    const linerLeft = new THREE.Mesh(new THREE.BoxGeometry(linerWidth, halfHeight * 2, 0.05), liner);
    const linerRight = linerLeft.clone();
    linerTop.position.set(0, halfHeight - linerWidth / 2, 0.004);
    linerBottom.position.set(0, -halfHeight + linerWidth / 2, 0.004);
    linerLeft.position.set(-halfWidth + linerWidth / 2, 0, 0.004);
    linerRight.position.set(halfWidth - linerWidth / 2, 0, 0.004);
    group.add(linerTop, linerBottom, linerLeft, linerRight);
    // 玻璃反光（斜向一道，若有若无）
    const sheen = new THREE.Mesh(
      new THREE.PlaneGeometry(halfWidth * 2, halfHeight * 2),
      new THREE.MeshBasicMaterial({
        map: glassSheenTexture(),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sheen.position.z = 0.028;
    sheen.renderOrder = 3;
    group.add(sheen);
    return group;
  }

  function glassSheenTexture() {
    const key = "grad:glass-sheen";
    if (canvasTextures.has(key)) return canvasTextures.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 256, 256);
    gradient.addColorStop(0, "rgba(255,255,255,0.34)");
    gradient.addColorStop(0.28, "rgba(255,255,255,0.05)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0)");
    gradient.addColorStop(0.8, "rgba(255,255,255,0.06)");
    gradient.addColorStop(1, "rgba(255,255,255,0.1)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    const texture = configureTexture(new THREE.CanvasTexture(canvas));
    canvasTextures.set(key, texture);
    return texture;
  }

  // 灰度微噪点纹理：墙面/地面/地毯的克制微观颗粒（PBR 质感，远处不可见）
  function noiseTexture(size = 256) {
    const key = `noise:${size}`;
    if (canvasTextures.has(key)) return canvasTextures.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const image = context.createImageData(size, size);
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
      const value = 128 + (Math.random() - 0.5) * 26;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    canvasTextures.set(key, texture);
    return texture;
  }

  // 噪声贴图的独立副本（同一张噪点图给不同材质用不同 repeat，互不干扰）
  function noiseClone(repeat = [1, 1]) {
    const texture = noiseTexture().clone();
    texture.repeat.set(...repeat);
    return texture;
  }

  // 接触阴影：中央深、四周渐隐的径向渐变，垫在展品/展柜下方，模拟 AO
  function contactShadowTexture() {
    const key = "grad:contact-shadow";
    if (canvasTextures.has(key)) return canvasTextures.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    const ovel = context.createRadialGradient(128, 128, 14, 128, 128, 128);
    ovel.addColorStop(0, "rgba(0,0,0,0.46)");
    ovel.addColorStop(0.55, "rgba(0,0,0,0.2)");
    ovel.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = ovel;
    context.fillRect(0, 0, 256, 256);
    const texture = configureTexture(new THREE.CanvasTexture(canvas));
    canvasTextures.set(key, texture);
    return texture;
  }

  // 墙角遮蔽带：沿墙脚一道横向渐隐的暗带，模拟墙体与地面的环境遮蔽（AO）
  function stripShadowTexture() {
    const key = "grad:strip-shadow";
    if (canvasTextures.has(key)) return canvasTextures.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, "rgba(0,0,0,0.4)");
    gradient.addColorStop(0.55, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 64);
    const texture = configureTexture(new THREE.CanvasTexture(canvas));
    canvasTextures.set(key, texture);
    return texture;
  }

  function contactShadowPlane(width, depth, opacity = 0.5) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({
        map: contactShadowTexture(),
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.renderOrder = 1;
    return plane;
  }

  function dispose() {
    materialTextures.forEach((texture) => texture.dispose());
    materialTextures.clear();
    canvasTextures.forEach((texture) => texture.dispose());
    canvasTextures.clear();
    beveledCache.forEach((geometry) => geometry.dispose());
    beveledCache.clear();
  }

  return { addBox, addFloorPlane, configureTexture, museumMaterial, noiseClone, contactShadowPlane, stripShadowTexture, beveledGeometry, artworkPlaceholder, labelPlane, frame, glowPlane, gradientTexture, pictureLight, nameObject, loadMaterialTexture, tileTexture, carpetTexture, dispose };
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  let line = "";
  let lines = 0;
  for (const char of Array.from(String(text || ""))) {
    const next = line + char;
    if (context.measureText(next).width > maxWidth && line) {
      context.fillText(line, x, y);
      line = char;
      y += lineHeight;
      lines += 1;
      if (lines >= maxLines) return;
    } else {
      line = next;
    }
  }
  if (line && lines < maxLines) context.fillText(line, x, y);
}
