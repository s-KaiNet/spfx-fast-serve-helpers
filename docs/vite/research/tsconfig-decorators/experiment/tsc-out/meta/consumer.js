import { __decorate, __metadata, __param } from "tslib";
import { Injectable, Inject, Prop } from './container';
import { HttpClient, Mode } from './types';
var LocalDep = /** @class */ (function () {
    function LocalDep() {
    }
    return LocalDep;
}());
var Consumer = /** @class */ (function () {
    function Consumer(http, logger, local, localIface, id, n, typeOnly, list, fn) {
    }
    Consumer.prototype.method = function (a, b) {
        return Promise.resolve('x');
    };
    __decorate([
        Prop(),
        __metadata("design:type", HttpClient)
    ], Consumer.prototype, "client", void 0);
    __decorate([
        Prop(),
        __metadata("design:type", Object)
    ], Consumer.prototype, "logger", void 0);
    __decorate([
        Prop(),
        __metadata("design:type", LocalDep)
    ], Consumer.prototype, "local", void 0);
    __decorate([
        Prop(),
        __metadata("design:type", Object)
    ], Consumer.prototype, "maybe", void 0);
    __decorate([
        Prop(),
        __metadata("design:type", Number)
    ], Consumer.prototype, "mode", void 0);
    __decorate([
        Prop(),
        __metadata("design:type", Function),
        __metadata("design:paramtypes", [HttpClient, Object]),
        __metadata("design:returntype", Promise)
    ], Consumer.prototype, "method", null);
    Consumer = __decorate([
        Injectable(),
        __param(6, Inject('t')),
        __metadata("design:paramtypes", [HttpClient, Object, LocalDep, Object, String, Number, Function, Array, Function])
    ], Consumer);
    return Consumer;
}());
export { Consumer };
export function readMetadata() {
    var name = function (value) { return (typeof value === 'function' ? value.name : String(value)); };
    var r = Reflect;
    var list = function (value) { return (Array.isArray(value) ? value.map(name) : value); };
    return {
        paramtypes: list(r.getMetadata('design:paramtypes', Consumer)),
        client: name(r.getMetadata('design:type', Consumer.prototype, 'client')),
        logger: name(r.getMetadata('design:type', Consumer.prototype, 'logger')),
        local: name(r.getMetadata('design:type', Consumer.prototype, 'local')),
        maybe: name(r.getMetadata('design:type', Consumer.prototype, 'maybe')),
        mode: name(r.getMetadata('design:type', Consumer.prototype, 'mode')),
        methodParams: list(r.getMetadata('design:paramtypes', Consumer.prototype, 'method')),
        methodReturn: name(r.getMetadata('design:returntype', Consumer.prototype, 'method')),
    };
}
