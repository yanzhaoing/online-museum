// 古琴展背景音乐生成器：Karplus-Strong 拨弦物理建模合成
// 用噪声激励 + 延迟线反馈模拟琴弦振动，叠加 Freeverb 风格混响，
// 生成一段约 94 秒、可无缝循环的古琴风格氛围音乐（F 宫五声音阶）。
// 用法：node online-museum/scripts/generate_guqin_bgm.mjs
// 产物：online-museum/audio/guqin-bgm.wav（22050Hz / 16bit / 单声道）

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 22050;
const LOOP_SECONDS = 94;
const TAIL_SECONDS = 4; // 结尾混响/余韵，交叉淡化回开头实现无缝循环
const OUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../audio/guqin-bgm.wav");

// ---------------- 基础工具 ----------------

// 可复现伪随机数（每次生成的音频完全一致）
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// 一阶低通系数
function onePoleAlpha(cutoffHz) {
  const w = 2 * Math.PI * cutoffHz;
  return w / (SR + w);
}

/**
 * Karplus-Strong 拨弦声部
 * @param {object} o
 * @param {number} o.freq       目标频率 Hz
 * @param {number} o.dur        渲染时长 s（自然衰减到此截止）
 * @param {number} o.gain       增益
 * @param {number} o.brightness 激励噪声低通截止 Hz（越大越亮）
 * @param {number} o.damping    反馈衰减系数（越接近 1 余音越长）
 * @param {number} [o.slideFrom] 滑音起始频率（绰/注），指数过渡到 freq
 * @param {number} [o.slideDur]  滑音时长 s
 * @param {object} [o.vibrato]   吟猱：{ rate, depth, start, ramp }
 * @param {number} [o.seed]
 */
function pluckString(o) {
  const n = Math.ceil(o.dur * SR);
  const out = new Float32Array(n);
  const startFreq = o.slideFrom ?? o.freq;
  const minFreq = Math.min(o.freq, startFreq) * 0.9; // 给吟猱下潜留余量
  const maxN = Math.ceil(SR / minFreq) + 8;
  const line = new Float32Array(maxN);

  // 激励：一个基音周期的低通噪声（拨弦瞬间）
  const rng = makeRng((o.seed ?? 1) * 2654435761 + 97);
  const p0 = Math.max(2, Math.round(SR / startFreq));
  const alpha = onePoleAlpha(o.brightness);
  let lp = 0;
  for (let i = 0; i < p0; i++) {
    lp += alpha * ((rng() * 2 - 1) - lp);
    line[i] = lp * 2.4;
  }

  let w = p0 % maxN; // 写指针：从激励之后开始，读指针落后一个周期
  let curPeriod = SR / startFreq;
  const targetPeriod = SR / o.freq;
  const slideTau = Math.max(0.03, (o.slideDur ?? 0.4) / 3);
  const slideK = 1 - Math.exp(-1 / (SR * slideTau));
  const slideActive = o.slideFrom != null;
  let prevRead = line[p0 - 1];
  let vibPhase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (slideActive && t < slideTau * 12) {
      curPeriod += (targetPeriod - curPeriod) * slideK;
    } else {
      curPeriod = targetPeriod;
    }
    let periodNow = curPeriod;
    if (o.vibrato && t > o.vibrato.start) {
      const depth = o.vibrato.depth * Math.min(1, (t - o.vibrato.start) / o.vibrato.ramp);
      vibPhase += (2 * Math.PI * o.vibrato.rate) / SR;
      periodNow = curPeriod * (1 + depth * Math.sin(vibPhase));
    }
    // 线性插值读取（支持分数周期 → 音高连续变化）
    let r = w - periodNow;
    while (r < 0) r += maxN;
    const i0 = Math.floor(r);
    const frac = r - i0;
    const i0m = i0 % maxN;
    const i1m = (i0 + 1) % maxN;
    const y = line[i0m] * (1 - frac) + line[i1m] * frac;
    // 阻尼低通（高频衰减快，低音绵长，接近真实琴弦）
    line[w] = o.damping * 0.5 * (y + prevRead);
    prevRead = y;
    out[i] = y;
    w = (w + 1) % maxN;
  }

  // 起始防爆音淡化 + 增益
  const fade = Math.min(96, n);
  for (let i = 0; i < fade; i++) out[i] *= i / fade;
  for (let i = 0; i < n; i++) out[i] *= o.gain;
  return out;
}

