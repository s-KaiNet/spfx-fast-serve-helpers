// \0spfx-external:@microsoft/sp-core-library
var m$1 = await window.__spfxVite.require("@microsoft/sp-core-library");
m$1.default !== void 0 && m$1.default;
m$1["DisplayMode"];
m$1["Environment"];
m$1["EnvironmentType"];
m$1["FormDisplayMode"];
m$1["Guid"];
m$1["Log"];
m$1["RandomNumberGenerator"];
m$1["RootServiceKey"];
m$1["SPError"];
m$1["SPEvent"];
m$1["SPEventArgs"];
m$1["ServiceKey"];
m$1["ServiceScope"];
m$1["Session"];
m$1["Text"];
m$1["TimeProvider"];
m$1["UrlQueryParameterCollection"];
m$1["UrlUtilities"];
m$1["Validate"];
var __e19$1 = m$1["Version"];
m$1["_BROKER_IN_USE_KEY"];
m$1["_Browser"];
m$1["_BrowserDetection"];
m$1["_BrowserUtilities"];
m$1["_ClientManifestData"];
m$1["_DeferredClass"];
m$1["_ES5CompatibleClass"];
m$1["_Envoy"];
m$1["_Event"];
m$1["_EventArgs"];
m$1["_OS"];
m$1["_ResponseUtilities"];
m$1["_SPEventManager"];
m$1["_SPExperiment"];
m$1["_SPFlight"];
m$1["_SPKillSwitch"];
m$1["_ServiceKeys"];
m$1["_getAsyncComponentLoader"];
m$1["_getPrimaryVersionedPath"];
m$1["_is3PDebugEnabled"];
m$1["_isDebugEnabled"];
m$1["_isLocalhostUrl"];
m$1["_registerAsyncComponentLoader"];
m$1["_safeWindowOpen"];
// \0spfx-external:@microsoft/sp-http
var m = await window.__spfxVite.require("@microsoft/sp-http");
m.default !== void 0 && m.default;
m["AadHttpClient"];
m["AadHttpClientConfiguration"];
m["AadHttpClientFactory"];
m["AadHttpClientResponse"];
m["AadTokenProvider"];
m["AadTokenProviderFactory"];
m["BeforeRedirectEventArgs"];
m["DigestCache"];
m["HttpClient"];
m["HttpClientConfiguration"];
m["HttpClientResponse"];
m["MSGraphClient"];
m["MSGraphClientFactory"];
m["ODataVersion"];
m["PopupEventArgs"];
var __e15 = m["SPHttpClient"];
m["SPHttpClientBatch"];
m["SPHttpClientBatchConfiguration"];
m["SPHttpClientCommonConfiguration"];
m["SPHttpClientConfiguration"];
m["SPHttpClientResponse"];
m["SPHttpHeader"];
m["TokenAcquisitionEventArgs"];
m["_DEPRECATED_DO_NOT_USE_GraphHttpClient"];
m["_DEPRECATED_DO_NOT_USE_GraphHttpClientConfiguration"];
m["_DEPRECATED_DO_NOT_USE_GraphHttpClientResponse"];
m["_DEPRECATED_DO_NOT_USE_OAuthTokenProvider"];
// research/tla-externals/proto/fake-spfx-dep/cycle-b.js
var bValue = "b:" + typeof __e19$1;
function cycleB() {
	return "B(a)";
}
// research/tla-externals/proto/fake-spfx-dep/cycle-a.js
function cycleA() {
	return "A(" + cycleB() + "," + bValue + ")";
}
// research/tla-externals/proto/fake-spfx-dep/index.js
var evaluatedAt = performance.now();
function fakeDep() {
	return {
		version: __e19$1.parse("1.2.3").toString(),
		Version: __e19$1,
		SPHttpClient: __e15,
		cycle: cycleA()
	};
}
export { evaluatedAt, fakeDep };
