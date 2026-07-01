import { create } from 'zustand';

const KEY = 'wschat-sound';

interface SoundConfig {
  enabled: boolean;
  volume: number; // 0~1
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function loadFromStorage(): SoundConfig {
  const fallback: SoundConfig = { enabled: true, volume: 0.6 };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SoundConfig>;
      return {
        enabled: typeof p.enabled === 'boolean' ? p.enabled : fallback.enabled,
        volume: typeof p.volume === 'number' ? clamp(p.volume) : fallback.volume,
      };
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function persist(c: SoundConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

interface SoundStore extends SoundConfig {
  init: () => void;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
}

export const useSoundStore = create<SoundStore>((set, get) => ({
  enabled: true,
  volume: 0.6,
  init: () => set(loadFromStorage()),
  setEnabled: (enabled) => {
    set({ enabled });
    persist({ ...get(), enabled });
  },
  setVolume: (volume) => {
    const v = clamp(volume);
    set({ volume: v });
    persist({ ...get(), volume: v });
  },
}));
