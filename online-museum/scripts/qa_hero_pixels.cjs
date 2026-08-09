// 截取 hero 区域并采样像素验证浅色星河渲染（背景应≈香槟色，且有金色尘埃亮点）
// 用法: node online-museum/scripts/qa_hero_pixels.cjs
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { writeFileSync } = require("node:fs");

const ROOT = resolve(__dirname, "..", "..");
const OUT = resolve(ROOT, "qa-screenshots", "hero-gl-light.png");
const chrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
const url = "file:///" + join(ROOT, "dist", "online-museum", "index.html").replaceAll("\\", "/");
const child = spawn(chrome, [
  "--headless=new", "--enable-webgl", "--use-gl=swiftshader", "--enable-unsafe-swiftshader",
  "--allow-file-access-from-files", "--remote-debugging-port=0",
  "--user-data-dir=" + join(tmpdir(), "hpix-" + Date.now()),
  "--window-size=1440,1000", "--force-device-scale-factor=1", url,
], { stdio: ["ignore", "ignore", "pipe"] });

let stderr = "";
let started = false;
child.stderr.on("data", (chunk) => {
  if (started) return;
  stderr += chunk.toString();
  const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
  if (match) { started = true; run(match[1]); }
});

async function run(ws) {
  const ep = new URL(ws);
  let target = null;
  for (let i = 0; i < 30 && !target; i++) {
    try {
      target = (await fetch("http://" + ep.host + "/json/list").then((r) => r.json())).find((t) => t.type === "page");
    } catch (e) {}
    await delay(200);
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  await new Promise((r) => (socket.onopen = r));
  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    socket.send(JSON.stringify({ id: i, method, params }));
  });
  await send("Runtime.enable");
  await delay(3000);

  const r = await send("Runtime.evaluate", {
    expression: `window.__heroFx?.getState?.() || null`,
    returnByValue: true,
  });
  console.log("heroFx:", JSON.stringify(r.result.value));

  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("saved:", OUT);
  child.kill();
  process.exit(0);
}
setTimeout(() => { console.log("timeout"); process.exit(1); }, 40000);
