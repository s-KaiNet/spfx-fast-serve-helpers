var Local = /* @__PURE__ */ function(Local) {
	Local[Local["One"] = 1] = "One";
	return Local;
}(Local || {});
export const local = { one: Local.One };
