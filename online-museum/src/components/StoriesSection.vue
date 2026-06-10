<script setup>
import PdfThumb from "./PdfThumb.vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { displayTitle, fileUrl, previewPath } from "../lib/catalog";

const {
  items,
  compare,
  compareHint,
  categoryChartEntries,
  collectorChartEntries,
  collectorCards,
  recentViewedItems,
  viewed,
  viewedPercent,
  openDetail,
  chooseCollector,
  removeCompare,
  clearTrail,
  openSummary,
} = useMuseumContext();

function barWidth(entries, count) {
  const max = Math.max(...entries.map((entry) => entry[1]), 1);
  return `${Math.max(4, count / max * 100)}%`;
}
</script>

<template>
  <section class="museum-section" id="stories">
    <div class="section-heading">
      <p class="eyebrow">Archive Rhythm</p>
      <h2>档案脉络</h2>
    </div>

    <div class="visit-trail" aria-label="观展足迹">
      <div class="trail-summary">
        <span class="collector-count">{{ viewed.length.toLocaleString("zh-CN") }} 件已看</span>
        <div>
          <strong>观展足迹</strong>
          <p>已浏览全馆 {{ viewedPercent }}% ，最近查看的条目会保留在这里，便于回看、对照和继续浏览。</p>
        </div>
        <button class="ghost-action" type="button" @click="clearTrail">清空足迹</button>
        <button class="ghost-action" type="button" @click="openSummary">生成观展小结</button>
      </div>
      <div class="trail-list">
        <button
          v-for="item in recentViewedItems"
          :key="item.id"
          class="trail-item"
          type="button"
          @click="openDetail(item.id)"
        >
          <img v-if="item.kind === 'image'" :src="fileUrl(previewPath(item))" alt="" loading="eager" decoding="async" />
          <PdfThumb v-else :item="item" />
          <span>
            <strong>{{ displayTitle(item) }}</strong>
            <em>{{ item.collector }} · {{ item.category }}</em>
          </span>
        </button>
        <p v-if="!recentViewedItems.length" class="empty-trail">
          打开任意藏品后，这里会生成你的观展足迹。
        </p>
      </div>
    </div>

    <div class="collector-strip" aria-label="藏家索引">
      <button
        v-for="card in collectorCards"
        :key="card.name"
        class="collector-card"
        type="button"
        @click="chooseCollector(card.name)"
      >
        <span class="collector-count">{{ card.total.toLocaleString("zh-CN") }} 件</span>
        <strong>{{ card.name }}</strong>
        <em>{{ card.categorySummary }}</em>
      </button>
    </div>

    <div class="insight-grid">
      <div class="insight-panel is-visible">
        <h3>类别结构</h3>
        <div class="bar-chart">
          <div v-for="[label, count] in categoryChartEntries" :key="label" class="bar">
            <span>{{ label }}</span>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: barWidth(categoryChartEntries, count) }"></div>
            </div>
            <strong>{{ count }}</strong>
          </div>
        </div>
      </div>
      <div class="insight-panel is-visible">
        <h3>藏家贡献</h3>
        <div class="bar-chart">
          <div v-for="[label, count] in collectorChartEntries" :key="label" class="bar">
            <span>{{ label }}</span>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: barWidth(collectorChartEntries, count) }"></div>
            </div>
            <strong>{{ count }}</strong>
          </div>
        </div>
      </div>
      <div class="insight-panel is-visible">
        <h3>专题对照</h3>
        <p>{{ compareHint }}</p>
        <div class="compare-tray">
          <div v-for="item in compare" :key="item.id" class="compare-card">
            <img v-if="item.kind === 'image'" :src="fileUrl(previewPath(item))" alt="" loading="eager" decoding="async" />
            <PdfThumb v-else :item="item" />
            <div>
              <strong>{{ displayTitle(item) }}</strong><br />
              <span>{{ item.collector }} · {{ item.category }}</span>
            </div>
            <button
              class="mini-button"
              type="button"
              aria-label="移出对照"
              title="移出对照"
              @click="removeCompare(item.id)"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
