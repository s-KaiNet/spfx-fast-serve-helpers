import { isInside } from '../utils/paths.js';

export const PROJECT_SCRIPT_ID = /\.[cm]?[jt]sx?$/;
export const NODE_MODULES_ID = /[\\/]node_modules[\\/]/;

export function isProjectScript(root: string, id: string): boolean {
  return PROJECT_SCRIPT_ID.test(id) && !NODE_MODULES_ID.test(id) && isInside(root, id);
}
