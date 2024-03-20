function SendMessage(gameObject, func, param) {
    var func_cstr = stringToNewUTF8(func);
    var gameObject_cstr = stringToNewUTF8(gameObject);
    var param_cstr = 0;

    try {
        if (param === undefined)
            _SendMessage(gameObject_cstr, func_cstr);
        else if (typeof param === "string") {
            param_cstr = stringToNewUTF8(param);
            _SendMessageString(gameObject_cstr, func_cstr, param_cstr);
        }
        else if (typeof param === "number")
            _SendMessageFloat(gameObject_cstr, func_cstr, param);
        else
            throw "" + param + " is does not have a type which is supported by SendMessage.";

    } finally {
        _free(param_cstr);
        _free(gameObject_cstr);
        _free(func_cstr);
    }
}
Module["SendMessage"] = SendMessage; // to avoid emscripten stripping