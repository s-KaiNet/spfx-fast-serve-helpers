import { Injectable, Inject, Prop } from "./container.mjs";
import { HttpClient, Mode } from "./types.mjs";
import _decorateMetadata from "@oxc-project/runtime/helpers/decorateMetadata";
import _decorate from "@oxc-project/runtime/helpers/decorate";
import _decorateParam from "@oxc-project/runtime/helpers/decorateParam";
class LocalDep {}
let Consumer = class Consumer {
	constructor(http, logger, local, localIface, id, n, typeOnly, list, fn) {}
	method(a, b) {
		return Promise.resolve("x");
	}
};
_decorate([Prop(), _decorateMetadata("design:type", typeof HttpClient === "undefined" ? Object : HttpClient)], Consumer.prototype, "client", void 0);
_decorate([Prop(), _decorateMetadata("design:type", Object)], Consumer.prototype, "logger", void 0);
_decorate([Prop(), _decorateMetadata("design:type", typeof LocalDep === "undefined" ? Object : LocalDep)], Consumer.prototype, "local", void 0);
_decorate([Prop(), _decorateMetadata("design:type", Object)], Consumer.prototype, "maybe", void 0);
_decorate([Prop(), _decorateMetadata("design:type", typeof Mode === "undefined" ? Object : Mode)], Consumer.prototype, "mode", void 0);
_decorate([
	Prop(),
	_decorateMetadata("design:type", Function),
	_decorateMetadata("design:paramtypes", [typeof HttpClient === "undefined" ? Object : HttpClient, Object]),
	_decorateMetadata("design:returntype", typeof Promise === "undefined" ? Object : Promise)
], Consumer.prototype, "method", null);
Consumer = _decorate([
	Injectable(),
	_decorateParam(6, Inject("t")),
	_decorateMetadata("design:paramtypes", [
		typeof HttpClient === "undefined" ? Object : HttpClient,
		Object,
		typeof LocalDep === "undefined" ? Object : LocalDep,
		Object,
		Object,
		Number,
		Object,
		Array,
		Function
	])
], Consumer);
export { Consumer };
export function readMetadata() {
	const name = (value) => typeof value === "function" ? value.name : String(value);
	const r = Reflect;
	const list = (value) => Array.isArray(value) ? value.map(name) : value;
	return {
		paramtypes: list(r.getMetadata("design:paramtypes", Consumer)),
		client: name(r.getMetadata("design:type", Consumer.prototype, "client")),
		logger: name(r.getMetadata("design:type", Consumer.prototype, "logger")),
		local: name(r.getMetadata("design:type", Consumer.prototype, "local")),
		maybe: name(r.getMetadata("design:type", Consumer.prototype, "maybe")),
		mode: name(r.getMetadata("design:type", Consumer.prototype, "mode")),
		methodParams: list(r.getMetadata("design:paramtypes", Consumer.prototype, "method")),
		methodReturn: name(r.getMetadata("design:returntype", Consumer.prototype, "method"))
	};
}
