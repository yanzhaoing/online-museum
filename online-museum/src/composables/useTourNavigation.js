import { computed, onBeforeUnmount, ref, watch } from "vue";

export function useTourNavigation(gallery, options = {}) {
  const activeIndex = ref(0);
  const autoTour = ref(false);
  const routeMapOpen = ref(false);
  let autoTimer = 0;

  const route = computed(() => gallery.value?.route || []);
  const zones = computed(() => (gallery.value?.zones || []).filter((zone) => zone.exhibits.length));
  const activeItem = computed(() => route.value[activeIndex.value]);
  const activeZone = computed(() => zones.value.find((zone) => zone.id === activeItem.value?.galleryZone || zone.category === activeItem.value?.galleryZone));
  const activeProgress = computed(() => route.value.length ? Math.round((activeIndex.value + 1) / route.value.length * 100) : 0);
  const activeZoneIndex = computed(() => Math.max(0, zones.value.findIndex((zone) => zone.id === activeZone.value?.id)));
  const routeSignature = computed(() => route.value.map((item) => item.id).join("|"));

  function setActive(index, announce = true) {
    if (!route.value.length) return;
    activeIndex.value = (index + route.value.length) % route.value.length;
    if (announce) options.showToast?.(`已移动到：${activeItem.value.galleryShortTitle}`);
  }

  function nextStop() {
    stopAutoTour();
    setActive(activeIndex.value + 1);
  }

  function previousStop() {
    stopAutoTour();
    setActive(activeIndex.value - 1);
  }

  function continueTour() {
    setActive(activeIndex.value + 1);
  }

  function toggleAutoTour() {
    if (autoTour.value) {
      stopAutoTour();
      return;
    }
    if (!route.value.length) return;
    autoTour.value = true;
    autoTimer = window.setInterval(() => setActive(activeIndex.value + 1, false), 4800);
  }

  function stopAutoTour() {
    autoTour.value = false;
    if (autoTimer) window.clearInterval(autoTimer);
    autoTimer = 0;
  }

  function goToZone(zoneId) {
    stopAutoTour();
    const index = route.value.findIndex((item) => item.galleryZone === zoneId);
    if (index >= 0) setActive(index);
    routeMapOpen.value = false;
  }

  watch(routeSignature, () => {
    stopAutoTour();
    activeIndex.value = 0;
    routeMapOpen.value = false;
  });

  onBeforeUnmount(stopAutoTour);

  return {
    activeIndex,
    autoTour,
    routeMapOpen,
    route,
    zones,
    activeItem,
    activeZone,
    activeProgress,
    activeZoneIndex,
    routeSignature,
    setActive,
    nextStop,
    previousStop,
    continueTour,
    toggleAutoTour,
    stopAutoTour,
    goToZone,
  };
}
