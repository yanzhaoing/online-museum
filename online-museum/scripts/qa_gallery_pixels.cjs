// 抽查：3D 展厅渲染像素（暗角 / 红色地毯 / 整体亮度）— 裁剪 .virtual-viewport 精确截图
const { spawn } = require("node:child_process");
const { existsSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

const ROOT = resolve(__dirname, "..", "..");
const OUT = resolve(ROOT, "qa-screenshots");
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].find(existsSync);
const url = "file:///" + join(ROOT, "dist", "online-museum", "index.html").replaceAll("\\", "/");
const qaUrl = url + "?qa=1#hall";
const child = spawn(CHROME, [
  "--headless=new", "--enable-webgl", "--use-gl=swiftshader", "--enable-unsafe-swiftshader",
  "--allow-file-access-from-files", "--remote-debugging-port=0",
  "--user-data-dir=" + join(tmpdir(), "gpx-" + Date.now()), "--window-size=1440,1000", url,
], { stdio: ["ignore", "ignore", "pipe"] });
let stderr = "";
let started = false;
child.stderr.on("data", (c) => {
  if (started) return;
  stderr += c;
  const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
  if (m) { started = true; run(m[1]); }
});
async function run(ws) {
  const ep = new URL(ws);
  let target;
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
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      socket.send(JSON.stringify({ id: i, method, params }));
    });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.error || e.message))); window.addEventListener("unhandledrejection", (e) => window.__errs.push(String(e.reason)));` });
  await delay(2800);
  await send("Page.navigate", { url: qaUrl });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }))?.result?.value;
  await delay(1500);
  const diag = await ev(`({
    hall: !!document.querySelector("#hall"),
    viewport: !!document.querySelector(".virtual-viewport"),
    qa: !!window.__museumGalleryQa,
    ready: window.__museumGalleryQa?.getState?.()?.ready,
    veil: !!document.querySelector(".preloader-veil"),
  })`);
  console.log("diag:", JSON.stringify(diag));
  let qa = false;
  for (let i = 0; i < 60 && !qa; i++) {
    await delay(500);
    qa = await ev(`!!window.__museumGalleryQa`);
  }
  if (!qa) { console.log("gallery never mounted"); child.kill(); process.exit(1); }
  console.log("gallery:", JSON.stringify(await ev(`(() => {
    const s = window.__museumGalleryQa?.getState?.();
    return { webglFailed: s?.webglFailed, ready: s?.ready, activeSide: s?.activeSide };
  })()`)));
  console.log("page errors:", JSON.stringify(await ev(`window.__errs`)));
  console.log("scene fail:", JSON.stringify(await ev(`window.__sceneFail || null`)));
  const sceneInfo = await ev(`window.__museumGalleryQa?.getSceneInfo?.() || null`);
  if (sceneInfo) {
    writeFileSync(join(OUT, "gallery-scene.json"), JSON.stringify(sceneInfo, null, 1));
    console.log(`scene objects: ${sceneInfo.length}`);
  }
  if (!qa) { console.log("gallery not ready"); child.kill(); process.exit(1); }
  await delay(900);
  await ev(`document.querySelector("#hall").scrollIntoView({ block: "start" })`);
  await delay(1200);
  // 等待进入厅的遮罩/过渡收掉，避免截到纯黑过渡帧
  let veil = true;
  for (let i = 0; i < 40 && veil; i++) {
    await delay(500);
    veil = await ev(`!!document.querySelector(".preloader-veil")`);
  }
  const canvasUi = await ev(`(() => {
    const c = document.querySelector(".virtual-viewport canvas");
    if (!c) return null;
    const s = getComputedStyle(c);
    return { display: s.display, visibility: s.visibility, opacity: Number(s.opacity), rect: (() => { const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() };
  })()`);
  console.log("canvas-ui:", JSON.stringify(canvasUi), "veil:", veil);
  await delay(600);
  // 若虚拟视口底部超出窗口（大画幅布局被裁剪），临时放大视口到完整容纳再截屏
  const before = await ev(`({ iw: innerWidth, ih: innerHeight })`);
  let rect = await ev(`(() => {
    const r = document.querySelector(".virtual-viewport").getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  })()`);
  // 若虚拟视口底部超出窗口（大画幅布局被裁剪），临时放大视口到完整容纳再截屏
  console.log("rect:", JSON.stringify(rect));
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 },
  });
  writeFileSync(join(OUT, "gallery-full.png"), Buffer.from(shot.data, "base64"));
  writeFileSync(join(OUT, "gallery-rect.json"), JSON.stringify(rect));
  const canvasData = await ev(`(() => {
      const c = document.querySelector(".virtual-viewport canvas");
      if (!c || !c.width) return null;
      try { return c.toDataURL("image/png"); } catch (e) { return String(e); }
    })()`);
  if (canvasData && canvasData.startsWith("data:image/png;base64,")) {
    writeFileSync(join(OUT, "gallery-canvas.png"), Buffer.from(canvasData.slice(22), "base64"));
    console.log("canvas: gallery-canvas.png (SwiftShader 下可能为合成伪影，以下 renderTarget 版为准)");
  } else {
    console.log("canvas capture failed:", JSON.stringify(canvasData));
  }
  const frame = await ev(`window.__museumGalleryQa.readFrame()`);
  if (frame && frame.b64) {
    const buf = Buffer.from(frame.b64, "base64");
    const stride = frame.w * 4;
    const raw = Buffer.alloc(frame.h * (stride + 1));
    for (let y = 0; y < frame.h; y++) {
      raw[y * (stride + 1)] = 0;
      buf.copy(raw, y * (stride + 1) + 1, (frame.h - 1 - y) * stride, (frame.h - y) * stride);
    }
    const zlib = require("node:zlib");
    const idat = zlib.deflateSync(raw);
    const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(frame.w, 0); ihdr.writeUInt32BE(frame.h, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)),
    ]);
    writeFileSync(join(OUT, "gallery-rt.png"), png);
    console.log(`rt: gallery-rt.png (${frame.w}x${frame.h})`);
  }
  console.log(`saved: gallery-full.png (${rect.width}x${rect.height} @ ${rect.x},${rect.y})`);
  child.kill();
  process.exit(0);
}
setTimeout(() => { console.log("timeout"); process.exit(1); }, 150000);
