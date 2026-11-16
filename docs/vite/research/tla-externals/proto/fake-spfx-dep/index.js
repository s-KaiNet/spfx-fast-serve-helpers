// A "third-party" package that imports SPFx libraries (like @pnp/spfx-controls-react would).
import { Version } from '@microsoft/sp-core-library';
import { SPHttpClient } from '@microsoft/sp-http';
import { cycleA } from './cycle-a.js';
export const evaluatedAt = performance.now();
export function fakeDep() {
  return { version: Version.parse('1.2.3').toString(), Version, SPHttpClient, cycle: cycleA() };
}
