import { onBeforeUnmount } from "vue";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const finePointer = () =>
  typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

/**
 * IntersectionObserver 驱动的入场动效：给 root 内所有 [data-fx] 元素
 * 在进入视口时设置 data-fx-in 属性（只触发一次），配合 styles.css 的 reveal 体系。
 * 用属性而不是 class：Vue 重渲染时会用 VNode 重写 className，外部添加的 class 会被抹掉，
 * 而未在模板中声明的 data-* 属性不受 Vue 补丁影响。
 */
export function useReveal(getRoot) {
  let observer = null;

  function scan(root) {
    if (!root || prefersReducedMotion() || !("IntersectionObserver" in window)) {
      root?.querySelectorAll?.("[data-fx]").forEach((el) => { el.dataset.fxIn = ""; });
      return;
    }
    observer ||= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.dataset.fxIn = "";
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    root.querySelectorAll("[data-fx]:not([data-fx-in])").forEach((el) => observer.observe(el));
  }

  function refresh() {
    const root = typeof getRoot === "function" ? getRoot() : getRoot?.value;
    scan(root || document);
  }

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return { refresh };
}

/** 数字滚动：把 el 文本从 0 递增到 target（带千分位），返回取消函数。 */
export function countUp(el, target, duration = 1200) {
  if (!el) return () => {};
  if (prefersReducedMotion() || !target) {
    el.textContent = Number(target || 0).toLocaleString("zh-CN");
    return () => {};
  }
  let raf = 0;
  const startedAt = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * eased).toLocaleString("zh-CN");
    if (t < 1) raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);
  return () => window.cancelAnimationFrame(raf);
}

/** 进入视口时对该元素内 [data-count] 执行一次 count-up。 */
export function useCountUp(getRoot) {
  let observer = null;
  const cancels = new Map();

  function refresh() {
    const root = (typeof getRoot === "function" ? getRoot() : getRoot?.value) || document;
    const nodes = root.querySelectorAll("[data-count]");
    if (!nodes.length) return;
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((el) => countUp(el, Number(el.dataset.count)));
      return;
    }
    observer ||= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        observer.unobserve(el);
        cancels.set(el, countUp(el, Number(el.dataset.count), Number(el.dataset.countDuration) || 1200));
      }
    }, { threshold: 0.4 });
    nodes.forEach((el) => observer.observe(el));
  }

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
    cancels.forEach((cancel) => cancel());
    cancels.clear();
  });

  return { refresh };
}

/** 磁吸 hover：指针靠近时元素向指针微移，离开回弹。仅桌面精细指针。 */
export function useMagnetic(getEl, strength = 0.22, maxOffset = 7) {
  let el = null;
  let raf = 0;
  const current = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };

  function step() {
    current.x += (target.x - current.x) * 0.18;
    current.y += (target.y - current.y) * 0.18;
    if (el) el.style.transform = `translate(${current.x.toFixed(2)}px, ${current.y.toFixed(2)}px)`;
    if (Math.abs(target.x - current.x) > 0.05 || Math.abs(target.y - current.y) > 0.05) {
      raf = window.requestAnimationFrame(step);
    } else {
      raf = 0;
    }
  }

  function kick() {
    if (!raf) raf = window.requestAnimationFrame(step);
  }

  function onMove(event) {
    const rect = el.getBoundingClientRect();
    target.x = Math.max(-maxOffset, Math.min(maxOffset, (event.clientX - rect.left - rect.width / 2) * strength));
    target.y = Math.max(-maxOffset, Math.min(maxOffset, (event.clientY - rect.top - rect.height / 2) * strength));
    kick();
  }

  function onLeave() {
    target.x = 0;
    target.y = 0;
    kick();
  }

  function attach() {
    const node = typeof getEl === "function" ? getEl() : getEl?.value;
    if (!node || node === el || prefersReducedMotion() || !finePointer()) return;
    detach();
    el = node;
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
  }

  function detach() {
    if (!el) return;
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerleave", onLeave);
    el.style.transform = "";
    el = null;
  }

  onBeforeUnmount(() => {
    detach();
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  });

  return { attach, detach };
}
