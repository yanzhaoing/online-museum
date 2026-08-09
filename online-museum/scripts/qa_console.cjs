// 加载检查：捕获控制台错误 / 异常 + 关键板块状态
// 用法: node online-museum/scripts/qa_console.cjs
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

const ROOT = resolve(__dirname, "..", "..");
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

function fileUrl(p) { return `file:///${p.replaceAll("\\", "/")}`; }

function waitForDevTools(child) {
  return new Promise((resolvePromise, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`Timed out. ${stderr}`)), 10000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timer);
      resolvePromise(match[1]);
    });
  });
}

async function pageWebSocketUrl(browserWsUrl) {
  const endpoint = new URL(browserWsUrl);
  for (let attempt = 0; attempt < 30; attempt++) {
    const targets = await fetch(`http://${endpoint.host}/json/list`).then((r) => r.json()).catch(() => []);
    const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (page) return page.webSocketDebuggerUrl;
    await delay(200);
  }
  throw new Error("no page target");
}

function createCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve: r, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else r(message.result);
    }
  });
  return new Promise((resolvePromise, reject) => {
    socket.addEventListener("open", () => resolvePromise({
      send(method, params = {}) {
        const messageId = ++id;
        socket.send(JSON.stringify({ id: messageId, method, params }));
        return new Promise((resolve, rejectMessage) => pending.set(messageId, { resolve, reject: rejectMessage }));
      },
      close() { socket.close(); },
    }));
    socket.addEventListener("error", reject);
  });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  return result.result.value;
}

async function waitFor(cdp, expression, timeout = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const value = await evaluate(cdp, expression).catch(() => null);
    if (value) return value;
    await delay(250);
  }
  throw new Error(`Timed out: ${expression}`);
}

async function main() {
  const url = fileUrl(join(ROOT, "dist", "online-museum", "index.html"));
  const chrome = CHROME_CANDIDATES.find((c) => existsSync(c));
  if (!chrome) throw new Error("no chrome");
  const child = spawn(chrome, [
    "--headless=new",
    "--enable-webgl",
    "--use-gl=swiftshader",
    "--enable-unsafe-swiftshader",
    "--allow-file-access-from-files",
    "--remote-debugging-port=0",
    `--user-data-dir=${join(tmpdir(), `museum-console-${Date.now()}`)}`,
    "--window-size=1440,1000",
    url,
  ], { stdio: ["ignore", "ignore", "pipe"] });

  const cdp = await createCdp(await pageWebSocketUrl(await waitForDevTools(child)));
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");

  const errors = [];
  const onRuntime = (raw) => {
    const data = JSON.parse(raw.data);
    if (data.method === "Runtime.exceptionThrown") {
      errors.push("EXCEPTION: " + JSON.stringify(data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text));
    }
    if (data.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(data.params.type)) {
      errors.push("CONSOLE: " + data.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300));
    }
  };
  const onLog = (raw) => {
    const data = JSON.parse(raw.data);
    if (data.method === "Log.entryAdded" && ["error", "warning"].includes(data.params.entry.level)) {
      errors.push("LOG: " + data.params.entry.text.slice(0, 300));
    }
  };
  cdp._socket = { on: (name, cb) => { if (name === "message") onRuntime({ data: cb.rawData }); } };

  await waitFor(cdp, `document.querySelector(".hero-stats") && !document.querySelector(".preloader-veil")`, 30000);
  await delay(2500);

  const heroFx = await evaluate(cdp, `window.__heroFx?.getState?.() || null`);
  const state = await evaluate(cdp, `({
    highlights: document.querySelectorAll(".masterpiece-dot").length,
    pdfFaces: document.querySelectorAll(".pdf-face, .pdf-thumb").length,
    itemCards: document.querySelectorAll(".item-card").length,
    spotlight: getComputedStyle(document.body, "::before").backgroundImage.slice(0, 120),
    halo: getComputedStyle(document.querySelector(".cursor-halo")).mixBlendMode,
    haloBg: getComputedStyle(document.querySelector(".cursor-halo")).backgroundImage.slice(0, 120),
  })`);
  console.log("heroFx:", JSON.stringify(heroFx));
  console.log("state:", JSON.stringify(state, null, 2));

  // 切深色再回浅色，确认 setTheme 无异常
  await evaluate(cdp, `[...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "切换灯光")?.click()`);
  await delay(500);
  await evaluate(cdp, `[...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "切换灯光")?.click()`);
  await delay(500);

  // 触发展厅加载
  await evaluate(cdp, `document.documentElement.style.scrollBehavior="auto"; document.querySelector("#hall").scrollIntoView({block:"start"})`);
  await delay(4000);

  cdp.close();
  child.kill();
  console.log("console errors:", errors.length ? "\n" + errors.join("\n") : "none");
}

main().catch((error) => { console.error(error); process.exit(1); });
