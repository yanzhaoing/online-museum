const catalog = window.MUSEUM_CATALOG || { items: [], stats: {} };
const GENERIC_SOURCE_COLLECTORS = new Set(["给编委会的", "党史办"]);

export const catalogStats = catalog.stats || {};
export const catalogItems = Array.isArray(catalog.items) ? catalog.items.map(normalizeCatalogItem) : [];

export function normalizeCollectorName(name) {
  const value = String(name || "").trim();
  if (!value) return "馆藏";
  if (value.includes("档案馆")) return "档案馆";
  if (GENERIC_SOURCE_COLLECTORS.has(value)) return "馆藏";
  return value;
}

function buildSearchText(item) {
  return [
    item.code,
    item.title,
    item.collector,
    item.category,
    item.kindLabel,
    item.fileName,
    item.folder,
  ].filter(Boolean).join(" ").toLowerCase();
}

function normalizeCatalogItem(item) {
  const normalized = { ...item, collector: normalizeCollectorName(item?.collector) };
  return { ...normalized, search: buildSearchText(normalized) };
}

export function uniqueSorted(source, key) {
  return [...new Set(source.map((item) => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function countBy(source, key) {
  return source.reduce((acc, item) => {
    const value = item[key] || "未分类";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

export function topEntries(source, key, limit = 9) {
  return Object.entries(countBy(source, key)).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function fileUrl(path) {
  return encodeURI(String(path || "").replaceAll("\\", "/"));
}

export function previewPath(item) {
  return item?.thumbPath || item?.path || "";
}

export function formatBytes(bytes) {
  if (!bytes) return "未知";
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function displayTitle(item) {
  const title = String(item?.title || "").trim();
  if (!title || /^\d{1,4}$/.test(title) || title.length < 3) {
    return `${item?.category || "藏品"} · ${item?.code || item?.fileName || ""}`;
  }
  return title;
}

export function stableVariant(item, length, salt = 0) {
  const source = `${item?.id || ""}${item?.code || ""}${item?.fileName || ""}`;
  const total = [...source].reduce((sum, char) => sum + char.charCodeAt(0), salt);
  return length ? total % length : 0;
}

export function topicTitle(name) {
  return {
    "票据类": "票据与日常流通",
    "文献类": "纸本文献与地方记录",
    "字画类": "笔墨手迹与审美线索",
    "器物类": "器物形态与使用场景",
    "徽章印章类": "徽章印章与身份标识",
  }[name] || name;
}

const VIRTUAL_GALLERY_ZONES = [
  {
    category: "票据类",
    title: "票据与日常流通",
    subtitle: "民国时期各类收据、证照与票据，记录社会经济活动与民众生活。",
    count: 6,
    layout: "paper-wall",
    accent: "#b8792b",
  },
  {
    category: "文献类",
    title: "文献与印刷记忆",
    subtitle: "契约、信札、谱牒与登记材料，保留地方社会运行的文字线索。",
    count: 5,
    layout: "archive-wall",
    accent: "#2f6f68",
  },
  {
    category: "徽章印章类",
    title: "徽章与印章",
    subtitle: "徽章、奖章、印章与标识物，浓缩身份、组织和制度记忆。",
    count: 5,
    layout: "case",
    accent: "#9f3f32",
  },
  {
    category: "字画类",
    title: "碑刻与书法",
    subtitle: "拓片、题字与书写材料，在笔触、章法和石刻痕迹中呈现时间层次。",
    count: 4,
    layout: "dark-wall",
    accent: "#59616c",
  },
  {
    category: "器物类",
    title: "器物与日常器用",
    subtitle: "生活器物、纪念物与使用痕迹，让抽象记忆落到具体物件。",
    count: 4,
    layout: "plinth",
    accent: "#8a6a39",
  },
];

const LOW_PRIORITY_COLLECTORS = new Set(["给编委会的"]);

export function buildVirtualGallery(source) {
  const zones = [];
  const route = [];

  VIRTUAL_GALLERY_ZONES.forEach((zone, zoneIndex) => {
    const selected = selectGalleryItems(source, zone.category, zone.count);
    const enriched = selected.map((item, localIndex) => ({
      ...item,
      galleryZone: zone.category,
      galleryZoneTitle: zone.title,
      gallerySubtitle: zone.subtitle,
      galleryAccent: zone.accent,
      galleryLayout: zone.layout,
      routeIndex: route.length + localIndex,
      galleryIntro: galleryIntro(item),
      galleryShortTitle: galleryShortTitle(item),
    }));
    route.push(...enriched);
    zones.push({
      ...zone,
      index: zoneIndex,
      totalItems: source.filter((item) => item.category === zone.category).length,
      imageItems: source.filter((item) => item.category === zone.category && item.kind === "image").length,
      exhibits: enriched,
    });
  });

  return { zones, route, total: route.length };
}

function selectGalleryItems(source, category, limit) {
  const seenCodes = new Set();
  const seenCollectors = new Map();

  return source
    .filter((item) => item.category === category && item.kind === "image" && item.thumbPath)
    .map((item, index) => ({ item, index, score: galleryCandidateScore(item, index) }))
    .sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code, "zh-CN"))
    .filter(({ item }) => {
      const code = compactCode(item.code);
      if (seenCodes.has(code)) return false;
      const collectorCount = seenCollectors.get(item.collector) || 0;
      const collectorCap = LOW_PRIORITY_COLLECTORS.has(item.collector) ? 1 : 4;
      if (collectorCount >= collectorCap) return false;
      seenCodes.add(code);
      seenCollectors.set(item.collector, collectorCount + 1);
      return true;
    })
    .slice(0, limit)
    .map(({ item }) => item);
}

function galleryCandidateScore(item, index) {
  const sizeScore = Math.min(48, Math.log10(Math.max(1, item.size || 1)) * 7);
  const sourceScore = LOW_PRIORITY_COLLECTORS.has(item.collector) ? -16 : 10;
  const codeScore = compactCode(item.code).length > 10 ? 8 : 0;
  const imageScore = item.thumbPath ? 18 : 0;
  return sizeScore + sourceScore + codeScore + imageScore + stableVariant(item, 13, index);
}

function compactCode(code) {
  return String(code || "").replace(/\s+/g, "").toUpperCase();
}

function galleryShortTitle(item) {
  const suffix = compactCode(item?.code).split("-").slice(-1)[0] || item?.fileName || "";
  const title = topicTitle(item?.category || "");
  return `${title} · ${suffix}`;
}

function galleryIntro(item) {
  return `这件展品来自${item?.collector || "馆藏"}，编号 ${item?.code || "未编号"}。${categoryInterpretation(item)}${kindInterpretation(item)}`;
}

export function categoryInterpretation(item) {
  const copy = {
    "票据类": [
      "票据保存了交易、流通与日常结算的细节，是观察地方商业秩序的切入口。",
      "票面上的金额、抬头、印记和编号，能帮助观众理解当时的经济往来与社会关系。",
      "这类材料往往来自具体场景，适合从使用痕迹进入个人生活与公共制度的交界处。",
    ],
    "文献类": [
      "文献记录了制度、家族、教育与公共事务的痕迹，适合从文字关系中还原历史现场。",
      "纸页中的署名、时间、用语和版式，共同构成一条可继续追索的地方记录。",
      "这类档案的价值不只在内容本身，也在它呈现出的流转路径、保存状态和社会语境。",
    ],
    "字画类": [
      "字画承载书写、审美与交往信息，笔墨、题款和装裱细节都可成为理解作品的线索。",
      "从线条、落款、印章和纸面状态进入，可以看到作品背后的审美趣味与人际往来。",
      "这类藏品适合近距离观看，在笔触、章法与保存痕迹之间寻找时间留下的层次。",
    ],
    "器物类": [
      "器物保留了使用方式、材料工艺与生活场景，能让抽象记忆重新落到具体物件上。",
      "尺寸、材质、磨损和结构细节，共同指向它曾经被使用、携带或陈设的方式。",
      "这类藏品的观看重点在形制与痕迹，观众可以由物件本身进入当时的生活现场。",
    ],
    "徽章印章类": [
      "徽章与印章浓缩了身份、组织和制度标识，适合追踪个人经历与时代结构之间的关系。",
      "图案、文字、编号和铸印工艺，使这类藏品成为身份确认与组织记忆的可视证据。",
      "这类材料通常具有明确标识性，适合从图形、铭文和使用场景展开观察。",
    ],
  };
  const variants = copy[item?.category] || [
    "这件藏品保留了民间收藏中的具体信息，可从名称、编号、来源和保存形态进入观察。",
    "它提供了一条进入馆藏结构的线索，适合结合类别、藏家和文件形态进行比较。",
    "观众可以从题名、来源目录和保存状态出发，建立对这件藏品的初步判断。",
  ];
  return variants[stableVariant(item, variants.length)];
}

export function kindInterpretation(item) {
  const imageCopy = [
    "当前条目提供影像预览，可直接查看纹理、版式、题写和保存状态。",
    "影像文件便于放大观察细节，也适合与同类条目并置比较。",
    "通过图像可以先判断外观特征，再进入原始档案核对更多信息。",
  ];
  const pdfCopy = [
    "当前条目以 PDF 归档，适合打开原始文件进一步阅读完整页序与细节。",
    "PDF 文件保留了较完整的档案结构，可用于连续阅读和资料核对。",
    "如需查看全文或多页内容，可进入原始档案继续浏览。",
  ];
  const variants = item?.kind === "image" ? imageCopy : pdfCopy;
  return variants[stableVariant(item, variants.length, 17)];
}

export function docentText(item) {
  const folder = String(item?.folder || "").split(/[\\/]/).slice(-2).join(" / ");
  return `编号 ${item?.code || "未编号"}，归入${item?.category || "未分类"}，登记来源：${item?.collector || "馆藏"}。档案目录为${folder || "馆藏数字档案"}。${categoryInterpretation(item)}${kindInterpretation(item)}`;
}

export function relatedItems(source, item) {
  if (!item) return [];
  return source
    .filter((entry) => entry.id !== item.id && (entry.category === item.category || entry.collector === item.collector))
    .slice(0, 4);
}
