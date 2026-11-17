import { inject, log, observed, tagged, traced } from "./decorators.mjs";
import _decorate from "@oxc-project/runtime/helpers/decorate";
import _decorateParam from "@oxc-project/runtime/helpers/decorateParam";
let Tagged = class Tagged {
	constructor() {
		this.name = "tagged";
	}
};
Tagged = _decorate([tagged("T1")], Tagged);
export { Tagged };
export class Calculator {
	add(a, b) {
		return a + b;
	}
}
_decorate([traced], Calculator.prototype, "add", null);
export class Model {
	constructor() {
		this.title = "initial";
	}
}
_decorate([observed], Model.prototype, "title", void 0);
_decorate([observed], Model.prototype, "untouched", void 0);
let Service = class Service {
	constructor(http, cfg) {
		this.http = http;
	}
	run(value) {
		return value;
	}
};
_decorate([_decorateParam(0, inject("arg"))], Service.prototype, "run", null);
Service = _decorate([_decorateParam(0, inject("http")), _decorateParam(1, inject("cfg"))], Service);
export { Service };
class Base {
	constructor() {
		this.init();
	}
	init() {
		this.declared = "from-base";
		this.label = "from-base";
	}
}
export class Derived extends Base {
	constructor(..._args) {
		super(..._args);
		this.value = "v";
	}
}
export function runAll() {
	const tagged = new Tagged();
	const calc = new Calculator();
	const sum = calc.add(2, 3);
	const model = new Model();
	model.title = "changed";
	const service = new Service("h");
	service.run("x");
	const derived = new Derived();
	return {
		tag: tagged.tag,
		sum,
		titleOwn: Object.prototype.hasOwnProperty.call(model, "title"),
		untouchedOwn: Object.prototype.hasOwnProperty.call(model, "untouched"),
		derivedDeclared: derived.declared,
		derivedLabel: derived.label,
		log: [...log]
	};
}
