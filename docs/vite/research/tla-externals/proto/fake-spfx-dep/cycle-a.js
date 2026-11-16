// cycle-a <-> cycle-b, and cycle-b awaits an SPFx facade (TLA inside a cycle).
import { cycleB, bValue } from './cycle-b.js';
export const aValue = 'a';
export function cycleA() { return 'A(' + cycleB() + ',' + bValue + ')'; }
