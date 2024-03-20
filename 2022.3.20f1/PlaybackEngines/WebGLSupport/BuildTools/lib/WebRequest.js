var LibraryWebRequestWebGL = {
	$wr: {
		requests: {},
		responses: {},
		abortControllers: {},
		timer: {},
		nextRequestId: 1
	},

	$jsWebRequestGetResponseHeaderString__deps: ['$wr'],
	$jsWebRequestGetResponseHeaderString: function(requestId) {
		var response = wr.responses[requestId];
		if (!response) {
          return "";
        }

		// Use cached value of response header string if present
		if (response.headerString) {
			return response.headerString;
		}

		// Create response header string from headers object
		var headers = "";
        var entries = response.headers.entries();
        for (var result = entries.next(); !result.done; result = entries.next()) {
            headers += result.value[0] + ": " + result.value[1] + "\r\n"; 
        }
		response.headerString = headers;

		return headers;
	},

	JS_WebRequest_Create__proxy: 'sync',
	JS_WebRequest_Create__sig: 'iii',
	JS_WebRequest_Create: function(url, method)
	{
		var _url = UTF8ToString(url);
		var _method = UTF8ToString(method);
		var abortController = new AbortController();
		var requestOptions = {
			url: _url,
			init: {
				method: _method,
				signal: abortController.signal,
				headers: {},
				enableStreamingDownload: true
			},
			tempBuffer: null,
			tempBufferSize: 0
		};

		wr.abortControllers[wr.nextRequestId] = abortController;
		wr.requests[wr.nextRequestId] = requestOptions;

		return wr.nextRequestId++;
	},
	
	JS_WebRequest_SetTimeout__proxy: 'sync',
	JS_WebRequest_SetTimeout__sig: 'vii',
	JS_WebRequest_SetTimeout: function (requestId, timeout)
	{
        var requestOptions = wr.requests[requestId];
		if (!requestOptions) {
            return;
		}

        requestOptions.timeout = timeout;
	},

	JS_WebRequest_SetRedirectLimit__proxy: 'sync',
	JS_WebRequest_SetRedirectLimit__sig: 'vii',
	JS_WebRequest_SetRedirectLimit: function (request, redirectLimit)
	{
		var requestOptions = wr.requests[request];
		if (!requestOptions) {
            return;
		}

		// Disable redirects if redirectLimit == 0 otherwise use browser defined redirect limit
		requestOptions.init.redirect = redirectLimit === 0 ? "error" : "follow";
	},

	JS_WebRequest_SetRequestHeader__proxy: 'sync',
	JS_WebRequest_SetRequestHeader__sig: 'viii',
	JS_WebRequest_SetRequestHeader: function (requestId, header, value)
	{
		var requestOptions = wr.requests[requestId];
		if (!requestOptions) {
            return;
		}

		var _header = UTF8ToString(header);
		var _value = UTF8ToString(value);
		requestOptions.init.headers[_header] = _value;
	},

	JS_WebRequest_Send__proxy: 'sync',
	JS_WebRequest_Send__sig: 'viiiiii',
	JS_WebRequest_Send: function (requestId, ptr, length, arg, onresponse, onprogress)
	{	
		var requestOptions = wr.requests[requestId];
        var abortController = wr.abortControllers[requestId];

		function getTempBuffer(size) {
			// Allocate new temp buffer if none has been allocated
			if (!requestOptions.tempBuffer) {
				const initialSize = Math.max(size, 1024); // Use 1 kB as minimal temp buffer size to prevent too many reallocations
				requestOptions.tempBuffer = _malloc(initialSize);
				requestOptions.tempBufferSize = initialSize;
			}

			// Increase size of temp buffer if necessary
			if (requestOptions.tempBufferSize < size) {
				_free(requestOptions.tempBuffer);
				requestOptions.tempBuffer =  _malloc(size);
				requestOptions.tempBufferSize = size;
			}

			return requestOptions.tempBuffer;
		}

        function ClearTimeout() {
			if (wr.timer[requestId]) {
				clearTimeout(wr.timer[requestId]);
                delete wr.timer[requestId];
			}
        }

		function HandleSuccess(response, body) {
            ClearTimeout();

			if (!onresponse) {
				return;
			}

			var kWebRequestOK = 0;
			// 200 is successful http request, 0 is returned by non-http requests (file:).
			if (requestOptions.init.enableStreamingDownload) {
				// Body was streamed only send final body length
				dynCall('viiiiii', onresponse, [arg, response.status, 0, body.length, 0, kWebRequestOK]);
			} else if (body.length != 0) {
				// Send whole body at once
				var buffer = _malloc(body.length);
				HEAPU8.set(body, buffer);
				dynCall('viiiiii', onresponse, [arg, response.status, buffer, body.length, 0, kWebRequestOK]);
			} else {
				dynCall('viiiiii', onresponse, [arg, response.status, 0, 0, 0, kWebRequestOK]);
			}

			// Cleanup temp buffer
			if (requestOptions.tempBuffer) {
				_free(requestOptions.tempBuffer);
			}
		}

		function HandleError(err, code) {
			ClearTimeout();

            if (!onresponse) {
				return;
			}

			var len = lengthBytesUTF8(err) + 1;
			var buffer = _malloc(len);
			stringToUTF8(err, buffer, len);
			dynCall('viiiiii', onresponse, [arg, 500, 0, 0, buffer, code]);
            _free(buffer);

			// Clean up temp buffer
			if (requestOptions.tempBuffer) {
				_free(requestOptions.tempBuffer);
			}
		}

		function HandleProgress(e) {
			if (!onprogress || !e.lengthComputable) {
				return;
			}

			var response = e.response;
			wr.responses[requestId] = response;

			if (e.chunk) {
				// Response body streaming is enabled copy data to new buffer
				var buffer = getTempBuffer(e.chunk.length);
				HEAPU8.set(e.chunk, buffer);
				dynCall('viiiiii', onprogress, [arg, response.status, e.loaded, e.total, buffer, e.chunk.length]);
			} else {
				// no response body streaming
				dynCall('viiiiii', onprogress, [arg, response.status, e.loaded, e.total, 0, 0]);
			}
		}

		try {
			if (length > 0) {
				var postData = HEAPU8.subarray(ptr, ptr+length);
#if USE_PTHREADS
				// In multithreaded builds, HEAPU8 views into a SharedArrayBuffer,
				// but currently XMLHttpRequest does not allow send()ing data from
				// a SharedArrayBuffer sources. Therefore copy the data from a SAB
				// to an ArrayBuffer for the API call.
				// See https://github.com/whatwg/xhr/issues/245
				postData = new Uint8Array(postData);
#endif
				requestOptions.init.body = new Blob([postData]);
			}

			// Add timeout handler if timeout is set
			if (requestOptions.timeout) {
				wr.timer[requestId] = setTimeout(function () {
					requestOptions.isTimedOut = true;
					abortController.abort();
				}, requestOptions.timeout);
			}

			var fetchImpl = Module.fetchWithProgress;
			requestOptions.init.onProgress = HandleProgress;
			if (Module.companyName && Module.productName && Module.cachedFetch) {
				fetchImpl = Module.cachedFetch;
				requestOptions.init.companyName = Module.companyName;
				requestOptions.init.productName = Module.productName;
				requestOptions.init.productVersion = Module.productVersion;
				requestOptions.init.control = Module.cacheControl(requestOptions.url);
			}

			fetchImpl(requestOptions.url, requestOptions.init).then(function (response) {
				wr.responses[requestId] = response;

                HandleSuccess(response, response.parsedBody);
			}).catch(function (error) {
				var kWebErrorUnknown = 2;
                var kWebErrorAborted = 17;
                var kWebErrorTimeout = 14;

                if (requestOptions.isTimedOut) {
					HandleError("Connection timed out.", kWebErrorTimeout);
                } else if (abortController.signal.aborted) {
                    HandleError("Aborted.", kWebErrorAborted);
                } else {
                    HandleError(error.message, kWebErrorUnknown);
                }
			});
		} catch(error) {
			var kWebErrorUnknown = 2;
            HandleError(error.message, kWebErrorUnknown);
		}
	},

	JS_WebRequest_GetResponseMetaDataLengths__proxy: 'sync',
	JS_WebRequest_GetResponseMetaDataLengths__sig: 'vii',
	JS_WebRequest_GetResponseMetaDataLengths__deps: ['$jsWebRequestGetResponseHeaderString'],
	JS_WebRequest_GetResponseMetaDataLengths: function(requestId, buffer)
	{
		var response = wr.responses[requestId];
		if (!response) {
		  HEAPU32[buffer >> 2] = 0;
		  HEAPU32[(buffer >> 2) + 1] = 0;
          return;
        }

		var headers = jsWebRequestGetResponseHeaderString(requestId);
       
		// Set length of header and response url to output buffer
		HEAPU32[buffer >> 2] = lengthBytesUTF8(headers);
		HEAPU32[(buffer >> 2) + 1] = lengthBytesUTF8(response.url);
	},

	JS_WebRequest_GetResponseMetaData__proxy: 'sync',
	JS_WebRequest_GetResponseMetaData__sig: 'viiiii',
	JS_WebRequest_GetResponseMetaData__deps: ['$jsWebRequestGetResponseHeaderString'],
	JS_WebRequest_GetResponseMetaData: function(requestId, headerBuffer, headerSize, responseUrlBuffer, responseUrlSize)
	{
		var response = wr.responses[requestId];
		if (!response) {
		  stringToUTF8("", headerBuffer, headerSize);
		  stringToUTF8("", responseUrlBuffer, responseUrlSize);
          return;
        }

		if (headerBuffer) {
			var headers = jsWebRequestGetResponseHeaderString(requestId);
			stringToUTF8(headers, headerBuffer, headerSize);
		}

		if (responseUrlBuffer) {
			stringToUTF8(response.url, responseUrlBuffer, responseUrlSize);
		}
	},

	JS_WebRequest_Abort__proxy: 'sync',
	JS_WebRequest_Abort__sig: 'vi',
	JS_WebRequest_Abort: function (requestId)
	{
		var abortController = wr.abortControllers[requestId];
        if (!abortController || abortController.signal.aborted) {
            return;
        }

        abortController.abort();
	},

	JS_WebRequest_Release__proxy: 'sync',
	JS_WebRequest_Release__sig: 'vi',
	JS_WebRequest_Release: function (requestId)
	{
        // Clear timeout
		if (wr.timer[requestId]) {
			clearTimeout(wr.timer[requestId]);
		}

		// Remove all resources for request
		delete wr.requests[requestId];
		delete wr.responses[requestId];
		delete wr.abortControllers[requestId];
		delete wr.timer[requestId];
	}
};

autoAddDeps(LibraryWebRequestWebGL, '$wr');
mergeInto(LibraryManager.library, LibraryWebRequestWebGL);
