<script setup>
import { computed } from "vue";
import ImmersiveTourPresentation from "./tour/ImmersiveTourPresentation.vue";
import { useMuseumContext } from "../composables/useMuseumContext";

const { virtualGallery, activeVirtualGallery, activeFilters, filteredItems } = useMuseumContext();

const gallery = computed(() => activeVirtualGallery.value || virtualGallery);
const filtered = computed(() => activeFilters.value.length > 0);
const routeModeLabel = computed(() => filtered.value ? "专题路线" : "默认游线");
const lead = computed(() => {
  if (!filtered.value) {
    return `从 ${virtualGallery.total} 件精选展品进入五组主题内容，沿默认游线完成一次导览。`;
  }
  return `已根据${activeFilters.value.join(" / ")}，从 ${filteredItems.value.length.toLocaleString("zh-CN")} 件匹配藏品中生成 ${gallery.value.route.length} 件专题路线。`;
});
</script>

<template>
  <ImmersiveTourPresentation :gallery="gallery" :lead="lead" :route-mode-label="routeModeLabel" />
</template>
