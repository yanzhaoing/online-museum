<script setup>
import { computed } from "vue";
import CategoryScene from "../CategoryScene.vue";
import TourInfoPanel from "./TourInfoPanel.vue";
import { useMuseumContext } from "../../composables/useMuseumContext";
import { useImmersiveGallery } from "../../composables/useImmersiveGallery";
import { useTourNavigation } from "../../composables/useTourNavigation";
import { placementFor } from "../../lib/immersive-gallery/layout";

const props = defineProps({
  gallery: { type: Object, required: true },
  lead: { type: String, required: true },
  routeModeLabel: { type: String, required: true },
});

const { openDetail, showToast } = useMuseumContext();
const galleryRef = computed(() => props.gallery);
const navigation = useTourNavigation(galleryRef, { showToast });
const activeSide = computed(() => {
  if (!navigation.activeItem.value) return "";
  return placementFor(navigation.activeItem.value, navigation.activeIndex.value, navigation.zones.value).side;
});
const immersive = useImmersiveGallery({
  route: navigation.route,
  zones: navigation.zones,
  activeIndex: navigation.activeIndex,
  activeItem: navigation.activeItem,
  activeSide,
  routeSignature: navigation.routeSignature,
  stopAutoTour: navigation.stopAutoTour,
});

function openActiveDetail() {
  if (navigation.activeItem.value) openDetail(navigation.activeItem.value.id);
}
</script>

<template>
  <section :ref="immersive.sectionRef" class="museum-section virtual-gallery-section" id="hall" aria-labelledby="virtualGalleryTitle">
    <div class="section-heading virtual-heading">
      <div>
        <p class="eyebrow">Virtual Tour</p>
        <h2 id="virtualGalleryTitle">虚拟展馆</h2>
        <p>{{ lead }}</p>
      </div>
      <div class="tour-controls" aria-label="虚拟展馆控制">
        <button class="ghost-action" type="button" :class="{ 'is-live': navigation.autoTour.value }" @click="navigation.toggleAutoTour">
          {{ navigation.autoTour.value ? "暂停游线" : routeModeLabel }}
        </button>
        <button class="ghost-action" type="button" @click="navigation.routeMapOpen.value = !navigation.routeMapOpen.value">导览图</button>
      </div>
    </div>

    <div class="virtual-gallery">
      <div
        :ref="immersive.viewportRef"
        class="virtual-viewport"
        :class="{ 'is-ready': immersive.canvasReady.value, 'is-loading': immersive.sceneLoading.value }"
        :data-active-side="activeSide || 'unknown'"
        :data-viewer-mode="immersive.viewerMode.value"
        @pointerdown="immersive.onViewportPointerDown"
        @pointermove="immersive.onViewportPointerMove"
        @pointerup="immersive.onViewportPointerUp"
        @pointercancel="immersive.onViewportPointerUp"
      >
        <canvas :ref="immersive.canvasRef" class="virtual-canvas" aria-hidden="true"></canvas>
        <div v-if="!navigation.route.value.length" class="gallery-empty" role="status">
          <strong>当前筛选没有可进入展厅的影像展品</strong>
          <span>请调整筛选条件，或返回全馆浏览全部藏品。</span>
        </div>
        <div v-if="immersive.sceneLoading.value && !immersive.webglFailed.value" class="gallery-loader" role="status" aria-live="polite">
          <div class="gallery-loader-mark" aria-hidden="true"><span></span><span></span></div>
          <div class="gallery-loader-copy">
            <strong>{{ immersive.sceneLoadLabel.value }}</strong>
            <span>先加载展厅，再按游线加载附近展品影像。</span>
          </div>
          <div class="gallery-loader-bar" aria-hidden="true">
            <span :style="{ width: `${immersive.sceneLoadProgress.value}%` }"></span>
          </div>
        </div>
        <CategoryScene
          v-if="immersive.webglFailed.value && navigation.activeZone.value"
          :zone="navigation.activeZone.value"
          compact
          :active-id="navigation.activeItem.value?.id ?? ''"
        />
        <div class="gallery-screen-top">
          <div>
            <strong>民间收藏博物馆</strong>
            <span>{{ navigation.activeZone.value?.title || routeModeLabel }}</span>
          </div>
          <button class="icon-action gallery-reset" type="button" aria-label="重置视角" title="重置视角" @pointerdown.stop @click.stop="immersive.resetView">⌖</button>
        </div>
        <div v-if="navigation.activeItem.value" class="viewport-item-hud">
          <span>{{ String(navigation.activeIndex.value + 1).padStart(2, "0") }} / {{ String(navigation.route.value.length).padStart(2, "0") }} · {{ navigation.activeZone.value?.title }}</span>
          <strong>{{ navigation.activeItem.value.galleryShortTitle }}</strong>
        </div>
        <div v-if="navigation.route.value.length" class="phone-controls" aria-label="手机游览控制" @pointerdown.stop @pointermove.stop @pointerup.stop @pointercancel.stop @click.stop>
          <div class="path-controls" role="group" :aria-label="`${routeModeLabel}移动`">
            <button class="path-step" type="button" aria-label="上一件展品" title="上一件展品" @click.stop="navigation.previousStop"><span aria-hidden="true">‹</span><small>上一件</small></button>
            <button class="path-step is-primary" type="button" aria-label="下一件展品" title="下一件展品" @click.stop="navigation.nextStop"><small>下一件</small><span aria-hidden="true">›</span></button>
          </div>
          <div class="distance-controls" role="group" aria-label="观看距离">
            <button class="distance-control" type="button" aria-label="靠近当前展品" title="靠近当前展品" @click.stop="immersive.approachActiveExhibit"><span aria-hidden="true">▲</span><small>靠近</small></button>
            <button class="distance-control" type="button" aria-label="回到走廊" title="回到走廊" @click.stop="immersive.returnToHallway"><span aria-hidden="true">▼</span><small>走廊</small></button>
          </div>
          <button class="round-control" type="button" :class="{ 'is-active': immersive.orbitView.value }" aria-label="环视" @click.stop="immersive.toggleOrbit"><span aria-hidden="true">◎</span><small>环视</small></button>
        </div>
        <div class="sr-only" aria-live="polite">{{ immersive.sceneStatus.value }}</div>
      </div>

      <TourInfoPanel
        :route="navigation.route.value"
        :zones="navigation.zones.value"
        :active-item="navigation.activeItem.value"
        :active-zone="navigation.activeZone.value"
        :active-index="navigation.activeIndex.value"
        :progress="navigation.activeProgress.value"
        :route-map-open="navigation.routeMapOpen.value"
        :route-mode-label="routeModeLabel"
        @open-detail="openActiveDetail"
        @continue="navigation.continueTour"
        @select="navigation.setActive"
        @go-zone="navigation.goToZone"
      />
    </div>
  </section>
</template>
