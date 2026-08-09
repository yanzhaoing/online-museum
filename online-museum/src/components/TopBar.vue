<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useMuseumContext } from "../composables/useMuseumContext";

const { toggleTheme } = useMuseumContext();
const topbar = ref(null);

let lastY = 0;
let ticking = false;

function updateBar() {
  ticking = false;
  const y = window.scrollY;
  const bar = topbar.value;
  if (!bar) return;
  bar.classList.toggle("is-scrolled", y > 40);
  // 滚动超过一屏后：下滚隐藏、上滚显示（阈值防抖动）
  if (y > 140 && y - lastY > 8) bar.classList.add("is-hidden");
  else if (lastY - y > 8 || y <= 140) bar.classList.remove("is-hidden");
  lastY = y;
}

function onScroll() {
  if (ticking) return;
  ticking = true;
  window.requestAnimationFrame(updateBar);
}

onMounted(() => {
  lastY = window.scrollY;
  window.addEventListener("scroll", onScroll, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
});
</script>

<template>
  <header ref="topbar" class="topbar" id="home">
    <a class="brand" href="#home" aria-label="回到首页">
      <span class="brand-mark">民</span>
      <span>
        <strong>民间藏品线上博物馆</strong>
        <small>Digital Folk Collections Museum</small>
      </span>
    </a>
    <nav class="nav" aria-label="主导航">
      <a href="#highlights">精品</a>
      <a href="#hall">展厅</a>
      <a href="#catalog">藏品</a>
      <a href="#stories">脉络</a>
    </nav>
    <button class="icon-button" type="button" aria-label="切换灯光" title="切换灯光" @click="toggleTheme">
      <span aria-hidden="true">◐</span>
    </button>
  </header>
</template>
