import { removeStyle as viteRemoveStyle, updateStyle as viteUpdateStyle } from '/@vite/client';

type Theme = Record<string, string | undefined>;

const THEME_TOKEN =
  /['"]\[theme:\s*(\w+)\s*(?:,\s*default:\s*([\\"']?[.,()#\-\s\w]*[.,()#\-\w]["']?))?\s*\]['"]/g;

function currentTheme(): Theme | undefined {
  return (window as unknown as { __themeState__?: { theme?: Theme } }).__themeState__?.theme;
}

export function detokenize(css: string, theme: Theme | undefined = currentTheme()): string {
  return css.replaceAll(THEME_TOKEN, (_match, slot: string, defaultValue: string | undefined) => {
    return theme?.[slot] ?? defaultValue ?? 'inherit';
  });
}

export function updateStyle(id: string, css: string): void {
  viteUpdateStyle(id, detokenize(css));
}

export const removeStyle = viteRemoveStyle;
