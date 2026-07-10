<script setup>
import TourFloorPlan from "./TourFloorPlan.vue";
import { displayTitle, fileUrl, previewPath } from "../../lib/catalog";

defineProps({
  route: { type: Array, required: true },
  zones: { type: Array, required: true },
  activeItem: { type: Object, default: null },
  activeZone: { type: Object, default: null },
  activeIndex: { type: Number, required: true },
  progress: { type: Number, required: true },
  routeMapOpen: { type: Boolean, default: false },
  routeModeLabel: { type: String, required: true },
});

defineEmits(["open-detail", "continue", "select", "go-zone"]);

function exhibitSrc(item) {
  return fileUrl(previewPath(item));
}
</script>

<template>
  <aside class="gallery-info" aria-live="polite">
    <div v-if="activeItem" class="gallery-card">
      <img :src="exhibitSrc(activeItem)" :alt="displayTitle(activeItem)" />
      <div class="gallery-card-copy">
        <span>{{ String(activeIndex + 1).padStart(2, "0") }} / {{ String(route.length).padStart(2, "0") }} · {{ activeZone?.title }}</span>
        <h3>{{ activeItem.galleryShortTitle }}</h3>
        <p>{{ activeItem.galleryIntro }}</p>
      </div>
      <div class="gallery-actions">
        <button class="ghost-action" type="button" @click="$emit('open-detail')">查看展品</button>
        <button class="primary-action" type="button" @click="$emit('continue')">继续前进</button>
      </div>
    </div>

    <div class="route-progress" :aria-label="`${routeModeLabel}进度`">
      <span class="route-progress-fill" :style="{ width: `${progress}%` }"></span>
    </div>

    <TourFloorPlan
      :route="route"
      :zones="zones"
      :active-index="activeIndex"
      :active-zone="activeZone"
      :open="routeMapOpen"
      @select="$emit('select', $event)"
      @go-zone="$emit('go-zone', $event)"
    />
  </aside>
</template>
