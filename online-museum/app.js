(function () {
  const catalog = window.MUSEUM_CATALOG || { items: [], stats: {} };
  const items = catalog.items;
  const state = {
    query: "",
    category: "全部",
    collector: "全部",
    type: "全部",
    view: "hall",
    visibleLimit: 84,
    tour: [],
    activeStop: 0,
    autoTour: false,
    autoTimer: null,
    featured: [],
    featuredIndex: 0,
    featuredTimer: null,
    tourBasis: [],
    tourSummary: "",
    compare: [],
    viewed: [],
  };

  const $ = (selector) => document.querySelector(selector);
  const els = {
    heroMedia: $("#heroMedia"),
    cursorHalo: $("#cursorHalo"),
    search: $("#searchInput"),
    searchSuggestions: $("#searchSuggestions"),
    categoryFilters: $("#categoryFilters"),
    collectorFilters: $("#collectorFilters"),
    typeFilters: $("#typeFilters"),
    resultCount: $("#resultCount"),
    filterSummary: $("#filterSummary"),
    catalogView: $("#catalogView"),
    stage: $("#stage"),
    galleryGuide: $("#galleryGuide"),
    tourMap: $("#tourMap"),
    featuredCard: $("#featuredCard"),
    featuredCounter: $("#featuredCounter"),
    topicRoutes: $("#topicRoutes"),
    tourStops: $("#tourStops"),
    detailDialog: $("#detailDialog"),
    detailBody: $("#detailBody"),
    summaryDialog: $("#summaryDialog"),
    summaryBody: $("#summaryBody"),
    tourToast: $("#tourToast"),
    compareTray: $("#compareTray"),
    compareHint: $("#compareHint"),
    categoryChart: $("#categoryChart"),
    collectorChart: $("#collectorChart"),
    collectorStrip: $("#collectorStrip"),
    visitTrail: $("#visitTrail"),
  };
  let revealObserver;

  function uniqueSorted(key) {
    return [...new Set(items.map((item) => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  function countBy(key) {
    return items.reduce((acc, item) => {
      const value = item[key] || "未分类";
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  function topEntries(key, limit = 9) {
    return Object.entries(countBy(key)).sort((a, b) => b[1] - a[1]).slice(0, limit);
  }

  function fileUrl(path) {
    return encodeURI(path.replaceAll("\\", "/"));
  }

  function previewPath(item) {
    return item.thumbPath || item.path;
  }

  function mediaHtml(item, className = "") {
    if (item.kind === "image") {
      return `<img class="${className}" src="${fileUrl(previewPath(item))}" alt="${escapeHtml(displayTitle(item))}" loading="eager" decoding="async">`;
    }
    return `<div class="pdf-face ${className}"><strong>PDF</strong><span>${escapeHtml(displayTitle(item))}</span></div>`;
  }

  function pdfThumbHtml(item, className = "") {
    return `<span class="pdf-thumb ${className}"><strong>PDF</strong><em>${escapeHtml(displayTitle(item))}</em></span>`;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[char]);
  }

  function formatBytes(bytes) {
    if (!bytes) return "未知";
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function displayTitle(item) {
    const title = String(item.title || "").trim();
    if (!title || /^\d{1,4}$/.test(title) || title.length < 3) {
      return `${item.category} · ${item.code}`;
    }
    return title;
  }

  function closestTarget(target, selector) {
    if (!target) return null;
    if (typeof target.closest === "function") return target.closest(selector);
    return target.parentElement?.closest(selector) || null;
  }

  function stableVariant(item, length, salt = 0) {
    const source = `${item.id || ""}${item.code || ""}${item.fileName || ""}`;
    const total = [...source].reduce((sum, char) => sum + char.charCodeAt(0), salt);
    return length ? total % length : 0;
  }

  function categoryInterpretation(item) {
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
    const variants = copy[item.category] || [
      "这件藏品保留了民间收藏中的具体信息，可从名称、编号、来源和保存形态进入观察。",
      "它提供了一条进入馆藏结构的线索，适合结合类别、藏家和文件形态进行比较。",
      "观众可以从题名、来源目录和保存状态出发，建立对这件藏品的初步判断。",
    ];
    return variants[stableVariant(item, variants.length)];
  }

  function kindInterpretation(item) {
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
    const variants = item.kind === "image" ? imageCopy : pdfCopy;
    return variants[stableVariant(item, variants.length, 17)];
  }

  function docentText(item) {
    const folder = String(item.folder || "").split(/[\\/]/).slice(-2).join(" / ");
    return `编号 ${item.code}，归入${item.category}，登记来源：${item.collector}。档案目录为${folder || "馆藏数字档案"}。${categoryInterpretation(item)}${kindInterpretation(item)}`;
  }

  function relatedItems(item) {
    return items
      .filter((entry) => entry.id !== item.id && (entry.category === item.category || entry.collector === item.collector))
      .slice(0, 4);
  }

  function loadViewed() {
    try {
      state.viewed = JSON.parse(localStorage.getItem("museumViewedItems") || "[]").filter(Boolean);
    } catch (error) {
      state.viewed = [];
    }
  }

  function saveViewed() {
    try {
      localStorage.setItem("museumViewedItems", JSON.stringify(state.viewed.slice(0, 80)));
    } catch (error) {
      state.viewed = state.viewed.slice(0, 80);
    }
  }

  function markViewed(id) {
    state.viewed = [id, ...state.viewed.filter((itemId) => itemId !== id)].slice(0, 80);
    saveViewed();
    renderVisitTrail();
    document.querySelectorAll("[data-id]").forEach((node) => {
      if (node.dataset.id === id) node.classList.add("is-viewed");
    });
  }

  function viewedItems() {
    const byId = new Map(items.map((item) => [item.id, item]));
    return state.viewed.map((id) => byId.get(id)).filter(Boolean);
  }

  function filteredItems() {
    const query = state.query.trim().toLowerCase();
    return items.filter((item) => {
      const matchQuery = !query || item.search.includes(query);
      const matchCategory = state.category === "全部" || item.category === state.category;
      const matchCollector = state.collector === "全部" || item.collector === state.collector;
      const matchType = state.type === "全部" || item.kindLabel === state.type;
      return matchQuery && matchCategory && matchCollector && matchType;
    });
  }

  function visualFirst(itemsToSort) {
    return [...itemsToSort].sort((a, b) => {
      if (state.type === "PDF" || state.type === "影像") return 0;
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
    if (item.category === state.category) score += 16;
    if (item.collector === state.collector) score += 14;
    if (state.query && item.search.includes(state.query.trim().toLowerCase())) score += 12;
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
    const categoryCounts = new Map();
    const collectorCounts = new Map();
    const kindCounts = new Map();
    const maxCategoryRepeat = source.length > 40 ? 3 : 4;
    const maxCollectorRepeat = source.length > 40 ? 3 : 4;

    for (const candidate of ranked) {
      if (selected.length >= limit) break;
      const item = candidate.item;
      const categoryCount = categoryCounts.get(item.category) || 0;
      const collectorCount = collectorCounts.get(item.collector) || 0;
      const kindCount = kindCounts.get(item.kindLabel) || 0;
      const allowLoose = source.length <= limit;
      if (!allowLoose && categoryCount >= maxCategoryRepeat) continue;
      if (!allowLoose && collectorCount >= maxCollectorRepeat) continue;
      if (!allowLoose && kindCount >= 8) continue;
      const reason = selectionReason(item, selected, source);
      selected.push(item);
      basis.push({ id: item.id, score: Math.round(candidate.score), reason });
      categoryCounts.set(item.category, categoryCount + 1);
      collectorCounts.set(item.collector, collectorCount + 1);
      kindCounts.set(item.kindLabel, kindCount + 1);
    }

    for (const candidate of ranked) {
      if (selected.length >= Math.min(limit, source.length)) break;
      if (selected.some((item) => item.id === candidate.item.id)) continue;
      selected.push(candidate.item);
      basis.push({ id: candidate.item.id, score: Math.round(candidate.score), reason: selectionReason(candidate.item, selected, source) || "作为候补代表补齐展线结构" });
    }
    return { selected, basis };
  }

  function searchSuggestions() {
    const query = state.query.trim().toLowerCase();
    if (!query) return [];
    const direct = items.filter((item) => item.search.includes(query));
    const imageFirst = direct.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "image" ? -1 : 1;
      return a.code.localeCompare(b.code, "zh-CN");
    });
    return imageFirst.slice(0, 7);
  }

  function renderStats() {
    $("#statItems").textContent = items.length.toLocaleString("zh-CN");
    $("#statCollectors").textContent = uniqueSorted("collector").length.toLocaleString("zh-CN");
    $("#statImages").textContent = items.filter((item) => item.kind === "image").length.toLocaleString("zh-CN");
  }

  function renderHero() {
    const imageItems = items.filter((item) => item.kind === "image");
    const sample = imageItems.filter((_, index) => index % Math.max(1, Math.floor(imageItems.length / 32)) === 0).slice(0, 32);
    els.heroMedia.innerHTML = sample.map((item, index) => `
      <div class="hero-tile" style="--tile-index:${index}; transform: translateY(${(index % 5) * 12}px)">
        <img src="${fileUrl(previewPath(item))}" alt="" loading="eager" decoding="async">
      </div>
    `).join("");
  }

  function renderFilters() {
    renderChipGroup(els.categoryFilters, ["全部", ...uniqueSorted("category")], "category");
    renderChipGroup(els.collectorFilters, ["全部", ...uniqueSorted("collector").slice(0, 40)], "collector");
    renderChipGroup(els.typeFilters, ["全部", ...uniqueSorted("kindLabel")], "type");
  }

  function renderChipGroup(container, values, key) {
    container.innerHTML = values.map((value) => `
      <button class="chip ${state[key] === value ? "is-active" : ""}" type="button" data-key="${key}" data-value="${escapeHtml(value)}">
        ${escapeHtml(value)}
      </button>
    `).join("");
  }

  function makeTour(source) {
    if (!source.length) {
      state.tour = [];
      state.tourBasis = [];
      state.tourSummary = "";
      state.activeStop = 0;
      return;
    }
    const imageFirst = source.filter((item) => item.kind === "image");
    const basePool = imageFirst.length >= 10 ? imageFirst : source;
    const routeSalt = Date.now() % 997;
    const shuffledPool = [...basePool].sort((a, b) => stableVariant(a, 997, routeSalt) - stableVariant(b, 997, routeSalt));
    const { selected, basis } = selectCuratedTour(shuffledPool, 10);
    state.tour = selected;
    state.tourBasis = basis;
    const categories = new Set(selected.map((item) => item.category)).size;
    const collectors = new Set(selected.map((item) => item.collector)).size;
    const images = selected.filter((item) => item.kind === "image").length;
    state.tourSummary = `本线从 ${source.length.toLocaleString("zh-CN")} 件候选藏品中生成，优先选择可预览影像，并控制类别、来源与编号跨度：共覆盖 ${categories} 个类别、${collectors} 个来源，其中 ${images} 件可直接观看。`;
    state.activeStop = 0;
  }

  function makeFeatured() {
    const images = items.filter((item) => item.kind === "image");
    const categories = uniqueSorted("category");
    state.featured = categories.map((category, index) => {
      const pool = images.filter((item) => item.category === category);
      return pool.length ? pool[Math.floor(pool.length * (index + 1) / (categories.length + 1))] : null;
    }).filter(Boolean).slice(0, 8);
    if (!state.featured.length) state.featured = images.slice(0, 8);
  }

  function renderFeatured() {
    const item = state.featured[state.featuredIndex % Math.max(1, state.featured.length)];
    if (!item) return;
    els.featuredCounter.textContent = `${state.featuredIndex + 1} / ${state.featured.length} 件代表性展品`;
    els.featuredCard.dataset.id = item.id;
    els.featuredCard.innerHTML = `
      ${mediaHtml(item)}
      <div class="featured-copy">
        <div class="featured-meta">
          <span>${escapeHtml(item.collector)}</span>
          <span>${escapeHtml(item.category)}</span>
          <span>${escapeHtml(item.kindLabel)}</span>
        </div>
        <h3>${escapeHtml(displayTitle(item))}</h3>
        <p>来自 ${escapeHtml(item.folder)}，可进入详情查看原始影像、建档编号与相关线索。</p>
      </div>
    `;
  }

  function renderTopics() {
    const topicNames = ["票据类", "文献类", "字画类", "器物类", "徽章印章类"];
    const counts = countBy("category");
    els.topicRoutes.innerHTML = topicNames.filter((name) => counts[name]).map((name) => {
      const sample = items.find((item) => item.category === name);
      return `
        <button class="topic-route" type="button" data-topic="${escapeHtml(name)}">
          <span>${counts[name].toLocaleString("zh-CN")} 件</span>
          <strong>${escapeHtml(topicTitle(name))}</strong>
          <em>${sample ? escapeHtml(sample.collector) : "馆藏"} · ${escapeHtml(name)}</em>
        </button>
      `;
    }).join("");
  }

  function topicTitle(name) {
    return {
      "票据类": "票据与日常流通",
      "文献类": "纸本文献与地方记录",
      "字画类": "笔墨手迹与审美线索",
      "器物类": "器物形态与使用场景",
      "徽章印章类": "徽章印章与身份标识",
    }[name] || name;
  }

  function startFeaturedLoop() {
    if (state.featuredTimer) window.clearInterval(state.featuredTimer);
    state.featuredTimer = window.setInterval(() => {
      state.featuredIndex = (state.featuredIndex + 1) % Math.max(1, state.featured.length);
      renderFeatured();
    }, 5200);
  }

  function goToHall() {
    window.location.hash = "hall";
    window.requestAnimationFrame(() => {
      scrollToSection("#hall", "smooth");
    });
  }

  function restoreHashPosition() {
    if (!window.location.hash) return;
    window.requestAnimationFrame(() => {
      scrollToSection(window.location.hash, "auto");
    });
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

  function renderTour() {
    if (!state.tour.length) {
      els.tourStops.innerHTML = "";
      els.stage.innerHTML = `
        <div class="empty-state empty-stage">
          <strong>没有匹配的展品</strong>
          <span>请调整关键词或筛选条件后继续浏览。</span>
        </div>
      `;
      els.tourMap.innerHTML = "";
      els.galleryGuide.innerHTML = "";
      return;
    }
    els.tourStops.innerHTML = state.tour.map((item, index) => `
      <li>
        <button class="tour-stop ${index === state.activeStop ? "is-active" : ""}" type="button" data-stop="${index}">
          <strong>${String(index + 1).padStart(2, "0")} ${escapeHtml(displayTitle(item))}</strong>
          <span>${escapeHtml(item.collector)} · ${escapeHtml(item.category)}</span>
        </button>
      </li>
    `).join("");

    const activeItem = state.tour[state.activeStop];
    els.stage.innerHTML = `
      <div class="stage-atmosphere" aria-hidden="true">
        <span>Digital Gallery</span>
        <strong>${escapeHtml(activeItem.category)}</strong>
      </div>
      <div class="stage-hud" id="stageHud" aria-hidden="true"></div>
      <div class="stage-track" style="rotate: 0 1 0 var(--stage-tilt, 0deg)">${state.tour.map((item, index) => {
      const offset = index - state.activeStop;
      const absOffset = Math.abs(offset);
      const x = 50 + offset * 16;
      const y = index === state.activeStop ? 48 : 45 + Math.min(absOffset, 4) * 4;
      const rotate = index === state.activeStop ? 0 : offset * -4;
      const depth = index === state.activeStop ? 120 : 44 - absOffset * 34;
      const opacity = absOffset > 4 ? 0.26 : Math.max(0.46, 1 - absOffset * 0.12);
      const scale = index === state.activeStop ? 1.12 : Math.max(0.72, 0.96 - absOffset * 0.07);
      return `
        <figure class="pedestal ${index === state.activeStop ? "is-active" : ""}" tabindex="0" data-id="${item.id}" data-stage-index="${index}" style="--x:${x}%; --y:${y}%; --rotate:${rotate}deg; --depth:${depth}px; --opacity:${opacity}; --base-scale:${scale}; --side:${offset}; --abs-offset:${absOffset}; --stop-index:${index}">
          ${mediaHtml(item)}
          <figcaption><strong>${escapeHtml(displayTitle(item))}</strong><span>${escapeHtml(item.collector)} / ${escapeHtml(item.category)}</span></figcaption>
        </figure>
      `;
    }).join("")}</div>
      <div class="gallery-floor" aria-hidden="true"></div>
    `;
    renderGalleryGuide();
    renderTourMap();
    scrollActiveStopIntoView();
  }

  function renderGalleryGuide() {
    const item = state.tour[state.activeStop];
    if (!item) {
      els.galleryGuide.innerHTML = "";
      return;
    }
    const progress = Math.round((state.activeStop + 1) / Math.max(1, state.tour.length) * 100);
    const guide = docentText(item);
    const basis = state.tourBasis.find((entry) => entry.id === item.id);
    els.galleryGuide.innerHTML = `
      <div class="guide-curation">
        <strong>为什么是这 10 件</strong>
        <span>${escapeHtml(state.tourSummary || "本线根据当前筛选结果生成，优先兼顾可看性、代表性与来源覆盖。")}</span>
      </div>
      <div class="guide-copy">
        <span class="guide-step">第 ${String(state.activeStop + 1).padStart(2, "0")} 展位 / 共 ${String(state.tour.length).padStart(2, "0")} 件</span>
        <strong>${escapeHtml(displayTitle(item))}</strong>
        <em class="guide-reason">入选依据：${escapeHtml(basis?.reason || "作为本线结构中的代表性条目。")}</em>
        <p>${escapeHtml(guide)}</p>
      </div>
      <div class="guide-actions">
        <div class="guide-progress" aria-label="导览进度"><span style="width:${progress}%"></span></div>
        <button class="ghost-action" type="button" data-guide-detail="${item.id}">查看详情</button>
        <button class="primary-action guide-next" type="button" data-guide-next>继续参观</button>
      </div>
    `;
  }

  function renderTourMap() {
    els.tourMap.innerHTML = state.tour.map((item, index) => `
      <button class="map-node ${index === state.activeStop ? "is-active" : ""}" type="button" data-map-stop="${index}" aria-label="跳到第 ${index + 1} 件：${escapeHtml(displayTitle(item))}">
        <span>${String(index + 1).padStart(2, "0")}</span>
      </button>
    `).join("");
  }

  function renderCatalog() {
    const results = filteredItems();
    const displayResults = state.view === "table" ? results : visualFirst(results);
    els.resultCount.textContent = `当前显示 ${results.length.toLocaleString("zh-CN")} / ${items.length.toLocaleString("zh-CN")} 件`;
    renderFilterSummary(results.length);
    if (!state.tour.length || state.view === "hall") makeTour(displayResults);
    renderTour();

    const pageLimit = state.view === "table" ? 220 : state.visibleLimit;
    const page = displayResults.slice(0, pageLimit);
    els.catalogView.className = state.view === "table" ? "catalog-grid is-table" : "catalog-grid";
    if (!page.length) {
      els.catalogView.innerHTML = `
        <div class="empty-state">
          <strong>没有找到匹配藏品</strong>
          <span>换一个关键词，或点击“返回全馆”恢复完整馆藏。</span>
        </div>
      `;
      renderLoadMore(results.length, page.length);
      return;
    }
    if (state.view === "table") {
      els.catalogView.innerHTML = page.map((item) => `
        <div class="table-row ${state.viewed.includes(item.id) ? "is-viewed" : ""}" data-id="${item.id}">
          <strong>${escapeHtml(item.code)}</strong>
          <b>${escapeHtml(displayTitle(item))}</b>
          <span>${escapeHtml(item.collector)}</span>
          <span>${escapeHtml(item.category)}</span>
          <span>${escapeHtml(item.kindLabel)}</span>
        </div>
      `).join("");
      renderLoadMore(results.length, page.length);
      scheduleReveal();
      return;
    }

    els.catalogView.innerHTML = page.map((item) => `
      <article class="item-card ${state.viewed.includes(item.id) ? "is-viewed" : ""}" data-id="${item.id}">
        <div class="item-media">${mediaHtml(item)}</div>
        <div class="item-actions">
          <button class="mini-button" type="button" data-compare="${item.id}" aria-label="加入对照" title="加入对照">＋</button>
        </div>
        <div class="item-body">
          <h3 class="item-title">${escapeHtml(displayTitle(item))}</h3>
          <div class="item-meta">
            <span>${escapeHtml(item.collector)}</span>
            <span>${escapeHtml(item.category)}</span>
            <span>${escapeHtml(item.kindLabel)}</span>
          </div>
        </div>
      </article>
    `).join("");
    renderLoadMore(results.length, page.length);
    scheduleReveal();
  }

  function renderFilterSummary(total) {
    const active = [];
    if (state.query.trim()) active.push(`关键词：${state.query.trim()}`);
    if (state.category !== "全部") active.push(`类别：${state.category}`);
    if (state.collector !== "全部") active.push(`藏家：${state.collector}`);
    if (state.type !== "全部") active.push(`形态：${state.type}`);
    if (!active.length) {
      els.filterSummary.innerHTML = `<span>当前为全馆浏览，系统优先展示可直接预览的影像条目。</span>`;
      return;
    }
    els.filterSummary.innerHTML = `
      <span>当前筛选：${active.map(escapeHtml).join(" / ")}，共 ${total.toLocaleString("zh-CN")} 件。</span>
      <button class="inline-reset" id="clearCatalogFilters" type="button">返回全馆</button>
    `;
  }

  function renderSearchSuggestions() {
    const suggestions = searchSuggestions();
    if (!suggestions.length) {
      els.searchSuggestions.classList.remove("is-open");
      els.searchSuggestions.innerHTML = "";
      return;
    }
    els.searchSuggestions.innerHTML = suggestions.map((item) => `
      <button class="suggestion-item" type="button" data-suggest="${item.id}" role="option">
        <span class="suggestion-thumb">
          ${item.kind === "image" ? `<img src="${fileUrl(previewPath(item))}" alt="" loading="eager" decoding="async">` : "PDF"}
        </span>
        <span class="suggestion-copy">
          <strong>${escapeHtml(displayTitle(item))}</strong>
          <span>${escapeHtml(item.collector)} · ${escapeHtml(item.category)}</span>
        </span>
        <span class="suggestion-type">${escapeHtml(item.kindLabel)}</span>
      </button>
    `).join("");
    els.searchSuggestions.classList.add("is-open");
  }

  function closeSearchSuggestions() {
    els.searchSuggestions.classList.remove("is-open");
  }

  function renderLoadMore(total, shown) {
    const existing = document.querySelector("#loadMoreWrap");
    if (existing) existing.remove();
    if (shown >= total) return;
    const wrap = document.createElement("div");
    wrap.id = "loadMoreWrap";
    wrap.className = "load-more";
    wrap.innerHTML = `<button class="ghost-action" type="button" id="loadMore">继续载入 ${Math.min(84, total - shown)} 件</button>`;
    els.catalogView.insertAdjacentElement("afterend", wrap);
  }

  function scheduleReveal() {
    if (!revealObserver) {
      document.querySelectorAll(".item-card, .table-row, .insight-panel").forEach((node) => node.classList.add("is-visible"));
      return;
    }
    requestAnimationFrame(() => {
      document.querySelectorAll(".item-card, .table-row, .insight-panel").forEach((node) => revealObserver.observe(node));
    });
  }

  function renderCharts() {
    renderBarChart(els.categoryChart, topEntries("category", 8));
    renderBarChart(els.collectorChart, topEntries("collector", 8));
  }

  function renderCollectorStrip() {
    const cards = topEntries("collector", 8).map(([collector, total]) => {
      const collectorItems = items.filter((item) => item.collector === collector);
      const categorySummary = Object.entries(collectorItems.reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
      }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => `${name} ${count}`).join(" / ");
      return `
        <button class="collector-card" type="button" data-collector-route="${escapeHtml(collector)}">
          <span class="collector-count">${total.toLocaleString("zh-CN")} 件</span>
          <strong>${escapeHtml(collector)}</strong>
          <em>${escapeHtml(categorySummary || "综合馆藏")}</em>
        </button>
      `;
    }).join("");
    els.collectorStrip.innerHTML = cards;
  }

  function renderVisitTrail() {
    const recent = viewedItems().slice(0, 5);
    const percent = Math.min(100, Math.round(state.viewed.length / Math.max(1, items.length) * 1000) / 10);
    els.visitTrail.innerHTML = `
      <div class="trail-summary">
        <span class="collector-count">${state.viewed.length.toLocaleString("zh-CN")} 件已看</span>
        <div>
          <strong>观展足迹</strong>
          <p>已浏览全馆 ${percent}% ，最近查看的条目会保留在这里，便于回看、对照和继续浏览。</p>
        </div>
        <button class="ghost-action" id="clearTrail" type="button">清空足迹</button>
        <button class="ghost-action" id="openSummary" type="button">生成观展小结</button>
      </div>
      <div class="trail-list">
        ${recent.length ? recent.map((item) => `
          <button class="trail-item" type="button" data-trail="${item.id}">
          ${item.kind === "image" ? `<img src="${fileUrl(previewPath(item))}" alt="" loading="eager" decoding="async">` : pdfThumbHtml(item)}
            <span>
              <strong>${escapeHtml(displayTitle(item))}</strong>
              <em>${escapeHtml(item.collector)} · ${escapeHtml(item.category)}</em>
            </span>
          </button>
        `).join("") : `<p class="empty-trail">打开任意藏品后，这里会生成你的观展足迹。</p>`}
      </div>
    `;
  }

  function openVisitSummary() {
    const recent = viewedItems();
    const categoryCounts = recent.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});
    const categoryRows = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `<div><span>${escapeHtml(name)}</span><strong>${count}</strong></div>`)
      .join("");
    const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
    els.summaryBody.innerHTML = `
      <section class="summary-sheet">
        <p class="eyebrow">Visit Summary</p>
        <h2>民间藏品线上博物馆观展小结</h2>
        <p class="summary-date">${today}</p>
        <div class="summary-stats">
          <div><strong>${recent.length.toLocaleString("zh-CN")}</strong><span>已看藏品</span></div>
          <div><strong>${Object.keys(categoryCounts).length.toLocaleString("zh-CN")}</strong><span>涉及类别</span></div>
          <div><strong>${items.length.toLocaleString("zh-CN")}</strong><span>全馆档案</span></div>
        </div>
        <div class="summary-columns">
          <section>
            <h3>类别分布</h3>
            <div class="summary-bars">${categoryRows || "<p>暂无浏览记录。</p>"}</div>
          </section>
          <section>
            <h3>最近浏览</h3>
            <ol class="summary-list">
              ${recent.slice(0, 12).map((item) => `
                <li>
                  <strong>${escapeHtml(displayTitle(item))}</strong>
                  <span>${escapeHtml(item.collector)} · ${escapeHtml(item.category)} · ${escapeHtml(item.code)}</span>
                </li>
              `).join("") || "<li><span>打开藏品后将生成记录。</span></li>"}
            </ol>
          </section>
        </div>
        <div class="summary-actions">
          <button class="ghost-action" id="printSummary" type="button">打印 / 保存 PDF</button>
        </div>
      </section>
    `;
    openDialog(els.summaryDialog);
  }

  function renderBarChart(container, entries) {
    const max = Math.max(...entries.map((entry) => entry[1]), 1);
    container.innerHTML = entries.map(([label, count]) => `
      <div class="bar">
        <span>${escapeHtml(label)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, count / max * 100)}%"></div></div>
        <strong>${count}</strong>
      </div>
    `).join("");
  }

  function openDetail(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    markViewed(id);
    const guide = docentText(item);
    const related = relatedItems(item);
    const preview = item.kind === "image"
      ? `<img id="zoomImage" src="${fileUrl(item.path)}" alt="${escapeHtml(displayTitle(item))}">`
      : `<div class="pdf-face"><strong>PDF 档案</strong><span>${escapeHtml(displayTitle(item))}</span></div>`;
    els.detailBody.innerHTML = `
      <div class="detail-content">
        <div class="detail-preview">${preview}</div>
        <aside class="detail-info">
          <p class="eyebrow">${escapeHtml(item.category)} / ${escapeHtml(item.kindLabel)}</p>
          <h2>${escapeHtml(displayTitle(item))}</h2>
          <dl class="detail-list">
            <div><dt>编号</dt><dd>${escapeHtml(item.code)}</dd></div>
            <div><dt>藏家</dt><dd>${escapeHtml(item.collector)}</dd></div>
            <div><dt>来源目录</dt><dd>${escapeHtml(item.folder)}</dd></div>
            <div><dt>文件大小</dt><dd>${formatBytes(item.size)}</dd></div>
            <div><dt>文件名</dt><dd>${escapeHtml(item.fileName)}</dd></div>
          </dl>
          <section class="docent-panel">
            <div>
              <h3>导览词</h3>
              <p id="docentText">${escapeHtml(guide)}</p>
            </div>
            <button class="ghost-action" id="speakDocent" type="button">听讲解</button>
          </section>
          <section class="related-panel">
            <h3>同类线索</h3>
            <div class="related-grid">
              ${related.map((entry) => `
                <button class="related-card" type="button" data-related="${entry.id}">
                  ${entry.kind === "image" ? `<img src="${fileUrl(previewPath(entry))}" alt="" loading="eager" decoding="async">` : pdfThumbHtml(entry)}
                  <strong>${escapeHtml(displayTitle(entry))}</strong>
                  <span>${escapeHtml(entry.collector)} · ${escapeHtml(entry.category)}</span>
                </button>
              `).join("")}
            </div>
          </section>
          <a class="open-file" href="${fileUrl(item.path)}" target="_blank" rel="noreferrer">打开原始档案</a>
        </aside>
      </div>
    `;
    openDialog(els.detailDialog);
    const zoomImage = $("#zoomImage");
    if (zoomImage) {
      zoomImage.addEventListener("click", () => {
        const zoomed = zoomImage.classList.toggle("is-zoomed");
        showTourToast(zoomed ? "已进入细节放大" : "已退出细节放大");
      });
    }
  }

  function openDialog(dialog) {
    if (!dialog) return;
    try {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
        return;
      }
    } catch (error) {
      dialog.setAttribute("open", "");
    }
    dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    try {
      if (typeof dialog.close === "function") {
        dialog.close();
        return;
      }
    } catch (error) {
      dialog.removeAttribute("open");
    }
    dialog.removeAttribute("open");
  }

  function addCompare(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item || state.compare.some((entry) => entry.id === id)) return;
    state.compare = [item, ...state.compare].slice(0, 4);
    renderCompare();
    showTourToast(`已加入对照：${displayTitle(item)}`);
  }

  function renderCompare() {
    els.compareHint.textContent = state.compare.length ? `已选择 ${state.compare.length} 件藏品。` : "选择藏品加入对照，查看类别、藏家与形态之间的关联。";
    els.compareTray.innerHTML = state.compare.map((item) => `
      <div class="compare-card">
        ${item.kind === "image" ? `<img src="${fileUrl(previewPath(item))}" alt="" loading="eager" decoding="async">` : pdfThumbHtml(item)}
        <div><strong>${escapeHtml(displayTitle(item))}</strong><br><span>${escapeHtml(item.collector)} · ${escapeHtml(item.category)}</span></div>
        <button class="mini-button" type="button" data-remove="${item.id}" aria-label="移出对照" title="移出对照">×</button>
      </div>
    `).join("");
  }

  function speakDocent() {
    const text = $("#docentText")?.textContent;
    const button = $("#speakDocent");
    if (!text || !("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") {
      if (button) button.textContent = "当前浏览器不支持语音";
      return;
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (button) button.textContent = "听讲解";
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.92;
    utterance.onend = () => {
      const button = $("#speakDocent");
      if (button) button.textContent = "听讲解";
    };
    if (button) button.textContent = "停止讲解";
    window.speechSynthesis.speak(utterance);
  }

  function setActiveStop(index) {
    if (!state.tour.length) return;
    const previousStop = state.activeStop;
    state.activeStop = (index + state.tour.length) % state.tour.length;
    renderTour();
    pulseStage(previousStop !== state.activeStop);
    if (state.activeStop === state.tour.length - 1 && previousStop !== state.activeStop) {
      showTourToast("即将完成本条展线，点击“继续参观”可回到起点。");
    }
  }

  function nextStop() {
    setActiveStop(state.activeStop + 1);
  }

  function previousStop() {
    setActiveStop(state.activeStop - 1);
  }

  function startAutoTour() {
    stopAutoTour();
    state.autoTour = true;
    const button = $("#autoTour");
    button.classList.add("is-live");
    button.setAttribute("aria-pressed", "true");
    button.textContent = "暂停导览";
    state.autoTimer = window.setInterval(nextStop, 3600);
  }

  function stopAutoTour() {
    state.autoTour = false;
    if (state.autoTimer) window.clearInterval(state.autoTimer);
    state.autoTimer = null;
    const button = $("#autoTour");
    if (!button) return;
    button.classList.remove("is-live");
    button.setAttribute("aria-pressed", "false");
    button.textContent = "自动导览";
  }

  function pulseStage(animate = true) {
    if (!animate) return;
    els.stage.classList.remove("is-transitioning");
    void els.stage.offsetWidth;
    els.stage.classList.add("is-transitioning");
  }

  function showTourToast(message) {
    if (!els.tourToast) return;
    els.tourToast.textContent = message;
    els.tourToast.classList.add("is-visible");
    window.clearTimeout(showTourToast.timer);
    showTourToast.timer = window.setTimeout(() => els.tourToast.classList.remove("is-visible"), 3200);
  }

  function resetFilters(scroll = true) {
    stopAutoTour();
    state.query = "";
    state.category = "全部";
    state.collector = "全部";
    state.type = "全部";
    state.visibleLimit = 84;
    els.search.value = "";
    closeSearchSuggestions();
    makeTour(visualFirst(filteredItems()));
    renderFilters();
    renderCatalog();
    if (scroll) scrollToSection("#catalog", "smooth");
  }

  function scrollActiveStopIntoView() {
    const active = els.tourStops.querySelector(".tour-stop.is-active");
    if (!active) return;
    try {
      active.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (error) {
      active.scrollIntoView();
    }
  }

  function setupRevealObserver() {
    if (!("IntersectionObserver" in window)) {
      revealObserver = null;
      return;
    }
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  }

  function updateScrollProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(100, Math.max(0, window.scrollY / max * 100)) : 0;
    document.documentElement.style.setProperty("--scroll-progress", `${progress}%`);
  }

  function setupMotion() {
    updateScrollProgress();
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    window.addEventListener("pointermove", (event) => {
      const x = Math.round(event.clientX / window.innerWidth * 100);
      const y = Math.round(event.clientY / window.innerHeight * 100);
      document.documentElement.style.setProperty("--spot-x", `${x}%`);
      document.documentElement.style.setProperty("--spot-y", `${y}%`);
      if (els.cursorHalo) {
        els.cursorHalo.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      }
    }, { passive: true });

    els.heroMedia.addEventListener("pointermove", (event) => {
      const rect = els.heroMedia.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      els.heroMedia.style.transform = `rotate(-4deg) scale(1.1) translate(${x * -18}px, ${y * -18}px)`;
    });
    els.heroMedia.addEventListener("pointerleave", () => {
      els.heroMedia.style.transform = "rotate(-4deg) scale(1.08)";
    });

    els.stage.addEventListener("pointermove", (event) => {
      const rect = els.stage.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
      const y = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100));
      els.stage.style.setProperty("--stage-x", `${x}%`);
      els.stage.style.setProperty("--stage-y", `${y}%`);
      els.stage.style.setProperty("--stage-tilt", `${(x - 50) / 18}deg`);
      const pedestal = closestTarget(event.target, ".pedestal");
      const hud = $("#stageHud");
      if (pedestal && hud) {
        const item = items.find((entry) => entry.id === pedestal.dataset.id);
        if (item) {
          const hudLeft = Math.max(16, Math.min(Math.max(16, rect.width - 260), event.clientX - rect.left + 18));
          const hudTop = Math.max(16, Math.min(Math.max(16, rect.height - 110), event.clientY - rect.top + 18));
          hud.classList.add("is-visible");
          hud.style.left = `${hudLeft}px`;
          hud.style.top = `${hudTop}px`;
          hud.innerHTML = `<strong>${escapeHtml(displayTitle(item))}</strong><span>${escapeHtml(item.collector)} / ${escapeHtml(item.category)} / ${escapeHtml(item.kindLabel)}</span>`;
        }
      }
    }, { passive: true });
    els.stage.addEventListener("pointerleave", () => {
      els.stage.style.setProperty("--stage-x", "50%");
      els.stage.style.setProperty("--stage-y", "48%");
      els.stage.style.setProperty("--stage-tilt", "0deg");
      $("#stageHud")?.classList.remove("is-visible");
    });

    els.catalogView.addEventListener("pointermove", (event) => {
      const card = closestTarget(event.target, ".item-card");
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty("--card-tilt-x", `${y * -5}deg`);
      card.style.setProperty("--card-tilt-y", `${x * 6}deg`);
      card.style.setProperty("--card-glow-x", `${(x + 0.5) * 100}%`);
        card.style.setProperty("--card-glow-y", `${(y + 0.5) * 100}%`);
    }, { passive: true });

    els.catalogView.addEventListener("pointerout", (event) => {
      const card = closestTarget(event.target, ".item-card");
      if (!card || card.contains(event.relatedTarget)) return;
      card.style.removeProperty("--card-tilt-x");
      card.style.removeProperty("--card-tilt-y");
      card.style.removeProperty("--card-glow-x");
      card.style.removeProperty("--card-glow-y");
    }, { passive: true });

    els.catalogView.addEventListener("pointerleave", () => {
      els.catalogView.querySelectorAll(".item-card").forEach((card) => {
        card.style.removeProperty("--card-tilt-x");
        card.style.removeProperty("--card-tilt-y");
        card.style.removeProperty("--card-glow-x");
        card.style.removeProperty("--card-glow-y");
      });
    }, { passive: true });
  }

  function bindEvents() {
    els.search.addEventListener("input", (event) => {
      state.query = event.target.value;
      state.visibleLimit = 84;
      renderCatalog();
      renderSearchSuggestions();
    });

    els.search.addEventListener("focus", renderSearchSuggestions);

    els.search.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSearchSuggestions();
      if (event.key === "Enter") {
        const first = els.searchSuggestions.querySelector("[data-suggest]");
        if (first) {
          event.preventDefault();
          closeSearchSuggestions();
          openDetail(first.dataset.suggest);
        }
      }
    });

    document.addEventListener("click", (event) => {
      if (!closestTarget(event.target, ".search-wrap")) closeSearchSuggestions();

      const suggestion = closestTarget(event.target, "[data-suggest]");
      if (suggestion) {
        closeSearchSuggestions();
        openDetail(suggestion.dataset.suggest);
        return;
      }

      const chip = closestTarget(event.target, ".chip");
      if (chip) {
        state[chip.dataset.key] = chip.dataset.value;
        state.visibleLimit = 84;
        renderFilters();
        renderCatalog();
        return;
      }

      const viewButton = closestTarget(event.target, "[data-view]");
      if (viewButton) {
        state.view = viewButton.dataset.view;
        state.visibleLimit = 84;
        document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-active", button === viewButton));
        renderCatalog();
        return;
      }

      if (closestTarget(event.target, "#loadMore")) {
        state.visibleLimit += 84;
        renderCatalog();
        return;
      }

      if (closestTarget(event.target, "#clearCatalogFilters")) {
        resetFilters(true);
        return;
      }

      if (closestTarget(event.target, "#speakDocent")) {
        speakDocent();
        return;
      }

      if (closestTarget(event.target, "#clearTrail")) {
        state.viewed = [];
        saveViewed();
        renderVisitTrail();
        document.querySelectorAll(".is-viewed").forEach((node) => node.classList.remove("is-viewed"));
        return;
      }

      if (closestTarget(event.target, "#openSummary")) {
        openVisitSummary();
        return;
      }

      if (closestTarget(event.target, "#printSummary")) {
        window.print();
        return;
      }

      const trail = closestTarget(event.target, "[data-trail]");
      if (trail) {
        openDetail(trail.dataset.trail);
        return;
      }

      const related = closestTarget(event.target, "[data-related]");
      if (related) {
        openDetail(related.dataset.related);
        return;
      }

      const stop = closestTarget(event.target, "[data-stop]");
      if (stop) {
        stopAutoTour();
        setActiveStop(Number(stop.dataset.stop));
        return;
      }

      const mapStop = closestTarget(event.target, "[data-map-stop]");
      if (mapStop) {
        stopAutoTour();
        setActiveStop(Number(mapStop.dataset.mapStop));
        return;
      }

      const guideDetail = closestTarget(event.target, "[data-guide-detail]");
      if (guideDetail) {
        openDetail(guideDetail.dataset.guideDetail);
        return;
      }

      if (closestTarget(event.target, "[data-guide-next]")) {
        stopAutoTour();
        if (state.activeStop === state.tour.length - 1) {
          showTourToast("本条展线参观完成，已回到第一件展品。");
        }
        nextStop();
        return;
      }

      const compareButton = closestTarget(event.target, "[data-compare]");
      if (compareButton) {
        event.stopPropagation();
        addCompare(compareButton.dataset.compare);
        return;
      }

      const removeButton = closestTarget(event.target, "[data-remove]");
      if (removeButton) {
        state.compare = state.compare.filter((item) => item.id !== removeButton.dataset.remove);
        renderCompare();
        return;
      }

      const card = closestTarget(event.target, "[data-id]");
      if (card) openDetail(card.dataset.id);

      const topic = closestTarget(event.target, "[data-topic]");
      if (topic) {
        state.category = topic.dataset.topic;
        state.collector = "全部";
        state.visibleLimit = 84;
        stopAutoTour();
        makeTour(filteredItems());
        renderFilters();
        renderCatalog();
        goToHall();
      }

      const collectorRoute = closestTarget(event.target, "[data-collector-route]");
      if (collectorRoute) {
        state.collector = collectorRoute.dataset.collectorRoute;
        state.category = "全部";
        state.visibleLimit = 84;
        stopAutoTour();
        makeTour(filteredItems());
        renderFilters();
        renderCatalog();
        goToHall();
      }
    });

    $("#shuffleTour").addEventListener("click", () => {
      stopAutoTour();
      makeTour(filteredItems());
      renderTour();
    });

    $("#resetFilters").addEventListener("click", () => {
      resetFilters(true);
    });

    $("#prevStop").addEventListener("click", () => {
      stopAutoTour();
      previousStop();
    });

    $("#nextStop").addEventListener("click", () => {
      stopAutoTour();
      nextStop();
    });

    $("#autoTour").addEventListener("click", () => {
      if (state.autoTour) stopAutoTour();
      else startAutoTour();
    });

    els.stage.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") {
        stopAutoTour();
        nextStop();
      }
      if (event.key === "ArrowLeft") {
        stopAutoTour();
        previousStop();
      }
      if (event.key === "Enter") {
        const item = state.tour[state.activeStop];
        if (item) openDetail(item.id);
      }
    });

    $("#themeToggle").addEventListener("click", () => document.body.classList.toggle("dark"));
    $("#closeDialog").addEventListener("click", () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      closeDialog(els.detailDialog);
    });
    $("#closeSummary").addEventListener("click", () => closeDialog(els.summaryDialog));
  }

  function init() {
    setupRevealObserver();
    loadViewed();
    renderStats();
    renderHero();
    makeFeatured();
    renderFeatured();
    renderTopics();
    renderFilters();
    renderCharts();
    renderCollectorStrip();
    renderVisitTrail();
    renderCompare();
    renderCatalog();
    scheduleReveal();
    setupMotion();
    startFeaturedLoop();
    bindEvents();
    restoreHashPosition();
  }

  init();
})();
