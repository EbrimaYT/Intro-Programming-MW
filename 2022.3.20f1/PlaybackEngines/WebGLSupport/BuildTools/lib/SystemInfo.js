var LibrarySystemInfoWebGL = {
  	JS_SystemInfo_HasWebGL__proxy: 'sync',
  	JS_SystemInfo_HasWebGL__sig: 'i',
	JS_SystemInfo_HasWebGL: function() 
	{
		return Module.SystemInfo.hasWebGL;
	},

  	JS_SystemInfo_HasCursorLock__proxy: 'sync',
  	JS_SystemInfo_HasCursorLock__sig: 'i',
	JS_SystemInfo_HasCursorLock: function() 
	{
		return Module.SystemInfo.hasCursorLock;
	},

  	JS_SystemInfo_HasFullscreen__proxy: 'sync',
  	JS_SystemInfo_HasFullscreen__sig: 'i',
	JS_SystemInfo_HasFullscreen: function() 
	{
		return Module.SystemInfo.hasFullscreen;
	},

  	JS_SystemInfo_IsMobile__proxy: 'sync',
  	JS_SystemInfo_IsMobile__sig: 'i',
	JS_SystemInfo_IsMobile: function() 
	{
		return Module.SystemInfo.mobile;
	},
  
	JS_SystemInfo_GetScreenSize__proxy: 'sync',
	JS_SystemInfo_GetScreenSize__sig: 'vii',
	JS_SystemInfo_GetScreenSize: function(outWidth, outHeight)
	{
		HEAPF64[outWidth >> 3] = Module.SystemInfo.width;
		HEAPF64[outHeight >> 3] = Module.SystemInfo.height;
	},

	JS_SystemInfo_GetCanvasClientSize__proxy: 'sync',
	JS_SystemInfo_GetCanvasClientSize__sig: 'viii',
	JS_SystemInfo_GetCanvasClientSize: function(domElementSelector, outWidth, outHeight)
	{
		var selector = UTF8ToString(domElementSelector);
		var canvas = (selector == '#canvas') ? Module['canvas'] : document.querySelector(selector);
		var w = 0, h = 0;
		if (canvas) {
			var size = canvas.getBoundingClientRect();
			w = size.width;
			h = size.height;
		}
		HEAPF64[outWidth >> 3] = w;
		HEAPF64[outHeight >> 3] = h;
	},

	JS_SystemInfo_GetPreferredDevicePixelRatio__proxy: 'sync',
	JS_SystemInfo_GetPreferredDevicePixelRatio__sig: 'd',
	JS_SystemInfo_GetPreferredDevicePixelRatio: function()
	{
		return Module.matchWebGLToCanvasSize == false ? 1 : Module.devicePixelRatio || window.devicePixelRatio || 1;
	},

	JS_SystemInfo_GetMatchWebGLToCanvasSize__proxy: 'sync',
	JS_SystemInfo_GetMatchWebGLToCanvasSize__sig: 'd',
	JS_SystemInfo_GetMatchWebGLToCanvasSize: function()
	{
		// If matchWebGLToCanvasSize is not present, it is
		// same as true, to keep backwards compatibility with user page templates
		// that are not setting this field.
		return Module.matchWebGLToCanvasSize || Module.matchWebGLToCanvasSize === undefined;
	},

  	JS_SystemInfo_GetDocumentURL__proxy: 'sync',
  	JS_SystemInfo_GetDocumentURL__sig: 'iii',
	JS_SystemInfo_GetDocumentURL: function(buffer, bufferSize) 
	{
		if (buffer)
			stringToUTF8(document.URL, buffer, bufferSize);
		return lengthBytesUTF8(document.URL);
	},

  	JS_SystemInfo_GetStreamingAssetsURL__proxy: 'sync',
  	JS_SystemInfo_GetStreamingAssetsURL__sig: 'iii',
	JS_SystemInfo_GetStreamingAssetsURL: function(buffer, bufferSize) 
	{
		if (buffer)
			stringToUTF8(Module.streamingAssetsUrl, buffer, bufferSize);
		return lengthBytesUTF8(Module.streamingAssetsUrl);
	},

  	JS_SystemInfo_GetBrowserName__proxy: 'sync',
  	JS_SystemInfo_GetBrowserName__sig: 'iii',
	JS_SystemInfo_GetBrowserName: function(buffer, bufferSize) 
	{
		var browser = Module.SystemInfo.browser;
		if (buffer)
			stringToUTF8(browser, buffer, bufferSize);
		return lengthBytesUTF8(browser);
	},

  	JS_SystemInfo_GetBrowserVersionString__proxy: 'sync',
  	JS_SystemInfo_GetBrowserVersionString__sig: 'iii',
	JS_SystemInfo_GetBrowserVersionString: function(buffer, bufferSize)
	{
		var browserVer = Module.SystemInfo.browserVersion;
		if (buffer)
			stringToUTF8(browserVer, buffer, bufferSize);
		return lengthBytesUTF8(browserVer);
	},

  	JS_SystemInfo_GetBrowserVersion__proxy: 'sync',
  	JS_SystemInfo_GetBrowserVersion__sig: 'i',
	JS_SystemInfo_GetBrowserVersion: function() 
	{
		return Module.SystemInfo.browserVersion;
	},

  	JS_SystemInfo_GetOS__proxy: 'sync',
  	JS_SystemInfo_GetOS__sig: 'iii',
	JS_SystemInfo_GetOS: function(buffer, bufferSize) 
	{
		var browser = Module.SystemInfo.os + " " + Module.SystemInfo.osVersion;
		if (buffer)
			stringToUTF8(browser, buffer, bufferSize);
		return lengthBytesUTF8(browser);
	},

  	JS_SystemInfo_GetLanguage__proxy: 'sync',
  	JS_SystemInfo_GetLanguage__sig: 'iii',
	JS_SystemInfo_GetLanguage: function(buffer, bufferSize) 
	{
		var language = Module.SystemInfo.language;
		if (buffer)
			stringToUTF8(language, buffer, bufferSize);
		return lengthBytesUTF8(language);
	},

  	JS_SystemInfo_GetMemory__proxy: 'sync',
  	JS_SystemInfo_GetMemory__sig: 'i',
	JS_SystemInfo_GetMemory: function() 
	{
		return HEAPU8.length/(1024*1024);
	},

  	JS_SystemInfo_GetGPUInfo__proxy: 'sync',
  	JS_SystemInfo_GetGPUInfo__sig: 'iii',
	JS_SystemInfo_GetGPUInfo : function(buffer, bufferSize)
	{
		var gpuinfo = Module.SystemInfo.gpu;
		if (buffer)
			stringToUTF8(gpuinfo, buffer, bufferSize);
		return lengthBytesUTF8(gpuinfo);
	},

    JS_SystemInfo_HasAstcHdr__proxy: 'sync',
    JS_SystemInfo_HasAstcHdr__sig: 'i',
    JS_SystemInfo_HasAstcHdr: function()
    {
      var ext = GLctx.getExtension('WEBGL_compressed_texture_astc');
      if (ext && ext.getSupportedProfiles) {
        return ext.getSupportedProfiles().includes("hdr");
      }
      return false;
    }
};

mergeInto(LibraryManager.library, LibrarySystemInfoWebGL);
