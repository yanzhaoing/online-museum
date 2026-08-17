// 验收截图：2D 互动展厅（单元中景 → 真实藏品近景 → 前后移动）
const { spawn } = require("node:child_process");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

const ROOT = resolve(__dirname, "..", "..");
const OUT = join(ROOT, "qa-screenshots");
const CHROME = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find((c) => existsSync(c));

function fileUrl(p) { return `file:///${p.replaceAll("\\", "/")}`; }

function waitForDevTools(child) {
  return new Promise((res, rej) => {
    let stderr = "";
    const timer = setTimeout(() => rej(new Error(stderr)), 10000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) { clearTimeout(timer); res(m[1]); }
    });
  });
}

async function pageWs(browserWs) {
  const ep = new URL(browserWs);
  for (let i = 0; i < 30; i++) {
    const targets = await fetch(`http://${ep.host}/json/list`).then((r) => r.json()).catch(() => []);
    const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (page) return page.webSocketDebuggerUrl;
    await delay(200);
  }
  throw new Error("no page");
}

function createCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: r, reject: j } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? j(new Error(msg.error.message)) : r(msg.result);
    }
  });
  return new Promise((res, rej) => {
    socket.addEventListener("open", () => res({
      send(method, params = {}) {
        const mid = ++id;
        socket.send(JSON.stringify({ id: mid, method, params }));
        return new Promise((r2, j2) => pending.set(mid, { resolve: r2, reject: j2 }));
      },
      close() { socket.close(); },
    }));
    socket.addEventListener("error", rej);
  });
}

async function evaluate(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  return r.result?.value;
}

async function waitFor(cdp, expression, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evaluate(cdp, expression).catch(() => null)) return true;
    await delay(250);
  }
  throw new Error("Timed out: " + expression);
}

async function shot(cdp, name) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name), Buffer.from(r.data, "base64"));
  console.log("截图", name);
}