// ---------------- 音色预设 ----------------
// 散音（空弦）：暗而绵长；按音：中带吟猱；泛音：亮而短促如磬
const TIMBRE = {
  open: { brightness: 2400, damping: 0.99994 },
  press: { brightness: 3200, damping: 0.99985 },
  harm: { brightness: 7000, damping: 0.99982 },
};
const VIB = { rate: 4.1, depth: 0.006, start: 0.55, ramp: 1.2 };

// ---------------- 作曲（原创，F 宫五声：F G A C D） ----------------
// 频率表
const N = {
  F2: 87.31, G2: 98.0, A2: 110.0, C3: 130.81, D3: 146.83,
  F3: 174.61, G3: 196.0, A3: 220.0, C4: 261.63, D4: 293.66, F4: 349.23,
};
// type: open=散音 press=按音 harm=泛音；t=起拍秒；dur=渲染长度；g=增益
const SCORE = [
  // 引子 · 散音，疏朗开阔
  { t: 0.6, type: "open", f: N.F2, dur: 7, g: 0.85 },
  { t: 4.4, type: "open", f: N.C3, dur: 6, g: 0.6 },
  { t: 8.2, type: "open", f: N.A2, dur: 6, g: 0.7 },
  { t: 12.2, type: "open", f: N.G2, dur: 6, g: 0.65 },
  { t: 16.0, type: "open", f: N.F2, dur: 8, g: 0.8 },
  { t: 16.05, type: "open", f: N.D3, dur: 5, g: 0.42 }, // 双弦
  // 按音主题，带绰注与吟猱
  { t: 21.0, type: "press", f: N.F3, slideFrom: N.D3, slideDur: 0.5, dur: 5, g: 0.6 },
  { t: 24.6, type: "press", f: N.G3, vib: true, dur: 5, g: 0.55 },
  { t: 28.2, type: "press", f: N.A3, vib: true, dur: 6, g: 0.6 },
  { t: 32.4, type: "press", f: N.C4, slideFrom: N.A3, slideDur: 0.45, dur: 6, g: 0.6 },
  { t: 36.8, type: "press", f: N.A3, vib: true, dur: 5, g: 0.5 },
  { t: 40.2, type: "press", f: N.F3, slideFrom: N.G3, slideDur: 0.55, dur: 6, g: 0.55 },
  { t: 44.6, type: "press", f: N.D3, vib: true, dur: 7, g: 0.6 },
  { t: 45.0, type: "open", f: N.F2, dur: 8, g: 0.5 },
  // 泛音段，清越点睛
  { t: 52.0, type: "harm", f: N.C4, dur: 2.6, g: 0.42 },
  { t: 53.6, type: "harm", f: N.F4, dur: 2.6, g: 0.4 },
  { t: 55.2, type: "harm", f: N.D4, dur: 2.6, g: 0.4 },
  { t: 56.8, type: "harm", f: N.C4, dur: 2.8, g: 0.42 },
  { t: 58.8, type: "harm", f: N.A3, dur: 2.6, g: 0.38 },
  { t: 60.4, type: "harm", f: N.G3, dur: 2.6, g: 0.38 },
  { t: 62.0, type: "harm", f: N.F3, dur: 3.2, g: 0.4 },
  { t: 64.6, type: "harm", f: N.C4, dur: 4.5, g: 0.45 },
  // 尾声 · 回归低音，余韵收束于宫
  { t: 70.0, type: "open", f: N.A2, dur: 7, g: 0.65 },
  { t: 74.4, type: "open", f: N.G2, dur: 7, g: 0.6 },
  { t: 78.6, type: "press", f: N.C3, vib: true, dur: 6, g: 0.55 },
  { t: 83.0, type: "open", f: N.F2, dur: 12, g: 0.9 },
  { t: 85.5, type: "harm", f: N.C4, dur: 4, g: 0.22 },
];

