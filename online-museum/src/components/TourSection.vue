<script setup>
import { nextTick, ref, watch } from "vue";
import MediaPreview from "./MediaPreview.vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { displayTitle } from "../lib/catalog";

const {
  tour,
  activeStop,
  autoTour,
  tourSummary,
  activeTourItem,
  activeTourBasis,
  activeTourProgress,
  activeDocentText,
  openDetail,
  previousStop,
  nextStop,
  setActiveStop,
  continueTour,
  toggleAutoTour,
  shuffleTour,
  stopAutoTour,
} = useMuseumContext();

const stageRef = ref(null);
const stopRefs = ref([]);
const stageTransitioning = ref(false);
const hud = ref({ visible: false, left: 16, top: 16, title: "", meta: "" });

function setStopRef(el, index) {
  if (el) stopRefs.value[index] = el;
}

function pedestalStyle(index) {
  const offset = index - activeStop.value;
  const absOffset = Math.abs(offset);
  return {
    "--x": `${50 + offset * 16}%`,
    "--y": `${index === activeStop.value ? 48 : 45 + Math.min(absOffset, 4) * 4}%`,
    "--rotate": `${index === activeStop.value ? 0 : offset * -4}deg`,
    "--depth": `${index === activeStop.value ? 120 : 44 - absOffset * 34}px`,
    "--opacity": absOffset > 4 ? 0.26 : Math.max(0.46, 1 - absOffset * 0.12),
    "--base-scale": index === activeStop.value ? 1.12 : Math.max(0.72, 0.96 - absOffset * 0.07),
    "--side": offset,
    "--abs-offset": absOffset,
    "--stop-index": index,
  };
}

function goToStop(index) {
  stopAutoTour();
  setActiveStop(index);
}

function goPrevious() {
  stopAutoTour();
  previousStop();
}

function goNext() {
  stopAutoTour();
  nextStop();
}

function handleStagePointerMove(event) {
  if (!stageRef.value) return;
  const rect = stageRef.value.getBoundingClientRect();
  const x = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
  const y = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100));
  stageRef.value.style.setProperty("--stage-x", `${x}%`);
  stageRef.value.style.setProperty("--stage-y", `${y}%`);
  stageRef.value.style.setProperty("--stage-tilt", `${(x - 50) / 18}deg`);

  const pedestal = event.target.closest?.(".pedestal");
  if (!pedestal) return;
  const item = tour.value.find((entry) => entry.id === pedestal.dataset.id);
  if (!item) return;
  hud.value = {
    visible: true,
    left: Math.max(16, Math.min(Math.max(16, rect.width - 260), event.clientX - rect.left + 18)),
    top: Math.max(16, Math.min(Math.max(16, rect.height - 110), event.clientY - rect.top + 18)),
    title: displayTitle(item),
    meta: `${item.collector} / ${item.category} / ${item.kindLabel}`,
  };
}

function handleStagePointerLeave() {
  if (!stageRef.value) return;
  stageRef.value.style.setProperty("--stage-x", "50%");
  stageRef.value.style.setProperty("--stage-y", "48%");
  stageRef.value.style.setProperty("--stage-tilt", "0deg");
  hud.value.visible = false;
}

function pulseStage() {
  stageTransitioning.value = false;
  window.requestAnimationFrame(() => {
    stageTransitioning.value = true;
    window.setTimeout(() => {
      stageTransitioning.value = false;
    }, 460);
  });
}

watch(activeStop, async () => {
  await nextTick();
  stopRefs.value[activeStop.value]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  pulseStage();
});
</script>

