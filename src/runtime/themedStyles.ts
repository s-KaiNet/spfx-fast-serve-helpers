import { removeStyle as viteRemoveStyle, updateStyle as viteUpdateStyle } from '/@vite/client';

type Theme = Record<string, string | undefined>;

const THEME_TOKEN =
  /['"]\[theme:\s*(\w+)\s*(?:,\s*default:\s*([\\"']?[.,()#\-\s\w]*[.,()#\-\w]["']?))?\s*\]['"]/g;
const THEME_POLL_MS = 500;

const rawStyles = new Map<string, string>();

function currentTheme(): Theme | undefined {
  return (window as unknown as { __themeState__?: { theme?: Theme } }).__themeState__?.theme;
}

export function detokenize(css: string, theme: Theme | undefined = currentTheme()): string {
  return css.replaceAll(THEME_TOKEN, (_match, slot: string, defaultValue: string | undefined) => {
    return theme?.[slot] ?? defaultValue ?? 'inherit';
  });
}

export function updateStyle(id: string, css: string): void {
  rawStyles.set(id, css);
  viteUpdateStyle(id, detokenize(css));
}

export function removeStyle(id: string): void {
  rawStyles.delete(id);
  viteRemoveStyle(id);
}

let lastTheme = currentTheme();
setInterval(() => {
  const theme = currentTheme();
  if (theme === lastTheme) return;
  lastTheme = theme;
  rawStyles.forEach((css, id) => {
    viteUpdateStyle(id, detokenize(css, theme));
  });
}, THEME_POLL_MS);
