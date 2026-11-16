// Served temporarily from <project>/temp/rea-probe/ by `heft start` (express.static of project root).
import { dep } from './esm-dep.js';
export const probe = 'esm-ok:' + dep + ':' + typeof window.require + ':' + (typeof window.require === 'function' && window.require.defined && window.require.defined('0d910c1c-13b9-4e1c-9aa4-b008c5e42d7d_18.3.1'));
export function getReactVersion() { return window.require('0d910c1c-13b9-4e1c-9aa4-b008c5e42d7d_18.3.1').version; }
