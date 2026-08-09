<script setup>
import { nextTick, onBeforeUnmount, onMounted, provide, ref } from "vue";
import CatalogSection from "./components/CatalogSection.vue";
import DetailDialog from "./components/DetailDialog.vue";
import ExhibitionTextDrawer from "./components/ExhibitionTextDrawer.vue";
import FeaturedSection from "./components/FeaturedSection.vue";
import FilterPanel from "./components/FilterPanel.vue";
import HeroSection from "./components/HeroSection.vue";
import HighlightsSection from "./components/HighlightsSection.vue";
import MarqueeStrip from "./components/MarqueeStrip.vue";
import PreloaderVeil from "./components/PreloaderVeil.vue";
import ScenesSection from "./components/ScenesSection.vue";
import SearchControls from "./components/SearchControls.vue";
import StoriesSection from "./components/StoriesSection.vue";
import SummaryDialog from "./components/SummaryDialog.vue";
import TopBar from "./components/TopBar.vue";
import TourSection from "./components/TourSection.vue";
import { MuseumKey } from "./composables/useMuseumContext";
import { useMuseum } from "./composables/useMuseum";
import { useReveal } from "./composables/useScrollFx";

const museum = useMuseum();
provide(MuseumKey, museum);

const cursorHalo = ref(null);
const { restoreHashPosition, stats, toast, toastVisible } = museum;

// preloader 揭幕完成（或被跳过）后通知 Hero 入场；兜底定时器防异常卡死
const appEntered = ref(false);
provide("appEntered", appEntered);
const reveal = useReveal(() => document);

function enterApp() {
  appEntered.value = true;
}

function updateScrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const progress = max > 0 ? Math.min(100, Math.max(0, window.scrollY / max * 100)) : 0;
  document.documentElement.style.setProperty("--scroll-progress", `${progress}%`);
}

function handlePointerMove(event) {
  const x = Math.round(event.clientX / window.innerWidth * 100);
  const y = Math.round(event.clientY / window.innerHeight * 100);
  document.documentElement.style.setProperty("--spot-x", `${x}%`);
  document.documentElement.style.setProperty("--spot-y", `${y}%`);
  if (cursorHalo.value) {
    cursorHalo.value.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
  }
}

function handlePointerOver(event) {
  if (!cursorHalo.value) return;
  const interactive = event.target.closest?.("a, button, [data-cursor]");
  cursorHalo.value.classList.toggle("is-active", Boolean(interactive));
  cursorHalo.value.dataset.cursorLabel = interactive?.closest?.("[data-cursor]")?.dataset.cursor || "";
}

function handlePointerOut(event) {
  if (!cursorHalo.value) return;
  if (event.relatedTarget?.closest?.("a, button, [data-cursor]")) return;
  cursorHalo.value.classList.remove("is-active");
  cursorHalo.value.dataset.cursorLabel = "";
}

onMounted(() => {
  updateScrollProgress();
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("pointerover", handlePointerOver, { passive: true });
  window.addEventListener("pointerout", handlePointerOut, { passive: true });
  restoreHashPosition();
  nextTick(() => reveal.refresh());
  window.setTimeout(enterApp, 2600);
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", updateScrollProgress);
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerover", handlePointerOver);
  window.removeEventListener("pointerout", handlePointerOut);
});
</script>

<template>
  <div class="scroll-progress" aria-hidden="true"></div>
  <div ref="cursorHalo" class="cursor-halo" aria-hidden="true" data-cursor-label=""></div>
  <PreloaderVeil :total="stats.items" @done="enterApp" />
  <div class="shell">
    <TopBar />
    <main>
      <HeroSection />
      <SearchControls />
      <FilterPanel />
      <MarqueeStrip />
      <FeaturedSection />
      <HighlightsSection />
      <TourSection />
      <ScenesSection />
      <CatalogSection />
      <StoriesSection />
    </main>
  </div>
  <DetailDialog />
  <SummaryDialog />
  <ExhibitionTextDrawer />
  <div class="tour-toast" :class="{ 'is-visible': toastVisible }" role="status" aria-live="polite">
    {{ toast }}
  </div>
</template>
