<script setup>
import { onBeforeUnmount, onMounted, provide, ref } from "vue";
import CatalogSection from "./components/CatalogSection.vue";
import DetailDialog from "./components/DetailDialog.vue";
import FeaturedSection from "./components/FeaturedSection.vue";
import FilterPanel from "./components/FilterPanel.vue";
import HeroSection from "./components/HeroSection.vue";
import ScenesSection from "./components/ScenesSection.vue";
import SearchControls from "./components/SearchControls.vue";
import StoriesSection from "./components/StoriesSection.vue";
import SummaryDialog from "./components/SummaryDialog.vue";
import TopBar from "./components/TopBar.vue";
import TourSection from "./components/TourSection.vue";
import { MuseumKey } from "./composables/useMuseumContext";
import { useMuseum } from "./composables/useMuseum";

const museum = useMuseum();
provide(MuseumKey, museum);

const cursorHalo = ref(null);
const { restoreHashPosition, toast, toastVisible } = museum;

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

onMounted(() => {
  updateScrollProgress();
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  restoreHashPosition();
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", updateScrollProgress);
  window.removeEventListener("pointermove", handlePointerMove);
});
</script>

<template>
  <div class="scroll-progress" aria-hidden="true"></div>
  <div ref="cursorHalo" class="cursor-halo" aria-hidden="true"></div>
  <div class="shell">
    <TopBar />
    <main>
      <HeroSection />
      <SearchControls />
      <FilterPanel />
      <FeaturedSection />
      <TourSection />
      <ScenesSection />
      <CatalogSection />
      <StoriesSection />
    </main>
  </div>
  <DetailDialog />
  <SummaryDialog />
  <div class="tour-toast" :class="{ 'is-visible': toastVisible }" role="status" aria-live="polite">
    {{ toast }}
  </div>
</template>
