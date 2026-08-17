<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { useGuqinBgm } from "../composables/useGuqinBgm";
import { buildCodeIndex, sunHaibinExhibition } from "../lib/exhibition";
import { displayTitle, fileUrl } from "../lib/catalog";
import { wallContainsCode, wallsForUnit } from "../content/photo-route-walls";

const { items, openDetail } = useMuseumContext();
const bgm = useGuqinBgm();
const activeIndex = ref(0);
const viewMode = ref("group");
const motionDirection = ref("forward");
const stageRef = ref(null);
const isStageVisible = ref(false);
let stageObserver = null;

function compactCode(code) {
  return String(code || "").replace(/\s+/g, "").toUpperCase();
}

const route = computed(() => {
  const codeIndex = buildCodeIndex(items);
  const result = [];
  sunHaibinExhibition.halls.forEach((hall, hallIndex) => {
    hall.units.forEach((unit, unitIndex) => {
      const unitKey = `${hall.id}:${unit.id}`;
      const resolved = unit.items
        .map((content, indexInUnit) => {
          const item = codeIndex.get(compactCode(content?.code));
          if (item?.kind !== "image" || !item.thumbPath) return null;
          return {
            id: `${unitKey}:${compactCode(content.code)}`,
            hall,
            hallIndex,
            unit,
            unitIndex,
            unitKey,
            indexInUnit,
            content,
            item,
          };
        })
        .filter(Boolean);
      resolved.forEach((stop) => result.push({ ...stop, unitItemCount: resolved.length }));
    });
  });
  return result.map((stop, index) => ({ ...stop, index }));
});

const groups = computed(() => {
  const result = [];
  route.value.forEach((stop) => {
    let group = result.find((entry) => entry.key === stop.unitKey);
    if (!group) {
      group = {
        key: stop.unitKey,
        hall: stop.hall,
        hallIndex: stop.hallIndex,
        unit: stop.unit,
        unitIndex: stop.unitIndex,
        firstIndex: stop.index,
        stops: [],
      };
      result.push(group);
    }
    group.stops.push(stop);
  });
  return result;
});

const activeStop = computed(() => route.value[activeIndex.value] || route.value[0] || null);
const activeGroup = computed(() => groups.value.find((group) => group.key === activeStop.value?.unitKey) || groups.value[0] || null);
const activeGroupIndex = computed(() => groups.value.findIndex((group) => group.key === activeGroup.value?.key));
const progress = computed(() => route.value.length ? ((activeIndex.value + 1) / route.value.length) * 100 : 0);
const sceneClass = computed(() => `is-hall-${activeStop.value?.hallIndex ?? 0}`);

const UNIT_BACKGROUNDS = {
  "unit-qinxue": "textures/hall/gpt-soft-labels-v3/unit-qinxue.png",
  "unit-manuscripts": "textures/hall/gpt-soft-labels-v3/unit-manuscripts.png",
  "unit-seals": "textures/hall/gpt-soft-labels-v3/unit-seals.png",
  "unit-qin-craft": "textures/hall/gpt-soft-labels-v3/unit-qin-craft.png",
  "unit-recordings": "textures/hall/gpt-soft-labels-v3/unit-recordings.png",
  "unit-qin-heart": "textures/hall/gpt-soft-labels-v3/unit-qin-heart.png",
  "unit-masters": "textures/hall/gpt-soft-labels-v3/unit-masters.png",
  "unit-paintings": "textures/hall/gpt-soft-labels-v3/unit-paintings.png",
};
const unitClass = computed(() => `is-unit-${activeStop.value?.unit?.id || "qinxue"}`);

