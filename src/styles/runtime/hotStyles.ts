interface ThemedStyles {
  loadStyles(styles: string, loadAsync?: boolean): void;
}

interface HotModule {
  data?: object;
  dispose(callback: () => void): void;
}

interface StyleElement {
  remove(): void;
}

interface StyleRecord {
  styleElement?: StyleElement;
}

interface ThemeState {
  registeredStyles?: StyleRecord[];
  registeredThemableStyles?: StyleRecord[];
}

interface StyleInsertEvent {
  args?: { newStyle?: StyleElement };
}

interface Page {
  document: {
    addEventListener(type: string, listener: (event: StyleInsertEvent) => void): void;
    removeEventListener(type: string, listener: (event: StyleInsertEvent) => void): void;
  };
  __themeState__?: ThemeState;
}

const STYLE_INSERT_EVENT = 'styleinsert';

export function loadHotStyles(hot: HotModule | undefined, themedStyles: ThemedStyles, styles: string): void {
  if (!hot?.data) {
    themedStyles.loadStyles(styles, true);
    return;
  }
  const { document } = globalThis as unknown as Page;
  const inserted: StyleElement[] = [];
  const capture = (event: StyleInsertEvent): void => {
    const style = event.args?.newStyle;
    if (style) inserted.push(style);
  };
  document.addEventListener(STYLE_INSERT_EVENT, capture);
  try {
    themedStyles.loadStyles(styles);
  } finally {
    document.removeEventListener(STYLE_INSERT_EVENT, capture);
  }
  hot.dispose(() => {
    for (const style of inserted) removeStyle(style);
  });
}

function removeStyle(style: StyleElement): void {
  style.remove();
  const state = (globalThis as unknown as Page).__themeState__;
  if (!state) return;
  const keep = (record: StyleRecord): boolean => record.styleElement !== style;
  if (state.registeredStyles) state.registeredStyles = state.registeredStyles.filter(keep);
  if (state.registeredThemableStyles) state.registeredThemableStyles = state.registeredThemableStyles.filter(keep);
}