async function main() {
  if (!CHROME) throw new Error("no chrome");
  mkdirSync(OUT, { recursive: true });
  const url = fileUrl(join(ROOT, "dist", "online-museum", "index.html"));
  const child = spawn(CHROME, [
    "--headless=new", "--enable-webgl", "--use-gl=swiftshader", "--enable-unsafe-swiftshader",
    "--allow-file-access-from-files", "--remote-debugging-port=0",
    `--user-data-dir=${join(tmpdir(), `museum-photoroute-${Date.now()}`)}`,
    "--window-size=1440,1100", "--hide-scrollbars", url,
  ], { stdio: ["ignore", "ignore", "pipe"] });

  const cdp = await createCdp(await pageWs(await waitForDevTools(child)));
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");

  const errors = [];
  // 等首屏就绪
  await waitFor(cdp, `document.querySelector(".hero-stats") && !document.querySelector(".preloader-veil")`);
  await delay(1200);

  // 滚到 2D 路线板块：第一单元中景必须已经陈列真实藏品
  await evaluate(cdp, `document.documentElement.style.scrollBehavior="auto"; document.querySelector(".photo-route").scrollIntoView({block:"start"}); "ok"`);
  await delay(1400);
  await waitFor(cdp, `document.querySelectorAll(".photo-route-exhibit img").length >= 1 && [...document.querySelectorAll(".photo-route-exhibit img")].every(img => img.naturalWidth > 0)`);
  await evaluate(cdp, `Promise.all([...document.querySelectorAll(".photo-route-exhibit img")].map(img => img.decode?.().catch(() => {})))`);
  await shot(cdp, "photoroute-01-group-medium.png");

  // 中景按“上一件”后只能改变选中藏品，不得自动切回近景
  const groupTitleBefore = await evaluate(cdp, `document.querySelector(".photo-route-location strong")?.textContent`);
  await evaluate(cdp, `document.querySelector('.photo-route-navigation button[aria-label="上一件展品"]')?.click(); "ok"`);
  await delay(350);
  const groupMoveState = await evaluate(cdp, `({
    remainsMedium: document.querySelector(".photo-route-stage")?.classList.contains("is-group"),
    hasNearView: Boolean(document.querySelector(".photo-route-near-view")),
    title: document.querySelector(".photo-route-location strong")?.textContent
  })`);
  console.log("中景上一件状态:", groupTitleBefore, "=>", groupMoveState);
  if (!groupMoveState.remainsMedium || groupMoveState.hasNearView) throw new Error("中景上一件错误切换到近景");

  // 第一展厅第二单元：《杨无恙诗序》必须有真实近景与对应解说
  await evaluate(cdp, `[...document.querySelectorAll(".photo-route-unit-rail button")].find(b => b.textContent.includes("文人墨迹"))?.click(); "ok"`);
  await delay(500);
  await evaluate(cdp, `Promise.all([...document.querySelectorAll(".photo-route-exhibit img")].map(img => img.decode?.().catch(() => {})))`);
  await shot(cdp, "photoroute-08-manuscripts-mounted.png");
  await evaluate(cdp, `[...document.querySelectorAll(".photo-route-exhibit")].find(b => b.textContent.includes("杨无恙诗序"))?.click(); "ok"`);
  await delay(900);
  await waitFor(cdp, `document.querySelector(".photo-route-docent h4")?.textContent.includes("杨无恙诗序") && document.querySelector(".photo-route-near-photo img")?.naturalWidth > 0`);
  await shot(cdp, "photoroute-02-yang-wuyang-near.png");

  // 第二展厅第二单元：唱片组中景由生成的墙面图承载展品，点击热区仍切换到原始高清近景
  await evaluate(cdp, `[...document.querySelectorAll(".photo-route-unit-rail button")].find(b => b.textContent.includes("琴声留痕"))?.click(); "ok"`);
  await delay(900);
  await waitFor(cdp, `[...document.querySelectorAll(".photo-route-exhibit")].some(b => b.textContent.includes("唱片58正面"))`);
  await evaluate(cdp, `Promise.all([...document.querySelectorAll(".photo-route-exhibit img")].map(img => img.decode?.().catch(() => {})))`);
  const compositeWall = await evaluate(cdp, `({
    background: document.querySelector(".photo-route-bg")?.getAttribute("src"),
    isComposite: document.querySelector(".photo-route-exhibit-wall")?.classList.contains("is-background-composite"),
    hotspots: document.querySelectorAll(".photo-route-exhibit").length,
    overlaysHidden: [...document.querySelectorAll(".photo-route-exhibit-image, .photo-route-exhibit-label")].every(node => getComputedStyle(node).display === "none")
  })`);
  console.log("中景生成墙面与透明热区:", compositeWall);
  if (!compositeWall.isComposite || compositeWall.hotspots !== 2 || !compositeWall.overlaysHidden) {
    throw new Error("中景没有使用生成墙面图或仍叠加了网页展品卡片");
  }
  await shot(cdp, "photoroute-03-records-medium.png");

  await evaluate(cdp, `[...document.querySelectorAll(".photo-route-exhibit")].find(b => b.textContent.includes("唱片58正面"))?.click(); "ok"`);
  await delay(900);
  await waitFor(cdp, `document.querySelector(".photo-route-docent h4")?.textContent.includes("广陵散") && document.querySelector(".photo-route-near-photo img")?.naturalWidth > 0`);
  await shot(cdp, "photoroute-04-guanglingsan-near.png");

  // 生成底图、27 件计数和真实展品近景 URL 校验
  const bg = await evaluate(cdp, `document.querySelector(".photo-route-bg")?.getAttribute("src")`);
  console.log("当前舞台背景:", bg);
  if (bg !== "textures/hall/gpt-soft-labels-v4/unit-recordings-wall-1.png") throw new Error("唱片墙未切换到生成的主题背景");
  const imgOk = await evaluate(cdp, `(document.querySelector(".photo-route-bg")||{}).naturalWidth > 0`);
  console.log("背景图加载成功:", imgOk);
  const count = await evaluate(cdp, `document.querySelector(".photo-route-count")?.textContent.trim()`);
  console.log("路线计数:", count);
  const nearSrc = await evaluate(cdp, `document.querySelector(".photo-route-near-photo img")?.getAttribute("src")`);
  console.log("广陵散真实影像:", nearSrc);
  if (!imgOk || !count?.includes("27 件") || !nearSrc?.startsWith("fullsize/")) {
    throw new Error("2D 互动展厅验收断言失败");
  }

  const allGroups = await evaluate(cdp, `(async () => {
    const buttons = [...document.querySelectorAll(".photo-route-unit-rail button")];
    let total = 0;
    const backgrounds = new Set();
    let walls = 0;
    for (const button of buttons) {
      button.click();
      await new Promise(resolve => setTimeout(resolve, 180));
      const visitedWalls = new Set();
      while (true) {
        const background = document.querySelector(".photo-route-bg");
        const images = [...document.querySelectorAll(".photo-route-exhibit img")];
        const backgroundSrc = background?.getAttribute("src");
        await Promise.all([background, ...images].map(img => img?.complete ? Promise.resolve() : new Promise(resolve => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        })));
        await Promise.all(images.map(img => img.decode?.().catch(() => {}) || Promise.resolve()));
        if (!background?.naturalWidth) return { ok: false, total, failedBackground: button.textContent.trim() };
        if (visitedWalls.has(backgroundSrc)) break;
        visitedWalls.add(backgroundSrc);
        backgrounds.add(backgroundSrc);
        walls += 1;
        if (images.some(img => img.naturalWidth < 1 || !img.getAttribute("src")?.startsWith("fullsize/"))) {
          return { ok: false, total, failedGroup: button.textContent.trim() };
        }
        total += images.length;
        const activeGroupBefore = [...document.querySelectorAll(".photo-route-unit-rail button")].findIndex(node => node.classList.contains("is-active"));
        document.querySelector('.photo-route-navigation button[aria-label="移步到下一面墙"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 220));
        const activeGroupAfter = [...document.querySelectorAll(".photo-route-unit-rail button")].findIndex(node => node.classList.contains("is-active"));
        if (activeGroupAfter !== activeGroupBefore) break;
      }
    }
    return { ok: true, total, groups: buttons.length, walls, backgrounds: [...backgrounds] };
  })()`);
  console.log("全部单元影像巡检:", allGroups);
  if (!allGroups?.ok || allGroups.total !== 27 || allGroups.groups !== 8 || allGroups.walls < 10 || allGroups.backgrounds?.length < 8) {
    throw new Error("8 个主题空景或全部 27 件展品未能完整加载");
  }

  // 甲方指定的竹禅长卷：中景与近景必须保持同一主题空景，衬底不得变成黑板。
  await evaluate(cdp, `[...document.querySelectorAll(".photo-route-unit-rail button")].find(b => b.textContent.includes("丹青寄情"))?.click(); "ok"`);
  await delay(300);
  await evaluate(cdp, `document.querySelector('.photo-route-navigation button[aria-label="移步到下一面墙"]')?.click(); "ok"`);
  await delay(220);
  await evaluate(cdp, `document.querySelector('.photo-route-navigation button[aria-label="移步到下一面墙"]')?.click(); "ok"`);
  await delay(300);
  const bambooBackgroundBefore = await evaluate(cdp, `document.querySelector(".photo-route-bg")?.getAttribute("src")`);
  await evaluate(cdp, `[...document.querySelectorAll(".photo-route-exhibit")].find(b => b.textContent.includes("竹禅作品"))?.click(); "ok"`);
  await delay(800);
  const bambooNear = await evaluate(cdp, `({
    background: document.querySelector(".photo-route-bg")?.getAttribute("src"),
    image: document.querySelector(".photo-route-near-photo img")?.getAttribute("src"),
    imageLoaded: (document.querySelector(".photo-route-near-photo img")?.naturalWidth || 0) > 0
  })`);
  console.log("竹禅近景一致性:", { before: bambooBackgroundBefore, ...bambooNear });
  if (bambooNear.background !== bambooBackgroundBefore || !bambooNear.image?.startsWith("fullsize/") || !bambooNear.imageLoaded) {
    throw new Error("竹禅作品中景与近景未保持同一展厅背景或高清原图");
  }
  await shot(cdp, "photoroute-07-bamboo-near.png");

  // 真实用户点击后琴音应播放；再次点击应暂停（自动播放策略下不强行无交互启动）
  const soundPoint = await evaluate(cdp, `(() => { const r = document.querySelector(".photo-route-sound").getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 }; })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: soundPoint.x, y: soundPoint.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: soundPoint.x, y: soundPoint.y, button: "left", clickCount: 1 });
  await delay(500);
  const soundPlaying = await evaluate(cdp, `document.querySelector(".photo-route-sound")?.classList.contains("is-playing")`);
  console.log("用户点击后琴音播放:", soundPlaying);
  if (!soundPlaying) throw new Error("琴音播放按钮未能启动音频");
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: soundPoint.x, y: soundPoint.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: soundPoint.x, y: soundPoint.y, button: "left", clickCount: 1 });

  // 手机视口：中景与近景均不能横向撑破页面
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(cdp, `document.querySelector(".photo-route").scrollIntoView({block:"start"}); [...document.querySelectorAll(".photo-route-unit-rail button")].find(b => b.textContent.includes("琴声留痕"))?.click(); "ok"`);
  await delay(700);
  await shot(cdp, "photoroute-05-mobile-medium.png");
  await evaluate(cdp, `[...document.querySelectorAll(".photo-route-exhibit")].find(b => b.textContent.includes("唱片58正面"))?.click(); "ok"`);
  await delay(700);
  await shot(cdp, "photoroute-06-mobile-near.png");
  const mobileOverflow = await evaluate(cdp, `document.documentElement.scrollWidth > window.innerWidth + 1`);
  console.log("手机页面横向溢出:", mobileOverflow);
  if (mobileOverflow) throw new Error("手机视口存在横向溢出");

  cdp.close();
  child.kill();
  console.log("console errors:", errors.length ? errors.join("\n") : "none");
}

main().catch((e) => { console.error(e); process.exit(1); });
