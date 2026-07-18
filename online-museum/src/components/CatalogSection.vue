<script setup>
import MediaPreview from "./MediaPreview.vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { displayTitle } from "../lib/catalog";

const {
  view,
  visibleItems,
  filteredItems,
  canLoadMore,
  loadMoreCount,
  resultText,
  activeFilters,
  isViewed,
  openDetail,
  addCompare,
  loadMore,
  resetFilters,
} = useMuseumContext();

function handleCardPointerMove(event) {
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  card.style.setProperty("--card-tilt-x", `${y * -5}deg`);
  card.style.setProperty("--card-tilt-y", `${x * 6}deg`);
  card.style.setProperty("--card-glow-x", `${(x + 0.5) * 100}%`);
  card.style.setProperty("--card-glow-y", `${(y + 0.5) * 100}%`);
}

function clearCardTilt(event) {
  const card = event.currentTarget;
  card.style.removeProperty("--card-tilt-x");
  card.style.removeProperty("--card-tilt-y");
  card.style.removeProperty("--card-glow-x");
  card.style.removeProperty("--card-glow-y");
}
</script>

<template>
  <section class="museum-section" id="catalog">
    <div class="section-heading" data-fx>
      <p class="eyebrow">Collection Browser</p>
      <h2>全馆藏品</h2>
      <p>{{ resultText }}</p>
      <div class="filter-summary" aria-live="polite">
        <template v-if="activeFilters.length">
          <span>
            当前筛选：{{ activeFilters.join(" / ") }}，共 {{ filteredItems.length.toLocaleString("zh-CN") }} 件。
          </span>
          <button class="inline-reset" type="button" @click="resetFilters(true)">返回全馆</button>
        </template>
        <span v-else>当前为全馆浏览，系统优先展示可直接预览的影像条目。</span>
      </div>
    </div>

    <div class="catalog-grid" :class="{ 'is-table': view === 'table' }">
      <div v-if="!visibleItems.length" class="empty-state">
        <strong>没有找到匹配藏品</strong>
        <span>换一个关键词，或点击“返回全馆”恢复完整馆藏。</span>
      </div>

      <template v-else-if="view === 'table'">
        <div
          v-for="item in visibleItems"
          :key="item.id"
          class="table-row is-visible"
          :class="{ 'is-viewed': isViewed(item.id) }"
          @click="openDetail(item.id)"
        >
          <strong>{{ item.code }}</strong>
          <b>{{ displayTitle(item) }}</b>
          <span>{{ item.collector }}</span>
          <span>{{ item.category }}</span>
          <span>{{ item.kindLabel }}</span>
        </div>
      </template>

      <template v-else>
        <article
          v-for="item in visibleItems"
          :key="item.id"
          class="item-card is-visible"
          :class="{ 'is-viewed': isViewed(item.id) }"
          @click="openDetail(item.id)"
          @pointermove="handleCardPointerMove"
          @pointerleave="clearCardTilt"
        >
          <div class="item-media">
            <MediaPreview :item="item" />
          </div>
          <div class="item-actions">
            <button
              class="mini-button"
              type="button"
              aria-label="加入对照"
              title="加入对照"
              @click.stop="addCompare(item.id)"
            >
              ＋
            </button>
          </div>
          <div class="item-body">
            <h3 class="item-title">{{ displayTitle(item) }}</h3>
            <div class="item-meta">
              <span>{{ item.collector }}</span>
              <span>{{ item.category }}</span>
              <span>{{ item.kindLabel }}</span>
            </div>
          </div>
        </article>
      </template>
    </div>

    <div v-if="canLoadMore" class="load-more">
      <button class="ghost-action" type="button" @click="loadMore">
        继续载入 {{ loadMoreCount }} 件
      </button>
    </div>
  </section>
</template>
