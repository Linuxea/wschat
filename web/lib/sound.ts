// WebAudio 合成的 IM 提示音内核：零资源文件、可调音量/音色。
// 浏览器自动播放策略要求用户先与页面交互过才能发声，见 unlockAudio()。

let ctx: AudioContext | null = null;
let lastPlayedAt = 0;
const THROTTLE_MS = 800; // 群聊刷屏时防连响

type WebkitWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const w = window as WebkitWindow;
    const AC = w.AudioContext || w.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** 用户首次交互后调用，解除浏览器对 AudioContext 的挂起状态。 */
export function unlockAudio(): void {
  const c = ensureCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function tone(
  c: AudioContext,
  dest: AudioNode,
  freq: number,
  startAt: number,
  dur: number,
  peak: number,
): number {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(dest);
  // 包络：10ms 线性起音到峰值 → 指数衰减到接近 0（避免咔哒爆音）
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(peak, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.03);
  return startAt + dur;
}

export type AlertVariant = 'normal' | 'mention';

/**
 * 播放一条消息提示音。
 * - normal:  两音"叮咚" G5 → C6
 * - mention: 上行三音 C5 → E5 → G5（被 @ 时更醒目）
 * volume 为 0~1，由调用方从设置 store 传入。
 */
export function playMessageAlert(variant: AlertVariant = 'normal', volume = 0.6): void {
  if (volume <= 0) return;
  const now = Date.now();
  if (now - lastPlayedAt < THROTTLE_MS) return; // 节流：丢弃短时间内的重复播放
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {}); // 尽力解锁，多数浏览器未交互时会拒绝
  lastPlayedAt = now;

  const master = c.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume));
  master.connect(c.destination);

  const t0 = c.currentTime + 0.02;
  const peak = variant === 'mention' ? 0.9 : 0.7;
  if (variant === 'mention') {
    let t = t0;
    t = tone(c, master, 523.25, t, 0.12, peak); // C5
    t = tone(c, master, 659.25, t, 0.12, peak); // E5
    t = tone(c, master, 783.99, t, 0.20, peak); // G5
  } else {
    let t = t0;
    t = tone(c, master, 783.99, t, 0.12, peak); // G5
    t = tone(c, master, 1046.5, t, 0.18, peak); // C6
  }
}
