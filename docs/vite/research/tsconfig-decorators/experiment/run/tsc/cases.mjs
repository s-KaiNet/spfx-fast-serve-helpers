import { __decorate, __extends, __param, __spreadArray } from "tslib";
import { inject, log, observed, tagged, traced } from './decorators.mjs';
var Tagged = /** @class */ (function () {
    function Tagged() {
        this.name = 'tagged';
    }
    Tagged = __decorate([
        tagged('T1')
    ], Tagged);
    return Tagged;
}());
export { Tagged };
var Calculator = /** @class */ (function () {
    function Calculator() {
    }
    Calculator.prototype.add = function (a, b) {
        return a + b;
    };
    __decorate([
        traced
    ], Calculator.prototype, "add", null);
    return Calculator;
}());
export { Calculator };
var Model = /** @class */ (function () {
    function Model() {
        this.title = 'initial';
    }
    __decorate([
        observed
    ], Model.prototype, "title", void 0);
    __decorate([
        observed
    ], Model.prototype, "untouched", void 0);
    return Model;
}());
export { Model };
var Service = /** @class */ (function () {
    function Service(http, cfg) {
        this.http = http;
    }
    Service.prototype.run = function (value) {
        return value;
    };
    __decorate([
        __param(0, inject('arg'))
    ], Service.prototype, "run", null);
    Service = __decorate([
        __param(0, inject('http')),
        __param(1, inject('cfg'))
    ], Service);
    return Service;
}());
export { Service };
var Base = /** @class */ (function () {
    function Base() {
        this.init();
    }
    Base.prototype.init = function () {
        this.declared = 'from-base';
        this.label = 'from-base';
    };
    return Base;
}());
var Derived = /** @class */ (function (_super) {
    __extends(Derived, _super);
    function Derived() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.value = 'v';
        return _this;
    }
    return Derived;
}(Base));
export { Derived };
export function runAll() {
    var tagged = new Tagged();
    var calc = new Calculator();
    var sum = calc.add(2, 3);
    var model = new Model();
    model.title = 'changed';
    var service = new Service('h');
    service.run('x');
    var derived = new Derived();
    return {
        tag: tagged.tag,
        sum: sum,
        titleOwn: Object.prototype.hasOwnProperty.call(model, 'title'),
        untouchedOwn: Object.prototype.hasOwnProperty.call(model, 'untouched'),
        derivedDeclared: derived.declared,
        derivedLabel: derived.label,
        log: __spreadArray([], log, true),
    };
}
