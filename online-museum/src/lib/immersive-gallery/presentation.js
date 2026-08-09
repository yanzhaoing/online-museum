const IMMERSIVE_GROUP_STYLES = {
  "circulation-records": { layout: "paper-wall", accent: "#a6603f" },
  "printed-memory": { layout: "archive-wall", accent: "#2f6f68" },
  "identity-marks": { layout: "case", accent: "#9f3f32" },
  "writing-and-inscriptions": { layout: "dark-wall", accent: "#59616c" },
  "objects-in-use": { layout: "plinth", accent: "#6b4a3a" },
  // 孙海滨古琴展八单元：文献 → 档案/纸墙，器物 → 展柜/展台，字画 → 深色墙
  "unit-qinxue": { layout: "archive-wall", accent: "#a63c2a" },
  "unit-manuscripts": { layout: "paper-wall", accent: "#8a5343" },
  "unit-seals": { layout: "case", accent: "#a63c2a" },
  "unit-qin-craft": { layout: "plinth", accent: "#6b4a3a" },
  "unit-recordings": { layout: "case", accent: "#4a4f5c" },
  "unit-qin-heart": { layout: "dark-wall", accent: "#a63c2a" },
  "unit-masters": { layout: "dark-wall", accent: "#5c5148" },
  "unit-paintings": { layout: "paper-wall", accent: "#7a6248" },
};

export function toImmersiveGallery(tour) {
  if (!tour) return { zones: [], route: [], total: 0 };
  const route = [];
  const zones = tour.groups.map((group) => {
    const style = IMMERSIVE_GROUP_STYLES[group.id] || { layout: "paper-wall", accent: "#a63c2a" };
    const exhibits = group.stops.map((stop) => {
      const exhibit = {
        ...stop.item,
        tourStopId: stop.id,
        tourDescription: stop.description,
        tourBackground: stop.background,
        galleryZone: group.id,
        galleryZoneTitle: group.title,
        gallerySubtitle: group.description,
        galleryHall: group.hall || "",
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
      hall: group.hall || "",
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
