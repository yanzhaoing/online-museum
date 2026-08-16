const { spawn } = require("node:child_process");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

const ROOT = resolve(__dirname, "..", "..");
const OUT_DIR = join(ROOT, "qa-screenshots");
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

function findChrome() {
  const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("Chrome or Edge was not found. Set CHROME_PATH to a browser executable.");
  return chrome;
}

function fileUrl(path) {
  return `file:///${path.replaceAll("\\", "/")}`;
}

function waitForDevTools(child) {
  return new Promise((resolvePromise, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for Chrome DevTools.\n${stderr}`)), 10000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timer);
      resolvePromise(match[1]);
    });
    child.on("exit", (code) => reject(new Error(`Chrome exited before DevTools was ready: ${code}\n${stderr}`)));
  });
}

async function pageWebSocketUrl(browserWsUrl) {
  const endpoint = new URL(browserWsUrl);
  const listUrl = `http://${endpoint.host}/json/list`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const targets = await fetch(listUrl).then((response) => response.json()).catch(() => []);
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (page) return page.webSocketDebuggerUrl;
    await delay(200);
  }
  throw new Error("No debuggable page target was found.");
}

function createCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: resolvePromise, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolvePromise(message.result);
  });

  return new Promise((resolvePromise, reject) => {
    socket.addEventListener("open", () => {
      resolvePromise({
        send(method, params = {}) {
          const messageId = ++id;
          socket.send(JSON.stringify({ id: messageId, method, params }));
          return new Promise((resolve, rejectMessage) => pending.set(messageId, { resolve, reject: rejectMessage }));
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("error", reject);
  });
}

async function capture(cdp, name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const path = join(OUT_DIR, `${name}.png`);
  writeFileSync(path, Buffer.from(result.data, "base64"));
  return path;
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result.value;
}

async function waitFor(cdp, expression, timeout = 15000) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeout) {
    lastValue = await evaluate(cdp, expression).catch((error) => ({ error: error.message }));
    if (lastValue) return lastValue;
    await delay(200);
  }
  throw new Error(`Timed out waiting for: ${expression}\nLast value: ${JSON.stringify(lastValue)}`);
}

async function clickButton(cdp, label) {
  // 只在虚拟展馆视窗内找按钮，避免与精品长廊等其他板块的同名按钮冲突
  const clicked = await evaluate(cdp, `(() => {
    const scope = document.querySelector(".virtual-viewport") || document;
    const button = [...scope.querySelectorAll("button")].find((node) =>
      node.getAttribute("aria-label") === ${JSON.stringify(label)} ||
      node.textContent.replace(/\s+/g, "").includes(${JSON.stringify(label.replace(/\s+/g, ""))})
    );
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not find button: ${label}`);
}

async function clickPageButton(cdp, label) {
  const clicked = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll("button")].find((node) =>
      node.getAttribute("aria-label") === ${JSON.stringify(label)} ||
      node.textContent.replace(/s+/g, "").includes(${JSON.stringify(label.replace(/s+/g, ""))})
    );
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not find page button: ${label}`);
}

async function waitForGalleryReady(cdp) {
  await waitFor(cdp, `document.querySelector(".virtual-viewport") && window.__museumGalleryQa`, 30000);
  await waitFor(cdp, `(() => {
    const state = window.__museumGalleryQa?.getState?.();
    return state && (state.ready || state.webglFailed);
  })()`, 90000);
  const galleryState = await evaluate(cdp, `window.__museumGalleryQa.getState()`);
  assertQa(!galleryState.webglFailed, "Virtual gallery visual QA requires WebGL; fallback view was rendered.", galleryState);
  return galleryState;
}

async function moveAlongPathToSide(cdp, side, maxSteps = 30) {
  for (let step = 0; step <= maxSteps; step += 1) {
    const state = await evaluate(cdp, `window.__museumGalleryQa.getState()`);
    if (state.activeSide === side) return { state, steps: step };
    await clickButton(cdp, "下一件展品");
    await delay(950);
  }
  const state = await evaluate(cdp, `window.__museumGalleryQa.getState()`);
  throw new Error(`Could not reach ${side} exhibits along the default path.\n${JSON.stringify(state, null, 2)}`);
}

function assertQa(condition, message, context = {}) {
  if (condition) return;
  const details = Object.keys(context).length ? `\n${JSON.stringify(context, null, 2)}` : "";
  throw new Error(`${message}${details}`);
}

function activeArtworkEvidenceExpression() {
  return `(() => {
    const qa = window.__museumGalleryQa;
    const projection = qa?.getActiveArtworkProjection?.();
    const state = qa?.getState?.();
    const canvas = document.querySelector(".virtual-canvas");
    if (!qa || !projection?.ready || !canvas) {
      return { ready: false, reason: "QA projection or canvas missing", state, projection };
    }

    return {
      ready: true,
      state,
      projection,
      reviewChecklist: [
        "current exhibit image is visible after clicking 近景",
        "no pilaster, wall edge, HUD, or control blocks the exhibit body",
        "frame remains rectangular enough for a museum close-up view",
        "image is not stretched, crushed, blank, or visually misshapen",
      ],
    };
  })()`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const chrome = findChrome();
  const url = fileUrl(join(ROOT, "dist", "online-museum", "index.html"));
  const galleryQaUrl = `${url}?qa=1#hall`;
  const userDataDir = join(process.env.TEMP || process.env.TMPDIR || tmpdir(), `museum-chrome-${Date.now()}`);
  const child = spawn(chrome, [
    "--headless=new",
    "--enable-webgl",
    "--use-gl=swiftshader",
    "--enable-unsafe-swiftshader",
    "--allow-file-access-from-files",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--window-size=1440,1100",
    url,
  ], { stdio: ["ignore", "ignore", "pipe"] });

  const browserWsUrl = await waitForDevTools(child);
  const cdp = await createCdp(await pageWebSocketUrl(browserWsUrl));
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await delay(2800);

  const checks = [];
  checks.push(await evaluate(cdp, `({
    title: document.title,
    heroTiles: document.querySelectorAll(".hero-tile").length,
    tourStops: document.querySelectorAll(".tour-stop").length,
    itemCards: document.querySelectorAll(".item-card").length,
    stats: [...document.querySelectorAll(".hero-stats strong")].map((node) => node.textContent.trim())
  })`));
  const heroFx = await evaluate(cdp, `window.__heroFx?.getState?.() || null`);
  checks.push({ heroFx });
  assertQa(heroFx && (heroFx.mode === "gl" || heroFx.mode === "fallback"), "Hero FX state is not exposed or has an unexpected mode.", heroFx || {});
  const marqueeCount = await evaluate(cdp, `document.querySelectorAll(".marquee-strip").length`);
  assertQa(marqueeCount === 1, "Marquee strip is missing from the page.", { marqueeCount });
  const desktop = await capture(cdp, "desktop-hero");

  await evaluate(cdp, `(() => {
    const topicButton = [...document.querySelectorAll(".topic-route")]
      .find((node) => node.textContent.includes("文献类"));
    topicButton?.click();
    return Boolean(topicButton);
  })()`);
  await waitFor(cdp, `location.hash === "#hall"`, 5000);
  await waitFor(cdp, `(() => {
    const lead = document.querySelector(".virtual-heading > div > p:not(.eyebrow)")?.textContent || "";
    const mode = document.querySelector(".tour-controls button")?.textContent || "";
    return lead.includes("类别：文献类") && mode.includes("专题路线");
  })()`, 5000);
  const topicRouteState = await evaluate(cdp, `(() => ({
    hash: location.hash,
    heading: document.querySelector(".virtual-heading > div > p:not(.eyebrow)")?.textContent.trim() || "",
    mode: document.querySelector(".tour-controls button")?.textContent.trim() || "",
    hud: document.querySelector(".viewport-item-hud span")?.textContent.trim() || "",
    activeTitle: document.querySelector(".viewport-item-hud strong")?.textContent.trim() || "",
    toast: document.querySelector(".tour-toast")?.textContent.trim() || ""
  }))()`);
  checks.push({ topicRouteState });
  assertQa(topicRouteState.hash === "#hall", "Topic route click did not navigate to the virtual gallery.", topicRouteState);
  assertQa(topicRouteState.mode.includes("专题路线"), "Topic route click did not switch the gallery mode label.", topicRouteState);
  assertQa(topicRouteState.heading.includes("类别：文献类"), "Topic route click did not generate a filtered gallery route.", topicRouteState);
  await clickPageButton(cdp, "展览文本");
  await waitFor(cdp, `document.querySelector(".exhibition-text-dialog")?.open`, 8000);
  const exhibitionItems = await evaluate(cdp, `document.querySelectorAll(".exhibition-text-item").length`);
  assertQa(exhibitionItems === 34, "Exhibition text drawer should list all 34 exhibits.", { exhibitionItems });
  await evaluate(cdp, `document.querySelector(".exhibition-text-dialog")?.close()`);
  await delay(400);

  await clickPageButton(cdp, "孙海滨古琴展");
  await waitFor(cdp, `(() => {
    const lead = document.querySelector(".virtual-heading > div > p:not(.eyebrow)")?.textContent || "";
    return lead.includes("孙海滨");
  })()`, 8000);
  const tourSwitchState = await evaluate(cdp, `(() => ({
    lead: document.querySelector(".virtual-heading > div > p:not(.eyebrow)")?.textContent.trim() || "",
    activeTab: document.querySelector(".tour-tab.is-active")?.textContent.trim() || "",
    hud: document.querySelector(".viewport-item-hud strong")?.textContent.trim() || ""
  }))()`);
  checks.push({ tourSwitchState });
  assertQa(tourSwitchState.activeTab.includes("古琴展"), "Tour tab did not switch to the guqin exhibition route.", tourSwitchState);
  assertQa(tourSwitchState.hud.includes("德音堂"), "Guqin route did not start at the expected first exhibit.", tourSwitchState);

  await cdp.send("Page.navigate", { url: galleryQaUrl });
  await waitFor(cdp, `document.querySelector("#hall")`, 30000);
  await evaluate(cdp, `document.querySelector("#hall").scrollIntoView({ block: "start" })`);
  await waitForGalleryReady(cdp);
  await delay(1600);
  const desktopGallery = await capture(cdp, "desktop-gallery");

  await cdp.send("Page.navigate", { url });
  await waitFor(cdp, `document.querySelector("#catalog") && !document.querySelector(".preloader-veil")`, 20000);
  await delay(400);

  await evaluate(cdp, `window.scrollTo(0, document.querySelector("#catalog").offsetTop - 90)`);
  await delay(900);
  const catalog = await capture(cdp, "desktop-catalog");

  await evaluate(cdp, `document.querySelector(".item-card")?.click()`);
  await delay(500);
  checks.push(await evaluate(cdp, `({
    detailOpen: document.querySelector(".detail-dialog")?.open || false,
    detailTitle: document.querySelector(".detail-dialog h2")?.textContent || ""
  })`));
  const detail = await capture(cdp, "desktop-detail");

  await evaluate(cdp, `document.querySelector(".detail-dialog")?.close()`);
  await delay(300);
  await evaluate(cdp, `document.scrollingElement.scrollTop = document.querySelector("#stories").offsetTop - 90`);
  await delay(1500);
  checks.push(await evaluate(cdp, `({
    insightPanels: document.querySelectorAll(".insight-panel").length,
    collectorCards: document.querySelectorAll(".collector-card").length,
    compareCards: document.querySelectorAll(".compare-card").length,
    scrollY: Math.round(scrollY),
    storiesTop: Math.round(document.querySelector("#stories").getBoundingClientRect().top)
  })`));
  const stories = await capture(cdp, "desktop-stories");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.send("Page.navigate", { url });
  try {
    await waitFor(cdp, `document.querySelector(".hero-stats") && !document.querySelector(".preloader-veil")`, 25000);
  } catch (error) {
    // 移动端整页二次加载偶发超时：重试一次导航（桌面端同一页面已断言通过）
    await cdp.send("Page.navigate", { url });
    await waitFor(cdp, `document.querySelector(".hero-stats") && !document.querySelector(".preloader-veil")`, 40000);
  }
  await delay(1200);
  checks.push(await evaluate(cdp, `({
    width: innerWidth,
    statRects: [...document.querySelectorAll(".hero-stats span")].map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
    })
  })`));
  const mobile = await capture(cdp, "mobile-hero");

  await cdp.send("Page.navigate", { url: galleryQaUrl });
  await waitFor(cdp, `document.querySelector("#hall")`, 30000);
  await evaluate(cdp, `document.querySelector("#hall").scrollIntoView({ block: "start" })`);
  await waitForGalleryReady(cdp);

  await clickButton(cdp, "下一件展品");
  await delay(950);
  await clickButton(cdp, "下一件展品");
  await delay(950);
  await clickButton(cdp, "进入当前展品近景");
  await delay(2300);

  const closeArtwork = await evaluate(cdp, activeArtworkEvidenceExpression());
  checks.push({ closeArtworkEvidence: closeArtwork });
  const closeExhibit = await capture(cdp, "mobile-close-exhibit");
  assertQa(closeArtwork.ready, "Close-up artwork evidence could not be read.", closeArtwork);
  assertQa(closeArtwork.state.viewerMode === "close", "Close-up artwork QA did not enter close viewing mode.", closeArtwork);
  assertQa(closeArtwork.state.activeTitle.includes("0049"), "Close-up artwork QA did not reach the known pilaster-regression exhibit.", closeArtwork);

  await clickButton(cdp, "回到走廊");
  await delay(900);
  const caseMove = await moveAlongPathToSide(cdp, "case");
  checks.push({ casePathMove: caseMove });
  await clickButton(cdp, "进入当前展品近景");
  await delay(2300);
  const closeCaseArtwork = await evaluate(cdp, activeArtworkEvidenceExpression());
  checks.push({ closeCaseArtworkEvidence: closeCaseArtwork });
  const closeCase = await capture(cdp, "mobile-close-case");
  assertQa(closeCaseArtwork.ready, "Display-case close-up evidence could not be read.", closeCaseArtwork);
  assertQa(closeCaseArtwork.state.viewerMode === "close", "Display-case QA did not enter close viewing mode.", closeCaseArtwork);
  assertQa(closeCaseArtwork.state.activeSide === "case", "Display-case QA did not stay on a case exhibit.", closeCaseArtwork);

  cdp.close();
  child.kill();
  console.log(JSON.stringify({
    screenshots: { desktop, desktopGallery, catalog, detail, stories, mobile, closeExhibit, closeCase },
    checks,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
