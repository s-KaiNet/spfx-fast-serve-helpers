import { injectIntoGlobalHook } from 'react-refresh/runtime';

interface RefreshGlobals {
  $RefreshReg$?: () => void;
  $RefreshSig$?: () => <T>(type: T) => T;
}

const root = window as Window & RefreshGlobals;
injectIntoGlobalHook(root);
root.$RefreshReg$ ??= () => undefined;
root.$RefreshSig$ ??= () => (type) => type;
