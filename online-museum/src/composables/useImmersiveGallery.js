import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createGalleryScene } from "../lib/immersive-gallery/createGalleryScene";
import { fileUrl, previewPath } from "../lib/catalog";

export function useImmersiveGallery(options) {
  const sectionRef = ref(null);
  const canvasRef = ref(null);
  const viewportRef = ref(null);
  const viewerMode = ref("hallway");
  const orbitView = ref(false);
  const canvasReady = ref(false);
  const sceneLoading = ref(false);
  const sceneLoadLabel = ref("进入展馆时加载 3D 游览");
  const sceneLoadProgress = ref(6);
  const webglFailed = ref(false);
  const sceneStatus = ref("拖动屏幕环顾展厅，使用底部控件沿当前游线移动。");
  const lookOffset = { yaw: 0, pitch: 0 };
  const dragState = { active: false, x: 0, y: 0 };
  const qaEnabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("qa");
  const qaToken = Symbol("museum-gallery-qa");
  let sceneInstance = null;
  let sceneObserver = null;
  let threeModulePromise = null;
  let isDisposed = false;
  let sceneInitializing = false;
  let sceneLoadToken = 0;

  function resetLook() {
    lookOffset.yaw = 0;
    lookOffset.pitch = 0;
  }

  function toggleOrbit() {
    orbitView.value = !orbitView.value;
    sceneStatus.value = orbitView.value ? "环视模式已开启，画面会围绕当前展品轻微移动。" : "环视模式已关闭。";
  }

  function approachActiveExhibit() {
    options.stopAutoTour?.();
    if (!options.activeItem.value) return;
    viewerMode.value = "close";
    orbitView.value = false;
    resetLook();
    sceneStatus.value = `已靠近展品：${options.activeItem.value.galleryShortTitle}`;
  }

  function returnToHallway() {
    options.stopAutoTour?.();
    viewerMode.value = "hallway";
    resetLook();
    sceneStatus.value = options.activeItem.value
      ? `已回到走廊，可继续选择展品：${options.activeItem.value.galleryShortTitle}`
      : "已回到走廊。";
  }

  function resetView() {
    resetLook();
    orbitView.value = false;
    viewerMode.value = "hallway";
    sceneStatus.value = "视角已回到当前游线方向。";
  }

  function onViewportPointerDown(event) {
    dragState.active = true;
    dragState.x = event.clientX;
    dragState.y = event.clientY;
    viewportRef.value?.setPointerCapture?.(event.pointerId);
  }

  function onViewportPointerMove(event) {
    if (!dragState.active) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    dragState.x = event.clientX;
    dragState.y = event.clientY;
    lookOffset.yaw = Math.max(-0.62, Math.min(0.62, lookOffset.yaw - dx / 420));
    lookOffset.pitch = Math.max(-0.22, Math.min(0.24, lookOffset.pitch + dy / 760));
  }

  function onViewportPointerUp(event) {
    if (!dragState.active) return;
    viewportRef.value?.releasePointerCapture?.(event.pointerId);
    dragState.active = false;
  }

  function scheduleSceneStart() {
    sceneObserver?.disconnect();
    sceneObserver = null;
    if (sceneInstance || !sectionRef.value || !options.route.value.length) return;
    sceneLoading.value = true;
    sceneLoadLabel.value = "靠近展馆时加载 3D 游览";
    sceneLoadProgress.value = 6;
    if (window.location.hash === "#hall" || !("IntersectionObserver" in window)) {
      initScene();
      return;
    }
    sceneObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      sceneObserver?.disconnect();
      sceneObserver = null;
      initScene();
    }, { rootMargin: "260px 0px" });
    sceneObserver.observe(sectionRef.value);
  }

  async function initScene() {
    if (sceneInstance || sceneInitializing || !canvasRef.value || !viewportRef.value || !options.route.value.length) return;
    const loadToken = ++sceneLoadToken;
    sceneInitializing = true;
    const loadingStartedAt = performance.now();
    sceneLoading.value = true;
    sceneLoadLabel.value = "准备展馆空间";
    sceneLoadProgress.value = 12;
    try {
      threeModulePromise ||= import("../lib/three-gallery");
      const THREE = await threeModulePromise;
      if (isDisposed) return;
      sceneLoadLabel.value = "搭建展墙并布置展品";
      sceneLoadProgress.value = 46;
      const nextScene = await createGalleryScene({
        THREE,
        canvas: canvasRef.value,
        viewport: viewportRef.value,
        route: options.route.value,
        zones: options.zones.value,
        assetUrl: fileUrl,
        itemImageUrl: (item) => fileUrl(previewPath(item)),
        getViewState: () => ({
          activeIndex: options.activeIndex.value,
          viewerMode: viewerMode.value,
          orbitView: orbitView.value,
          lookOffset,
        }),
      });
      if (isDisposed || loadToken !== sceneLoadToken) {
        nextScene.dispose();
        return;
      }
      sceneInstance = nextScene;
      const remaining = 650 - (performance.now() - loadingStartedAt);
      if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));
      if (isDisposed || loadToken !== sceneLoadToken) return;
      canvasReady.value = true;
      sceneLoading.value = false;
      sceneLoadProgress.value = 100;
      exposeQa();
    } catch (error) {
      if (isDisposed || loadToken !== sceneLoadToken) return;
      sceneInstance?.dispose();
      sceneInstance = null;
      webglFailed.value = true;
      canvasReady.value = true;
      sceneLoading.value = false;
      sceneLoadProgress.value = 100;
      sceneStatus.value = "当前浏览器使用轻量展馆视图，可继续按游线参观。";
      exposeQa();
    } finally {
      if (loadToken === sceneLoadToken) sceneInitializing = false;
    }
  }

  function disposeScene() {
    sceneLoadToken += 1;
    sceneInitializing = false;
    sceneObserver?.disconnect();
    sceneObserver = null;
    sceneInstance?.dispose();
    sceneInstance = null;
    canvasReady.value = false;
    sceneLoading.value = false;
    webglFailed.value = false;
  }

  function exposeQa() {
    if (!qaEnabled) return;
    window.__museumGalleryQa = {
      token: qaToken,
      getActiveArtworkProjection: () => sceneInstance?.getActiveArtworkProjection() || { ready: false, reason: "gallery scene is not ready" },
      getState: () => ({
        ready: canvasReady.value,
        loading: sceneLoading.value,
        webglFailed: webglFailed.value,
        activeIndex: options.activeIndex.value,
        viewerMode: viewerMode.value,
        activeSide: options.activeSide.value || "",
        activeTitle: options.activeItem.value?.galleryShortTitle || "",
      }),
    };
  }

  function clearQa() {
    if (qaEnabled && window.__museumGalleryQa?.token === qaToken) delete window.__museumGalleryQa;
  }

  watch(options.activeIndex, (index) => {
    resetLook();
    viewerMode.value = "hallway";
    sceneInstance?.warmTextures(index);
    const item = options.activeItem.value;
    if (item) sceneStatus.value = `正在观看：${item.galleryShortTitle}。${item.galleryIntro}`;
  });

  watch(options.routeSignature, async (nextSignature, previousSignature) => {
    if (nextSignature === previousSignature) return;
    options.stopAutoTour?.();
    resetLook();
    orbitView.value = false;
    viewerMode.value = "hallway";
    disposeScene();
    if (!options.route.value.length) {
      sceneStatus.value = "当前筛选没有可进入展厅的影像展品。";
      return;
    }
    sceneStatus.value = `已切换游线：${options.route.value[0].galleryShortTitle}`;
    await nextTick();
    scheduleSceneStart();
  });

  onMounted(() => {
    isDisposed = false;
    scheduleSceneStart();
  });

  onBeforeUnmount(() => {
    isDisposed = true;
    clearQa();
    disposeScene();
  });

  return {
    sectionRef,
    canvasRef,
    viewportRef,
    viewerMode,
    orbitView,
    canvasReady,
    sceneLoading,
    sceneLoadLabel,
    sceneLoadProgress,
    webglFailed,
    sceneStatus,
    toggleOrbit,
    approachActiveExhibit,
    returnToHallway,
    resetView,
    onViewportPointerDown,
    onViewportPointerMove,
    onViewportPointerUp,
  };
}
