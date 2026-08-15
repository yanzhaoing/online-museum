// 验证修复后的孙海滨展 3D 场景：sign 位置、展柜/展台展品立幅比例
const { spawn } = require("node:child_process");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

const ROOT = resolve(__dirname, "..", "..");
const OUT_DIR = join(ROOT, "qa-screenshots");
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const chrome = CHROME_CANDIDATES.find((c) => existsSync(c)) || process.env.CHROME_PATH;
if (!chrome) throw new Error("Chrome not found");
const fileUrl = (p) => `file:///${p.replaceAll("\\", "/")}`;

function waitForDevTools(child) {
  return new Promise((resolvePromise, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`DevTools timeout\n${stderr}`)), 10000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) { clearTimeout(timer); resolvePromise(m[1]); }
    });
    child.on("exit", (code) => reject(new Error(`Chrome exited ${code}`)));
  });
}
async function pageWs(browserWs) {
  const ep = new URL(browserWs);
  for (let i = 0; i < 30; i += 1) {
    const list = await fetch(`http://${ep.host}/json/list`).then((r) => r.json()).catch(() => []);
    const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (page) return page.webSocketDebuggerUrl;
    await delay(200);
  }
  throw new Error("no page");
}
function cdp(ws) {
  const sock = new WebSocket(ws);
  let id = 0;
  const pending = new Map();
  sock.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (!m.id || !pending.has(m.id)) return;
    const { r, j } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? j(new Error(m.error.message)) : r(m.result);
  });
  return new Promise((r, j) => {
    sock.addEventListener("open", () => r({
      send(method, params = {}) {
        const mid = ++id;
        sock.send(JSON.stringify({ id: mid, method, params }));
        return new Promise((rr, jj) => pending.set(mid, { r: rr, j: jj }));
      },
      close() { sock.close(); },
    }));
    sock.addEventListener("error", j);
  });
}
async function ev(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function wait(cdp, expr, timeout = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await ev(cdp, expr).catch(() => null);
    if (v) return v;
    await delay(300);
  }
  throw new Error(`timeout ${expr}`);
}
async function capture(cdp, name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const path = join(OUT_DIR, `${name}.png`);
  writeFileSync(path, Buffer.from(result.data, "base64"));
  console.log("截图:", path);
  return path;
}
async function clickPage(cdp, label) {
  const ok = await ev(cdp, `(() => {
    const b = [...document.querySelectorAll("button")].find((n) =>
      n.getAttribute("aria-label") === ${JSON.stringify(label)} ||
      n.textContent.replace(/\s+/g, "").includes(${JSON.stringify(label.replace(/\s+/g, ""))}));
    if (!b) return false; b.click(); return true;
  })()`);
  if (!ok) throw new Error(`btn ${label}`);
}

