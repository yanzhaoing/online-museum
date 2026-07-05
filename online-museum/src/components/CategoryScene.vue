<script setup>
import { computed } from "vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { displayTitle, fileUrl, previewPath, stableVariant } from "../lib/catalog";

const props = defineProps({
  zone: { type: Object, required: true },
  compact: { type: Boolean, default: false },
  activeId: { type: [String, Number], default: "" },
});

const { openDetail } = useMuseumContext();

const SCENE_KINDS = {
  "票据类": "desk",
  "文献类": "cabinet",
  "徽章印章类": "velvet",
  "字画类": "scroll",
  "器物类": "table",
};

const sceneKind = computed(() => SCENE_KINDS[props.zone?.category] || "desk");

const sceneHint = computed(() => ({
  desk: "账房桌面 · 纸本平铺",
  cabinet: "档案柜 · 抽屉调阅",
  velvet: "绒面奖章盒 · 圆窝陈列",
  scroll: "墨房 · 挂轴垂展",
  table: "老屋条案 · 器物静置",
}[sceneKind.value]));

function exhibitSrc(item) {
  return fileUrl(previewPath(item));
}

function itemStyle(item, index) {
  if (sceneKind.value === "desk") {
    return { "--tilt": `${(stableVariant(item, 5, index) - 2) * 1.7}deg` };
  }
  if (sceneKind.value === "scroll") {
    return { "--drop": `${stableVariant(item, 3, index) * 16}px` };
  }
  if (sceneKind.value === "table") {
    return { "--object-height": `${150 + stableVariant(item, 4, index) * 22}px` };
  }
  return {};
}

function isActive(item) {
  return props.activeId !== "" && String(item.id) === String(props.activeId);
}
</script>

<template>
  <figure
    class="category-scene"
    :class="[`scene-${sceneKind}`, { 'is-compact': compact }]"
    :style="{ '--zone-accent': zone.accent }"
  >
    <header v-if="!compact" class="scene-heading">
      <span class="scene-index">{{ String((zone.index ?? 0) + 1).padStart(2, "0") }}</span>
      <div class="scene-heading-copy">
        <h3>{{ zone.title }}</h3>
        <p>{{ zone.subtitle }}</p>
      </div>
      <span class="scene-hint">{{ sceneHint }} · {{ zone.exhibits.length }} 件</span>
    </header>
    <div class="scene-stage">
      <div class="scene-backdrop" aria-hidden="true"></div>
      <ul class="scene-items">
        <li v-for="(item, index) in zone.exhibits" :key="item.id">
          <button
            type="button"
            class="scene-item"
            :class="{ 'is-active': isActive(item) }"
            :style="itemStyle(item, index)"
            @click="openDetail(item.id)"
          >
            <span class="scene-media">
              <img :src="exhibitSrc(item)" :alt="displayTitle(item)" loading="lazy" decoding="async" />
            </span>
            <span class="scene-plaque">
              <strong>{{ item.galleryShortTitle }}</strong>
              <em>{{ item.collector }} · {{ item.category }}</em>
            </span>
          </button>
        </li>
      </ul>
    </div>
  </figure>
</template>
