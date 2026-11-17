export const log = [];
export function tagged(tag) {
	return function(ctor) {
		return class extends ctor {
			tag = tag;
		};
	};
}
export function traced(target, key, descriptor) {
	const original = descriptor.value;
	descriptor.value = function(...args) {
		log.push(`call:${key}`);
		return original.apply(this, args);
	};
	return descriptor;
}
export function observed(target, key) {
	let store;
	log.push(`prop:${key}`);
	Object.defineProperty(target, key, {
		get: () => store,
		set: (value) => {
			log.push(`set:${key}=${String(value)}`);
			store = value;
		},
		configurable: true
	});
}
export function inject(token) {
	return function(target, key, index) {
		log.push(`param:${String(key)}:${index}:${token}`);
	};
}
