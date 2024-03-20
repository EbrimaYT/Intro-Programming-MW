mergeInto(LibraryManager.library, {
	// PLAT-4600: Avoid JS exceptions unwinding C/C++ code.
	// Can be removed once https://github.com/emscripten-core/emscripten/pull/18977
	// has been adopted.
	JS_GuardAgainstJsExceptions: function(cb) {
		try {
			{{{ makeDynCall('v', 'cb') }}}();
		} catch(e) {
			console.warn(e);
		}
	}
});
