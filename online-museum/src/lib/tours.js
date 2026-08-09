import { museumTourDefinitions } from "../content/tours.js";
import { categoryInterpretation, kindInterpretation, stableVariant, topicTitle } from "./catalog.js";

const LOW_PRIORITY_COLLECTORS = new Set(["给编委会的"]);

export { museumTourDefinitions };

export function buildMuseumTours(source, definitions = museumTourDefinitions) {
  return definitions.map((definition) => buildMuseumTour(source, definition));
}

export function buildMuseumTour(source, definition = museumTourDefinitions[0]) {
  const groups = definition.groups.map((group, groupIndex) => {
    const entries = resolveTourEntries(source, group);
    const stops = entries.map((entry, itemIndex) => createTourStop(definition, group, entry, groupIndex, itemIndex));
    const sourceCategory = group.selection?.category || stops[0]?.item.category || "";
    return {
      id: group.id,
      title: group.title,
      description: group.description,
      background: group.background,
      hall: group.hall || "",
      index: groupIndex,
      selection: group.selection ? { ...group.selection } : null,
      sourceCategory,
      availableItems: sourceCategory ? source.filter((item) => item.category === sourceCategory).length : stops.length,
      availableImages: sourceCategory ? source.filter((item) => item.category === sourceCategory && item.kind === "image").length : stops.filter((stop) => stop.item.kind === "image").length,
      stops,
    };
  });
  const stops = groups.flatMap((group) => group.stops);

  return {
    id: definition.id,
    title: definition.title,
    shortTitle: definition.shortTitle,
    eyebrow: definition.eyebrow,
    summary: definition.summary,
    groups,
    stops,
    total: stops.length,
  };
}

function createTourStop(tour, group, entry, groupIndex, itemIndex) {
  const { item, content } = entry;
  return {
    id: `${tour.id}:${group.id}:${item.id}`,
    itemId: item.id,
    groupId: group.id,
    groupIndex,
    indexInGroup: itemIndex,
    title: content.title || item.tourTitle || shortTourTitle(item),
    description: content.description || item.description || item.detailedDescription || defaultItemDescription(item),
    background: content.background || item.backgroundStory || item.background || group.background || "",
    item,
  };
}

function resolveTourEntries(source, group) {
  const byId = new Map(source.map((item) => [String(item.id), item]));
  if (Array.isArray(group.stops) && group.stops.length) {
    const byCode = new Map();
    for (const item of source) {
      const code = compactCode(item.code);
      if (!code) continue;
      const prev = byCode.get(code);
      if (!prev || rankTourItem(item) > rankTourItem(prev)) byCode.set(code, item);
    }
    return group.stops
      .map((content) => {
        const item = content.itemId != null
          ? byId.get(String(content.itemId))
          : byCode.get(compactCode(content.code));
        return { item, content };
      })
      // code 定位的展品只上墙有影像的条目（PDF 档案由展览文本抽屉呈现）
      .filter((entry) => entry.item && (entry.content.itemId != null || entry.item.kind === "image"));
  }
  if (Array.isArray(group.itemIds) && group.itemIds.length) {
    return group.itemIds
      .map((itemId) => ({ item: byId.get(String(itemId)), content: {} }))
      .filter((entry) => entry.item);
  }
  return selectTourItems(source, group.selection).map((item) => ({ item, content: {} }));
}

function selectTourItems(source, selection = {}) {
  const seenCodes = new Set();
  const seenCollectors = new Map();
  const limit = selection.limit ?? 8;

  return source
    .filter((item) => (!selection.category || item.category === selection.category) && item.kind === "image" && item.thumbPath)
    .map((item, index) => ({ item, score: tourCandidateScore(item, index) }))
    .sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code, "zh-CN"))
    .filter(({ item }) => {
      const code = compactCode(item.code);
      if (seenCodes.has(code)) return false;
      const collectorCount = seenCollectors.get(item.collector) || 0;
      const collectorCap = LOW_PRIORITY_COLLECTORS.has(item.sourceCollector) ? 1 : 4;
      if (collectorCount >= collectorCap) return false;
      seenCodes.add(code);
      seenCollectors.set(item.collector, collectorCount + 1);
      return true;
    })
    .slice(0, limit)
    .map(({ item }) => item);
}

function tourCandidateScore(item, index) {
  const sizeScore = Math.min(48, Math.log10(Math.max(1, item.size || 1)) * 7);
  const sourceScore = LOW_PRIORITY_COLLECTORS.has(item.sourceCollector) ? -16 : 10;
  const codeScore = compactCode(item.code).length > 10 ? 8 : 0;
  const imageScore = item.thumbPath ? 18 : 0;
  return sizeScore + sourceScore + codeScore + imageScore + stableVariant(item, 13, index);
}

function compactCode(code) {
  return String(code || "").replace(/\s+/g, "").toUpperCase();
}

// 同一档号可能有多条重复记录：优先有缩略图的影像条目，其次取文件较大者
function rankTourItem(item) {
  const imageScore = item?.kind === "image" && item?.thumbPath ? 1e12 : 0;
  return imageScore + (item?.size || 0);
}

function shortTourTitle(item) {
  const suffix = compactCode(item?.code).split("-").slice(-1)[0] || item?.fileName || "";
  return `${topicTitle(item?.category || "藏品")} · ${suffix}`;
}

function defaultItemDescription(item) {
  return `这件展品来自${item?.collector || "馆藏"}，编号 ${item?.code || "未编号"}。${categoryInterpretation(item)}${kindInterpretation(item)}`;
}
