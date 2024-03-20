var LibraryVideoWebGL = {
$videoInstances: {},
$videoInstanceIdCounter: 0,
$hasSRGBATextures: null,
$s2lTexture: null,
$s2lFBO: null,
$s2lVBO: null,
$s2lProgram: null,
$s2lVertexPositionNDC: null,

// Callback handler that is called when a single loop iteration of the video finishes.
$jsVideoEnded: function() {
	if (this.onendedCallback) {
		dynCall_vi(this.onendedCallback, this.onendedRef);
	}
},

$jsVideoAllAudioTracksAreDisabled: function(v) {
	// If we have not yet configured audio tracks, default to assuming we have one enabled
	// track.
	if (!v.enabledTracks) return false;

	// Check if none of the audio tracks are currenly enabled.
	for (var i = 0; i < v.enabledTracks.length; ++i) {
		if (v.enabledTracks[i])
			return false;
	}
	return true;
},

// Browser will block video autoplay when they contain non-muted audio. We will place such blocked video clips to this
// set, and try to re-play them when user clicks on the web page that will unblock video autoplay.
$jsVideoPendingBlockedVideos: {},

$jsVideoAddPendingBlockedVideo__deps: ['$jsVideoPendingBlockedVideos', '$jsVideoAttemptToPlayBlockedVideos'],
$jsVideoAddPendingBlockedVideo: function(video, v) {
	if (Object.keys(jsVideoPendingBlockedVideos).length == 0) {
		window.addEventListener('mousedown', jsVideoAttemptToPlayBlockedVideos, true);
		window.addEventListener('touchstart', jsVideoAttemptToPlayBlockedVideos, true);
	}

	jsVideoPendingBlockedVideos[video] = v;
},

$jsVideoPlayPendingBlockedVideo__deps: ['$jsVideoPendingBlockedVideos', '$jsVideoRemovePendingBlockedVideo'],
$jsVideoPlayPendingBlockedVideo: function(video) {
	jsVideoPendingBlockedVideos[video].play().then(function() {
		jsVideoRemovePendingBlockedVideo(video);
	});
},

$jsVideoRemovePendingBlockedVideo__deps: ['$jsVideoPendingBlockedVideos', '$jsVideoAttemptToPlayBlockedVideos'],
$jsVideoRemovePendingBlockedVideo: function(video) {
	delete jsVideoPendingBlockedVideos[video];
	if (Object.keys(jsVideoPendingBlockedVideos).length == 0) {
		window.removeEventListener('mousedown', jsVideoAttemptToPlayBlockedVideos);
		window.removeEventListener('touchstart', jsVideoAttemptToPlayBlockedVideos);
	}
},

$jsVideoAttemptToPlayBlockedVideos__deps: ['$jsVideoPendingBlockedVideos', '$jsVideoPendingBlockedVideos', '$jsVideoPlayPendingBlockedVideo', '$jsVideoRemovePendingBlockedVideo'],
$jsVideoAttemptToPlayBlockedVideos: function() {
	for (var i in jsVideoPendingBlockedVideos) {
		if (jsVideoPendingBlockedVideos.hasOwnProperty(i)) jsVideoPlayPendingBlockedVideo(i);
	}
},

$jsVideoCreateTexture2D: function() {
        var t = GLctx.createTexture();
        GLctx.bindTexture(GLctx.TEXTURE_2D, t);
        GLctx.texParameteri(GLctx.TEXTURE_2D, GLctx.TEXTURE_WRAP_S, GLctx.CLAMP_TO_EDGE);
        GLctx.texParameteri(GLctx.TEXTURE_2D, GLctx.TEXTURE_WRAP_T, GLctx.CLAMP_TO_EDGE);
        GLctx.texParameteri(GLctx.TEXTURE_2D, GLctx.TEXTURE_MIN_FILTER, GLctx.LINEAR);
        return t;
},

JS_Video_Create__proxy: 'sync',
JS_Video_Create__sig: 'ii',
JS_Video_Create__deps: ['$videoInstances', '$videoInstanceIdCounter', '$jsVideoEnded', '$hasSRGBATextures'],
JS_Video_Create: function(url)
{
	var str = UTF8ToString(url);
	var video = document.createElement('video');
	video.style.display = 'none';
	video.src = str;
	video.muted = true;
	// Fix for iOS: Set muted and playsinline attribute to disable fullscreen playback
	video.setAttribute("muted", "");
	video.setAttribute("playsinline", "");

	// Enable CORS on the request fetching the video so the browser accepts
	// playing it.  This is needed since the data is fetched and used
	// programmatically - rendering into a canvas - and not displayed normally.
	video.crossOrigin = "anonymous";

	videoInstances[++videoInstanceIdCounter] = video;

	// Firefox and Webkit have a bug that makes GLctx.SRGB8_ALPHA8 not work consistently.
	// This means linearized video textures will not have an alpha channel until we can get
	// that format working consistently.
	// https://bugzilla.mozilla.org/show_bug.cgi?id=1696693
	// https://bugs.webkit.org/show_bug.cgi?id=222822
	if (hasSRGBATextures == null)
		hasSRGBATextures = Module.SystemInfo.browser == "Chrome" || Module.SystemInfo.browser == "Edge";

	return videoInstanceIdCounter;
},

JS_Video_UpdateToTexture__proxy: 'sync',
JS_Video_UpdateToTexture__sig: 'iiii',
JS_Video_UpdateToTexture__deps: ['$jsVideoCreateTexture2D', '$hasSRGBATextures', '$s2lTexture', '$s2lFBO', '$s2lVBO', '$s2lProgram', '$s2lVertexPositionNDC'],
JS_Video_UpdateToTexture: function(video, tex, adjustToLinearspace)
{
	var v = videoInstances[video];

	// If the source video has not yet loaded (size is reported as 0), ignore uploading
	// The videoReady property is set when the play promise resolves. The video isn't truly
	// ready, even if its resolution properties have been updated, until that promise resolves.
	if (!(v.videoWidth > 0 && v.videoHeight > 0))
		return false;

	// If video is still going on the same video frame as before, ignore reuploading as well
	if (v.lastUpdateTextureTime === v.currentTime)
		return false;

	// While seeking, currentTime will already have the new destination time, but the onseeked
	// callback has not been invoked yet, meaning the returned image is not updated (or at least,
	// this is undefined). So we avoid updating the texture during seek so that our frameReady
	// callbacks won't become ambiguous.
	if (v.seeking)
		return false;

	v.lastUpdateTextureTime = v.currentTime;

	GLctx.pixelStorei(GLctx.UNPACK_FLIP_Y_WEBGL, true);

	// Instead of using GLcx.SRGB8_ALPHA8 or GLctx.SRGB8 for the internal format when linearizing
	// (and let the driver deal with the conversion) we perform the conversion to linear using a
	// shader to bypass performance issues observed on many browsers (Safari, Chrome/Win, Chrome/Mac,
	// Edge).
	//
	// For example, the frame rate drop when converting a 1080p clip to linear on these browsers
	// on Windows was from ~30fps (without linearization) to 17fps with linearization, and from 60
	// fps to 38 on Mac (test systems differed, but the relative fps drop is what matters).
	var internalFormat = adjustToLinearspace ? (hasSRGBATextures ? GLctx.RGBA : GLctx.RGB) : GLctx.RGBA;
	var format = adjustToLinearspace ? (hasSRGBATextures ? GLctx.RGBA : GLctx.RGB) : GLctx.RGBA;

	// It is not possible to get the source pixel aspect ratio of the video from
	// HTMLViewElement, which is problematic when we get anamorphic content. The videoWidth &
	// videoHeight properties report the frame size _after_ the pixel aspect ratio stretch has
	// been applied, but without this ratio ever being exposed. The caller has presumably
	// created the destination texture using the width/height advertized with the
	// post-pixel-aspect-ratio info (from JS_Video_Width and JS_Video_Height), which means it
	// may be incorrectly sized. As a workaround, we re-create the texture _without_
	// initializing its storage. The call to texImage2D ends up creating the appropriately-sized
	// storage. This may break the caller's assumption if the texture was created with properties
	// other than what is selected below. But for the specific (and currently dominant) case of
	// using Video.js with the VideoPlayer, this provides a workable solution.
	//
	// We do this texture re-creation every time we notice the videoWidth/Height has changed in
	// case the stream changes resolution.
	//
	// We could constantly call texImage2D instead of using texSubImage2D on subsequent calls,
	// but texSubImage2D has less overhead because it does not reallocate the storage.
	if (v.previousUploadedWidth != v.videoWidth || v.previousUploadedHeight != v.videoHeight) {
		GLctx.deleteTexture(GL.textures[tex]);
		var t = jsVideoCreateTexture2D();
		t.name = tex;
		GL.textures[tex] = t;

		v.previousUploadedWidth = v.videoWidth;
		v.previousUploadedHeight = v.videoHeight;

		if (adjustToLinearspace) {
			GLctx.texImage2D(GLctx.TEXTURE_2D, 0, internalFormat, v.videoWidth, v.videoHeight, 0, format, GLctx.UNSIGNED_BYTE, null);
			if (!s2lTexture) {
				s2lTexture = jsVideoCreateTexture2D();
			} else {
				GLctx.bindTexture(GLctx.TEXTURE_2D, s2lTexture);
			}
		}

		GLctx.texImage2D(GLctx.TEXTURE_2D, 0, internalFormat, format, GLctx.UNSIGNED_BYTE, v);
	} else {
		if (adjustToLinearspace) {
			if (!s2lTexture) {
				s2lTexture = jsVideoCreateTexture2D();
			} else {
				GLctx.bindTexture(GLctx.TEXTURE_2D, s2lTexture);
			}
		} else {
			GLctx.bindTexture(GLctx.TEXTURE_2D, GL.textures[tex]);
		}
		// Using texSubImage2D here would seem like the right thing to do for better
		// performance. However, this produces errors on (at least) Chrome/Mac, Chrome/Win
		// and Edge. The error is
		//
		//     GL_INVALID_OPERATION: The destination level of the destination texture must be defined.
		//
		// texSubImage2D does work on Firefox/Mac and Safari so we could enable this better
		// path on these browsers for better performance (at the cost of having more
		// complexity for browsers that are far from the majority).
		GLctx.texImage2D(GLctx.TEXTURE_2D, 0, internalFormat, format, GLctx.UNSIGNED_BYTE, v);
	}

	GLctx.pixelStorei(GLctx.UNPACK_FLIP_Y_WEBGL, false);

	if (adjustToLinearspace) {
		if (s2lProgram == null) {
			var vertexShaderCode = `precision lowp float;
				attribute vec2 vertexPositionNDC;
				varying vec2 vTexCoords;
				const vec2 scale = vec2(0.5, 0.5);
				void main() {
				    vTexCoords = vertexPositionNDC * scale + scale; // scale vertex attribute to [0,1] range
				    gl_Position = vec4(vertexPositionNDC, 0.0, 1.0);
				}`;

			var fragmentShaderCode = `precision mediump float;
				uniform sampler2D colorMap;
				varying vec2 vTexCoords;
				vec4 toLinear(vec4 sRGB) {
				    vec3 c = sRGB.rgb;
				    return vec4(c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878), sRGB.a);
				}
				void main() {
				    gl_FragColor = toLinear(texture2D(colorMap, vTexCoords));
				}`;

			var vertexShader = GLctx.createShader(GLctx.VERTEX_SHADER);
			GLctx.shaderSource(vertexShader, vertexShaderCode);
			GLctx.compileShader(vertexShader);

			var fragmentShader = GLctx.createShader(GLctx.FRAGMENT_SHADER);
			GLctx.shaderSource(fragmentShader, fragmentShaderCode);
			GLctx.compileShader(fragmentShader);

			s2lProgram = GLctx.createProgram();
			GLctx.attachShader(s2lProgram, vertexShader);
			GLctx.attachShader(s2lProgram, fragmentShader);
			GLctx.linkProgram(s2lProgram);

			s2lVertexPositionNDC = GLctx.getAttribLocation(s2lProgram, "vertexPositionNDC");
		}

		if (s2lVBO == null) {
			s2lVBO = GLctx.createBuffer();
			GLctx.bindBuffer(GLctx.ARRAY_BUFFER, s2lVBO);

			var verts = [
				// First triangle
				1.0,  1.0,
				-1.0,  1.0,
				-1.0, -1.0,
				// Second triangle
				-1.0, -1.0,
				1.0, -1.0,
				1.0,  1.0
			];
			GLctx.bufferData(GLctx.ARRAY_BUFFER, new Float32Array(verts), GLctx.STATIC_DRAW);
		}

		if (!s2lFBO) {
			s2lFBO = GLctx.createFramebuffer();
		}

		GLctx.bindFramebuffer(GLctx.FRAMEBUFFER, s2lFBO);
		GLctx.framebufferTexture2D(GLctx.FRAMEBUFFER, GLctx.COLOR_ATTACHMENT0, GLctx.TEXTURE_2D, GL.textures[tex], 0);
		GLctx.bindTexture(GLctx.TEXTURE_2D, s2lTexture);

		GLctx.viewport(0, 0, v.videoWidth, v.videoHeight);
		GLctx.useProgram(s2lProgram);
		GLctx.bindBuffer(GLctx.ARRAY_BUFFER, s2lVBO);
		GLctx.enableVertexAttribArray(s2lVertexPositionNDC);
		GLctx.vertexAttribPointer(s2lVertexPositionNDC, 2, GLctx.FLOAT, false, 0, 0);
		GLctx.drawArrays(GLctx.TRIANGLES, 0, 6);

		// Have to reset the viewport rect ourselves, otherwise further drawing in
		// the scene will use the wrong viewport.
		GLctx.viewport(0, 0, GLctx.canvas.width, GLctx.canvas.height);
		GLctx.bindFramebuffer(GLctx.FRAMEBUFFER, null);
	}

	return true;
},

JS_Video_Destroy__proxy: 'sync',
JS_Video_Destroy__sig: 'vi',
JS_Video_Destroy__deps: ['$jsVideoRemovePendingBlockedVideo'],
JS_Video_Destroy: function(video)
{
	var v = videoInstances[video];
	if (v.loopEndPollInterval) {
		clearInterval(v.loopEndPollInterval);
	}
	jsVideoRemovePendingBlockedVideo(video);
	// Reset video source to cancel download of video file
	v.src = "";
	// Clear the registered event handlers so that we won't get any events from phantom videos.
	delete v.onendedCallback;
	v.onended = v.onerror = v.oncanplay = v.onseeked = null;
	// And let browser GC the video object itself.
	delete videoInstances[video];
},

JS_Video_Play__proxy: 'sync',
JS_Video_Play__sig: 'vii',
JS_Video_Play__deps: ['JS_Video_SetLoop', '$jsVideoAllAudioTracksAreDisabled', '$jsVideoAddPendingBlockedVideo'],
JS_Video_Play: function(video, muted)
{
	var v = videoInstances[video];
	v.muted = muted || jsVideoAllAudioTracksAreDisabled(v);
	var promise = v.play();
	if (promise) promise.catch(function(e) {
		if (e.name == 'NotAllowedError') jsVideoAddPendingBlockedVideo(video, v);
	});
	// Set up the loop ended handler.
	_JS_Video_SetLoop(video, v.loop);
},

JS_Video_Pause__proxy: 'sync',
JS_Video_Pause__sig: 'vi',
JS_Video_Pause__deps: ['$jsVideoRemovePendingBlockedVideo'],
JS_Video_Pause: function(video)
{
	var v = videoInstances[video];
	v.pause();

	jsVideoRemovePendingBlockedVideo(video);

	// Clear loop end polling, if one is in effect, to conserve performance.
	if (v.loopEndPollInterval) {
		clearInterval(v.loopEndPollInterval);
	}
},

JS_Video_Seek__proxy: 'sync',
JS_Video_Seek__sig: 'vii',
JS_Video_Seek: function(video, time)
{
	var v = videoInstances[video];
	v.lastSeenPlaybackTime = v.currentTime = time;
},

JS_Video_SetLoop__proxy: 'sync',
JS_Video_SetLoop__sig: 'vii',
JS_Video_SetLoop__deps: ['$jsVideoEnded'],
JS_Video_SetLoop: function(video, loop)
{
	var v = videoInstances[video];
	if (v.loopEndPollInterval) {
		clearInterval(v.loopEndPollInterval);
	}

	v.loop = loop;
	if (loop) {
		// When video is looping, we must manually poll to observe the completion
		// of a loop iteration. See https://bugzilla.mozilla.org/show_bug.cgi?id=1668591
		v.loopEndPollInterval = setInterval(function() {
			var cur = v.currentTime;
			var last = v.lastSeenPlaybackTime;
			if (cur < last) {
				// If time rewinds, we need to make sure it rewinds "enough" because
				// time sometimes rewinds "just a bit" while we're adjusting playback
				// speed to help keeping up with the clock source.
				var dur = v.duration;
				var margin = 0.2;
				var closeToBegin = margin * dur;
				var closeToEnd = dur - closeToBegin;
				if (cur < closeToBegin && last > closeToEnd)
					jsVideoEnded.apply(v);
			}
			v.lastSeenPlaybackTime = v.currentTime;
		}, 1000/30); // Poll loop completion at at 30fps
		v.lastSeenPlaybackTime = v.currentTime;
		v.onended = null;
	} else {
		// When video is not looping, we can use the usual onended handler.
		v.onended = jsVideoEnded;
	}
},

JS_Video_SetMute__proxy: 'sync',
JS_Video_SetMute__sig: 'vii',
JS_Video_SetMute__deps: ['$jsVideoAllAudioTracksAreDisabled'],
JS_Video_SetMute: function(video, muted)
{
	var v = videoInstances[video];
	v.muted = muted || jsVideoAllAudioTracksAreDisabled(v);
},

JS_Video_SetPlaybackRate__proxy: 'sync',
JS_Video_SetPlaybackRate__sig: 'vii',
JS_Video_SetPlaybackRate: function(video, rate)
{
	videoInstances[video].playbackRate = rate;
},

JS_Video_GetPlaybackRate__proxy: 'sync',
JS_Video_GetPlaybackRate__sig: 'di',
JS_Video_GetPlaybackRate: function(video)
{
	return videoInstances[video].playbackRate;
},

JS_Video_GetNumAudioTracks__proxy: 'sync',
JS_Video_GetNumAudioTracks__sig: 'ii',
JS_Video_GetNumAudioTracks: function(video)
{
	var tracks = videoInstances[video].audioTracks;
	// For browsers that don't support the audioTracks property, let's assume
	// there is one.
	return tracks ? tracks.length : 1;
},

JS_Video_GetAudioLanguageCode__proxy: 'sync',
JS_Video_GetAudioLanguageCode__sig: 'iii',
JS_Video_GetAudioLanguageCode: function(video, trackIndex)
{
	var tracks = videoInstances[video].audioTracks;
	if (!tracks)
		return "";
	var track = tracks[trackIndex];
	return track ? track.language : "";
},

JS_Video_EnableAudioTrack__proxy: 'sync',
JS_Video_EnableAudioTrack__sig: 'viii',
JS_Video_EnableAudioTrack: function(video, trackIndex, enabled)
{
	var v = videoInstances[video];

	// Keep a manual track of enabled audio tracks for browsers that
	// do not support the <video>.audioTracks property
	if (!v.enabledTracks) v.enabledTracks = [];
	while (v.enabledTracks.length <= trackIndex) v.enabledTracks.push(true);
	v.enabledTracks[trackIndex] = enabled;

	// Apply the enabled state to the audio track if browser supports it.
	var tracks = v.audioTracks;
	if (!tracks)
		return;
	var track = tracks[trackIndex];
	if (track)
		track.enabled = enabled ? true : false;
},

JS_Video_SetVolume__proxy: 'sync',
JS_Video_SetVolume__sig: 'vii',
JS_Video_SetVolume: function(video, volume)
{
	videoInstances[video].volume = volume;
},

JS_Video_Height__proxy: 'sync',
JS_Video_Height__sig: 'ii',
JS_Video_Height: function(video)
{
	return videoInstances[video].videoHeight;
},

JS_Video_Width__proxy: 'sync',
JS_Video_Width__sig: 'ii',
JS_Video_Width: function(video)
{
	return videoInstances[video].videoWidth;
},

JS_Video_Time__proxy: 'sync',
JS_Video_Time__sig: 'ii',
JS_Video_Time: function(video)
{
	return videoInstances[video].currentTime;
},

JS_Video_Duration__proxy: 'sync',
JS_Video_Duration__sig: 'ii',
JS_Video_Duration: function(video)
{
	return videoInstances[video].duration;
},

JS_Video_IsReady__proxy: 'sync',
JS_Video_IsReady__sig: 'ii',
JS_Video_IsReady: function(video)
{
	var v = videoInstances[video];
	// Fix for iOS: readyState is only set to have HAVE_METADATA
	// until video.play() is called.
	// Wait for HAVE_ENOUGH_DATA on other platforms.
	var targetReadyState = /(iPhone|iPad)/i.test(navigator.userAgent) ? v.HAVE_METADATA : v.HAVE_ENOUGH_DATA;

	// If the ready state is targer ready state or higher, we can start playing.
	if (!v.isReady &&
		v.readyState >= targetReadyState)
		v.isReady = true;
	return v.isReady;
},

JS_Video_IsPlaying__proxy: 'sync',
JS_Video_IsPlaying__sig: 'ii',
JS_Video_IsPlaying: function(video)
{
	var v = videoInstances[video];
	return !v.paused && !v.ended;
},

JS_Video_IsSeeking__proxy: 'sync',
JS_Video_IsSeeking__sig: 'ii',
JS_Video_IsSeeking: function(video)
{
	var v = videoInstances[video];
	return v.seeking;
},

JS_Video_SetErrorHandler__proxy: 'sync',
JS_Video_SetErrorHandler__sig: 'viii',
JS_Video_SetErrorHandler: function(video, ref, onerror)
{
	videoInstances[video].onerror = function(evt) {
		dynCall_vii(onerror, ref, evt.target.error.code);
	};
},

JS_Video_SetReadyHandler__proxy: 'sync',
JS_Video_SetReadyHandler__sig: 'viii',
JS_Video_SetReadyHandler: function(video, ref, onready)
{
	videoInstances[video].oncanplay = function() {
		dynCall_vi(onready, ref);
	};
},

JS_Video_SetEndedHandler__proxy: 'sync',
JS_Video_SetEndedHandler__sig: 'viii',
JS_Video_SetEndedHandler: function(video, ref, onended)
{
	var v = videoInstances[video];
	v.onendedCallback = onended;
	v.onendedRef = ref;
},

JS_Video_SetSeekedHandler__proxy: 'sync',
JS_Video_SetSeekedHandler__sig: 'viii',
JS_Video_SetSeekedHandler: function(video, ref, onseeked)
{
	videoInstances[video].onseeked = function() {
		var v = videoInstances[video];
		// Clear the last update time so that the next texture update is not ignored.
		// The seek is triggered by setting currentTime, so when it settles, there will
		// not necessarily be a change of currentTime (e.g.: Safari does nudge the time
		// value a bit if needed to be perfectly aligned on frame boundary, but not
		// Chrome/macOS).
		v.lastUpdateTextureTime = null;
		dynCall_vi(onseeked, ref);
	}
},

$jsSupportedVideoFormats: [],
$jsUnsupportedVideoFormats: [],

JS_Video_CanPlayFormat__proxy: 'sync',
JS_Video_CanPlayFormat__sig: 'ii',
JS_Video_CanPlayFormat__deps: ['$jsSupportedVideoFormats', '$jsUnsupportedVideoFormats'],
JS_Video_CanPlayFormat: function(format)
{
	format = UTF8ToString(format);
	if (jsSupportedVideoFormats.indexOf(format) != -1) return true;
	if (jsUnsupportedVideoFormats.indexOf(format) != -1) return false;
	var video = document.createElement('video');
	var canPlay = video.canPlayType(format);
	if (canPlay) jsSupportedVideoFormats.push(format);
	else jsUnsupportedVideoFormats.push(format);
	return !!canPlay;
}

};
autoAddDeps(LibraryVideoWebGL, '$videoInstances');
mergeInto(LibraryManager.library, LibraryVideoWebGL);
