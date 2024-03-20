mergeInto(LibraryManager.library, {
	$jsDomCssEscapeId: function (id) {
		// Use CSS Object Model to escape ID if feature is present
		if (typeof window.CSS !== "undefined" && typeof window.CSS.escape !== "undefined") {
			return window.CSS.escape(id);
		}

		// Fallback: Escape special characters with RegExp. This handles most cases but not all!
		return id.replace(/(#|\.|\+|\[|\]|\(|\)|\{|\})/g, "\\$1");
	},

	$jsCanvasSelector__deps: ['$jsDomCssEscapeId'],
	$jsCanvasSelector: function() {
		// This lookup specifies the target canvas that different DOM
		// events are registered to, like keyboard and mouse events.
		// This requires that Module['canvas'] must have a CSS ID associated
		// with it, it cannot be empty. Override Module['canvas'] to specify
		// some other target to use, e.g. if the page contains multiple Unity
		// game instances.
#if ASSERTIONS
		if (Module['canvas'] && !Module['canvas'].id) throw 'Module["canvas"] must have a CSS ID associated with it!';
#endif
		var canvasId = Module['canvas'] ? Module['canvas'].id : 'unity-canvas';
		return '#' + jsDomCssEscapeId(canvasId);
	},

	JS_DOM_UnityCanvasSelector__deps: ['$stringToNewUTF8', '$jsCanvasSelector'],
	JS_DOM_UnityCanvasSelector__proxy: 'sync',
	JS_DOM_UnityCanvasSelector: function() {
		var canvasSelector = jsCanvasSelector();
		if (_JS_DOM_UnityCanvasSelector.selector != canvasSelector) {
			_free(_JS_DOM_UnityCanvasSelector.ptr);
			_JS_DOM_UnityCanvasSelector.ptr = stringToNewUTF8(canvasSelector);
			_JS_DOM_UnityCanvasSelector.selector = canvasSelector;
		}
		return _JS_DOM_UnityCanvasSelector.ptr;
	},

	JS_DOM_MapViewportCoordinateToElementLocalCoordinate__deps: ['$jsCanvasSelector'],
	JS_DOM_MapViewportCoordinateToElementLocalCoordinate__proxy: 'sync',
	JS_DOM_MapViewportCoordinateToElementLocalCoordinate: function(viewportX, viewportY, targetX, targetY) {
		var canvas = document.querySelector(jsCanvasSelector());
		var rect = canvas && canvas.getBoundingClientRect();
		HEAPU32[targetX >> 2] = viewportX - (rect ? rect.left : 0);
		HEAPU32[targetY >> 2] = viewportY - (rect ? rect.top : 0);
	},
});
