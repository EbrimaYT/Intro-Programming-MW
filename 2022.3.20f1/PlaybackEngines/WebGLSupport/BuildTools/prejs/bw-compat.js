// Emscripten 1.x had a function Pointer_stringify() to marshal C strings to JS strings. That has been obsoleted by the new UTF8/16/32ToString() API family.
function Pointer_stringify(s, len) {
	warnOnce("The JavaScript function 'Pointer_stringify(ptrToSomeCString)' is obsoleted and will be removed in a future Unity version. Please call 'UTF8ToString(ptrToSomeCString)' instead.");
	return UTF8ToString(s, len);
}
Module['Pointer_stringify'] = Pointer_stringify;