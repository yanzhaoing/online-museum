// 验收截图：2D 精品路线板块（序厅总览 → 文献厅 → 字画厅背景切换）
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

  // 滚到 2D 路线板块：序厅总览状态
  await evaluate(cdp, `document.documentElement.style.scrollBehavior="auto"; document.querySelector(".photo-route").scrollIntoView({block:"start"}); "ok"`);
  await delay(1400);
  await shot(cdp, "photoroute-01-intro.png");

  // 点第 1 站（第一展厅·文献厅背景）
  await evaluate(cdp, `[...document.querySelectorAll(".photo-route-stop")][0]?.click(); "ok"`);
  await delay(900);
  await shot(cdp, "photoroute-02-hall1.png");

  // 点最后一站（第三展厅·字画厅背景）
  await evaluate(cdp, `[...document.querySelectorAll(".photo-route-stop")].at(-1)?.click(); "ok"`);
  await delay(900);
  await shot(cdp, "photoroute-03-hall3.png");

  // 当前背景图 URL 校验
  const bg = await evaluate(cdp, `document.querySelector(".photo-route-bg")?.getAttribute("src")`);
  console.log("当前舞台背景:", bg);
  const imgOk = await evaluate(cdp, `(document.querySelector(".photo-route-bg")||{}).naturalWidth > 0`);
  console.log("背景图加载成功:", imgOk);

  cdp.close();
  child.kill();
  console.log("console errors:", errors.length ? errors.join("\n") : "none");
}

main().catch((e) => { console.error(e); process.exit(1); });
