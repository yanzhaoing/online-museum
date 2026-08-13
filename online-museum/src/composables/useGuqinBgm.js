import { reactive, readonly } from "vue";

// 「琴韵流芳」孙海滨古琴展专属背景音乐（单例 Audio，循环播放）。
// 音频由 scripts/generate_guqin_bgm.mjs 用 Karplus-Strong 拨弦模型合成，
// 文件随静态资源目录部署（online-museum/audio/guqin-bgm.wav）。
const state = reactive({ playing: false });

let audio = null;

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio("audio/guqin-bgm.wav");
  audio.loop = true;
  audio.volume = 0.32;
  audio.preload = "auto";
  audio.addEventListener("playing", () => { state.playing = true; });
  audio.addEventListener("pause", () => { state.playing = false; });
  audio.addEventListener("ended", () => { state.playing = false; });
  audio.addEventListener("error", () => { state.playing = false; });
  return audio;
}

export function useGuqinBgm() {
  async function play() {
    const el = ensureAudio();
    try {
      await el.play();
    } catch {
      // 浏览器自动播放策略要求先有用户交互；此时“琴音”按钮保持可点，由用户手动开启
      state.playing = false;
    }
  }

  function pause() {
    if (audio) audio.pause();
  }

  async function toggle() {
    const el = ensureAudio();
    if (el.paused) await play();
    else el.pause();
  }

  return { state: readonly(state), play, pause, toggle };
}
