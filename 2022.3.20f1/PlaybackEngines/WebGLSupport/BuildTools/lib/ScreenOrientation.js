mergeInto(LibraryManager.library, {
	$JS_ScreenOrientation_callback: 0,

	$JS_ScreenOrientation_eventHandler__deps: ['$JS_ScreenOrientation_callback'],
	$JS_ScreenOrientation_eventHandler: function() {
		if (JS_ScreenOrientation_callback) dynCall_viii(JS_ScreenOrientation_callback, window.innerWidth, window.innerHeight, screen.orientation ? screen.orientation.angle : window.orientation);
	},

	JS_ScreenOrientation_Init__deps: ['$JS_ScreenOrientation_eventHandler', '$JS_ScreenOrientation_callback'],
	JS_ScreenOrientation_Init: function(callback) {
		// Only register if not yet registered
		if (!JS_ScreenOrientation_callback) {
			if (screen.orientation) {
				// Use Screen Orientation API if available:
				// - https://www.w3.org/TR/screen-orientation/
				// - https://caniuse.com/screen-orientation
				// - https://developer.mozilla.org/en-US/docs/Web/API/Screen/orientation
				// (Firefox, Chrome, Chrome for Android, Firefox for Android)
				screen.orientation.addEventListener('change', JS_ScreenOrientation_eventHandler);
			}

			// As a fallback, use deprecated DOM window.orientation field if available:
			// - https://compat.spec.whatwg.org/#dom-window-orientation
			// - https://developer.mozilla.org/en-US/docs/Web/API/Window/orientation
			// (Safari for iOS)
			// Listening to resize event also helps emulate landscape/portrait transitions on desktop
			// browsers when the browser window is scaled to narrow/wide configurations.
			window.addEventListener('resize', JS_ScreenOrientation_eventHandler);

			JS_ScreenOrientation_callback = callback;

			// Trigger the event handler immediately after the engine initialization is done to start up
			// ScreenManager with the initial state.
			setTimeout(JS_ScreenOrientation_eventHandler, 0);
		}
	},

	JS_ScreenOrientation_DeInit__deps: ['$JS_ScreenOrientation_eventHandler', '$JS_ScreenOrientation_callback'],
	JS_ScreenOrientation_DeInit: function() {
		JS_ScreenOrientation_callback = 0;
		window.removeEventListener('resize', JS_ScreenOrientation_eventHandler);
		if (screen.orientation) {
			screen.orientation.removeEventListener('change', JS_ScreenOrientation_eventHandler);
		}
	},

	$JS_ScreenOrientation_requestedLockType: -1,	// Orientation Lock type most recently requested
	$JS_ScreenOrientation_appliedLockType: -1,		// Currently applied lock (initially unlocked)
	$JS_ScreenOrientation_timeoutID: -1,			// ID of the setTimeout function, positive when waiting for the callback or for screen.orientation.lock()

	// The following JS_ScreenOrientation_Lock is called by the ScreenManagerWebGL as often as the user scripts
	// call Screen.autorotateToX and Screen.orientation, so we need to handle multiple, frequent calls
	JS_ScreenOrientation_Lock__deps: ['$JS_ScreenOrientation_requestedLockType', '$JS_ScreenOrientation_appliedLockType', '$JS_ScreenOrientation_timeoutID'],
	JS_ScreenOrientation_Lock__proxy: 'sync',
	JS_ScreenOrientation_Lock__sig: 'vi',
	JS_ScreenOrientation_Lock: function(orientationLockType) {
		// We will use the Screen Orientation API if available, and silently return if not available
		// - https://www.w3.org/TR/screen-orientation/
		// - https://caniuse.com/screen-orientation
		// - https://developer.mozilla.org/en-US/docs/Web/API/Screen/orientation
		if (!screen.orientation || !screen.orientation.lock) {
			// As of writing, this is only not implemented on Safari
			return;
		}

		// Callback to apply the lock
		function applyLock() {
			JS_ScreenOrientation_appliedLockType = JS_ScreenOrientation_requestedLockType;

			// Index must match enum class OrientationLockType in ScreenOrientation.h
			var screenOrientations = ['any', 0/*natural*/, 'landscape', 'portrait', 'portrait-primary', 'portrait-secondary', 'landscape-primary', 'landscape-secondary' ];
			var type = screenOrientations[JS_ScreenOrientation_appliedLockType];

#if ASSERTIONS
			assert(type, 'Invalid orientationLockType passed to JS_ScreenOrientation_Lock');
#endif

			// Apply the lock, which is done asynchronously and returns a Promise
			screen.orientation.lock(type).then(function() {
				// Upon success, see if the JS_ScreenOrientation_requestedLockType value has changed, in which case, we will now need to queue another applyLock
				if (JS_ScreenOrientation_requestedLockType != JS_ScreenOrientation_appliedLockType) {
					JS_ScreenOrientation_timeoutID = setTimeout(applyLock, 0);
				}
				else {
					JS_ScreenOrientation_timeoutID = -1;
				}
			}).catch(function(err) {
				// When screen.orientation.lock() is called on a desktop browser, a DOMException is thrown by the promise
				warnOnce(err);
				JS_ScreenOrientation_timeoutID = -1;
			});

			// Note, there is also an screen.orientation.unlock() which unlocks auto rotate to default orientation.
			// On my Google Pixel 5, this allows 'portrait-primary' AND 'landscape', but will differ depending on device.
		}

		// Request this orientationLockType be applied on the callback
		JS_ScreenOrientation_requestedLockType = orientationLockType;

		// Queue applyLock callback if there is not already a callback or a screen.orientation.lock call in progress
		if (JS_ScreenOrientation_timeoutID == -1 && orientationLockType != JS_ScreenOrientation_appliedLockType) {
			JS_ScreenOrientation_timeoutID = setTimeout(applyLock, 0);
		}
	},
});
