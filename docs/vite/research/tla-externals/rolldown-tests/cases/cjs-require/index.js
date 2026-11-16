var core = require('@microsoft/sp-core-library');
exports.result = function () { return 'cjs:' + core.Version.name; };
