<script setup>
import { computed } from "vue";
import { floorPlanX, floorPlanY, placementFor, wallLeftCount } from "../../lib/immersive-gallery/layout";

const props = defineProps({
  route: { type: Array, required: true },
  zones: { type: Array, required: true },
  activeIndex: { type: Number, required: true },
  activeZone: { type: Object, default: null },
  open: { type: Boolean, default: false },
});

const emit = defineEmits(["select", "go-zone"]);

const stops = computed(() => props.route.map((item, index) => {
  const placement = placementFor(item, index, props.zones);
  return {
    index,
    x: floorPlanX(placement),
    y: floorPlanY(index, props.route.length),
    side: placement.side,
    title: item.galleryShortTitle,
  };
}));

const pathPoints = computed(() => stops.value.map((stop) => `${stop.x},${stop.y}`).join(" "));

const zoneBands = computed(() => props.zones.map((zone) => {
  const startIndex = props.route.findIndex((item) => item.galleryZone === zone.id);
  const endIndex = startIndex + zone.exhibits.length - 1;
  return {
    id: zone.id,
    label: String(zone.index + 1).padStart(2, "0"),
    y: floorPlanY(startIndex, props.route.length) - 8,
    height: Math.max(18, floorPlanY(endIndex, props.route.length) - floorPlanY(startIndex, props.route.length) + 16),
  };
}));

const activeZonePlan = computed(() => {
  const zone = props.activeZone;
  if (!zone) return "默认展线从入口进入，沿固定顺序参观。";
  if (zone.layout === "paper-wall" || zone.layout === "archive-wall") {
    const leftCount = wallLeftCount(zone);
    return `本组先看左墙 ${leftCount} 件，再转右墙 ${zone.exhibits.length - leftCount} 件。`;
  }
  if (zone.layout === "dark-wall") return "本组沿右侧深色墙面顺行。";
  if (zone.layout === "case") return "本组沿中央展柜顺行，靠近时从上方向下看。";
  if (zone.layout === "plinth") return "本组沿中央台座顺行，靠近时以略俯视角查看器物轮廓。";
  return "本组沿默认展线顺行。";
});
</script>

<template>
  <div class="floor-plan-card" :class="{ 'is-open': open }" aria-label="虚拟展馆平面图与参观线路">
    <div class="floor-plan-copy">
      <span>展厅平面</span>
      <strong>入口沿左墙顺行，再转向右墙与中央展柜</strong>
      <p>{{ activeZonePlan }}</p>
    </div>
    <svg class="floor-plan-map" viewBox="0 0 100 320" role="img" aria-label="虚拟展馆平面图，金色线条表示默认参观路线">
      <rect class="floor-plan-room" x="8" y="8" width="84" height="304" rx="8"></rect>
      <line class="floor-plan-axis" x1="50" y1="18" x2="50" y2="302"></line>
      <text class="floor-plan-label" x="50" y="20" text-anchor="middle">入口</text>
      <text class="floor-plan-label" x="50" y="308" text-anchor="middle">尾厅</text>
      <g class="floor-plan-zones">
        <rect v-for="band in zoneBands" :key="band.id" x="11" :y="band.y" width="78" :height="band.height" rx="5"></rect>
      </g>
      <polyline class="floor-plan-path" :points="pathPoints"></polyline>
      <g class="floor-plan-stops">
        <circle
          v-for="stop in stops"
          :key="stop.index"
          :class="{ 'is-active': stop.index === activeIndex, 'is-past': stop.index < activeIndex }"
          :cx="stop.x"
          :cy="stop.y"
          :r="stop.index === activeIndex ? 5 : 3.5"
          tabindex="0"
          role="button"
          :aria-label="`跳转到 ${stop.title}`"
          @click="emit('select', stop.index)"
          @keydown.enter.prevent="emit('select', stop.index)"
          @keydown.space.prevent="emit('select', stop.index)"
        ></circle>
      </g>
      <g class="floor-plan-band-labels">
        <text v-for="band in zoneBands" :key="`${band.id}-label`" x="14" :y="band.y + 12">{{ band.label }}</text>
      </g>
    </svg>
  </div>

  <div class="zone-rail" :class="{ 'is-open': open }" aria-label="展区导览">
    <button
      v-for="(zone, index) in zones"
      :key="zone.id"
      class="zone-node"
      :class="{ 'is-active': zone.id === activeZone?.id, 'is-past': index < (activeZone?.index ?? 0) }"
      type="button"
      @click="emit('go-zone', zone.id)"
    >
      <span>{{ String(index + 1).padStart(2, "0") }}</span>
      <strong>{{ zone.title }}</strong>
      <small>{{ zone.exhibits.length }} 件 / {{ zone.imageItems }} 张影像</small>
    </button>
  </div>
</template>
