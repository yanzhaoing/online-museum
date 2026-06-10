<script setup>
import { ref } from "vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { displayTitle, fileUrl, previewPath } from "../lib/catalog";

const { heroItems, stats } = useMuseumContext();
const heroMedia = ref(null);

function handlePointerMove(event) {
  if (!heroMedia.value) return;
  const rect = heroMedia.value.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  heroMedia.value.style.transform = `rotate(-4deg) scale(1.1) translate(${x * -18}px, ${y * -18}px)`;
}

function resetMediaTilt() {
  if (heroMedia.value) heroMedia.value.style.transform = "rotate(-4deg) scale(1.08)";
}
</script>

<template>
  <section class="hero" aria-labelledby="heroTitle">
    <div class="hero-aurora" aria-hidden="true"></div>
    <div
      ref="heroMedia"
      class="hero-media"
      aria-hidden="true"
      @pointermove="handlePointerMove"
      @pointerleave="resetMediaTilt"
    >
      <div
        v-for="(item, index) in heroItems"
        :key="item.id"
        class="hero-tile"
        :style="{ '--tile-index': index, transform: `translateY(${(index % 5) * 12}px)` }"
      >
        <img :src="fileUrl(previewPath(item))" :alt="displayTitle(item)" loading="eager" decoding="async" />
      </div>
    </div>
    <div class="hero-copy">
      <p class="eyebrow">民间藏品数字展厅</p>
      <h1 id="heroTitle">把散落民间的物证，组织成可进入、可浏览、可追溯的线上展厅。</h1>
      <p>
        围绕本地馆藏档案建立数字展线，支持按藏家、类别、文件形态与关键词检索，
        并以沉浸展厅、专题路线和细节查看串联完整观展体验。
      </p>
      <div class="hero-actions">
        <a class="primary-action" href="#hall">进入展厅</a>
        <a class="secondary-action" href="#catalog">检索藏品</a>
      </div>
    </div>
    <div class="hero-enter" aria-hidden="true">
      <span>Scroll to enter</span>
    </div>
    <aside class="hero-stats" aria-label="馆藏统计">
      <span><strong>{{ stats.items.toLocaleString("zh-CN") }}</strong>件档案</span>
      <span><strong>{{ stats.collectors.toLocaleString("zh-CN") }}</strong>位/组藏家</span>
      <span><strong>{{ stats.images.toLocaleString("zh-CN") }}</strong>张影像</span>
    </aside>
  </section>
</template>
