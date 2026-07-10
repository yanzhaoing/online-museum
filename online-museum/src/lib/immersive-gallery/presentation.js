const IMMERSIVE_GROUP_STYLES = {
  "circulation-records": { layout: "paper-wall", accent: "#b8792b" },
  "printed-memory": { layout: "archive-wall", accent: "#2f6f68" },
  "identity-marks": { layout: "case", accent: "#9f3f32" },
  "writing-and-inscriptions": { layout: "dark-wall", accent: "#59616c" },
  "objects-in-use": { layout: "plinth", accent: "#8a6a39" },
};

export function toImmersiveGallery(tour) {
  if (!tour) return { zones: [], route: [], total: 0 };
  const route = [];
  const zones = tour.groups.map((group) => {
    const style = IMMERSIVE_GROUP_STYLES[group.id] || { layout: "paper-wall", accent: "#b98a36" };
    const exhibits = group.stops.map((stop) => {
      const exhibit = {
        ...stop.item,
        tourStopId: stop.id,
        tourDescription: stop.description,
        tourBackground: stop.background,
        galleryZone: group.id,
        galleryZoneTitle: group.title,
        gallerySubtitle: group.description,
        galleryAccent: style.accent,
        galleryLayout: style.layout,
        galleryIntro: stop.description,
        galleryShortTitle: stop.title,
        routeIndex: route.length,
      };
      route.push(exhibit);
      return exhibit;
    });
    return {
      id: group.id,
      category: group.id,
      sourceCategory: group.sourceCategory,
      title: group.title,
      subtitle: group.description,
      background: group.background,
      index: group.index,
      layout: style.layout,
      accent: style.accent,
      totalItems: group.availableItems,
      imageItems: group.availableImages,
      exhibits,
    };
  });

  return {
    tourId: tour.id,
    title: tour.title,
    summary: tour.summary,
    zones,
    route,
    total: route.length,
  };
}
