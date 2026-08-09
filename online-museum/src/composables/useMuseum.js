import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  catalogItems,
  countBy,
  displayTitle,
  previewPath,
  relatedItems,
  topEntries,
  topicTitle,
  uniqueSorted,
} from "../lib/catalog";
import { buildMuseumTour, buildMuseumTours, museumTourDefinitions } from "../lib/tours";
import { toImmersiveGallery } from "../lib/immersive-gallery/presentation";
import { buildExhibitionSlides } from "../lib/exhibition";

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
  const museumTours = buildMuseumTours(items);
  const defaultMuseumTour = museumTours[0];
  const virtualGallery = toImmersiveGallery(defaultMuseumTour);

  const query = ref("");
  const category = ref(ALL);
  const collector = ref(ALL);
  const type = ref(ALL);
  const view = ref("hall");
  const visibleLimit = ref(84);
  const featured = ref([]);
  const featuredIndex = ref(0);
  const compare = ref([]);
  const viewed = ref([]);
  const suggestionsOpen = ref(false);
  const detailItem = ref(null);
  const detailOpen = ref(false);
  const summaryOpen = ref(false);
  const exhibitionTextOpen = ref(false);
  const exhibitionSlides = buildExhibitionSlides(items);
  const toast = ref("");
  const toastVisible = ref(false);
  const isDark = ref(false);

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
  const resultText = computed(() => `当前显示 ${visibleItems.value.length.toLocaleString("zh-CN")} / ${items.length.toLocaleString("zh-CN")} 件`);

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
  const selectedTourId = ref("collection-highlights");
  const selectedMuseumTour = computed(() =>
    museumTours.find((tour) => tour.id === selectedTourId.value) || defaultMuseumTour);
  const topicRoutes = computed(() => ["票据类", "文献类", "字画类", "器物类", "徽章印章类"]
    .filter((name) => categoryCounts[name])
    .map((name) => ({
      name,
      title: topicTitle(name),
      count: categoryCounts[name],
      sample: items.find((item) => item.category === name),
    })));
  const activeMuseumTour = computed(() => {
    if (!activeFilters.value.length) return selectedMuseumTour.value;
    return buildMuseumTour(filteredItems.value, {
      ...museumTourDefinitions[0],
      id: "filtered-selection",
      title: "筛选结果导览",
    });
  });
  const activeVirtualGallery = computed(() => toImmersiveGallery(activeMuseumTour.value));

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

  // 切换虚拟展馆游线（如「琴韵流芳·孙海滨古琴展」）；切游线时清除筛选，避免被筛选游线覆盖
  function chooseTour(id) {
    if (!museumTours.some((tour) => tour.id === id)) return;
    selectedTourId.value = id;
    query.value = "";
    category.value = ALL;
    collector.value = ALL;
    type.value = ALL;
  }

  function openExhibitionText() {
    exhibitionTextOpen.value = true;
  }

  function closeExhibitionText() {
    exhibitionTextOpen.value = false;
  }

  function setView(nextView) {
    view.value = nextView;
    visibleLimit.value = nextView === "table" ? 220 : 84;
  }

  function loadMore() {
    visibleLimit.value += 84;
  }

  function resetFilters(scroll = true) {
    query.value = "";
    category.value = ALL;
    collector.value = ALL;
    type.value = ALL;
    visibleLimit.value = view.value === "table" ? 220 : 84;
    closeSuggestions();
    if (scroll) scrollToSection("#catalog", "smooth");
  }

  function chooseTopic(name) {
    category.value = name;
    collector.value = ALL;
    visibleLimit.value = view.value === "table" ? 220 : 84;
    showToast(`已切换至「${topicTitle(name)}」专题路线`);
    goToHall();
  }

  function chooseCollector(name) {
    collector.value = name;
    category.value = ALL;
    visibleLimit.value = view.value === "table" ? 220 : 84;
    goToHall();
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
    let target = null;
    try {
      target = document.querySelector(selector);
    } catch (error) {
      return;
    }
    if (!target) return;
    const top = Math.max(0, target.offsetTop - 84);
    target.setAttribute("tabindex", "-1");
    try {
      target.focus({ preventScroll: true });
    } catch (error) {
      target.focus();
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
  });

  loadViewed();
  makeFeatured();
  startFeaturedLoop();

  onBeforeUnmount(() => {
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
    museumTours,
    selectedTourId,
    selectedMuseumTour,
    activeMuseumTour,
    activeVirtualGallery,
    collectorCards,
    virtualGallery,
    exhibitionTextOpen,
    exhibitionSlides,
    viewedItems,
    recentViewedItems,
    viewedPercent,
    compareHint,
    summaryData,
    displayTitle,
    previewPath,
    relatedItems: (item) => relatedItems(items, item),
    isViewed,
    setFilter,
    setView,
    loadMore,
    resetFilters,
    chooseTopic,
    chooseCollector,
    chooseTour,
    openDetail,
    closeDetail,
    openSummary,
    closeSummary,
    openExhibitionText,
    closeExhibitionText,
    addCompare,
    removeCompare,
    clearTrail,
    openSuggestions,
    closeSuggestions,
    openFirstSuggestion,
    showToast,
    toggleTheme,
    scrollToSection,
    restoreHashPosition,
  };
}
