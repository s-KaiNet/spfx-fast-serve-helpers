export { createProject, type CodeRoot, type LocalLibrary, type ProjectOptions, type SpfxProject } from './project.js';
export { DEFAULT_LOCALE } from './localizedResources.js';
export { readLibraryComponent, type LibraryComponentSource } from './localLibraries.js';
export type { PathMapping, TsconfigPaths } from './tsconfigPaths.js';
export type * from './types.js';
export { assertSupportedSpfxVersion, findSpfxVersion, type InstalledSpfxVersion, type SpfxVersionSource } from './spfxVersion.js';
export { CUSTOM_ACTION_LOCATIONS } from './serveConfigurations.js';
export { SASS_CONFIG_FILE, type SassConfiguration } from './sassConfiguration.js';
export { CUSTOMIZE_WEBPACK_FILE, findWebpackCustomizations, WEBPACK_PATCH_FILE } from './webpackCustomizations.js';