const activeWalls = computed(() => wallsForUnit(
  activeStop.value?.unit?.id,
  UNIT_BACKGROUNDS[activeStop.value?.unit?.id] || UNIT_BACKGROUNDS["unit-qinxue"],
));
const activeWall = computed(() => activeWalls.value.find((wall) => wallContainsCode(wall, activeStop.value?.content?.code)) || activeWalls.value[0]);
const activeWallIndex = computed(() => activeWalls.value.findIndex((wall) => wall.id === activeWall.value?.id));
const activeWallStops = computed(() => activeGroup.value?.stops.filter((stop) => wallContainsCode(activeWall.value, stop.content.code)) || []);
const activeBackground = computed(() => activeWall.value?.background || UNIT_BACKGROUNDS["unit-qinxue"]);
const activeMobileBackground = computed(() => activeBackground.value);
const isCompositeWall = computed(() => Boolean(activeWall.value?.codes));

const FRAME_BOXES = {
  "unit-qinxue": [[450,295,234,232],[1015,295,214,232]],
  "unit-manuscripts": [[510,320,232,230],[941,320,220,230]],
  "unit-seals": [[495,300,246,245],[995,300,236,245]],
  "unit-qin-craft": [[381,312,195,180],[619,312,210,180],[852,312,213,180],[1100,312,210,180],[410,541,235,158],[664,541,277,158],[975,541,277,158]],
  "unit-recordings": [[461,384,212,204],[795,383,223,206],[1122,383,226,206]],
  "unit-qin-heart": [[375,207,204,221],[633,207,210,221],[905,207,219,221],[1183,207,218,221],[757,535,232,182]],
  "unit-masters": [[500,332,233,221],[800,332,239,221],[1082,332,243,221]],
  "unit-paintings": [[538,299,229,212],[823,299,231,212],[1104,299,223,212]],
};

function frameStyle(index) {
  const box = activeWall.value?.hotspots?.[index] || FRAME_BOXES[activeStop.value?.unit?.id]?.[index];
  if (!box) return {};
  return {
    left: `${box[0] / 16.72}%`,
    top: `${box[1] / 9.41}%`,
    width: `${box[2] / 16.72}%`,
    height: `${box[3] / 9.41}%`,
  };
}

function imageFor(stop) {
  if (!stop?.item) return "";
  const sourceName = String(stop.item.fileName || stop.item.path || "");
  const extension = sourceName.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() || ".jpg";
  return fileUrl(`fullsize/${stop.item.id}${extension}`);
}

function selectStop(index, mode = "near") {
  if (!route.value.length) return;
  motionDirection.value = index >= activeIndex.value ? "forward" : "backward";
  activeIndex.value = Math.max(0, Math.min(index, route.value.length - 1));
  viewMode.value = mode;
  if (isStageVisible.value) bgm.play();
}

function selectGroup(group) {
  if (!group) return;
  selectStop(group.firstIndex, "group");
}

function previewStop(index) {
  const stop = route.value[index];
  if (viewMode.value !== "group" || !stop || stop.unitKey !== activeGroup.value?.key) return;
  activeIndex.value = index;
}

function move(delta) {
  if (!route.value.length) return;
  const next = (activeIndex.value + delta + route.value.length) % route.value.length;
  // 上一件/移步只改变当前展示面，不改变观看距离：
  // 中景下继续保持整组陈列，近景下继续保持单件特写。
  selectStop(next, viewMode.value);
}

function moveToNextWall() {
  if (!activeGroup.value || !activeWalls.value.length) return;
  const nextWall = activeWalls.value[activeWallIndex.value + 1];
  if (nextWall) {
    const nextStop = activeGroup.value.stops.find((stop) => wallContainsCode(nextWall, stop.content.code));
    if (nextStop) selectStop(nextStop.index, "group");
    return;
  }
  const nextGroupIndex = (activeGroupIndex.value + 1 + groups.value.length) % groups.value.length;
  selectGroup(groups.value[nextGroupIndex]);
}

const FRAME_SLOT_ORDERS = {
  1: [3],
  2: [2, 4],
  3: [2, 3, 4],
  4: [1, 2, 3, 4],
  5: [1, 2, 3, 4, 6],
  6: [1, 2, 3, 4, 5, 7],
  7: [1, 2, 3, 4, 5, 6, 7],
};

function frameSlot(index, count) {
  const order = FRAME_SLOT_ORDERS[Math.min(7, Math.max(1, count))] || FRAME_SLOT_ORDERS[7];
  return order[index] || 7;
}

