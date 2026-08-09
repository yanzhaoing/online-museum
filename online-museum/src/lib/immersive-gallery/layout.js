export const GALLERY_SPACE = {
  floorWidth: 13.8,
  halfWidth: 6.9,
  wallX: 6.74,
  artworkX: 6.46,
  wallHeight: 5.72,
  wallCenterY: 2.68,
  ceilingY: 5.24,
};

export function galleryLength(route) {
  return Math.max(72, route.length * 2.72 + 18);
}

export function placementFor(item, index, zones) {
  const zone = zones.find((entry) => entry.id === item.galleryZone || entry.category === item.galleryZone);
  const localIndex = zone?.exhibits.findIndex((entry) => entry.id === item.id) ?? 0;
  const z = -index * 2.65 - 2.1;
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
    return { side: "case", x: localIndex % 2 ? 2.55 : -2.55, y: 1.02, z, rotationY: 0, localIndex };
  }
  if (item.galleryLayout === "plinth") {
    return { side: "plinth", x: localIndex % 2 ? 2.3 : -2.3, y: 1.67, z, rotationY: 0, localIndex };
  }
  return { side: "left", x: -5.88, y: 2.28, z, rotationY: Math.PI / 2, localIndex };
}

export function wallLeftCount(zone) {
  return Math.ceil((zone?.exhibits.length || 1) / 2);
}

export function floorPlanX(placement) {
  if (placement.side === "left") return 22;
  if (placement.side === "right") return 78;
  return 50;
}

export function floorPlanY(index, routeLength) {
  return 24 + index / Math.max(1, routeLength - 1) * 272;
}

export function artworkSize(item) {
  if (item.galleryLayout === "paper-wall") return { width: 1.72, height: 1.18 };
  if (item.galleryLayout === "archive-wall") return { width: 1.22, height: 1.72 };
  if (item.galleryLayout === "dark-wall") return { width: 1.28, height: 2.06 };
  if (item.galleryLayout === "case") return { width: 1.08, height: 0.78 };
  return { width: 1.44, height: 1.06 };
}
