import { create } from 'zustand';
import { DEFAULT_THEME, isThemeId, type ThemeId } from './themes';

const KEY = 'wschat-theme';

function loadFromStorage(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && isThemeId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

function applyTheme(theme: ThemeId) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
}

interface ThemeStore {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  init: () => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: DEFAULT_THEME,
  init: () => {
    const theme = loadFromStorage();
    applyTheme(theme);
    set({ theme });
  },
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(KEY, theme);
      } catch {
        /* ignore */
      }
    }
    applyTheme(theme);
    set({ theme });
  },
}));
