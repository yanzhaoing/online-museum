<script setup>
import { computed, ref } from "vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { buildCodeIndex, sunHaibinExhibition } from "../lib/exhibition";
import { displayTitle, fileUrl, previewPath } from "../lib/catalog";

const { items, openDetail } = useMuseumContext();
// -1 = 序厅总览状态（整馆背景 + 提示），点击任一节点后进入对应展厅
const activeIndex = ref(-1);

const route = computed(() => {
  const index = buildCodeIndex(items);
  return sunHaibinExhibition.halls
    .flatMap((hall) => hall.units.map((unit) => {
      const match = unit.items
        .map((content) => ({ content, item: index.get(compactCode(content?.code)) }))
        .find(({ item }) => item?.kind === "image" && item.thumbPath);
      return match ? { hall, unit, ...match } : null;
    }))
    .filter(Boolean);
});

const indexedRoute = computed(() => route.value.map((stop, index) => ({ ...stop, index })));

const activeStop = computed(() => (activeIndex.value >= 0 ? indexedRoute.value[activeIndex.value] : null));
const progress = computed(() => (activeIndex.value < 0 || !indexedRoute.value.length ? 0 : ((activeIndex.value + 1) / indexedRoute.value.length) * 100));

// 各展厅对应的展馆实拍风背景图（整套生成提示词见 design-references/hall-photo-set）
const HALL_BACKGROUNDS = {
  "第一展厅": ["textures/hall/02-documents-wall.png", "textures/hall/03-documents-table.png"],
  "第二展厅": ["textures/hall/04-artifact-cases.png", "textures/hall/05-artifact-island.png"],
  "第三展厅": ["textures/hall/06-scroll-wall.png", "textures/hall/07-scroll-case.png"],
};
const INTRO_BACKGROUND = "textures/hall/01-entrance.png";

// 当前舞台背景：序厅总览 → 序厅图；选中节点 → 该节点所在展厅的实拍图
const stageBackground = computed(() => {
  const stop = activeStop.value;
  if (!stop) return INTRO_BACKGROUND;
  const list = HALL_BACKGROUNDS[stop.hall.indexLabel];
  return list?.[stop.index % list.length] || INTRO_BACKGROUND;
});

function compactCode(code) {
  return String(code || "").replace(/\s+/g, "").toUpperCase();
}

function stopStyle(index) {
  const positions = [
    [15, 35], [29, 57], [42, 31], [54, 58],
    [66, 29], [76, 55], [86, 34], [93, 60],
  ];
  const safeIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
  const [left, top] = positions[safeIndex % positions.length];
  return { "--stop-left": `${left}%`, "--stop-top": `${top}%` };
}

function selectStop(index) {
  activeIndex.value = index;
}

function nextStop() {
  if (!indexedRoute.value.length) return;
  activeIndex.value = (activeIndex.value + 1) % indexedRoute.value.length;
}

function openActiveDetail() {
  if (activeStop.value) openDetail(activeStop.value.item.id, activeStop.value.content.text);
}
</script>

<template>
  <section class="photo-route" aria-labelledby="photoRouteTitle">
    <header class="photo-route-heading">
      <div>
        <p class="eyebrow">Featured Route · 2D Gallery Walk</p>
        <h3 id="photoRouteTitle">先逛一圈，再看藏品</h3>
        <p>沿着展厅中的八个节点，从纸上琴韵走到墨韵传心。每一站都绑定真实档号、影像和策展说明。</p>
      </div>
      <span class="photo-route-count">{{ route.length }} 个节点</span>
    </header>

    <div class="photo-route-stage" role="group" aria-label="古琴展精品路线">
      <img :key="stageBackground" class="photo-route-bg" :src="stageBackground" alt="" aria-hidden="true" />
      <div class="photo-route-vignette" aria-hidden="true"></div>
      <div class="photo-route-path" aria-hidden="true"></div>

      <button
        v-for="stop in indexedRoute"
        :key="stop.id"
        type="button"
        class="photo-route-stop"
        :class="{ 'is-active': stop.index === activeIndex }"
        :style="stopStyle(stop.index)"
        :aria-label="`第 ${stop.index + 1} 站：${stop.content.title}`"
        @click="selectStop(stop.index)"
      >
        <span class="photo-route-stop-pin"><span>{{ String(stop.index + 1).padStart(2, "0") }}</span></span>
        <span class="photo-route-stop-card">
          <span class="photo-route-stop-image">
            <img :src="fileUrl(previewPath(stop.item))" :alt="displayTitle(stop.item)" loading="lazy" decoding="async" />
          </span>
          <span class="photo-route-stop-label">
            <small>{{ stop.hall.indexLabel }} · {{ stop.unit.indexLabel }}</small>
            <strong>{{ stop.content.title }}</strong>
          </span>
        </span>
      </button>

      <div v-if="!activeStop" class="photo-route-intro" aria-live="polite">
        <strong>琴韵流芳 · 文脉传承</strong>
        <span>点击下方任意节点，走进对应展厅</span>
      </div>

      <div v-if="activeStop" class="photo-route-focus" aria-live="polite">
        <div class="photo-route-focus-meta">
          <span>{{ String(activeIndex + 1).padStart(2, "0") }} / {{ String(route.length).padStart(2, "0") }}</span>
          <span>{{ activeStop.hall.title }} · {{ activeStop.unit.title }}</span>
        </div>
        <h4>{{ activeStop.content.title }}</h4>
        <p>{{ activeStop.content.text }}</p>
        <div class="photo-route-actions">
          <button class="ghost-action" type="button" @click="openActiveDetail">查看展品</button>
          <button class="primary-action" type="button" @click="nextStop">下一站</button>
        </div>
      </div>
    </div>

    <div class="photo-route-rail" aria-label="精品路线节点">
      <button
        v-for="stop in indexedRoute"
        :key="`${stop.id}-rail`"
        type="button"
        class="photo-route-rail-item"
        :class="{ 'is-active': stop.index === activeIndex }"
        :aria-label="`前往第 ${stop.index + 1} 站`"
        @click="selectStop(stop.index)"
      >
        <span>{{ String(stop.index + 1).padStart(2, "0") }}</span>
        <small>{{ stop.content.title }}</small>
      </button>
      <span class="photo-route-progress" aria-hidden="true"><i :style="{ width: `${progress}%` }"></i></span>
    </div>
  </section>
</template>
