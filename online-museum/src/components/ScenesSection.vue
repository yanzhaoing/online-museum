<script setup>
import { computed } from "vue";
import CategoryScene from "./CategoryScene.vue";
import { useMuseumContext } from "../composables/useMuseumContext";

const { virtualGallery } = useMuseumContext();

const zones = computed(() => virtualGallery.zones.filter((zone) => zone.exhibits.length));
</script>

<template>
  <section class="museum-section" id="scenes" aria-labelledby="scenesTitle">
    <div class="section-heading" data-fx>
      <div>
        <p class="eyebrow">Category Scenes</p>
        <h2 id="scenesTitle">展区巡礼</h2>
        <p>五个类别，五种陈列：以平面场景快速浏览各展区的精选藏品，点击任意展品查看详情。</p>
      </div>
    </div>
    <div class="scene-list">
      <CategoryScene
        v-for="(zone, zoneIndex) in zones"
        :key="zone.category"
        :zone="zone"
        data-fx
        :style="{ '--fx-index': zoneIndex % 3 }"
      />
    </div>
  </section>
</template>
