var http = require('@microsoft/sp-http');
exports.f = function () { return 'cjs:' + http.SPHttpClient.name; };
