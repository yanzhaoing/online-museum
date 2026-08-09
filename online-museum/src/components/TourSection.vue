<script setup>
import { computed } from "vue";
import ImmersiveTourPresentation from "./tour/ImmersiveTourPresentation.vue";
import { useMuseumContext } from "../composables/useMuseumContext";

const { virtualGallery, activeVirtualGallery, activeMuseumTour, activeFilters, filteredItems } = useMuseumContext();

const gallery = computed(() => activeVirtualGallery.value || virtualGallery);
const filtered = computed(() => activeFilters.value.length > 0);
const routeModeLabel = computed(() => filtered.value ? "专题路线" : "默认游线");
const lead = computed(() => {
  if (filtered.value) {
    return `已根据${activeFilters.value.join(" / ")}，从 ${filteredItems.value.length.toLocaleString("zh-CN")} 件匹配藏品中生成 ${gallery.value.route.length} 件专题路线。`;
  }
  const tour = activeMuseumTour.value;
  return `${tour.summary} 沿游线共 ${gallery.value.total} 件展品。`;
});
</script>

<template>
  <ImmersiveTourPresentation :gallery="gallery" :lead="lead" :route-mode-label="routeModeLabel" />
</template>
