import { injectIntoGlobalHook } from 'react-refresh/runtime';

interface RefreshGlobals {
  $RefreshReg$?: () => void;
  $RefreshSig$?: () => <T>(type: T) => T;
}

interface HotUpdateGlobals {
  [APPLYING_BUNDLES]?: Set<object>;
}

const APPLYING_BUNDLES = Symbol.for('fast-serve.hot-update.applying-bundles');

const root = window as Window & RefreshGlobals & HotUpdateGlobals;
injectIntoGlobalHook(root);
root.$RefreshReg$ ??= () => undefined;
root.$RefreshSig$ ??= () => (type) => type;

const thisBundle = {};
const applyingBundles = (root[APPLYING_BUNDLES] ??= new Set());
import.meta.webpackHot?.addStatusHandler((status) => {
  if (status === 'apply') applyingBundles.add(thisBundle);
  else applyingBundles.delete(thisBundle);
});
