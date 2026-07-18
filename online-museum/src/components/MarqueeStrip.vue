<script setup>
import { computed } from "vue";
import { useMuseumContext } from "../composables/useMuseumContext";

const { stats } = useMuseumContext();

const phrases = computed(() => [
  "民间藏品线上博物馆",
  `${stats.value.items.toLocaleString("zh-CN")} 件建档档案`,
  `${stats.value.collectors.toLocaleString("zh-CN")} 位/组藏家`,
  `${stats.value.images.toLocaleString("zh-CN")} 张馆藏影像`,
  "五组主题沉浸导览",
]);
</script>

<template>
  <div class="marquee-strip" aria-hidden="true">
    <div class="marquee-track">
      <span v-for="copy in 2" :key="copy" class="marquee-run">
        <template v-for="(phrase, index) in phrases" :key="index">
          <em>{{ phrase }}</em>
          <i>◆</i>
        </template>
      </span>
    </div>
  </div>
</template>
