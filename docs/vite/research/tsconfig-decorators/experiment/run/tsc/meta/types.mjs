var HttpClient = /** @class */ (function () {
    function HttpClient() {
    }
    HttpClient.prototype.get = function () {
        return 'ok';
    };
    return HttpClient;
}());
export { HttpClient };
export var Mode;
(function (Mode) {
    Mode[Mode["A"] = 0] = "A";
    Mode[Mode["B"] = 1] = "B";
})(Mode || (Mode = {}));
