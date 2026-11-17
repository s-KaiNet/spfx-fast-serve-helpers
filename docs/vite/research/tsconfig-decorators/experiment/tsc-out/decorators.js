import { __extends } from "tslib";
export var log = [];
export function tagged(tag) {
    return function (ctor) {
        return /** @class */ (function (_super) {
            __extends(class_1, _super);
            function class_1() {
                var _this = _super !== null && _super.apply(this, arguments) || this;
                _this.tag = tag;
                return _this;
            }
            return class_1;
        }(ctor));
    };
}
export function traced(target, key, descriptor) {
    var original = descriptor.value;
    descriptor.value = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        log.push("call:".concat(key));
        return original.apply(this, args);
    };
    return descriptor;
}
export function observed(target, key) {
    var store;
    log.push("prop:".concat(key));
    Object.defineProperty(target, key, {
        get: function () { return store; },
        set: function (value) {
            log.push("set:".concat(key, "=").concat(String(value)));
            store = value;
        },
        configurable: true,
    });
}
export function inject(token) {
    return function (target, key, index) {
        log.push("param:".concat(String(key), ":").concat(index, ":").concat(token));
    };
}
