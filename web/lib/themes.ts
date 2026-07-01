/**
 * Theme registry (metadata only for the switcher UI).
 * The actual token values live as CSS variables in app/globals.css
 * under `:root[data-theme='<id>']`. Adding a theme = 1 entry here + 1 CSS block.
 */
export type ThemeId = 'macos';

export interface ThemeDef {
  id: ThemeId;
  name: string;
  description: string;
}

export const THEMES: ThemeDef[] = [
  { id: 'macos', name: 'macOS', description: '毛玻璃 · 系统蓝' },
];

export const DEFAULT_THEME: ThemeId = 'macos';

export function getTheme(id: string): ThemeDef | undefined {
  return THEMES.find((t) => t.id === id);
}

export function isThemeId(id: string): id is ThemeId {
  return THEMES.some((t) => t.id === id);
}