(async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  const url = fileUrl(join(ROOT, "dist", "online-museum", "index.html")) + "?qa=1#hall";
  const child = spawn(chrome, [
    "--headless=new", "--enable-webgl", "--use-gl=swiftshader", "--enable-unsafe-swiftshader",
    "--allow-file-access-from-files", "--remote-debugging-port=0",
    `--user-data-dir=${join(process.env.TEMP || tmpdir(), `museum-verify-${Date.now()}`)}`,
    "--window-size=1440,1100", url,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const c = await cdp(await pageWs(await waitForDevTools(child)));
  await c.send("Page.enable"); await c.send("Runtime.enable");
  await wait(c, `document.querySelector("#hall")`, 30000);
  await ev(c, `document.querySelector("#hall").scrollIntoView({ block: "start" })`);
  await wait(c, `(() => { const s = window.__museumGalleryQa?.getState?.(); return s && s.ready; })()`, 90000);
  await clickPage(c, "孙海滨古琴展");
  await wait(c, `(() => (document.querySelector(".virtual-heading > div > p:not(.eyebrow)")?.textContent || "").includes("孙海滨"))()`, 15000);
  // 等新场景就绪且第一个展品为古琴展展品（第一件上墙影像为德音堂琴谱）
  await wait(c, `(() => { const st = window.__museumGalleryQa?.getState?.(); return st && st.ready && st.activeTitle && st.activeTitle.length > 2; })()`, 90000);
  const diag = await ev(c, `(() => {
    const st = window.__museumGalleryQa?.getState?.() || null;
    const sceneInfo = window.__museumGalleryQa?.getSceneInfo?.() || [];
    return { state: st, sceneInfoCount: sceneInfo.length, sceneFail: window.__sceneFail || null };
  })()`);
  console.log("诊断:", JSON.stringify(diag, null, 1).slice(0, 800));
  if (!diag.sceneInfoCount) { c.close(); child.kill(); process.exit(1); }
  await delay(4000); // 纹理加载完成（立幅自适应在纹理加载后生效）
  // 导航到印章集展品（index 4，《印章集1-5》），触发其纹理加载后再验证立幅
  for (let i = 0; i < 4; i += 1) {
    await ev(c, `(() => {
      const b = [...document.querySelectorAll(".virtual-viewport button")].find((n) =>
        n.getAttribute("aria-label") === "下一件展品"); if (b) b.click();
    })()`);
    await delay(700);
  }
  const sealState = await ev(c, `window.__museumGalleryQa.getState()`);
  console.log("导航后:", JSON.stringify(sealState));
  await delay(3000); // 等印章集纹理加载并调整立幅
  await capture(c, "final-seal-hallway"); // 印章集展柜（立幅）+ 天花板墙纸
  await clickPage(c, "靠近当前展品");
  await delay(1600);
  await capture(c, "final-seal-close-fixed");
  await clickPage(c, "回到走廊");
  await delay(500);
  const sceneInfo = await ev(c, `window.__museumGalleryQa.getSceneInfo()`);
  writeFileSync(join(OUT_DIR, "guqin-scene-verify.json"), JSON.stringify(sceneInfo, null, 1));
  const s = sceneInfo;
  const signs = s.filter((o) => o.name === "mesh" && o.y > 4 && o.y < 4.9 && Math.abs(Math.abs(o.x) - 6.46) < 0.5);
  console.log("== 组标题 sign（y≈4.5 贴墙）==");
  for (const o of signs) console.log(`  x=${o.x} y=${o.y} z=${o.z} w=${o.w} h=${o.h}`);
  console.log("\n== case 展品（展柜内，立幅）==");
  const cases = s.filter((o) => /^artwork-/.test(o.name) && Math.abs(o.y - 1.38) < 0.25);
  for (const o of cases) console.log(`  ${o.name} x=${o.x} y=${o.y} z=${o.z} w=${o.w} h=${o.h} 比例=${(o.w / o.h).toFixed(2)}`);
  const caseFrameParts = s.filter((o) => /^frame-part-/.test(o.name) && Math.abs(o.x) < 3.8 && o.y < 2.05 && o.y > 0.75);
  const penetratingParts = caseFrameParts.filter((o) => o.y - o.h < 0.77 || o.y + o.h > 2.05);
  const floatingTopRims = s.filter((o) => o.name === "case-top-rim");
  console.log("展柜框件净空检查:", { frameParts: caseFrameParts.length, penetrating: penetratingParts.length, floatingTopRims: floatingTopRims.length });
  if (!cases.length || penetratingParts.length || floatingTopRims.length) throw new Error("3D 展柜仍存在穿模/浮空顶框");
  const proj = await ev(c, `window.__museumGalleryQa.getActiveArtworkProjection()`);
  console.log("\n== 当前展品投影（印章集）==");
  console.log("  title:", proj.itemTitle, "| expectedAspect:", proj.expectedAspect?.toFixed(3), "| projectedAspect:", proj.projectedAspect?.toFixed(3), "| side:", proj.side);
  // 像素探针：展品中心 vs 背景墙面 vs 地毯 vs 天花板（比较展品突出度）
  if (proj?.ready) {
    const cx = (proj.rect.left + proj.rect.right) / 2;
    const cy = (proj.rect.top + proj.rect.bottom) / 2;
    const pts = [
      [Math.round(cx), Math.round(cy), "展品中心"],
      [Math.round(cx - (proj.rect.width / 2 + 60)), Math.round(cy), "展品左(玻璃外)"],
      [Math.round(cx), Math.round(cy + proj.rect.height / 2 + 90), "展品下(地砖)"],
      [Math.round(cx), 40, "天花板"],
      [110, 500, "左墙远点"],
      [1300, 500, "右墙远点"],
    ];
    const probes = await ev(c, `window.__museumGalleryQa.probePixel(${JSON.stringify(pts.map((p) => p.slice(0, 2)))})`);
    console.log("== 像素探针（坐标 + 命中，供截图采样）==");
    probes.forEach((p, i) => {
      console.log(`  ${pts[i][2]}: x=${p.x} y=${p.y} hit=${p.hit} pixel=${JSON.stringify(p.pixel)}`);
    });
  }
  console.log("\n== plinth 展品（展台，无倾斜）==");
  const plinths = s.filter((o) => /^artwork-/.test(o.name) && Math.abs(o.y - 1.84) < 0.3);
  for (const o of plinths) console.log(`  ${o.name} x=${o.x} y=${o.y} z=${o.z} w=${o.w} h=${o.h} 比例=${(o.w / o.h).toFixed(2)}`);
  console.log("\n== 天花板两侧材质检查（不导出材质，跳过）==");
  const runner = s.filter((o) => o.name === "runner")[0];
  const tiles = s.filter((o) => o.name.startsWith("floor-tile"));
  console.log("红地毯:", JSON.stringify(runner), "\n地砖带:", tiles.map((t) => `x=${t.x} w=${t.w}`).join(" "));
  // 导航到琴心墨韵（第一组 dark-wall，右侧），验证 sign 与展品分离
  for (let i = 0; i < 14; i += 1) {
    const st = await ev(c, `window.__museumGalleryQa.getState()`);
    if (st.activeSide === "right" && st.activeIndex >= 8) break;
    await ev(c, `(() => {
      const b = [...document.querySelectorAll(".virtual-viewport button")].find((n) =>
        n.getAttribute("aria-label") === "下一件展品"); if (b) b.click();
    })()`);
    await delay(650);
  }
  const dwState = await ev(c, `window.__museumGalleryQa.getState()`);
  console.log("dark-wall 站:", JSON.stringify(dwState));
  await delay(2500);
  await capture(c, "final-qin-heart-sign"); // 琴心墨韵组标题 + 展品分离
  c.close(); child.kill();
})().catch((e) => { console.error(e); process.exit(1); });
