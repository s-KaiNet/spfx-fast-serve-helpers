import { Version } from '@microsoft/sp-core-library';
import legacy from './legacy.cjs';

export const result = () => ({ version: Version, escape: legacy.escape });
