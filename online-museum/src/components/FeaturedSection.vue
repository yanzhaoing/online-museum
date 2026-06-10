<script setup>
import MediaPreview from "./MediaPreview.vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { displayTitle } from "../lib/catalog";

const { featured, featuredIndex, featuredItem, topicRoutes, openDetail, chooseTopic } = useMuseumContext();
</script>

<template>
  <section class="museum-section featured-section" id="featured">
    <div class="section-heading">
      <p class="eyebrow">Featured Path</p>
      <h2>策展精选</h2>
      <p v-if="featured.length">{{ featuredIndex + 1 }} / {{ featured.length }} 件代表性展品</p>
      <p v-else>从馆藏中提取代表性展品</p>
    </div>
    <div class="featured-layout">
      <button
        v-if="featuredItem"
        class="featured-card"
        type="button"
        aria-label="查看精选藏品"
        @click="openDetail(featuredItem.id)"
      >
        <MediaPreview :item="featuredItem" />
        <div class="featured-copy">
          <div class="featured-meta">
            <span>{{ featuredItem.collector }}</span>
            <span>{{ featuredItem.category }}</span>
            <span>{{ featuredItem.kindLabel }}</span>
          </div>
          <h3>{{ displayTitle(featuredItem) }}</h3>
          <p>来自 {{ featuredItem.folder }}，可进入详情查看原始影像、建档编号与相关线索。</p>
        </div>
      </button>
      <div class="topic-panel">
        <h3>专题路线</h3>
        <div class="topic-routes">
          <button
            v-for="route in topicRoutes"
            :key="route.name"
            class="topic-route"
            type="button"
            @click="chooseTopic(route.name)"
          >
            <span>{{ route.count.toLocaleString("zh-CN") }} 件</span>
            <strong>{{ route.title }}</strong>
            <em>{{ route.sample ? route.sample.collector : "馆藏" }} · {{ route.name }}</em>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
