var LibraryWebCamWebGL = {
	$activeWebCams: {},
	$cameraAccess: 0, //0 = access unknown, 1 = access granted, 2 = access denied

	JS_WebCam_IsSupported__proxy: 'sync',
	JS_WebCam_IsSupported__sig: 'i',
	JS_WebCam_IsSupported: function() {
		return !!navigator.mediaDevices;
	},

	JS_AsyncWebCam_GetPermission__proxy: 'sync',
	JS_AsyncWebCam_GetPermission__sig: 'vii',
	JS_AsyncWebCam_GetPermission__deps: ['$cameraAccess'],
	JS_AsyncWebCam_GetPermission: function(op, onWebcamAccessResponse) {
		if (!navigator.mediaDevices) {
			cameraAccess = 2;
			{{{ makeDynCall('vi', 'onWebcamAccessResponse') }}}(op);
			return;
		}
		navigator.mediaDevices.getUserMedia({
			audio: false,
			video: true
		}).then(function(stream) {
        	//getUserMedia requests for permission (we want this) and starts the webcam (we don't want this), we're going to immediately turn it off after getting permission
      		var tracks = stream.getVideoTracks();
      		tracks.forEach(function(track) {
        		track.stop();
      		});
			cameraAccess = 1;
			navigator.mediaDevices.enumerateDevices().then(function(devices) {
				updateVideoInputDevices(devices);
				{{{ makeDynCall('vi', 'onWebcamAccessResponse') }}}(op);
			});
      	}).catch(function(err) {
			cameraAccess = 2;
			{{{ makeDynCall('vi', 'onWebcamAccessResponse') }}}(op);
      	});
  	},

	JS_GetCurrentCameraAccessState__proxy: 'sync',
	JS_GetCurrentCameraAccessState__sig: 'i',
	JS_GetCurrentCameraAccessState__deps: ['$cameraAccess'],
	JS_GetCurrentCameraAccessState: function() {
		return cameraAccess;
	},


	JS_WebCamVideo_GetNumDevices__proxy: 'sync',
	JS_WebCamVideo_GetNumDevices__sig: 'i',
	JS_WebCamVideo_GetNumDevices: function() {
		var numDevices = 0;
		if (!videoInputDevicesEnumerated) {
			console.warn(
							'WebCam devices were used before being enumerated by the browser. The browser is likely ' +
							'pausing WebCam device enumeration due to the page being out of focus while the Unity ' +
							'application is being loaded in the background.\n' +
							'If you are a developer, you can ensure WebCam devices are enumerated by first requiring ' +
							'user interaction.\n' +
							'See https://github.com/w3c/mediacapture-main/issues/905 for details.'
						);
			return numDevices;
		}

		// If a WebCam is disconnected in the middle of the list,
		// we keep reporting that index as (disconnected), so
		// find the max ID of devices as the device count.
		Object.keys(videoInputDevices).forEach(function(i) {
			numDevices = Math.max(numDevices, videoInputDevices[i].id+1);
		});

		return numDevices;
	},

	JS_WebCamVideo_GetDeviceName__proxy: 'sync',
	JS_WebCamVideo_GetDeviceName__sig: 'iiii',
	JS_WebCamVideo_GetDeviceName: function(deviceId, buffer, bufferSize) {
		var webcam = videoInputDevices[deviceId];
		var name = webcam ? webcam.name : '(disconnected input #' + (deviceId + 1) + ')';
		if (buffer) stringToUTF8(name, buffer, bufferSize);
		return lengthBytesUTF8(name);
	},

	JS_WebCamVideo_IsFrontFacing__proxy: 'sync',
	JS_WebCamVideo_IsFrontFacing__sig: 'iiii',
	JS_WebCamVideo_IsFrontFacing: function(deviceId) {
		return videoInputDevices[deviceId].isFrontFacing;
	},

	JS_WebCamVideo_GetNativeWidth__proxy: 'sync',
	JS_WebCamVideo_GetNativeWidth__sig: 'ii',
	JS_WebCamVideo_GetNativeWidth__deps: ['$activeWebCams'],
	JS_WebCamVideo_GetNativeWidth: function(deviceId) {
		return activeWebCams[deviceId] && activeWebCams[deviceId].video.videoWidth;
	},

	JS_WebCamVideo_GetNativeHeight__proxy: 'sync',
	JS_WebCamVideo_GetNativeHeight__sig: 'ii',
	JS_WebCamVideo_GetNativeHeight__deps: ['$activeWebCams'],
	JS_WebCamVideo_GetNativeHeight: function(deviceId) {
		return activeWebCams[deviceId] && activeWebCams[deviceId].video.videoHeight;
	},

	JS_WebCamVideo_Start__proxy: 'sync',
	JS_WebCamVideo_Start__sig: 'vi',
	JS_WebCamVideo_Start__deps: ['$activeWebCams'],
	JS_WebCamVideo_Start: function(deviceId) {
		// Is the given WebCam device already enabled?
		if (activeWebCams[deviceId]) {
			++activeWebCams[deviceId].refCount;
			return;
		}

		// No webcam exists with given ID?
		if (!videoInputDevices[deviceId]) {
			console.error('Cannot start video input with ID ' + deviceId + '. No such ID exists! Existing video inputs are:');
			console.dir(videoInputDevices);
			return;
		}

		navigator.mediaDevices.getUserMedia({
			audio: false,
			video: videoInputDevices[deviceId].deviceId ? {
				deviceId: { exact: videoInputDevices[deviceId].deviceId }
			} : true
		}).then(function(stream) {
			var video = document.createElement('video');
			video.srcObject = stream;

			if (/(iPhone|iPad|iPod)/.test(navigator.userAgent)) {
				warnOnce('Applying iOS Safari specific workaround to video playback: https://bugs.webkit.org/show_bug.cgi?id=217578');
				video.setAttribute('playsinline', '');
			}

			video.play();
			activeWebCams[deviceId] = {
				video: video,
				stream: stream,
				// Webcams will likely operate on a lower framerate than 60fps, i.e. 30/25/24/15 or something like that. We will be polling
				// every frame to grab a new video frame, so obtain the actual frame rate of the video device so that we can avoid capturing
				// the same video frame multiple times, when we know that a new video frame cannot yet have been produced.
				frameLengthInMsecs: 1000 / stream.getVideoTracks()[0].getSettings().frameRate,
				nextFrameAvailableTime: 0,
				refCount: 1
			};
		}).catch(function(e) {
			console.error('Unable to start video input! ' + e);
		});
	},

	JS_WebCamVideo_CanPlay__proxy: 'sync',
	JS_WebCamVideo_CanPlay__sig: 'ii',
	JS_WebCamVideo_CanPlay__deps: ['$activeWebCams'],
	JS_WebCamVideo_CanPlay: function(deviceId) {
		var webcam = activeWebCams[deviceId];
		return webcam && webcam.video.videoWidth > 0 && webcam.video.videoHeight > 0;
	},

	JS_WebCamVideo_Stop__proxy: 'sync',
	JS_WebCamVideo_Stop__sig: 'vi',
	JS_WebCamVideo_Stop__deps: ['$activeWebCams'],
	JS_WebCamVideo_Stop: function(deviceId) {
		var webcam = activeWebCams[deviceId];
		if (!webcam) return;

		if (--webcam.refCount <= 0) {
			webcam.video.pause();
			webcam.video.srcObject = null;
			webcam.stream.getVideoTracks().forEach(function(track) {
				track.stop();
			});
			delete activeWebCams[deviceId];
		}
	},

	JS_WebCamVideo_Update__proxy: 'sync',
	JS_WebCamVideo_Update__sig: 'viiii',
	JS_WebCamVideo_Update__deps: ['$activeWebCams'],
	JS_WebCamVideo_Update: function(deviceId, textureId, destWidth, destHeight) {
		var webcam = activeWebCams[deviceId];
		if (!webcam) return;

		//HTML images have the opposite Y direction as GL, so we're telling WebGL to flip the Y of the texture image
		GLctx.pixelStorei(GLctx.UNPACK_FLIP_Y_WEBGL, true);

		var webCamTexture = webcam.video;

		// If we need to do texture resizing, we'll use the canvas to accomplish that, otherwise, we'll upload the video directly,
		// if this becomes a performance problem at some point, we can do it using a framebuffer instead
		if (webcam.video.videoWidth != destWidth || webcam.video.videoHeight != destHeight)
		{
			if (!webcam.canvas)
			{
				webcam.canvas = document.createElement('canvas');
			}
			var canvas = webcam.canvas;
			if (canvas.width != destWidth || canvas.height != destHeight || !webcam.context2d)
			{
				canvas.width = destWidth;
				canvas.height = destHeight;
				// Chrome and Firefox bug? After resizing the canvas, the 2D context
				// needs to be reacquired or the resize does not apply.
				webcam.context2d = canvas.getContext('2d');
			}
			var context = webcam.context2d;
            context.drawImage(webcam.video, 0, 0, webcam.video.videoWidth, webcam.video.videoHeight, 0, 0, destWidth, destHeight);
            webCamTexture = canvas;
		}
		GLctx.bindTexture(GLctx.TEXTURE_2D, GL.textures[textureId]);
		GLctx.texSubImage2D(GLctx.TEXTURE_2D, 0/*mipLevel*/, 0, 0, GLctx.RGBA, GLctx.UNSIGNED_BYTE, webCamTexture);
		GLctx.pixelStorei(GLctx.UNPACK_FLIP_Y_WEBGL, false);
	},
};

mergeInto(LibraryManager.library, LibraryWebCamWebGL);