<template>
  <section class="museum-section" id="hall">
    <div class="section-heading">
      <p class="eyebrow">Curated Route</p>
      <h2>互动展线</h2>
      <div class="tour-controls" aria-label="展线控制">
        <button class="icon-action" type="button" aria-label="上一件" title="上一件" @click="goPrevious">‹</button>
        <button
          class="ghost-action"
          :class="{ 'is-live': autoTour }"
          type="button"
          :aria-pressed="String(autoTour)"
          @click="toggleAutoTour"
        >
          {{ autoTour ? "暂停导览" : "自动导览" }}
        </button>
        <button class="icon-action" type="button" aria-label="下一件" title="下一件" @click="goNext">›</button>
        <button class="ghost-action" type="button" @click="shuffleTour">换一条路线</button>
      </div>
    </div>
    <div class="hall-layout">
      <div class="route-panel">
        <ol>
          <li v-for="(item, index) in tour" :key="item.id">
            <button
              :ref="(el) => setStopRef(el, index)"
              class="tour-stop"
              :class="{ 'is-active': index === activeStop }"
              type="button"
              @click="goToStop(index)"
            >
              <strong>{{ String(index + 1).padStart(2, "0") }} {{ displayTitle(item) }}</strong>
              <span>{{ item.collector }} · {{ item.category }}</span>
            </button>
          </li>
        </ol>
      </div>
      <div class="stage-wrap">
        <div
          ref="stageRef"
          class="stage"
          :class="{ 'is-transitioning': stageTransitioning }"
          tabindex="0"
          aria-label="互动展厅"
          @pointermove="handleStagePointerMove"
          @pointerleave="handleStagePointerLeave"
          @keydown.right.prevent="goNext"
          @keydown.left.prevent="goPrevious"
          @keydown.enter.prevent="activeTourItem && openDetail(activeTourItem.id)"
        >
          <div v-if="!tour.length" class="empty-state empty-stage">
            <strong>没有匹配的展品</strong>
            <span>请调整关键词或筛选条件后继续浏览。</span>
          </div>
          <template v-else>
            <div class="stage-atmosphere" aria-hidden="true">
              <span>Digital Gallery</span>
              <strong>{{ activeTourItem.category }}</strong>
            </div>
            <div
              class="stage-hud"
              :class="{ 'is-visible': hud.visible }"
              :style="{ left: `${hud.left}px`, top: `${hud.top}px` }"
              aria-hidden="true"
            >
              <strong>{{ hud.title }}</strong>
              <span>{{ hud.meta }}</span>
            </div>
            <div class="stage-track" style="rotate: 0 1 0 var(--stage-tilt, 0deg)">
              <figure
                v-for="(item, index) in tour"
                :key="item.id"
                class="pedestal"
                :class="{ 'is-active': index === activeStop }"
                tabindex="0"
                :data-id="item.id"
                :data-stage-index="index"
                :style="pedestalStyle(index)"
                @click="openDetail(item.id)"
                @keydown.enter.prevent="openDetail(item.id)"
              >
                <MediaPreview :item="item" />
                <figcaption>
                  <strong>{{ displayTitle(item) }}</strong>
                  <span>{{ item.collector }} / {{ item.category }}</span>
                </figcaption>
              </figure>
            </div>
            <div class="gallery-floor" aria-hidden="true"></div>
          </template>
        </div>
        <div class="gallery-guide" aria-live="polite">
          <template v-if="activeTourItem">
            <div class="guide-curation">
              <strong>为什么是这 10 件</strong>
              <span>{{ tourSummary || "本线根据当前筛选结果生成，优先兼顾可看性、代表性与来源覆盖。" }}</span>
            </div>
            <div class="guide-copy">
              <span class="guide-step">第 {{ String(activeStop + 1).padStart(2, "0") }} 展位 / 共 {{ String(tour.length).padStart(2, "0") }} 件</span>
              <strong>{{ displayTitle(activeTourItem) }}</strong>
              <em class="guide-reason">入选依据：{{ activeTourBasis?.reason || "作为本线结构中的代表性条目。" }}</em>
              <p>{{ activeDocentText }}</p>
            </div>
            <div class="guide-actions">
              <div class="guide-progress" aria-label="导览进度">
                <span :style="{ width: `${activeTourProgress}%` }"></span>
              </div>
              <button class="ghost-action" type="button" @click="openDetail(activeTourItem.id)">查看详情</button>
              <button class="primary-action guide-next" type="button" @click="continueTour">继续参观</button>
            </div>
          </template>
        </div>
        <div class="tour-map" aria-label="展线地图">
          <button
            v-for="(item, index) in tour"
            :key="item.id"
            class="map-node"
            :class="{ 'is-active': index === activeStop }"
            type="button"
            :aria-label="`跳到第 ${index + 1} 件：${displayTitle(item)}`"
            @click="goToStop(index)"
          >
            <span>{{ String(index + 1).padStart(2, "0") }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
