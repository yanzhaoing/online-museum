import { onBeforeUnmount, onMounted, ref } from "vue";
import { createHeroField } from "../lib/hero-fx/createHeroField";
import { fileUrl, previewPath } from "../lib/catalog";
import { prefersReducedMotion } from "./useScrollFx";

/**
 * Hero WebGL 星河：成功时 mode="gl"（图墙淡出），失败或减少动态时 mode="fallback"。
 * 始终暴露 window.__heroFx.getState() 供 QA 断言。
 */
export function useHeroField(getItems) {
  const canvasRef = ref(null);
  const viewportRef = ref(null);
  const mode = ref("pending");
  const ready = ref(false);

  let field = null;
  let visibilityObserver = null;
  let disposed = false;

  function exposeQa() {
    window.__heroFx = {
      getState: () => ({ mode: mode.value, ready: ready.value }),
    };
  }

  function resolveItems() {
    const source = typeof getItems === "function" ? getItems() : getItems?.value;
    return Array.isArray(source) ? source : [];
  }

  function onPointerMove(event) {
    if (!field || !viewportRef.value) return;
    const rect = viewportRef.value.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    field.setPointer(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
  }

  onMounted(async () => {
    exposeQa();
    if (prefersReducedMotion() || !canvasRef.value || !viewportRef.value || !resolveItems().length) {
      mode.value = "fallback";
      ready.value = true;
      return;
    }
    try {
      const THREE = await import("../lib/three-gallery");
      if (disposed) return;
      const nextField = createHeroField({
        THREE,
        canvas: canvasRef.value,
        viewport: viewportRef.value,
        items: resolveItems(),
        imageUrl: (item) => fileUrl(previewPath(item)),
        count: window.innerWidth < 720 ? 48 : 90,
      });
      if (disposed) {
        nextField.dispose();
        return;
      }
      field = nextField;
      mode.value = "gl";
      ready.value = true;
      if ("IntersectionObserver" in window) {
        visibilityObserver = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) field?.resume();
            else field?.pause();
          }
        }, { rootMargin: "120px 0px" });
        visibilityObserver.observe(viewportRef.value);
      }
      viewportRef.value.addEventListener("pointermove", onPointerMove, { passive: true });
    } catch (error) {
      field = null;
      mode.value = "fallback";
      ready.value = true;
      window.__heroFxError = String(error?.message || error);
    }
  });

  onBeforeUnmount(() => {
    disposed = true;
    visibilityObserver?.disconnect();
    visibilityObserver = null;
    viewportRef.value?.removeEventListener("pointermove", onPointerMove);
    field?.dispose();
    field = null;
    if (window.__heroFx) delete window.__heroFx;
  });

  function setTheme() {
    field?.setTheme?.();
  }

  return { canvasRef, viewportRef, mode, ready, setTheme };
}
