mergeInto(LibraryManager.library, {
	$ExceptionsSeen: 0,
	JS_CallAsLongAsNoExceptionsSeen__deps: ['$ExceptionsSeen'],
	JS_CallAsLongAsNoExceptionsSeen: function(cb) {
		if (!ExceptionsSeen) {
			try {
				{{{ makeDynCall('v', 'cb') }}}();
			} catch(e) {
				ExceptionsSeen = 1;
				console.error('Uncaught exception from main loop:');
				console.error(e);
				console.error('Halting program.');
				if (Module.errorHandler) Module.errorHandler(e);
				throw e;
			}
		}
	}
});
