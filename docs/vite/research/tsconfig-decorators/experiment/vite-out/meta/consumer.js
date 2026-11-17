import { Injectable, Inject, Prop } from "/src/decoexp/meta/container.ts";
class LocalDep {}
export @Injectable() class Consumer {
	@Prop() client;
	@Prop() logger;
	@Prop() local;
	@Prop() maybe;
	@Prop() mode;
	constructor(http, logger, local, localIface, id, n, @Inject("t") typeOnly, list, fn) {}
	@Prop() method(a, b) {
		return Promise.resolve("x");
	}
}
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

