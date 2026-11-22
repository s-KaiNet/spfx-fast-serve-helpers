const TYPESCRIPT_5 = 'npm:typescript@5.8.3';

function usesTypeScript5(name) {
  return name === 'typescript-eslint' || name === 'ts-api-utils' || name.startsWith('@typescript-eslint/');
}

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (usesTypeScript5(pkg.name) && pkg.peerDependencies?.typescript !== undefined) {
        delete pkg.peerDependencies.typescript;
        pkg.dependencies = { ...pkg.dependencies, typescript: TYPESCRIPT_5 };
      }
      return pkg;
    },
  },
};
