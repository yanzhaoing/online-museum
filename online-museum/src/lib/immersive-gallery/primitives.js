export function createGalleryPrimitives({ THREE, scene, textureLoader, assetUrl }) {
  const materialTextures = new Map();
  const canvasTextures = new Map();

  function addBox(name, size, position, material, options = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    (options.parent || scene).add(mesh);
    return mesh;
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
    });
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
    const walnut = new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 0.52, metalness: 0.06 });
    const board = new THREE.MeshStandardMaterial({ color: 0xf7f1e3, roughness: 0.92, metalness: 0 });
    const halfWidth = width / 2 + 0.17;
    const halfHeight = height / 2 + 0.17;
    const back = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2, halfHeight * 2, 0.05), board);
    back.position.z = -0.032;
    group.add(back);
    const thickness = 0.085;
    const depth = 0.105;
    const top = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2 + thickness * 2, thickness, depth), walnut);
    const bottom = top.clone();
    const left = new THREE.Mesh(new THREE.BoxGeometry(thickness, halfHeight * 2, depth), walnut);
    const right = left.clone();
    top.position.set(0, halfHeight + thickness / 2, 0.012);
    bottom.position.set(0, -halfHeight - thickness / 2, 0.012);
    left.position.set(-halfWidth - thickness / 2, 0, 0.012);
    right.position.set(halfWidth + thickness / 2, 0, 0.012);
    group.add(top, bottom, left, right);
    return group;
  }

  function dispose() {
    materialTextures.forEach((texture) => texture.dispose());
    materialTextures.clear();
    canvasTextures.forEach((texture) => texture.dispose());
    canvasTextures.clear();
  }

  return { addBox, addFloorPlane, configureTexture, museumMaterial, artworkPlaceholder, labelPlane, frame, dispose };
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
