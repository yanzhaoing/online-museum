import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  catalogItems,
  buildVirtualGallery,
  countBy,
  displayTitle,
  docentText,
  previewPath,
  relatedItems,
  stableVariant,
  topEntries,
  topicTitle,
  uniqueSorted,
} from "../lib/catalog";

const ALL = "全部";

export function useMuseum() {
  const items = catalogItems;
  const categories = uniqueSorted(items, "category");
  const collectors = uniqueSorted(items, "collector");
  const types = uniqueSorted(items, "kindLabel");
  const categoryCounts = countBy(items, "category");
  const collectorCounts = countBy(items, "collector");
  const categoryChartEntries = topEntries(items, "category", 8);
  const collectorChartEntries = topEntries(items, "collector", 8);
  const virtualGallery = buildVirtualGallery(items);

  const query = ref("");
  const category = ref(ALL);
  const collector = ref(ALL);
  const type = ref(ALL);
  const view = ref("hall");
  const visibleLimit = ref(84);
  const tour = ref([]);
  const activeStop = ref(0);
  const autoTour = ref(false);
  const tourBasis = ref([]);
  const tourSummary = ref("");
  const featured = ref([]);
  const featuredIndex = ref(0);
  const compare = ref([]);
  const viewed = ref([]);
  const suggestionsOpen = ref(false);
  const detailItem = ref(null);
  const detailOpen = ref(false);
  const summaryOpen = ref(false);
  const toast = ref("");
  const toastVisible = ref(false);
  const isDark = ref(false);

  let autoTimer = null;
  let featuredTimer = null;
  let toastTimer = null;

  const imageItems = items.filter((item) => item.kind === "image");
  const heroItems = imageItems
    .filter((_, index) => index % Math.max(1, Math.floor(imageItems.length / 32)) === 0)
    .slice(0, 32);

  const stats = computed(() => ({
    items: items.length,
    collectors: collectors.length,
    images: imageItems.length,
  }));

  const filteredItems = computed(() => {
    const needle = query.value.trim().toLowerCase();
    return items.filter((item) => {
      const matchQuery = !needle || String(item.search || "").includes(needle);
      const matchCategory = category.value === ALL || item.category === category.value;
      const matchCollector = collector.value === ALL || item.collector === collector.value;
      const matchType = type.value === ALL || item.kindLabel === type.value;
      return matchQuery && matchCategory && matchCollector && matchType;
    });
  });

  const displayResults = computed(() => (view.value === "table" ? filteredItems.value : visualFirst(filteredItems.value)));
  const visibleItems = computed(() => displayResults.value.slice(0, visibleLimit.value));
  const canLoadMore = computed(() => visibleItems.value.length < displayResults.value.length);
  const loadMoreCount = computed(() => Math.min(84, displayResults.value.length - visibleItems.value.length));
  const resultText = computed(() => `当前显示 ${filteredItems.value.length.toLocaleString("zh-CN")} / ${items.length.toLocaleString("zh-CN")} 件`);

  const activeFilters = computed(() => {
    const active = [];
    if (query.value.trim()) active.push(`关键词：${query.value.trim()}`);
    if (category.value !== ALL) active.push(`类别：${category.value}`);
    if (collector.value !== ALL) active.push(`藏家：${collector.value}`);
    if (type.value !== ALL) active.push(`形态：${type.value}`);
    return active;
  });

  const searchSuggestions = computed(() => {
    const needle = query.value.trim().toLowerCase();
    if (!needle) return [];
    return items
      .filter((item) => String(item.search || "").includes(needle))
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "image" ? -1 : 1;
        return a.code.localeCompare(b.code, "zh-CN");
      })
      .slice(0, 7);
  });

  const featuredItem = computed(() => featured.value[featuredIndex.value % Math.max(1, featured.value.length)]);
  const topicRoutes = computed(() => ["票据类", "文献类", "字画类", "器物类", "徽章印章类"]
    .filter((name) => categoryCounts[name])
    .map((name) => ({
      name,
      title: topicTitle(name),
      count: categoryCounts[name],
      sample: items.find((item) => item.category === name),
    })));

  const collectorCards = computed(() => topEntries(items, "collector", 8).map(([name, total]) => {
    const collectorItems = items.filter((item) => item.collector === name);
    const categorySummary = Object.entries(collectorItems.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {}))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([categoryName, count]) => `${categoryName} ${count}`)
      .join(" / ");
    return { name, total, categorySummary: categorySummary || "综合馆藏" };
  }));

  const byId = computed(() => new Map(items.map((item) => [item.id, item])));
  const viewedItems = computed(() => viewed.value.map((id) => byId.value.get(id)).filter(Boolean));
  const recentViewedItems = computed(() => viewedItems.value.slice(0, 5));
  const viewedPercent = computed(() => Math.min(100, Math.round(viewed.value.length / Math.max(1, items.length) * 1000) / 10));
  const compareHint = computed(() => compare.value.length ? `已选择 ${compare.value.length} 件藏品。` : "选择藏品加入对照，查看类别、藏家与形态之间的关联。");
  const activeTourItem = computed(() => tour.value[activeStop.value]);
  const activeTourBasis = computed(() => tourBasis.value.find((entry) => entry.id === activeTourItem.value?.id));
  const activeTourProgress = computed(() => Math.round((activeStop.value + 1) / Math.max(1, tour.value.length) * 100));
  const activeDocentText = computed(() => activeTourItem.value ? docentText(activeTourItem.value) : "");

  const summaryData = computed(() => {
    const recent = viewedItems.value;
    const counts = recent.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});
    return {
      recent,
      categoryRows: Object.entries(counts).sort((a, b) => b[1] - a[1]),
      categoryCount: Object.keys(counts).length,
      date: new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }),
    };
  });

  function visualFirst(source) {
    return [...source].sort((a, b) => {
      if (type.value === "PDF" || type.value === "影像") return 0;
      if (a.kind !== b.kind) return a.kind === "image" ? -1 : 1;
      return a.code.localeCompare(b.code, "zh-CN");
    });
  }

  function codeNumber(item) {
    const match = String(item.code || item.fileName || "").match(/(\d+)(?!.*\d)/);
    return match ? Number(match[1]) : 0;
  }

  function tourCandidateScore(item, index, sourceLength) {
    let score = 0;
    if (item.kind === "image") score += 42;
    if (item.thumbPath) score += 18;
    if (item.size && item.size > 80 * 1024) score += 8;
    if (item.category === category.value) score += 16;
    if (item.collector === collector.value) score += 14;
    if (query.value && item.search.includes(query.value.trim().toLowerCase())) score += 12;
    const position = sourceLength ? index / sourceLength : 0;
    score += Math.sin(position * Math.PI) * 10;
    score += stableVariant(item, 17);
    return score;
  }

  function selectionReason(item, selected, source) {
    const reasons = [];
    if (item.kind === "image") reasons.push("具备影像预览，适合在展厅中直接观看");
    else reasons.push("补入 PDF 档案，保留原始文献阅读线索");
    if (!selected.some((entry) => entry.category === item.category)) reasons.push(`补足「${item.category}」类别代表`);
    if (!selected.some((entry) => entry.collector === item.collector)) reasons.push("补充不同登记来源，扩大展线覆盖面");
    const number = codeNumber(item);
    if (number) {
      const existingNumbers = selected.map(codeNumber).filter(Boolean);
      const hasSpread = existingNumbers.every((value) => Math.abs(value - number) > 2);
      if (hasSpread) reasons.push("与已选展品形成编号跨度");
    }
    if (source.filter((entry) => entry.category === item.category).length > 1) reasons.push("可与同类条目建立横向比较");
    return reasons.slice(0, 3).join("；");
  }

  function selectCuratedTour(source, limit = 10) {
    const ranked = source
      .map((item, index) => ({ item, index, score: tourCandidateScore(item, index, source.length) }))
      .sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code, "zh-CN"));
    const selected = [];
    const basis = [];
    const categoryCountsByRoute = new Map();
    const collectorCountsByRoute = new Map();
    const kindCountsByRoute = new Map();
    const maxCategoryRepeat = source.length > 40 ? 3 : 4;
    const maxCollectorRepeat = source.length > 40 ? 3 : 4;

    for (const candidate of ranked) {
      if (selected.length >= limit) break;
      const item = candidate.item;
      const categoryCount = categoryCountsByRoute.get(item.category) || 0;
      const collectorCount = collectorCountsByRoute.get(item.collector) || 0;
      const kindCount = kindCountsByRoute.get(item.kindLabel) || 0;
      const allowLoose = source.length <= limit;
      if (!allowLoose && categoryCount >= maxCategoryRepeat) continue;
      if (!allowLoose && collectorCount >= maxCollectorRepeat) continue;
      if (!allowLoose && kindCount >= 8) continue;
      const reason = selectionReason(item, selected, source);
      selected.push(item);
      basis.push({ id: item.id, score: Math.round(candidate.score), reason });
      categoryCountsByRoute.set(item.category, categoryCount + 1);
      collectorCountsByRoute.set(item.collector, collectorCount + 1);
      kindCountsByRoute.set(item.kindLabel, kindCount + 1);
    }

    for (const candidate of ranked) {
      if (selected.length >= Math.min(limit, source.length)) break;
      if (selected.some((item) => item.id === candidate.item.id)) continue;
      selected.push(candidate.item);
      basis.push({
        id: candidate.item.id,
        score: Math.round(candidate.score),
        reason: selectionReason(candidate.item, selected, source) || "作为候补代表补齐展线结构",
      });
    }
    return { selected, basis };
  }

  function makeTour(source = displayResults.value) {
    if (!source.length) {
      tour.value = [];
      tourBasis.value = [];
      tourSummary.value = "";
      activeStop.value = 0;
      return;
    }
    const imageFirst = source.filter((item) => item.kind === "image");
    const basePool = imageFirst.length >= 10 ? imageFirst : source;
    const routeSalt = Date.now() % 997;
    const shuffledPool = [...basePool].sort((a, b) => stableVariant(a, 997, routeSalt) - stableVariant(b, 997, routeSalt));
    const { selected, basis } = selectCuratedTour(shuffledPool, 10);
    tour.value = selected;
    tourBasis.value = basis;
    const categoryTotal = new Set(selected.map((item) => item.category)).size;
    const collectorTotal = new Set(selected.map((item) => item.collector)).size;
    const imageTotal = selected.filter((item) => item.kind === "image").length;
    tourSummary.value = `本线从 ${source.length.toLocaleString("zh-CN")} 件候选藏品中生成，优先选择可预览影像，并控制类别、来源与编号跨度：共覆盖 ${categoryTotal} 个类别、${collectorTotal} 个来源，其中 ${imageTotal} 件可直接观看。`;
    activeStop.value = 0;
  }

  function makeFeatured() {
    const selected = categories.map((name, index) => {
      const pool = imageItems.filter((item) => item.category === name);
      return pool.length ? pool[Math.floor(pool.length * (index + 1) / (categories.length + 1))] : null;
    }).filter(Boolean).slice(0, 8);
    featured.value = selected.length ? selected : imageItems.slice(0, 8);
  }

  function startFeaturedLoop() {
    window.clearInterval(featuredTimer);
    featuredTimer = window.setInterval(() => {
      featuredIndex.value = (featuredIndex.value + 1) % Math.max(1, featured.value.length);
    }, 5200);
  }

  function loadViewed() {
    try {
      viewed.value = JSON.parse(localStorage.getItem("museumViewedItems") || "[]").filter(Boolean);
    } catch (error) {
      viewed.value = [];
    }
  }

  function saveViewed() {
    try {
      localStorage.setItem("museumViewedItems", JSON.stringify(viewed.value.slice(0, 80)));
    } catch (error) {
      viewed.value = viewed.value.slice(0, 80);
    }
  }

  function markViewed(id) {
    viewed.value = [id, ...viewed.value.filter((itemId) => itemId !== id)].slice(0, 80);
    saveViewed();
  }

  function isViewed(id) {
    return viewed.value.includes(id);
  }

  function openDetail(id) {
    const item = byId.value.get(id);
    if (!item) return;
    markViewed(id);
    detailItem.value = item;
    detailOpen.value = true;
  }

  function closeDetail() {
    detailOpen.value = false;
  }

  function openSummary() {
    summaryOpen.value = true;
  }

  function closeSummary() {
    summaryOpen.value = false;
  }

  function addCompare(id) {
    const item = byId.value.get(id);
    if (!item || compare.value.some((entry) => entry.id === id)) return;
    compare.value = [item, ...compare.value].slice(0, 4);
    showToast(`已加入对照：${displayTitle(item)}`);
  }

  function removeCompare(id) {
    compare.value = compare.value.filter((item) => item.id !== id);
  }

  function clearTrail() {
    viewed.value = [];
    saveViewed();
  }

  function showToast(message) {
    toast.value = message;
    toastVisible.value = true;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastVisible.value = false;
    }, 3200);
  }

  function setFilter(key, value) {
    const refs = { category, collector, type };
    if (!refs[key]) return;
    refs[key].value = value;
  }

  function setView(nextView) {
    view.value = nextView;
    visibleLimit.value = nextView === "table" ? 220 : 84;
  }

  function loadMore() {
    visibleLimit.value += 84;
  }

  function resetFilters(scroll = true) {
    stopAutoTour();
    query.value = "";
    category.value = ALL;
    collector.value = ALL;
    type.value = ALL;
    visibleLimit.value = view.value === "table" ? 220 : 84;
    closeSuggestions();
    makeTour(visualFirst(filteredItems.value));
    if (scroll) scrollToSection("#catalog", "smooth");
  }

  function chooseTopic(name) {
    category.value = name;
    collector.value = ALL;
    visibleLimit.value = view.value === "table" ? 220 : 84;
    stopAutoTour();
    makeTour(visualFirst(filteredItems.value));
    goToHall();
  }

  function chooseCollector(name) {
    collector.value = name;
    category.value = ALL;
    visibleLimit.value = view.value === "table" ? 220 : 84;
    stopAutoTour();
    makeTour(visualFirst(filteredItems.value));
    goToHall();
  }

  function setActiveStop(index) {
    if (!tour.value.length) return false;
    const previous = activeStop.value;
    activeStop.value = (index + tour.value.length) % tour.value.length;
    if (activeStop.value === tour.value.length - 1 && previous !== activeStop.value) {
      showToast("即将完成本条展线，点击“继续参观”可回到起点。");
    }
    return previous !== activeStop.value;
  }

  function nextStop() {
    setActiveStop(activeStop.value + 1);
  }

  function previousStop() {
    setActiveStop(activeStop.value - 1);
  }

  function continueTour() {
    stopAutoTour();
    if (activeStop.value === tour.value.length - 1) {
      showToast("本条展线参观完成，已回到第一件展品。");
    }
    nextStop();
  }

  function startAutoTour() {
    if (!tour.value.length) return;
    stopAutoTour();
    autoTour.value = true;
    autoTimer = window.setInterval(nextStop, 3600);
  }

  function stopAutoTour() {
    autoTour.value = false;
    if (autoTimer) window.clearInterval(autoTimer);
    autoTimer = null;
  }

  function toggleAutoTour() {
    if (autoTour.value) stopAutoTour();
    else startAutoTour();
  }

  function shuffleTour() {
    stopAutoTour();
    makeTour(visualFirst(filteredItems.value));
  }

  function openSuggestions() {
    suggestionsOpen.value = true;
  }

  function closeSuggestions() {
    suggestionsOpen.value = false;
  }

  function openFirstSuggestion() {
    const first = searchSuggestions.value[0];
    if (!first) return;
    closeSuggestions();
    openDetail(first.id);
  }

  function toggleTheme() {
    isDark.value = !isDark.value;
    document.body.classList.toggle("dark", isDark.value);
  }

  function scrollToSection(selector, behavior = "smooth") {
    const target = document.querySelector(selector);
    if (!target) return;
    const top = Math.max(0, target.offsetTop - 84);
    target.setAttribute("tabindex", "-1");
    try {
      target.focus({ preventScroll: false });
    } catch (error) {
      target.focus();
    }
    if (document.scrollingElement) {
      document.scrollingElement.scrollTop = top;
      return;
    }
    try {
      window.scrollTo({ top, behavior });
    } catch (error) {
      target.scrollIntoView({ behavior, block: "start" });
    }
  }

  function goToHall() {
    window.location.hash = "hall";
    window.requestAnimationFrame(() => scrollToSection("#hall", "smooth"));
  }

  function restoreHashPosition() {
    if (!window.location.hash) return;
    const restore = () => scrollToSection(window.location.hash, "auto");
    window.requestAnimationFrame(() => {
      restore();
      window.setTimeout(restore, 250);
      window.setTimeout(restore, 800);
    });
  }

  watch([query, category, collector, type], () => {
    visibleLimit.value = view.value === "table" ? 220 : 84;
    stopAutoTour();
    makeTour(visualFirst(filteredItems.value));
  });

  watch(view, () => {
    if (view.value === "hall") makeTour(visualFirst(filteredItems.value));
  });

  loadViewed();
  makeFeatured();
  makeTour(visualFirst(filteredItems.value));
  startFeaturedLoop();

  onBeforeUnmount(() => {
    stopAutoTour();
    window.clearInterval(featuredTimer);
    window.clearTimeout(toastTimer);
  });

  return {
    items,
    query,
    category,
    collector,
    type,
    view,
    visibleLimit,
    tour,
    activeStop,
    autoTour,
    tourBasis,
    tourSummary,
    featured,
    featuredIndex,
    compare,
    viewed,
    suggestionsOpen,
    detailItem,
    detailOpen,
    summaryOpen,
    toast,
    toastVisible,
    isDark,
    categories,
    collectors,
    types,
    collectorCounts,
    categoryChartEntries,
    collectorChartEntries,
    heroItems,
    stats,
    filteredItems,
    displayResults,
    visibleItems,
    canLoadMore,
    loadMoreCount,
    resultText,
    activeFilters,
    searchSuggestions,
    featuredItem,
    topicRoutes,
    collectorCards,
    virtualGallery,
    viewedItems,
    recentViewedItems,
    viewedPercent,
    compareHint,
    activeTourItem,
    activeTourBasis,
    activeTourProgress,
    activeDocentText,
    summaryData,
    displayTitle,
    docentText,
    previewPath,
    relatedItems: (item) => relatedItems(items, item),
    isViewed,
    setFilter,
    setView,
    loadMore,
    resetFilters,
    chooseTopic,
    chooseCollector,
    openDetail,
    closeDetail,
    openSummary,
    closeSummary,
    addCompare,
    removeCompare,
    clearTrail,
    setActiveStop,
    nextStop,
    previousStop,
    continueTour,
    stopAutoTour,
    toggleAutoTour,
    shuffleTour,
    openSuggestions,
    closeSuggestions,
    openFirstSuggestion,
    showToast,
    toggleTheme,
    scrollToSection,
    restoreHashPosition,
  };
}