// ---------------- 混音 ----------------
const totalSamples = Math.ceil((LOOP_SECONDS + TAIL_SECONDS) * SR);
const mix = new Float32Array(totalSamples);
SCORE.forEach((ev, idx) => {
  const timbre = TIMBRE[ev.type];
  const voice = pluckString({
    freq: ev.f,
    dur: ev.dur,
    gain: ev.g,
    brightness: timbre.brightness,
    damping: timbre.damping,
    slideFrom: ev.slideFrom,
    slideDur: ev.slideDur,
    vibrato: ev.vib ? VIB : null,
    seed: idx + 1,
  });
  const offset = Math.round(ev.t * SR);
  for (let i = 0; i < voice.length && offset + i < totalSamples; i++) {
    mix[offset + i] += voice[i];
  }
});

// ---------------- 混响（Freeverb 风格：8 并联梳状 + 2 串联全通） ----------------
function applyReverb(input, wet) {
  const combDelays = [558, 594, 638, 678, 711, 745, 778, 808]; // 按 22050Hz 缩放
  const combs = combDelays.map((d) => ({ buf: new Float32Array(d), idx: 0, fb: 0.84, store: 0 }));
  const allpasses = [278, 220].map((d) => ({ buf: new Float32Array(d), idx: 0, g: 0.5 }));
  const damp = 0.3;
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.idx];
      c.store = y * (1 - damp) + c.store * damp;
      c.buf[c.idx] = x + c.store * c.fb;
      c.idx = (c.idx + 1) % c.buf.length;
      acc += y;
    }
    let v = (acc / combs.length) * 3;
    for (const a of allpasses) {
      const b = a.buf[a.idx];
      const y = -v + b;
      a.buf[a.idx] = v + b * a.g;
      a.idx = (a.idx + 1) % a.buf.length;
      v = y;
    }
    out[i] = x * (1 - wet) + v * wet;
  }
  return out;
}
const wet = applyReverb(mix, 0.25);

// ---------------- 无缝循环：尾部交叉淡化回开头 ----------------
const loopN = LOOP_SECONDS * SR;
const xN = TAIL_SECONDS * SR;
const looped = new Float32Array(loopN);
for (let i = 0; i < loopN; i++) {
  if (i < xN) {
    const r = 0.5 - 0.5 * Math.cos((Math.PI * i) / xN); // 等功率交叉淡化
    looped[i] = wet[i] * r + wet[loopN + i] * (1 - r);
  } else {
    looped[i] = wet[i];
  }
}

// ---------------- 归一化 + 诊断 ----------------
let peak = 0;
for (let i = 0; i < loopN; i++) peak = Math.max(peak, Math.abs(looped[i]));
const TARGET_PEAK = 0.5; // -6dBFS，背景音乐留足余量
const scale = TARGET_PEAK / Math.max(peak, 1e-9);

let globalRms = 0;
const windowRms = [];
for (let s = 0; s < LOOP_SECONDS; s += 10) {
  let sum = 0;
  const from = s * SR;
  const to = Math.min(loopN, from + 10 * SR);
  for (let i = from; i < to; i++) sum += (looped[i] * scale) ** 2;
  windowRms.push(Math.sqrt(sum / (to - from)));
}
for (let i = 0; i < loopN; i++) globalRms += (looped[i] * scale) ** 2;
globalRms = Math.sqrt(globalRms / loopN);

// ---------------- 写 WAV（PCM 16bit 单声道） ----------------
const dataSize = loopN * 2;
const buf = Buffer.alloc(44 + dataSize);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
for (let i = 0; i < loopN; i++) {
  const v = Math.max(-1, Math.min(1, looped[i] * scale));
  buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
}
mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, buf);

console.log(`已生成 ${OUT_PATH}`);
console.log(`时长 ${LOOP_SECONDS}s | 采样率 ${SR}Hz | 文件 ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`归一化前峰值 ${peak.toFixed(3)} | 全局 RMS ${(globalRms * 100).toFixed(2)}%`);
console.log(`每 10s RMS(%): ${windowRms.map((v) => (v * 100).toFixed(1)).join(" ")}`);
