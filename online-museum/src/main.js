import { createApp } from "vue";
import "../styles.css";

function loadCatalog() {
  if (window.MUSEUM_CATALOG) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "./data/catalog.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load museum catalog."));
    document.head.append(script);
  });
}

async function bootstrap() {
  await loadCatalog();
  const { default: App } = await import("./App.vue");
  createApp(App).mount("#app");
}

bootstrap().catch((error) => {
  console.error(error);
  document.querySelector("#app").innerHTML = `
    <main class="empty-state" style="margin: 12vh auto; max-width: 720px;">
      <strong>馆藏目录载入失败</strong>
      <span>请确认 online-museum/data/catalog.js 存在后刷新页面。</span>
    </main>
  `;
});
