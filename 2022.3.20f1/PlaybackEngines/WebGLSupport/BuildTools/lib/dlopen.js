mergeInto(LibraryManager.library, {
#if !MAIN_MODULE
#if !SIDE_MODULE

	$dlopen_main_init: 0,

	// Stub over core Emscripten dlopen/dlclose behavior to show a Unity-specific error message and behavior.
	_dlopen_js__deps: ['$dlopen_main_init'],
	_dlopen_js__sig: 'ii',
	_dlopen_js: function(handle) {
#if ASSERTIONS
		warnOnce('Unable to open DLL! Dynamic linking is not supported in WebAssembly builds due to limitations to performance and code size. Please statically link in the needed libraries.');
#endif
		// Do not abort here - IL2CPP will throw a managed exception.

		// Return dummy success for the first dlopen since that is the __main__ module (so it gets past its assert checks),
		// and false otherwise. TODO: After Emscripten is updated to a version newer than 3.1.8-unity, this logic can be
		// dropped: https://github.com/emscripten-core/emscripten/issues/16790
		var ret = !dlopen_main_init;
		dlopen_main_init = 1;
		return ret;
	},

	_emscripten_dlopen_js__deps: [],
	_emscripten_dlopen_js: function(filename, flags, user_data, onsuccess, onerror) {
#if ASSERTIONS
		warnOnce('Unable to open DLL ' + UTF8ToString(filename) + '! Dynamic linking is not supported in WebAssembly builds due to limitations to performance and code size. Please statically link in the needed libraries.');
#endif
		// Do not abort here - IL2CPP will throw a managed exception.
	},

	_dlsym_js__deps: [],
	_dlsym_js__proxy: 'async',
	_dlsym_js__sig: 'iii',
	_dlsym_js: function(handle, symbol) {
		return 0;
	}
#endif
#endif
});
