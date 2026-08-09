<script setup>
import { inject, onMounted, ref, watch } from "vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { useHeroField } from "../composables/useHeroField";
import { useCountUp, useMagnetic } from "../composables/useScrollFx";
import { displayTitle, fileUrl, previewPath } from "../lib/catalog";

const { heroItems, stats, isDark } = useMuseumContext();
const heroMedia = ref(null);
const primaryAction = ref(null);
const secondaryAction = ref(null);

// App 通过 provide 注入：preloader 揭幕完成（或被跳过）后为 true
const entered = inject("appEntered", ref(true));

const hero = useHeroField(() => heroItems);
const counters = useCountUp(() => hero.viewportRef.value);
const primaryMagnet = useMagnetic(primaryAction);
const secondaryMagnet = useMagnetic(secondaryAction);

function handlePointerMove(event) {
  if (!heroMedia.value) return;
  const rect = heroMedia.value.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  heroMedia.value.style.transform = `rotate(-4deg) scale(1.1) translate(${x * -18}px, ${y * -18}px)`;
}

function resetMediaTilt() {
  if (heroMedia.value) heroMedia.value.style.transform = "rotate(-4deg) scale(1.08)";
}

onMounted(() => {
  counters.refresh();
  primaryMagnet.attach();
  secondaryMagnet.attach();
});

// 切换灯光后同步 WebGL 星河的雾色
watch(isDark, () => hero.setTheme());
</script>

<template>
  <section
    :ref="hero.viewportRef"
    class="hero"
    :class="{ 'is-gl': hero.mode.value === 'gl', 'is-entered': entered }"
    aria-labelledby="heroTitle"
  >
    <div class="hero-aurora" aria-hidden="true"></div>
    <div
      ref="heroMedia"
      class="hero-media"
      aria-hidden="true"
      @pointermove="handlePointerMove"
      @pointerleave="resetMediaTilt"
    >
      <div
        v-for="(item, index) in heroItems"
        :key="item.id"
        class="hero-tile"
        :style="{ '--tile-index': index, transform: `translateY(${(index % 5) * 12}px)` }"
      >
        <img :src="fileUrl(previewPath(item))" :alt="displayTitle(item)" loading="eager" decoding="async" />
      </div>
    </div>
    <canvas :ref="hero.canvasRef" class="hero-fx-canvas" aria-hidden="true"></canvas>
    <div class="hero-copy">
      <p class="eyebrow">民间藏品数字展厅</p>
      <h1 id="heroTitle">
        <span class="line"><span class="line-inner">把散落民间的藏品，</span></span>
        <span class="line"><span class="line-inner">组织成可进入、可浏览、</span></span>
        <span class="line"><span class="line-inner">可追溯的线上展厅。</span></span>
      </h1>
      <p>
        围绕本地馆藏档案建立数字展线，支持按藏家、类别、文件形态与关键词检索，
        并以沉浸展厅、专题路线和细节查看串联完整观展体验。
      </p>
      <div class="hero-actions">
        <a ref="primaryAction" class="primary-action is-shimmer" href="#hall">进入展厅</a>
        <a ref="secondaryAction" class="secondary-action" href="#catalog">检索藏品</a>
      </div>
    </div>
    <div class="hero-enter" aria-hidden="true">
      <span>Scroll to enter</span>
    </div>
    <aside class="hero-stats" aria-label="馆藏统计">
      <span><strong :data-count="stats.items" data-count-duration="1400">0</strong>件档案</span>
      <span><strong :data-count="stats.collectors" data-count-duration="1400">0</strong>位/组藏家</span>
      <span><strong :data-count="stats.images" data-count-duration="1400">0</strong>张影像</span>
    </aside>
  </section>
</template>