function descriptionWithoutUnknownAuthor(text) {
  return String(text || "")
    .replace(/(?:作者|创作者)\s*[:：]?\s*(?:不详|佚名)\s*[，,。；;]?/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function exhibitSummary(text, limit = 46) {
  const normalized = descriptionWithoutUnknownAuthor(text).replace(/\s+/g, "").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}……` : normalized;
}

function approach() {
  viewMode.value = "near";
  if (isStageVisible.value) bgm.play();
}

function returnToGroup() {
  viewMode.value = "group";
}

function openActiveDetail() {
  if (activeStop.value) openDetail(activeStop.value.item.id, descriptionWithoutUnknownAuthor(activeStop.value.content.text));
}

function handleStageKeydown(event) {
  if (event.key === "ArrowLeft") move(-1);
  else if (event.key === "ArrowRight") move(1);
  else if (event.key === "ArrowUp") approach();
  else if (event.key === "ArrowDown" || event.key === "Escape") returnToGroup();
  else return;
  event.preventDefault();
}

onMounted(() => {
  if (!("IntersectionObserver" in window) || !stageRef.value) return;
  stageObserver = new IntersectionObserver(([entry]) => {
    isStageVisible.value = Boolean(entry?.isIntersecting);
    if (!isStageVisible.value) bgm.pause();
  }, { threshold: 0.35 });
  stageObserver.observe(stageRef.value);
});

onBeforeUnmount(() => {
  stageObserver?.disconnect();
  bgm.pause();
});
</script>

<template>
  <section class="photo-route" aria-labelledby="photoRouteTitle">
    <header class="photo-route-heading">
      <div>
        <p class="eyebrow">Interactive 2D Gallery · 互动电子展厅</p>
        <h3 id="photoRouteTitle">走近藏品，听见琴史</h3>
        <p>八个展览单元逐件呈现真实馆藏影像。中景看一组展品，进入近景后看原件细节，解说始终与当前藏品对应。</p>
      </div>
      <div class="photo-route-heading-actions">
        <span class="photo-route-count">{{ route.length }} 件展品 · {{ groups.length }} 个单元</span>
        <button
          class="photo-route-sound"
          :class="{ 'is-playing': bgm.state.playing }"
          type="button"
          :aria-pressed="bgm.state.playing"
          @click="bgm.toggle"
        >
          <span aria-hidden="true">{{ bgm.state.playing ? "◼" : "♪" }}</span>
          {{ bgm.state.playing ? "暂停琴音" : "播放琴音" }}
        </button>
      </div>
    </header>

    <div
      ref="stageRef"
      class="photo-route-stage"
      :class="[sceneClass, unitClass, `is-${viewMode}`, `moves-${motionDirection}`]"
      role="application"
      aria-label="古琴展互动二维展厅，使用左右方向键移动、上键进入近景、下键退回中景"
      tabindex="0"
      @keydown="handleStageKeydown"
    >
      <picture>
        <source media="(max-width: 760px)" :srcset="activeMobileBackground" />
        <img class="photo-route-bg" :src="activeBackground" alt="" aria-hidden="true" />
      </picture>
      <div class="photo-route-light" aria-hidden="true"></div>

      <div v-if="activeStop" class="photo-route-location">
        <span>{{ activeStop.hall.indexLabel }} · {{ activeStop.hall.title }}</span>
        <strong>{{ activeStop.unit.indexLabel }} · {{ activeStop.unit.title }}</strong>
      </div>

      <div v-if="activeGroup && viewMode === 'group'" :key="`${activeGroup.key}:${activeWall?.id}`" class="photo-route-group-view">
        <div class="photo-route-group-copy">
          <small>中景 · {{ activeWall?.label }} · {{ activeWallStops.length }} 件</small>
          <h4>{{ activeGroup.unit.title }}</h4>
          <p>{{ activeGroup.unit.subtitle }}</p>
          <div class="photo-route-group-focus">
            <small>{{ activeStop.content.codeRange || activeStop.content.code }}</small>
            <h5>{{ activeStop.content.title }}</h5>
            <p>{{ exhibitSummary(activeStop.content.text, 120) }}</p>
          </div>
          <span>指向展品阅读说明，点击后进入近景查看</span>
        </div>
        <div class="photo-route-exhibit-wall" :class="{ 'is-background-composite': isCompositeWall }" :style="{ '--group-size': activeWallStops.length }">
          <button
            v-for="(stop, exhibitIndex) in activeWallStops"
            :key="stop.id"
            class="photo-route-exhibit"
            :class="[{ 'is-current': stop.index === activeIndex }, `is-slot-${frameSlot(exhibitIndex, activeWallStops.length)}`]"
            :style="frameStyle(exhibitIndex)"
            type="button"
            :aria-label="`近景查看：${stop.content.title}`"
            @mouseenter="previewStop(stop.index)"
            @focus="previewStop(stop.index)"
            @click="selectStop(stop.index)"
          >
            <span class="photo-route-exhibit-image"><img :src="imageFor(stop)" :alt="displayTitle(stop.item)" loading="eager" decoding="sync" /></span>
            <span class="photo-route-exhibit-label"><small>{{ stop.content.code }}</small><strong>{{ stop.content.title }}</strong><span class="photo-route-exhibit-summary">{{ exhibitSummary(stop.content.text) }}</span></span>
          </button>
        </div>
      </div>

      <div v-if="activeStop && viewMode === 'near'" :key="activeStop.id" class="photo-route-near-view">
        <figure class="photo-route-near-photo">
          <img :src="imageFor(activeStop)" :alt="displayTitle(activeStop.item)" />
          <figcaption>馆藏原始影像 · {{ activeStop.content.codeRange || activeStop.content.code }}</figcaption>
        </figure>
        <article class="photo-route-docent">
          <div class="photo-route-focus-meta">
            <span>近景 {{ String(activeIndex + 1).padStart(2, "0") }} / {{ String(route.length).padStart(2, "0") }}</span>
            <span>{{ activeStop.unit.title }}</span>
          </div>
          <h4>{{ activeStop.content.title }}</h4>
          <p>{{ descriptionWithoutUnknownAuthor(activeStop.content.text) }}</p>
          <button class="ghost-action" type="button" @click="openActiveDetail">查看高清档案</button>
        </article>
      </div>

      <div v-if="activeStop" class="photo-route-navigation" aria-label="二维展厅移动控制">
        <button type="button" aria-label="上一件展品" title="上一件展品" @click="move(-1)"><span aria-hidden="true">←</span><small>上一件</small></button>
        <button type="button" aria-label="下一件展品" title="下一件展品" @click="move(1)"><span aria-hidden="true">→</span><small>下一件</small></button>
        <button type="button" :class="{ 'is-active': viewMode === 'near' }" aria-label="进入当前展品近景" title="进入当前展品近景" @click="approach"><span aria-hidden="true">↑</span><small>近景</small></button>
        <button type="button" :class="{ 'is-active': viewMode === 'group' }" aria-label="退回当前展厅中景" title="退回当前展厅中景" @click="returnToGroup"><span aria-hidden="true">↓</span><small>中景</small></button>
        <button type="button" aria-label="移步到下一面墙" title="移步到下一面墙" @click="moveToNextWall"><span aria-hidden="true">→</span><small>移步</small></button>
      </div>
    </div>

    <div class="photo-route-unit-rail" aria-label="八个展览单元">
      <button
        v-for="(group, groupIndex) in groups"
        :key="group.key"
        type="button"
        :class="{ 'is-active': groupIndex === activeGroupIndex }"
        @click="selectGroup(group)"
      >
        <span>{{ String(groupIndex + 1).padStart(2, "0") }}</span>
        <small>{{ group.hall.indexLabel }}</small>
        <strong>{{ group.unit.title }}</strong>
        <em>{{ group.stops.length }} 件</em>
      </button>
      <span class="photo-route-progress" aria-hidden="true"><i :style="{ width: `${progress}%` }"></i></span>
    </div>
  </section>
</template>
