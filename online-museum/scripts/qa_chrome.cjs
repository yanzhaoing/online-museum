const { spawn } = require("node:child_process");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const chrome = findChrome();
  const url = fileUrl(join(ROOT, "dist", "online-museum", "index.html"));
  const userDataDir = join(process.env.TEMP || "C:\\tmp", `museum-chrome-${Date.now()}`);
  const child = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
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
  await delay(1500);

  const checks = [];
  checks.push(await evaluate(cdp, `({
    title: document.title,
    heroTiles: document.querySelectorAll(".hero-tile").length,
    tourStops: document.querySelectorAll(".tour-stop").length,
    itemCards: document.querySelectorAll(".item-card").length,
    stats: [...document.querySelectorAll(".hero-stats strong")].map((node) => node.textContent.trim())
  })`));
  const desktop = await capture(cdp, "desktop-hero");

  await evaluate(cdp, `window.scrollTo(0, document.querySelector("#catalog").offsetTop - 90)`);
  await delay(500);
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
  await delay(900);
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
  await delay(1800);
  checks.push(await evaluate(cdp, `({
    width: innerWidth,
    statRects: [...document.querySelectorAll(".hero-stats span")].map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
    })
  })`));
  const mobile = await capture(cdp, "mobile-hero");

  cdp.close();
  child.kill();
  console.log(JSON.stringify({ screenshots: { desktop, catalog, detail, stories, mobile }, checks }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
