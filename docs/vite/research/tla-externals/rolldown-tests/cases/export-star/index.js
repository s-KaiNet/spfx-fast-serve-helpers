export * from '@microsoft/sp-core-library';
import legacy from './legacy.cjs';
export const result = () => 'star:' + legacy.name;
