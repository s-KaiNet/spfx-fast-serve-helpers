import { inject, log, observed, tagged, traced } from "./decorators.mjs";
export @tagged("T1") class Tagged {
	name = "tagged";
}
export class Calculator {
	@traced add(a, b) {
		return a + b;
	}
}
export class Model {
	@observed title = "initial";
	@observed untouched;
}
export class Service {
	http;
	constructor(@inject("http") http, @inject("cfg") cfg) {
		this.http = http;
	}
	run(@inject("arg") value) {
		return value;
	}
}
class Base {
	declared;
	label;
	constructor() {
		this.init();
	}
	init() {
		this.declared = "from-base";
		this.label = "from-base";
	}
}
export class Derived extends Base {
	declared;
	label;
	value = "v";
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
