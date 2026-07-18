<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { prefersReducedMotion } from "../composables/useScrollFx";

const props = defineProps({
  total: { type: Number, default: 0 },
});
const emit = defineEmits(["done"]);

const BRAND = "民间藏品数字展厅";
const chars = [...BRAND];

const displayCount = ref("0");
const revealing = ref(false);
const active = ref(true);

let raf = 0;
let timer = 0;

function finish() {
  window.clearTimeout(timer);
  window.cancelAnimationFrame(raf);
  raf = 0;
  active.value = false;
  emit("done");
}

onMounted(() => {
  // 锚点直达（如 #hall）或减少动态偏好时跳过开场
  if (prefersReducedMotion() || window.location.hash) {
    finish();
    return;
  }
  const duration = 1150;
  const startedAt = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    displayCount.value = Math.round(props.total * eased).toLocaleString("zh-CN");
    if (t < 1) {
      raf = window.requestAnimationFrame(tick);
      return;
    }
    // 计数完成：幕布升起，同时通知 Hero 开始入场
    revealing.value = true;
    emit("done");
    timer = window.setTimeout(() => {
      active.value = false;
    }, 640);
  };
  raf = window.requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  window.clearTimeout(timer);
  window.cancelAnimationFrame(raf);
});
</script>

<template>
  <div v-if="active" class="preloader-veil" :class="{ 'is-revealing': revealing }" aria-hidden="true">
    <div class="preloader-center">
      <p class="preloader-brand">
        <span v-for="(char, index) in chars" :key="index" :style="{ '--char-index': index }">{{ char }}</span>
      </p>
      <p class="preloader-count"><strong>{{ displayCount }}</strong> 件档案完成数字建档</p>
      <span class="preloader-line"><span></span></span>
    </div>
  </div>
</template>
