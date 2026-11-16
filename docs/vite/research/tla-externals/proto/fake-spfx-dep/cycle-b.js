import { aValue } from './cycle-a.js';
import { Version } from '@microsoft/sp-core-library';
export const bValue = 'b:' + typeof Version;
export function cycleB() { return 'B(' + aValue + ')'; }
