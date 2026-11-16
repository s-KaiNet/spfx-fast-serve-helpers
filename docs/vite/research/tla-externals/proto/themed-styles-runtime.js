// Browser runtime (dev only). Replaces Vite's `updateStyle`/`removeStyle` for CSS modules so that
// SharePoint theme tokens like "[theme:bodyText, default: #323130]" are resolved the same way
// SPFx production bundles resolve them (@microsoft/load-themed-styles + window.__themeState__),
// while Vite keeps owning the <style> elements so CSS HMR replaces styles in place.
import { updateStyle as viteUpdateStyle, removeStyle as viteRemoveStyle } from '/@vite/client';

// Same token grammar as @microsoft/load-themed-styles.
const THEME_TOKEN = /[\'\"]\[theme:\s*(\w+)\s*(?:\,\s*default:\s*([\\"\']?[\.\,\(\)\#\-\s\w]*[\.\,\(\)\#\-\w][\"\']?))?\s*\][\'\"]/g;

const rawStyles = new Map();

function currentTheme() {
  const state = window.__themeState__;
  return state && state.theme;
}

export function detokenize(css) {
  const theme = currentTheme();
  return css.replace(THEME_TOKEN, (_match, slot, defaultValue) => (theme && theme[slot]) || defaultValue || 'inherit');
}

export function updateStyle(id, css) {
  rawStyles.set(id, css);
  viteUpdateStyle(id, detokenize(css));
}

export function removeStyle(id) {
  rawStyles.delete(id);
  viteRemoveStyle(id);
}

// SharePoint switches themes by calling loadTheme(), which replaces __themeState__.theme.
// Re-resolve our styles when that happens (cheap reference check, dev only).
let lastTheme = currentTheme();
setInterval(() => {
  const theme = currentTheme();
  if (theme !== lastTheme) {
    lastTheme = theme;
    rawStyles.forEach((css, id) => viteUpdateStyle(id, detokenize(css)));
  }
}, 500);
