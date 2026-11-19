export { createProject, DEFAULT_LOCALE, type ProjectChange, type ProjectLogger, type SpfxProject } from './project.js';
export { aliasCandidates, matchesPathAlias, type PathMapping, type TsconfigPaths } from './tsconfigPaths.js';
export type * from './types.js';
export { assertSupportedSpfxVersion, findSpfxVersion, type InstalledSpfxVersion, type SpfxVersionSource } from './spfxVersion.js';
export { CUSTOM_ACTION_LOCATIONS } from './serveConfigurations.js';
export { SASS_CONFIG_FILE, type SassConfiguration } from './sassConfiguration.js';
export { CUSTOMIZE_WEBPACK_FILE, findWebpackCustomizations, WEBPACK_PATCH_FILE } from './webpackCustomizations.js';
