<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { useGuqinBgm } from "../composables/useGuqinBgm";
import { buildCodeIndex, sunHaibinExhibition } from "../lib/exhibition";
import { displayTitle, fileUrl } from "../lib/catalog";

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
  "unit-qinxue": "textures/hall/unit-qinxue.png",
  "unit-manuscripts": "textures/hall/unit-manuscripts.png",
  "unit-seals": "textures/hall/unit-seals.png",
  "unit-qin-craft": "textures/hall/unit-qin-craft.png",
  "unit-recordings": "textures/hall/unit-recordings.png",
  "unit-qin-heart": "textures/hall/unit-qin-heart.png",
  "unit-masters": "textures/hall/unit-masters.png",
  "unit-paintings": "textures/hall/unit-paintings.png",
};
const activeBackground = computed(() => UNIT_BACKGROUNDS[activeStop.value?.unit?.id] || UNIT_BACKGROUNDS["unit-qinxue"]);

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

function move(delta) {
  if (!route.value.length) return;
  const next = (activeIndex.value + delta + route.value.length) % route.value.length;
  // 上一件/下一件只改变当前藏品，不改变观看距离：
  // 中景下继续保持整组陈列，近景下继续保持单件特写。
  selectStop(next, viewMode.value);
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

function approach() {
  viewMode.value = "near";
  if (isStageVisible.value) bgm.play();
}

function returnToGroup() {
  viewMode.value = "group";
}

function openActiveDetail() {
  if (activeStop.value) openDetail(activeStop.value.item.id, activeStop.value.content.text);
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
        <p>八个展览单元逐件呈现真实馆藏影像。中景看一组展品，靠近后看原件细节，解说始终与当前藏品对应。</p>
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
      :class="[sceneClass, `is-${viewMode}`, `moves-${motionDirection}`]"
      role="application"
      aria-label="古琴展互动二维展厅，使用左右方向键移动、上键靠近、下键退回中景"
      tabindex="0"
      @keydown="handleStageKeydown"
    >
      <img class="photo-route-bg" :src="activeBackground" alt="" aria-hidden="true" />
      <div class="photo-route-light" aria-hidden="true"></div>

      <div v-if="activeStop" class="photo-route-location">
        <span>{{ activeStop.hall.indexLabel }} · {{ activeStop.hall.title }}</span>
        <strong>{{ activeStop.unit.indexLabel }} · {{ activeStop.unit.title }}</strong>
      </div>

      <div v-if="activeGroup && viewMode === 'group'" :key="activeGroup.key" class="photo-route-group-view">
        <div class="photo-route-group-copy">
          <small>中景 · 本组 {{ activeGroup.stops.length }} 件</small>
          <h4>{{ activeGroup.unit.title }}</h4>
          <p>{{ activeGroup.unit.subtitle }}</p>
          <span>点击任一真实藏品，靠近查看</span>
        </div>
        <div class="photo-route-exhibit-wall" :style="{ '--group-size': activeGroup.stops.length }">
          <button
            v-for="(stop, exhibitIndex) in activeGroup.stops"
            :key="stop.id"
            class="photo-route-exhibit"
            :class="[{ 'is-current': stop.index === activeIndex }, `is-slot-${frameSlot(exhibitIndex, activeGroup.stops.length)}`]"
            type="button"
            :aria-label="`靠近查看：${stop.content.title}`"
            @click="selectStop(stop.index)"
          >
            <span class="photo-route-exhibit-image"><img :src="imageFor(stop)" :alt="displayTitle(stop.item)" loading="eager" decoding="sync" /></span>
            <span class="photo-route-exhibit-label"><small>{{ stop.content.code }}</small><strong>{{ stop.content.title }}</strong></span>
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
          <p>{{ activeStop.content.text }}</p>
          <button class="ghost-action" type="button" @click="openActiveDetail">查看高清档案</button>
        </article>
      </div>

      <div v-if="activeStop" class="photo-route-navigation" aria-label="二维展厅移动控制">
        <button type="button" aria-label="上一件展品" title="上一件展品" @click="move(-1)"><span aria-hidden="true">←</span><small>上一件</small></button>
        <button type="button" :class="{ 'is-active': viewMode === 'near' }" aria-label="靠近当前展品" title="靠近当前展品" @click="approach"><span aria-hidden="true">↑</span><small>靠近</small></button>
        <button type="button" :class="{ 'is-active': viewMode === 'group' }" aria-label="退回当前单元中景" title="退回当前单元中景" @click="returnToGroup"><span aria-hidden="true">↓</span><small>中景</small></button>
        <button type="button" aria-label="下一件展品" title="下一件展品" @click="move(1)"><span aria-hidden="true">→</span><small>下一件</small></button>
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
