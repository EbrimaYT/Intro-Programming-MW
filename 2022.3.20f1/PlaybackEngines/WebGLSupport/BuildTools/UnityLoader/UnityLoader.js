function createUnityInstance(canvas, config, onProgress) {
  onProgress = onProgress || function () {};

#if USE_THREADS
  // Polyfill Atomics.wake for old Emscripten fastcomp compiler.
  // TODO: When we update to new Emscripten, this can be removed.
  if (typeof Atomics !== 'undefined' && Atomics.notify && !Atomics.wake) {
    Atomics.wake = Atomics.notify;
  }
#endif

  function showBanner(msg, type) {
    // Only ever show one error at most - other banner messages after that should get ignored
    // to avoid noise.
    if (!showBanner.aborted && config.showBanner) {
      if (type == 'error') showBanner.aborted = true;
      return config.showBanner(msg, type);
    }

    // Fallback to console logging if visible banners have been suppressed
    // from the main page.
    switch(type) {
      case 'error': console.error(msg); break;
      case 'warning': console.warn(msg); break;
      default: console.log(msg); break;
    }
  }

  function errorListener(e) {
    var error = e.reason || e.error;
    var message = error ? error.toString() : (e.message || e.reason || '');
    var stack = (error && error.stack) ? error.stack.toString() : '';

    // Do not repeat the error message if it's present in the stack trace.
    if (stack.startsWith(message)) {
      stack = stack.substring(message.length);
    }

    message += '\n' + stack.trim();

    if (!message || !Module.stackTraceRegExp || !Module.stackTraceRegExp.test(message))
      return;

    var filename = e.filename || (error && (error.fileName || error.sourceURL)) || '';
    var lineno = e.lineno || (error && (error.lineNumber || error.line)) || 0;

#if SYMBOLS_FILENAME
    demanglingErrorHandler(message, filename, lineno);
#else // SYMBOLS_FILENAME
    errorHandler(message, filename, lineno);
#endif // SYMBOLS_FILENAME
  }

  function fallbackToDefaultConfigWithWarning(config, key, defaultValue) {
    var value = config[key];

    if (typeof value === "undefined" || !value) {
      console.warn("Config option \"" + key + "\" is missing or empty. Falling back to default value: \"" + defaultValue + "\". Consider updating your WebGL template to include the missing config option.");
      config[key] = defaultValue;
    }
  }

  var Module = {
    canvas: canvas,
    webglContextAttributes: {
      preserveDrawingBuffer: false,
      powerPreference: {{{ WEBGL_POWER_PREFERENCE }}},
    },
#if USE_DATA_CACHING
    cacheControl: function (url) {
      return (url == Module.dataUrl || url.match(/\.bundle/)) ? "must-revalidate" : "no-store";
    },
#endif // USE_DATA_CACHING
#if !USE_WASM
    INITIAL_MEMORY: {{{ INITIAL_MEMORY }}},
#endif // !USE_WASM
    streamingAssetsUrl: "StreamingAssets",
    downloadProgress: {},
    deinitializers: [],
    intervals: {},
    setInterval: function (func, ms) {
      var id = window.setInterval(func, ms);
      this.intervals[id] = true;
      return id;
    },
    clearInterval: function(id) {
      delete this.intervals[id];
      window.clearInterval(id);
    },
    preRun: [],
    postRun: [],
    print: function (message) {
      console.log(message);
    },
    printErr: function (message) {
      console.error(message);

      if (typeof message === 'string' && message.indexOf('wasm streaming compile failed') != -1) {
        if (message.toLowerCase().indexOf('mime') != -1) {
          showBanner('HTTP Response Header "Content-Type" configured incorrectly on the server for file ' + Module.codeUrl + ' , should be "application/wasm". Startup time performance will suffer.', 'warning');
        } else {
          showBanner('WebAssembly streaming compilation failed! This can happen for example if "Content-Encoding" HTTP header is incorrectly enabled on the server for file ' + Module.codeUrl + ', but the file is not pre-compressed on disk (or vice versa). Check the Network tab in browser Devtools to debug server header configuration.', 'warning');
        }
      }
    },
    locateFile: function (url) {
#if USE_WASM && !DECOMPRESSION_FALLBACK
      if (url == "build.wasm") return this.codeUrl;
#endif
#if USE_THREADS
      if (url == "build.worker.js") return this.workerUrl;
#endif
      return url;
    },
#if USE_THREADS
    mainScriptUrlOrBlob: this.frameworkUrl,
#endif // USE_THREADS
    disabledCanvasEvents: [
      "contextmenu",
      "dragstart",
    ],
  };

  // Add fallback values for companyName, productName and productVersion to ensure that the UnityCache is working. 
  fallbackToDefaultConfigWithWarning(config, "companyName", "Unity");
  fallbackToDefaultConfigWithWarning(config, "productName", "WebGL Player");
  fallbackToDefaultConfigWithWarning(config, "productVersion", "1.0");
  
  for (var parameter in config)
    Module[parameter] = config[parameter];

  Module.streamingAssetsUrl = new URL(Module.streamingAssetsUrl, document.URL).href;

  // Operate on a clone of Module.disabledCanvasEvents field so that at Quit time
  // we will ensure we'll remove the events that we created (in case user has
  // modified/cleared Module.disabledCanvasEvents in between)
  var disabledCanvasEvents = Module.disabledCanvasEvents.slice();

  function preventDefault(e) {
    e.preventDefault();
  }

  disabledCanvasEvents.forEach(function (disabledCanvasEvent) {
    canvas.addEventListener(disabledCanvasEvent, preventDefault);
  });

  window.addEventListener("error", errorListener);
  window.addEventListener("unhandledrejection", errorListener);

  // Safari does not automatically stretch the fullscreen element to fill the screen.
  // The CSS width/height of the canvas causes it to remain the same size in the full screen
  // window on Safari, resulting in it being a small canvas with black borders filling the
  // rest of the screen.
  var _savedElementWidth = "";
  var _savedElementHeight = "";
  function webkitFullscreenChangeEventHandler(e) {
    // Safari uses webkitCurrentFullScreenElement and not fullscreenElement.
    var fullscreenElement = document.webkitCurrentFullScreenElement;
    if (fullscreenElement === canvas) {
      if (canvas.style.width) {
        _savedElementWidth = canvas.style.width;
        _savedElementHeight = canvas.style.height;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
      }
    } else {
      if (_savedElementWidth) {
        canvas.style.width = _savedElementWidth;
        canvas.style.height = _savedElementHeight;
        _savedElementWidth = "";
        _savedElementHeight = "";
      }
    }
  }
  // Safari uses webkitfullscreenchange event and not fullscreenchange
  document.addEventListener("webkitfullscreenchange", webkitFullscreenChangeEventHandler);

  // Clear the event handlers we added above when the app quits, so that the event handler
  // functions will not hold references to this JS function scope after
  // exit, to allow JS garbage collection to take place.
  Module.deinitializers.push(function() {
    Module['disableAccessToMediaDevices']();
    disabledCanvasEvents.forEach(function (disabledCanvasEvent) {
      canvas.removeEventListener(disabledCanvasEvent, preventDefault);
    });
    window.removeEventListener("error", errorListener);
    window.removeEventListener("unhandledrejection", errorListener);

    document.removeEventListener("webkitfullscreenchange", webkitFullscreenChangeEventHandler);

    for (var id in Module.intervals)
    {
      window.clearInterval(id);
    }
    Module.intervals = {};
  });

  Module.QuitCleanup = function () {
    for (var i = 0; i < Module.deinitializers.length; i++) {
      Module.deinitializers[i]();
    }
    Module.deinitializers = [];
    // After all deinitializer callbacks are called, notify user code that the Unity game instance has now shut down.
    if (typeof Module.onQuit == "function")
      Module.onQuit();

#if CLOSE_ON_QUIT
    window.close();
#endif
  };

  var unityInstance = {
    Module: Module,
    SetFullscreen: function () {
      if (Module.SetFullscreen)
        return Module.SetFullscreen.apply(Module, arguments);
      Module.print("Failed to set Fullscreen mode: Player not loaded yet.");
    },
    SendMessage: function () {
      if (Module.SendMessage)
        return Module.SendMessage.apply(Module, arguments);
      Module.print("Failed to execute SendMessage: Player not loaded yet.");
    },
    Quit: function () {
      return new Promise(function (resolve, reject) {
        Module.shouldQuit = true;
        Module.onQuit = resolve;
      });
    },
    GetMemoryInfo: function () {
      var memInfoPtr = Module._getMemInfo();
      return {
        totalWASMHeapSize: Module.HEAPU32[memInfoPtr >> 2],
        usedWASMHeapSize: Module.HEAPU32[(memInfoPtr >> 2) + 1],
        totalJSHeapSize: Module.HEAPF64[(memInfoPtr >> 3) + 1],
        usedJSHeapSize: Module.HEAPF64[(memInfoPtr >> 3) + 2]
      };
    },
  };


  Module.SystemInfo = (function () {
#if 0
    // Recognize and parse the following formats of user agents:

    // Opera 71 on Windows 10:         Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36 OPR/71.0.3770.228
    // Edge 85 on Windows 10:          Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36 Edg/85.0.564.70
    // Firefox 81 on Windows 10:       Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:81.0) Gecko/20100101 Firefox/81.0
    // Chrome 85 on Windows 10:        Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36
    // IE 11 on Windows 7:             Mozilla/5.0 CK={} (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko
    // IE 10 on Windows 7:             Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)

    // Chrome 80 on Android 8.0.0:     Mozilla/5.0 (Linux; Android 8.0.0; VKY-L29) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Mobile Safari/537.36
    // Firefox 68 on Android 8.0.0:    Mozilla/5.0 (Android 8.0.0; Mobile; rv:68.0) Gecko/68.0 Firefox/68.0

    // Samsung Browser on Android 9:   Mozilla/5.0 (Linux; Android 9; SAMSUNG SM-G960U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/10.2 Chrome/71.0.3578.99 Mobile Safari/537.36
    // Safari 13.0.5 on iPhone 13.3.1: Mozilla/5.0 (iPhone; CPU iPhone OS 13_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.5 Mobile/15E148 Safari/604.1

    // Safari 12.1 on iPad OS 12.2     Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1

    // Safari 14 on macOS 11.0:        Mozilla/5.0 (Macintosh; Intel Mac OS X 11_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1
    // Safari 14 on macOS 10.15.6:     Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15
    // Firefox 80 on macOS 10.15:      Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:80.0) Gecko/20100101 Firefox/80.0
    // Chrome 65 on macOS 10.15.6:     Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36

    // Firefox 57 on FreeBSD:          Mozilla/5.0 (X11; FreeBSD amd64; rv:57.0) Gecko/20100101 Firefox/57.0
    // Chrome 43 on OpenBSD:           Mozilla/5.0 (X11; OpenBSD amd64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/43.0.2357.125 Safari/537.36
#endif

    var browser, browserVersion, os, osVersion, canvas, gpu;

    var ua = navigator.userAgent + ' ';
    var browsers = [
      ['Firefox', 'Firefox'],
      ['OPR', 'Opera'],
      ['Edg', 'Edge'],
      ['SamsungBrowser', 'Samsung Browser'],
      ['Trident', 'Internet Explorer'],
      ['MSIE', 'Internet Explorer'],
      ['Chrome', 'Chrome'],
      ['CriOS', 'Chrome on iOS Safari'],
      ['FxiOS', 'Firefox on iOS Safari'],
      ['Safari', 'Safari'],
    ];

    function extractRe(re, str, idx) {
      re = RegExp(re, 'i').exec(str);
      return re && re[idx];
    }
    for(var b = 0; b < browsers.length; ++b) {
      browserVersion = extractRe(browsers[b][0] + '[\/ ](.*?)[ \\)]', ua, 1);
      if (browserVersion) {
        browser = browsers[b][1];
        break;
      }
    }
    if (browser == 'Safari') browserVersion = extractRe('Version\/(.*?) ', ua, 1);
    if (browser == 'Internet Explorer') browserVersion = extractRe('rv:(.*?)\\)? ', ua, 1) || browserVersion;

    // These OS strings need to match the ones in Runtime/Misc/SystemInfo.cpp::GetOperatingSystemFamily()
    var oses = [
      ['Windows (.*?)[;\)]', 'Windows'],
      ['Android ([0-9_\.]+)', 'Android'],
      ['iPhone OS ([0-9_\.]+)', 'iPhoneOS'],
      ['iPad.*? OS ([0-9_\.]+)', 'iPadOS'],
      ['FreeBSD( )', 'FreeBSD'],
      ['OpenBSD( )', 'OpenBSD'],
      ['Linux|X11()', 'Linux'],
      ['Mac OS X ([0-9_\\.]+)', 'MacOS'],
      ['bot|google|baidu|bing|msn|teoma|slurp|yandex', 'Search Bot']
    ];
    for(var o = 0; o < oses.length; ++o) {
      osVersion = extractRe(oses[o][0], ua, 1);
      if (osVersion) {
        os = oses[o][1];
        osVersion = osVersion.replace(/_/g, '.');
        break;
      }
    }
    var versionMappings = {
      'NT 5.0': '2000',
      'NT 5.1': 'XP',
      'NT 5.2': 'Server 2003',
      'NT 6.0': 'Vista',
      'NT 6.1': '7',
      'NT 6.2': '8',
      'NT 6.3': '8.1',
      'NT 10.0': '10'
    };
    osVersion = versionMappings[osVersion] || osVersion;

    // TODO: Add mobile device identifier, e.g. SM-G960U

    canvas = document.createElement("canvas");
    if (canvas) {
      var gl = canvas.getContext("webgl2");
      var glVersion = gl ? 2 : 0;
      if (!gl) {
        if (gl = canvas && canvas.getContext("webgl")) glVersion = 1;
      }

      if (gl) {
        gpu = (gl.getExtension("WEBGL_debug_renderer_info") && gl.getParameter(0x9246 /*debugRendererInfo.UNMASKED_RENDERER_WEBGL*/)) || gl.getParameter(0x1F01 /*gl.RENDERER*/);
      }
    }

    var hasThreads = typeof SharedArrayBuffer !== 'undefined';
    var hasWasm = typeof WebAssembly === "object" && typeof WebAssembly.compile === "function";
    return {
      width: screen.width,
      height: screen.height,
      userAgent: ua.trim(),
      browser: browser || 'Unknown browser',
      browserVersion: browserVersion || 'Unknown version',
      mobile: /Mobile|Android|iP(ad|hone)/.test(navigator.appVersion),
      os: os || 'Unknown OS',
      osVersion: osVersion || 'Unknown OS Version',
      gpu: gpu || 'Unknown GPU',
      language: navigator.userLanguage || navigator.language,
      hasWebGL: glVersion,
      hasCursorLock: !!document.body.requestPointerLock,
      hasFullscreen: !!document.body.requestFullscreen || !!document.body.webkitRequestFullscreen, // Safari still uses the webkit prefixed version
      hasThreads: hasThreads,
      hasWasm: hasWasm,
      // This should be updated when we re-enable wasm threads. Previously it checked for WASM thread
      // support with: var wasmMemory = hasWasm && hasThreads && new WebAssembly.Memory({"initial": 1, "maximum": 1, "shared": true});
      // which caused Chrome to have a warning that SharedArrayBuffer requires cross origin isolation.
      hasWasmThreads: false,
    };
  })();

  function errorHandler(message, filename, lineno) {
    // Unity needs to rely on Emscripten deferred fullscreen requests, so these will make their way to error handler
    if (message.indexOf('fullscreen error') != -1)
      return;

    if (Module.startupErrorHandler) {
      Module.startupErrorHandler(message, filename, lineno);
      return;
    }
    if (Module.errorHandler && Module.errorHandler(message, filename, lineno))
      return;
    console.log("Invoking error handler due to\n" + message);

    // Support Firefox window.dump functionality.
    if (typeof dump == "function")
      dump("Invoking error handler due to\n" + message);

    if (errorHandler.didShowErrorMessage)
      return;
    var message = "An error occurred running the Unity content on this page. See your browser JavaScript console for more info. The error was:\n" + message;
    if (message.indexOf("DISABLE_EXCEPTION_CATCHING") != -1) {
      message = "An exception has occurred, but exception handling has been disabled in this build. If you are the developer of this content, enable exceptions in your project WebGL player settings to be able to catch the exception or see the stack trace.";
    } else if (message.indexOf("Cannot enlarge memory arrays") != -1) {
      message = "Out of memory. If you are the developer of this content, try allocating more memory to your WebGL build in the WebGL player settings.";
    } else if (message.indexOf("Invalid array buffer length") != -1  || message.indexOf("Invalid typed array length") != -1 || message.indexOf("out of memory") != -1 || message.indexOf("could not allocate memory") != -1) {
      message = "The browser could not allocate enough memory for the WebGL content. If you are the developer of this content, try allocating less memory to your WebGL build in the WebGL player settings.";
    }
    alert(message);
    errorHandler.didShowErrorMessage = true;
  }

#if SYMBOLS_FILENAME
  function demangleMessage(message, symbols) {
#if USE_WASM
    var symbolExp = "(wasm-function\\[)(\\d+)(\\])";
#else // USE_WASM
    var symbolExp = "(\\n|\\n    at |\\n    at Array\\.)([a-zA-Z0-9_$]+)(@| \\()";
#endif // USE_WASM
    var symbolRegExp = new RegExp(symbolExp);
    return message.replace(new RegExp(symbolExp, "g"), function (symbol) {
      var match = symbol.match(symbolRegExp);
#if USE_WASM
      return match[1] + (symbols[match[2]] ? symbols[match[2]] + "@" : "") + match[2] + match[3];
#else // USE_WASM
      return match[1] + match[2] + (symbols[match[2]] ? "[" + symbols[match[2]] + "]" : "") + match[3];
#endif // USE_WASM
    });
  }

  function demanglingErrorHandler(message, filename, lineno) {
    if (Module.symbols) {
      errorHandler(demangleMessage(message, Module.symbols), filename, lineno);
    } else if (!Module.symbolsUrl) {
      errorHandler(message, filename, lineno);
    } else {
      downloadBinary("symbolsUrl").then(function (data) {
        var json = "";
        for (var i = 0; i < data.length; i++)
          json += String.fromCharCode(data[i]);
        Module.symbols = JSON.parse(json);
        errorHandler(demangleMessage(message, Module.symbols), filename, lineno);
      }).catch(function (error) {
        errorHandler(message, filename, lineno);
      });
    }
  }

#endif // SYMBOLS_FILENAME

  Module.abortHandler = function (message) {
#if SYMBOLS_FILENAME
    demanglingErrorHandler(message, "", 0);
#else // SYMBOLS_FILENAME
    errorHandler(message, "", 0);
#endif // SYMBOLS_FILENAME
    return true;
  };

  Error.stackTraceLimit = Math.max(Error.stackTraceLimit || 0, 50);

  function progressUpdate(id, e) {
    if (id == "symbolsUrl")
      return;
    var progress = Module.downloadProgress[id];
    if (!progress)
      progress = Module.downloadProgress[id] = {
        started: false,
        finished: false,
        lengthComputable: false,
        total: 0,
        loaded: 0,
      };
    if (typeof e == "object" && (e.type == "progress" || e.type == "load")) {
      if (!progress.started) {
        progress.started = true;
        progress.lengthComputable = e.lengthComputable;
      }
      progress.total = e.total;
      progress.loaded = e.loaded;
      if (e.type == "load")
        progress.finished = true;
    }
    var loaded = 0, total = 0, started = 0, computable = 0, unfinishedNonComputable = 0;
    for (var id in Module.downloadProgress) {
      var progress = Module.downloadProgress[id];
      if (!progress.started)
        return 0;
      started++;
      if (progress.lengthComputable) {
        loaded += progress.loaded;
        total += progress.total;
        computable++;
      } else if (!progress.finished) {
        unfinishedNonComputable++;
      }
    }
    var totalProgress = started ? (started - unfinishedNonComputable - (total ? computable * (total - loaded) / total : 0)) / started : 0;
    onProgress(0.9 * totalProgress);
  }

{{{ read("FetchWithProgress.js") }}}
#if USE_DATA_CACHING
  {{{ read("UnityCache.js") }}}
  {{{ read("CachedFetch.js") }}}
#endif // USE_DATA_CACHING

#if DECOMPRESSION_FALLBACK
  var decompressors = {
#if DECOMPRESSION_FALLBACK == "Gzip"
    gzip: {
      require: {{{ read("Gzip.js") }}},
      decompress: function (data) {
        if (!this.exports)
          this.exports = this.require("inflate.js");
        try { return this.exports.inflate(data) } catch (e) {};
      },
      hasUnityMarker: function (data) {
        var commentOffset = 10, expectedComment = "UnityWeb Compressed Content (gzip)";
        if (commentOffset > data.length || data[0] != 0x1F || data[1] != 0x8B)
          return false;
        var flags = data[3];
        if (flags & 0x04) {
          if (commentOffset + 2 > data.length)
            return false;
          commentOffset += 2 + data[commentOffset] + (data[commentOffset + 1] << 8);
          if (commentOffset > data.length)
            return false;
        }
        if (flags & 0x08) {
          while (commentOffset < data.length && data[commentOffset])
            commentOffset++;
          if (commentOffset + 1 > data.length)
            return false;
          commentOffset++;
        }
        return (flags & 0x10) && String.fromCharCode.apply(null, data.subarray(commentOffset, commentOffset + expectedComment.length + 1)) == expectedComment + "\0";
      },
    },
#endif // DECOMPRESSION_FALLBACK == "Gzip"
#if DECOMPRESSION_FALLBACK == "Brotli"
    br: {
      require: {{{ read("Brotli.js") }}},
      decompress: function (data) {
        if (!this.exports)
          this.exports = this.require("decompress.js");
        try { return this.exports(data) } catch (e) {};
      },
      hasUnityMarker: function (data) {
        var expectedComment = "UnityWeb Compressed Content (brotli)";
        if (!data.length)
          return false;
        var WBITS_length = (data[0] & 0x01) ? (data[0] & 0x0E) ? 4 : 7 : 1,
            WBITS = data[0] & ((1 << WBITS_length) - 1),
            MSKIPBYTES = 1 + ((Math.log(expectedComment.length - 1) / Math.log(2)) >> 3);
            commentOffset = (WBITS_length + 1 + 2 + 1 + 2 + (MSKIPBYTES << 3) + 7) >> 3;
        if (WBITS == 0x11 || commentOffset > data.length)
          return false;
        var expectedCommentPrefix = WBITS + (((3 << 1) + (MSKIPBYTES << 4) + ((expectedComment.length - 1) << 6)) << WBITS_length);
        for (var i = 0; i < commentOffset; i++, expectedCommentPrefix >>>= 8) {
          if (data[i] != (expectedCommentPrefix & 0xFF))
            return false;
        }
        return String.fromCharCode.apply(null, data.subarray(commentOffset, commentOffset + expectedComment.length)) == expectedComment;
      },
    },
#endif // DECOMPRESSION_FALLBACK == "Brotli"
  };

  function decompress(compressed, url) {
    return new Promise(function (resolve, reject) {
      try {
        for (var contentEncoding in decompressors) {
          if (decompressors[contentEncoding].hasUnityMarker(compressed)) {
            if (url)
              console.log("You can reduce startup time if you configure your web server to add \"Content-Encoding: " + contentEncoding + "\" response header when serving \"" + url + "\" file.");
            var decompressor = decompressors[contentEncoding];
            if (!decompressor.worker) {
              var workerUrl = URL.createObjectURL(new Blob(["this.require = ", decompressor.require.toString(), "; this.decompress = ", decompressor.decompress.toString(), "; this.onmessage = ", function (e) {
                var data = { id: e.data.id, decompressed: this.decompress(e.data.compressed) };
                postMessage(data, data.decompressed ? [data.decompressed.buffer] : []);
              }.toString(), "; postMessage({ ready: true });"], { type: "application/javascript" }));
              decompressor.worker = new Worker(workerUrl);
              decompressor.worker.onmessage = function (e) {
                if (e.data.ready) {
                  URL.revokeObjectURL(workerUrl);
                  return;
                }
                this.callbacks[e.data.id](e.data.decompressed);
                delete this.callbacks[e.data.id];
              };
              decompressor.worker.callbacks = {};
              decompressor.worker.nextCallbackId = 0;
            }
            var id = decompressor.worker.nextCallbackId++;
            decompressor.worker.callbacks[id] = resolve;
            decompressor.worker.postMessage({id: id, compressed: compressed}, [compressed.buffer]);
            return;
          }
        }

        resolve(compressed);
      } catch (error) {
        reject(error);
      }
    });
  }
#endif // DECOMPRESSION_FALLBACK

  function downloadBinary(urlId) {
      progressUpdate(urlId);
#if USE_DATA_CACHING
      var cacheControl = Module.cacheControl(Module[urlId]);
      var fetchImpl = Module.companyName && Module.productName ? Module.cachedFetch : Module.fetchWithProgress;
#else // USE_DATA_CACHING
      var cacheControl = "no-store";
      var fetchImpl = Module.fetchWithProgress;
#endif // USE_DATA_CACHING
      var url = Module[urlId];
      var mode = /file:\/\//.exec(url) ? "same-origin" : undefined;

      var request = fetchImpl(Module[urlId], {
        method: "GET",
        companyName: Module.companyName,
        productName: Module.productName,
        productVersion: Module.productVersion,
        control: cacheControl,
        mode: mode,
        onProgress: function (event) {
          progressUpdate(urlId, event);
        }
      });

      return request.then(function (response) {
#if DECOMPRESSION_FALLBACK
        return decompress(response.parsedBody, Module[urlId]);
#else // DECOMPRESSION_FALLBACK
        return response.parsedBody;
#endif // DECOMPRESSION_FALLBACK
      }).catch(function (e) {
        var error = 'Failed to download file ' + Module[urlId];
        if (location.protocol == 'file:') {
          showBanner(error + '. Loading web pages via a file:// URL without a web server is not supported by this browser. Please use a local development web server to host Unity content, or use the Unity Build and Run option.', 'error');
        } else {
          console.error(error);
        }
      });
  }

  function downloadFramework() {
#if DECOMPRESSION_FALLBACK
    return downloadBinary("frameworkUrl").then(function (code) {
      var blobUrl = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
#if USE_THREADS
      Module.frameworkBlobUrl = blobUrl;
#endif // USE_THREADS
#endif // DECOMPRESSION_FALLBACK
      return new Promise(function (resolve, reject) {
        var script = document.createElement("script");
#if DECOMPRESSION_FALLBACK
        script.src = blobUrl;
#else // DECOMPRESSION_FALLBACK
        script.src = Module.frameworkUrl;
#endif // DECOMPRESSION_FALLBACK
        script.onload = function () {
          // Adding the framework.js script to DOM created a global
          // 'unityFramework' variable that should be considered internal.
          // If not, then we have received a malformed file.
          if (typeof unityFramework === 'undefined' || !unityFramework) {
            var compressions = [['br', 'br'], ['gz', 'gzip']];
            for(var i in compressions) {
              var compression = compressions[i];
              if (Module.frameworkUrl.endsWith('.' + compression[0])) {
                var error = 'Unable to parse ' + Module.frameworkUrl + '!';
                if (location.protocol == 'file:') {
                  showBanner(error + ' Loading pre-compressed (brotli or gzip) content via a file:// URL without a web server is not supported by this browser. Please use a local development web server to host compressed Unity content, or use the Unity Build and Run option.', 'error');
                  return;
                }
                error += ' This can happen if build compression was enabled but web server hosting the content was misconfigured to not serve the file with HTTP Response Header "Content-Encoding: ' + compression[1] + '" present. Check browser Console and Devtools Network tab to debug.';
                if (compression[0] == 'br') {
                  if (location.protocol == 'http:') {
                    var migrationHelp = ['localhost', '127.0.0.1'].indexOf(location.hostname) != -1 ? '' : 'Migrate your server to use HTTPS.'
                    if (/Firefox/.test(navigator.userAgent)) error = 'Unable to parse ' + Module.frameworkUrl + '!<br>If using custom web server, verify that web server is sending .br files with HTTP Response Header "Content-Encoding: br". Brotli compression may not be supported in Firefox over HTTP connections. ' + migrationHelp + ' See <a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1670675">https://bugzilla.mozilla.org/show_bug.cgi?id=1670675</a> for more information.';
                    else error = 'Unable to parse ' + Module.frameworkUrl + '!<br>If using custom web server, verify that web server is sending .br files with HTTP Response Header "Content-Encoding: br". Brotli compression may not be supported over HTTP connections. Migrate your server to use HTTPS.';
                  }
                }
                showBanner(error, 'error');
                return;
              }
            };
            showBanner('Unable to parse ' + Module.frameworkUrl + '! The file is corrupt, or compression was misconfigured? (check Content-Encoding HTTP Response Header on web server)', 'error');
          }

          // Capture the variable to local scope and clear it from global
          // scope so that JS garbage collection can take place on
          // application quit.
          var fw = unityFramework;
          unityFramework = null;
          // Also ensure this function will not hold any JS scope
          // references to prevent JS garbage collection.
          script.onload = null;
#if DECOMPRESSION_FALLBACK && !USE_THREADS
          URL.revokeObjectURL(blobUrl);
#endif // DECOMPRESSION_FALLBACK && !USE_THREADS
          resolve(fw);
        }
        script.onerror = function(e) {
          showBanner('Unable to load file ' + Module.frameworkUrl + '! Check that the file exists on the remote server. (also check browser Console and Devtools Network tab to debug)', 'error');
        }
        document.body.appendChild(script);
        Module.deinitializers.push(function() {
          document.body.removeChild(script);
        });
      });
#if DECOMPRESSION_FALLBACK
    });
#endif // DECOMPRESSION_FALLBACK
  }

  function loadBuild() {
#if USE_WASM
#if DECOMPRESSION_FALLBACK
    Promise.all([
      downloadFramework(),
      downloadBinary("codeUrl"),
    ]).then(function (results) {
      Module.wasmBinary = results[1];
      results[0](Module);
    });

#else // DECOMPRESSION_FALLBACK
    downloadFramework().then(function (unityFramework) {
      unityFramework(Module);
    });

#endif // DECOMPRESSION_FALLBACK
#else // USE_WASM
    downloadFramework().then(function (results) {
      results(Module);
    });

#endif // USE_WASM
#if MEMORY_FILENAME
    Module.memoryInitializerRequest = {
      addEventListener: function (type, listener) {
        if (type == "load")
          Module.memoryInitializerRequest.useRequest = listener;
      },
    };
    downloadBinary("memoryUrl").then(function (data) {
      Module.memoryInitializerRequest.status = 200;
      Module.memoryInitializerRequest.response = data;
      if (Module.memoryInitializerRequest.useRequest)
        Module.memoryInitializerRequest.useRequest();
    });

#endif // MEMORY_FILENAME
    var dataPromise = downloadBinary("dataUrl");
    Module.preRun.push(function () {
      Module.addRunDependency("dataUrl");
      dataPromise.then(function (data) {
        var view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        var pos = 0;
        var prefix = "UnityWebData1.0\0";
        if (!String.fromCharCode.apply(null, data.subarray(pos, pos + prefix.length)) == prefix)
          throw "unknown data format";
        pos += prefix.length;
        var headerSize = view.getUint32(pos, true); pos += 4;
        while (pos < headerSize) {
          var offset = view.getUint32(pos, true); pos += 4;
          var size = view.getUint32(pos, true); pos += 4;
          var pathLength = view.getUint32(pos, true); pos += 4;
          var path = String.fromCharCode.apply(null, data.subarray(pos, pos + pathLength)); pos += pathLength;
          for (var folder = 0, folderNext = path.indexOf("/", folder) + 1 ; folderNext > 0; folder = folderNext, folderNext = path.indexOf("/", folder) + 1)
            Module.FS_createPath(path.substring(0, folder), path.substring(folder, folderNext - 1), true, true);
          Module.FS_createDataFile(path, null, data.subarray(offset, offset + size), true, true, true);
        }
        Module.removeRunDependency("dataUrl");
      });
    });
  }

  return new Promise(function (resolve, reject) {
    if (!Module.SystemInfo.hasWebGL) {
      reject("Your browser does not support WebGL.");
  #if !USE_WEBGL_1_0
    } else if (Module.SystemInfo.hasWebGL == 1) {
      var msg = "Your browser does not support graphics API \"WebGL 2\" which is required for this content.";
      if (Module.SystemInfo.browser == 'Safari' && parseInt(Module.SystemInfo.browserVersion) < 15) {
        if (Module.SystemInfo.mobile || navigator.maxTouchPoints > 1)
          msg += "\nUpgrade to iOS 15 or later.";
        else
          msg += "\nUpgrade to Safari 15 or later.";
      }
      reject(msg);
  #endif // !USE_WEBGL_1_0
  #if USE_WASM
    } else if (!Module.SystemInfo.hasWasm) {
      reject("Your browser does not support WebAssembly.");
  #endif // USE_WASM
  #if USE_THREADS
    } else if (!Module.SystemInfo.hasThreads) {
      reject("Your browser does not support multithreading.");
  #endif // USE_THREADS
    } else {
  #if USE_WEBGL_2_0 && USE_WEBGL_1_0
      if (Module.SystemInfo.hasWebGL == 1)
        Module.print("Warning: Your browser does not support \"WebGL 2\" Graphics API, switching to \"WebGL 1\"");
  #endif // USE_WEBGL_2_0 && USE_WEBGL_1_0
      Module.startupErrorHandler = reject;
      onProgress(0);
      Module.postRun.push(function () {
        onProgress(1);
        delete Module.startupErrorHandler;
        resolve(unityInstance);
      });
      loadBuild();
    }
  });
}
