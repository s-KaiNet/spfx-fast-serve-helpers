import { A } from './a.js';
import { Version } from '@microsoft/sp-core-library';
export const B = 'B:' + Version.name;
export function b() { return 'b(' + A + ')'; }
