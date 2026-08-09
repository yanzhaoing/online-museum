import { sunHaibinExhibition } from "../content/exhibition-sunhaibin.js";

export { sunHaibinExhibition };

// 长廊/特展背景统一使用馆藏中国字画（管平湖作品），替代此前欧洲画廊照片；
// 运行时按档号从目录解析缩略图，目录重新生成也不会失效
export const CHINESE_BACKDROP_CODE = "MJCP-SHB-ZH.02-0009";

// 档号（code）→ 目录条目 的最佳匹配索引：同一档号可能存在多条重复记录，
// 优先选择有缩略图的影像条目，其次取文件较大者，保证展厅里展示质量稳定。
export function buildCodeIndex(items) {
  const index = new Map();
  for (const item of items || []) {
    const code = compactCode(item?.code);
    if (!code) continue;
    const prev = index.get(code);
    if (!prev || rankCatalogItem(item) > rankCatalogItem(prev)) {
      index.set(code, item);
    }
  }
  return index;
}

function rankCatalogItem(item) {
  const imageScore = item.kind === "image" && item.thumbPath ? 1e12 : 0;
  return imageScore + (item.size || 0);
}

function compactCode(code) {
  return String(code || "").replace(/\s+/g, "").toUpperCase();
}

// 把策展定义展开成线性幻灯片序列：
// 封面 → [展厅引言 → (单元引言 → 展品…)] × 3 → 结语
export function buildExhibitionSlides(items, definition = sunHaibinExhibition) {
  const codeIndex = buildCodeIndex(items);
  const slides = [];
  const missing = [];

  slides.push({
    id: `${definition.id}:cover`,
    type: "cover",
    title: definition.title,
    subtitle: definition.subtitle,
    paragraphs: definition.preface,
  });

  definition.halls.forEach((hall, hallIndex) => {
    const hallItemCount = hall.units.reduce((sum, unit) => sum + unit.items.length, 0);
    slides.push({
      id: `${definition.id}:${hall.id}`,
      type: "hall",
      hallIndex,
      indexLabel: hall.indexLabel,
      kind: hall.kind,
      title: hall.title,
      subtitle: hall.subtitle,
      paragraphs: [hall.intro],
      itemCount: hallItemCount,
    });

    hall.units.forEach((unit, unitIndex) => {
      slides.push({
        id: `${definition.id}:${hall.id}:${unit.id}`,
        type: "unit",
        hallIndex,
        unitIndex,
        hallTitle: hall.title,
        indexLabel: unit.indexLabel,
        title: unit.title,
        subtitle: unit.subtitle,
        paragraphs: [unit.intro],
      });

      unit.items.forEach((content, indexInUnit) => {
        const item = codeIndex.get(compactCode(content.code)) || null;
        if (!item) {
          missing.push(content.code);
          return;
        }
        slides.push({
          id: `${definition.id}:${hall.id}:${unit.id}:${compactCode(content.code)}`,
          type: "item",
          hallIndex,
          unitIndex,
          indexInUnit,
          hallLabel: hall.indexLabel,
          hallTitle: hall.title,
          unitLabel: unit.indexLabel,
          unitTitle: unit.title,
          unitCount: unit.items.length,
          title: content.title,
          text: content.text,
          code: content.code,
          codeRange: content.codeRange || content.code,
          item,
          itemId: item.id,
        });
      });
    });
  });

  slides.push({
    id: `${definition.id}:finale`,
    type: "finale",
    title: "结语",
    paragraphs: definition.conclusion,
  });

  slides.forEach((slide, index) => {
    slide.index = index;
  });

  const itemSlides = slides.filter((slide) => slide.type === "item");
  return {
    id: definition.id,
    eyebrow: definition.eyebrow,
    title: definition.title,
    subtitle: definition.subtitle,
    summary: definition.summary,
    slides,
    total: slides.length,
    itemTotal: itemSlides.length,
    missing,
  };
}
