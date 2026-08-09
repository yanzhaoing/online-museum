// 抽查：详情弹窗 PDF 档案卡 + 特展封面可读性（截图）
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
const child = spawn(CHROME, [
  "--headless=new", "--allow-file-access-from-files", "--remote-debugging-port=0",
  "--user-data-dir=" + join(tmpdir(), "pdfdlg-" + Date.now()), "--window-size=1440,1000", url,
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
  await delay(3200);
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }))?.result?.value;

  // 先切到「形态 = PDF」筛选，目录区会浮现 PDF 卡片
  await ev(`[...document.querySelectorAll(".filters .chip")].find((b) => b.textContent.trim() === "PDF")?.click(); "ok"`);
  await delay(2200);
  const clicked = await ev(`(() => {
    const cards = [...document.querySelectorAll(".item-card")];
    const withPdf = cards.filter((c) => c.querySelector(".pdf-face"));
    if (!withPdf.length) return "no pdf card; item-card=" + cards.length + " pdf-face=" + document.querySelectorAll(".pdf-face").length;
    withPdf[0].click();
    return "clicked " + (withPdf[0].querySelector(".item-title")?.textContent || "").trim();
  })()`);
  console.log("pdf card clicked:", clicked);
  await delay(1200);
  const dlg = await ev(`({
    open: !!document.querySelector(".detail-dialog[open]"),
    hasFace: !!document.querySelector(".detail-pdf-face"),
    badge: document.querySelector(".detail-pdf-face strong")?.textContent?.trim(),
    meta: document.querySelector(".detail-pdf-face em")?.textContent?.trim(),
    hint: document.querySelector(".detail-pdf-face small")?.textContent?.trim()?.slice(0, 40),
  })`);
  console.log("dialog:", JSON.stringify(dlg, null, 1));
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, "detail-pdf-card.png"), Buffer.from(shot.data, "base64"));
  console.log("saved: detail-pdf-card.png");
  child.kill();
  process.exit(0);
}
setTimeout(() => { console.log("timeout"); process.exit(1); }, 50000);
