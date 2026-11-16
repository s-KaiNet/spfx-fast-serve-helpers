// ESM entry that also pulls in a CJS module requiring sp-* (mixed packages are common)
import legacy from './legacy.cjs';
import { Guid } from '@microsoft/sp-core-library';
export const result = () => legacy.f() + '|esm:' + Guid.name;
