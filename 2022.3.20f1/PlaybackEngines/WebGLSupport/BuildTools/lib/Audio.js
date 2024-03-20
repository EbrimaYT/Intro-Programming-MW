var LibraryAudioWebGL = {
$WEBAudio: {
	audioInstanceIdCounter: 0,
	audioInstances: {},
	audioContext: null,
	audioWebEnabled: 0,
	audioCache: [],
	pendingAudioSources: {}
},

$jsAudioAddPendingBlockedAudio: function (sourceNode, offset) {
	WEBAudio.pendingAudioSources[sourceNode.mediaElement.src] = {
		sourceNode: sourceNode,
		offset: offset
	};
},

$jsAudioPlayPendingBlockedAudio: function(soundId) {
	var pendingAudio = WEBAudio.pendingAudioSources[soundId];
	pendingAudio.sourceNode._startPlayback(pendingAudio.offset);
	delete WEBAudio.pendingAudioSources[soundId];
},

$jsAudioPlayBlockedAudios__deps: ['$jsAudioPlayPendingBlockedAudio'],
$jsAudioPlayBlockedAudios: function() {
	Object.keys(WEBAudio.pendingAudioSources).forEach(function (audioId) {
		jsAudioPlayPendingBlockedAudio(audioId);
	});
},

/**
 * Mixin for setPitch and estimatePlaybackPosition functions
 * @param {AudioScheduledSourceNode} source An audio source
 */
$jsAudioMixinSetPitch: function (source) {
	// Add a helper to AudioBufferSourceNode which gives the current playback position of the clip in seconds.
	source.estimatePlaybackPosition = function () {
		var t = (WEBAudio.audioContext.currentTime - source.playbackStartTime) * source.playbackRate.value;
		// Collapse extra times that the audio clip has looped through.
		if (source.loop && t >= source.loopStart) {
			t = (t - source.loopStart) % (source.loopEnd - source.loopStart) + source.loopStart;
		}
		return t;
	}

	// Add a helper to AudioBufferSourceNode to allow adjusting pitch in a way that keeps playback position estimation functioning.
	source.setPitch = function (newPitch) {
		var curPosition = source.estimatePlaybackPosition();
		if (curPosition >= 0) { // If negative, the clip has not begun to play yet (that delay is not scaled by pitch)
			source.playbackStartTime = WEBAudio.audioContext.currentTime - curPosition / newPitch;
		}
		if (source.playbackRate.value !== newPitch) source.playbackRate.value = newPitch;
	}
},

/**
 * Get matching mime type string from a FMOD_SOUND_TYPE value
 * @param {number} fmodSoundType A sound type from the FMOD_SOUND_TYPE enum
 * @returns {string} A mime type string
 */
$jsAudioGetMimeTypeFromType: function (fmodSoundType) {
	switch(fmodSoundType)
	{
		case 13: // FMOD_SOUND_TYPE_MPEG
			return "audio/mpeg";
		case 20: // FMOD_SOUND_TYPE_WAV
			return "audio/wav";
		default: // Fallback to mp4 audio file for other types or if not set (works on most browsers)
			return "audio/mp4";
	}
},

$jsAudioCreateCompressedSoundClip__deps: ['$jsAudioMixinSetPitch', '$jsAudioAddPendingBlockedAudio', '$jsAudioGetMimeTypeFromType'],
/**
 * Create a compressed sound clip
 * @param {Uint8Array} audioData Compressed audio data
 * @param {number} fmodSoundType A sound type from the FMOD_SOUND_TYPE enum
 */
$jsAudioCreateCompressedSoundClip: function (audioData, fmodSoundType) {
	var mimeType = jsAudioGetMimeTypeFromType(fmodSoundType);
	var blob = new Blob([audioData], { type: mimeType });

	var soundClip = {
		url: URL.createObjectURL(blob),
		error: false,
		mediaElement: new Audio()
	};

	// An Audio element is created for the buffer so that we can access properties like duration
	// in JS_Sound_GetLength, which knows about the buffer object, but not the channel object.
	// This Audio element is used for metadata properties only, not for playback. Trying to play
	// back this Audio element would cause an error on Safari because it's not created in a
	// direct user event handler.
	soundClip.mediaElement.preload = "metadata";
	soundClip.mediaElement.src = soundClip.url;

	/**
	 * Release resources of a sound clip
	 */
	soundClip.release = function () {
		if (!this.mediaElement) {
			return;
		}

		this.mediaElement.src = "";
		URL.revokeObjectURL(this.url);
		delete this.mediaElement;
		delete this.url;
	}

	/**
	 * Get length of sound clip in number of samples
	 * @returns {number}
	 */
	soundClip.getLength = function () {
		// Convert duration (seconds) to number of samples.
		return this.mediaElement.duration * 44100;
	}
	/**
	 * Gets uncompressed audio data from sound clip.
	 * If output buffer is smaller than the sound data only the first portion
	 * of the sound data is read.
	 * Sound clips with multiple channels will be stored one after the other.
	 *
	 * @param {number} ptr Pointer to the output buffer
	 * @param {number} length Size of output buffer in bytes
	 * @returns Size of data in bytes written to output buffer
	 */
	 soundClip.getData = function (ptr, length) {
		console.warn("getData() is not supported for compressed sound.");

		return 0;
	}

	/**
	 * Gets number of channels of soundclip
	 * @returns {number}
	 */
	soundClip.getNumberOfChannels = function () {
		console.warn("getNumberOfChannels() is not supported for compressed sound.");

		return 0;
	}

	/**
	 * Gets sampling rate in Hz
	 * @returns {number}
	 */
	soundClip.getFrequency = function () {
		console.warn("getFrequency() is not supported for compressed sound.");

		return 0;
	}

	/**
	 * Create an audio source node
	 * @returns {MediaElementAudioSourceNode}
	 */
	soundClip.createSourceNode = function () {
		var self = this;
		var mediaElement = WEBAudio.audioCache.length ? WEBAudio.audioCache.pop() : new Audio();;
		mediaElement.preload = "metadata";
		mediaElement.src = this.url;
		var source = WEBAudio.audioContext.createMediaElementSource(mediaElement);

		Object.defineProperty(source, "loop", {
			get: function () {
				return source.mediaElement.loop;
			},
			set: function (v) {
				if (source.mediaElement.loop !== v) source.mediaElement.loop = v;
			}
		});

		source.playbackRate = {};
		Object.defineProperty(source.playbackRate, "value", {
			get: function () {
				return source.mediaElement.playbackRate;
			},
			set: function (v) {
				if (source.mediaElement.playbackRate !== v) source.mediaElement.playbackRate = v;
			}
		});
		Object.defineProperty(source, "currentTime", {
			get: function () {
				return source.mediaElement.currentTime;
			},
			set: function (v) {
				if (source.mediaElement.currentTime !== v) source.mediaElement.currentTime = v;
			}
		});
		Object.defineProperty(source, "mute", {
			get: function () {
				return source.mediaElement.mute;
			},
			set: function (v) {
				if (source.mediaElement.mute !== v) source.mediaElement.mute = v;
			}
		});
		Object.defineProperty(source, "onended", {
			get: function () {
				return source.mediaElement.onended;
			},
			set: function (onended) {
				source.mediaElement.onended = onended;
			}
		});

		source.playPromise = null;
		source.playTimeout = null;
		source.pauseRequested = false;
		source.isStopped = false;

		source._pauseMediaElement = function () {
			// If there is a play request still pending, then pausing now would cause an
			// error. Instead, mark that we want the audio paused as soon as it can be,
			// which will be when the play promise resolves.
			if (source.playPromise || source.playTimeout) {
				source.pauseRequested = true;
			} else {
				// If there is no play request pending, we can pause immediately.
				source.mediaElement.pause();
			}
		};

		source._startPlayback = function (offset) {
			if (source.playPromise || source.playTimeout) {
				source.mediaElement.currentTime = offset;
				source.pauseRequested = false;
				return;
			}

			source.mediaElement.currentTime = offset;
			source.playPromise = source.mediaElement.play();

			if (source.playPromise) {
				source.playPromise.then(function () {
					// If a pause was requested between play() and the MediaElement actually
					// starting, then pause it now.
					if (source.pauseRequested) {
						source.mediaElement.pause();
						source.pauseRequested = false;
					}
					source.playPromise = null;
				}).catch(function (error) {
					source.playPromise = null;
					if (error.name !== 'NotAllowedError')
						throw error;

					// Playing a media element may fail if there was no previous user interaction
					// Retry playback when there was a user interaction
					jsAudioAddPendingBlockedAudio(source, offset);
				});
			}
		};

		source.start = function (startTime, offset) {
			if (typeof startTime === "undefined") {
				startTime = WEBAudio.audioContext.currentTime;
			}

			if (typeof offset === "undefined") {
				offset = 0.0;
			}

			// Compare startTime to WEBAudio context currentTime, and if
			// startTime is more than about 4 msecs in the future, do a setTimeout() wait
			// for the remaining duration, and only then play. 4 msecs boundary because
			// setTimeout() is specced to throttle <= 4 msec waits if repeatedly called.
			var startDelayThresholdMS = 4;
			// Convert startTime and currentTime to milliseconds
			var startDelayMS = (startTime - WEBAudio.audioContext.currentTime) * 1000;
			if (startDelayMS > startDelayThresholdMS) {
				source.playTimeout = setTimeout(function () {
					source.playTimeout = null;
					source._startPlayback(offset);
				}, startDelayMS);
			} else {
				source._startPlayback(offset);
			}
		};

		source.stop = function (stopTime) {
			if (typeof stopTime === "undefined") {
				stopTime = WEBAudio.audioContext.currentTime;
			}

			// Compare stopTime to WEBAudio context currentTime, and if
			// stopTime is more than about 4 msecs in the future, do a setTimeout() wait
			// for the remaining duration, and only then stop. 4 msecs boundary because
			// setTimeout() is specced to throttle <= 4 msec waits if repeatedly called.
			var stopDelayThresholdMS = 4;
			// Convert startTime and currentTime to milliseconds
			var stopDelayMS = (stopTime - WEBAudio.audioContext.currentTime) * 1000;

			if (stopDelayMS > stopDelayThresholdMS) {
				setTimeout(function () {
					source._pauseMediaElement();
					source.isStopped = true;
				}, stopDelayMS);
			} else {
				source._pauseMediaElement();
				source.isStopped = true;
			}
		};

		jsAudioMixinSetPitch(source);

		return source;
	}

	return soundClip;
},

$jsAudioCreateUncompressedSoundClip__deps: ['$jsAudioMixinSetPitch'],
/**
 * Create an uncompressed sound clip
 * @param {AudioBuffer} buffer An AudioBuffer
 * @param {boolean} error True if an error occurred during creation
 * @returns {UncompressedSoundClip}
 */
$jsAudioCreateUncompressedSoundClip: function (buffer, error) {
	var soundClip = {
		buffer: buffer,
		error: error
	};

	/**
	 * Release resources of a sound clip
	 */
	soundClip.release = function () { };

	/**
	 * Get length of sound clip in number of samples
	 * @returns {number}
	 */
	soundClip.getLength = function () {
		if (!this.buffer) {
			console.log ("Trying to get length of sound which is not loaded.");
			return 0;
		}

		// Fakemod assumes sample rate is 44100, though that's not necessarily the case,
		// depending on OS, if the audio file was not imported by our pipeline.
		// Therefore we need to recalculate the length based on the actual samplerate.
		var sampleRateRatio = 44100 / this.buffer.sampleRate;
		return this.buffer.length * sampleRateRatio;
	}

	/**
	 * Gets uncompressed audio data from sound clip.
	 * If output buffer is smaller than the sound data only the first portion
	 * of the sound data is read.
	 * Sound clips with multiple channels will be stored one after the other.
	 *
	 * @param {number} ptr Pointer to the output buffer
	 * @param {number} length Size of output buffer in bytes
	 * @returns Size of data in bytes written to output buffer
	 */
	soundClip.getData = function (ptr, length) {
		if (!this.buffer) {
			console.log ("Trying to get data of sound which is not loaded.");
			return 0;
		}

		// Get output buffer
		var startOutputBuffer = ptr >> 2;
		var output = HEAPF32.subarray(startOutputBuffer, startOutputBuffer + (length >> 2));
		var numMaxSamples = Math.floor((length >> 2) / this.buffer.numberOfChannels);
		var numReadSamples = Math.min(this.buffer.length, numMaxSamples);

		// Copy audio data to outputbuffer
		for (var i = 0; i < this.buffer.numberOfChannels; i++) {
			var channelData = this.buffer.getChannelData(i).subarray(0, numReadSamples);
			output.set(channelData, i * numReadSamples);
		}

		return numReadSamples * this.buffer.numberOfChannels * 4;
	}

	/**
	 * Gets number of channels of soundclip
	 * @returns {number}
	 */
	soundClip.getNumberOfChannels = function () {
		if (!this.buffer) {
			console.log ("Trying to get metadata of sound which is not loaded.");
			return 0;
		}

		return this.buffer.numberOfChannels;
	}

	/**
	 * Gets sampling rate in Hz
	 * @returns {number}
	 */
	soundClip.getFrequency = function () {
		if (!this.buffer) {
			console.log ("Trying to get metadata of sound which is not loaded.");
			return 0;
		}

		return this.buffer.sampleRate;
	}

	/**
	 * Create an audio source node.
	 * @returns {AudioBufferSourceNode}
	 */
	soundClip.createSourceNode = function () {
		if (!this.buffer) {
			console.log ("Trying to play sound which is not loaded.");
		}

		var source = WEBAudio.audioContext.createBufferSource();
		source.buffer = this.buffer;
		jsAudioMixinSetPitch(source);

		return source;
	};

	return soundClip;
},

$jsAudioCreateUncompressedSoundClipFromPCM__deps: ['$jsAudioCreateUncompressedSoundClip'],
/**
 * Create an uncompressed sound clip
 * @param {number} channels Number of channels
 * @param {number} length Length of the sound clip
 * @param {number} sampleRate Sample rate of the sounde clip
 * @param {number} ptr Pointer to sound clip data
 * @returns {UncompressedSoundClip}
 */
$jsAudioCreateUncompressedSoundClipFromPCM: function (channels, length, sampleRate, ptr) {
	var buffer = WEBAudio.audioContext.createBuffer(channels, length, sampleRate);

	// Copy audio data to buffer
	for (var i = 0; i < channels; i++) {
		var offs = (ptr >> 2) + length * i;
		var copyToChannel = buffer['copyToChannel'] || function (source, channelNumber, startInChannel) {
			// Shim for copyToChannel on browsers which don't support it like Safari.
			var clipped = source.subarray(0, Math.min(source.length, this.length - (startInChannel | 0)));
			this.getChannelData(channelNumber | 0).set(clipped, startInChannel | 0);
		};
		copyToChannel.apply(buffer, [HEAPF32.subarray(offs, offs + length), i, 0]);
	}

	return jsAudioCreateUncompressedSoundClip(buffer, false);
},

$jsAudioCreateUncompressedSoundClipFromCompressedAudio__deps: ['$jsAudioCreateUncompressedSoundClip'],
/**
 * Create an uncompressed sound clip from compressed audio data
 * @param {Uint8Array} audioData Compressed audio data
 * @returns {UncompressedSoundClip}
 */
$jsAudioCreateUncompressedSoundClipFromCompressedAudio: function (audioData) {
	var soundClip = jsAudioCreateUncompressedSoundClip(null, false);

	WEBAudio.audioContext.decodeAudioData(
		audioData,
		function (_buffer) {
			soundClip.buffer = _buffer;
		},
		function (_error) {
			soundClip.error = true;
			console.log("Decode error: " + _error);
		}
	);

	return soundClip;
},

$jsAudioCreateChannel__deps: ['$jsAudioCreateUncompressedSoundClip'],
/**
 * Create a sound channel object
 * @param {number} callback Pointer to native callback(Called when playback ended)
 * @param {number} userData Pointer to user data for native callback
 */
$jsAudioCreateChannel: function (callback, userData) {
	var channel = {
		callback: callback,
		userData: userData,
		source: null,
		gain: WEBAudio.audioContext.createGain(),
		panner: WEBAudio.audioContext.createPanner(),
		threeD: false,
		loop: false,
		loopStart: 0,
		loopEnd: 0,
		pitch: 1.0
	};

	channel.panner.rolloffFactor = 0; // We calculate rolloff ourselves.

	/**
	 * Release internal resources.
	 */
	channel.release = function () {
		// Explicitly disconnect audio nodes related to this audio channel when the channel should be
		// GCd to work around Safari audio performance bug that resulted in crackling audio; as suggested
		// in https://bugs.webkit.org/show_bug.cgi?id=222098#c23
		this.disconnectSource();
		this.gain.disconnect();
		this.panner.disconnect();
	}

	/**
	 * Play a sound clip on the channel
	 * @param {UncompressedSoundClip|CompressedSoundClip} soundClip
	 * @param {number} startTime Scheduled start time in seconds
	 * @param {number} startOffset Start offset in seconds
	 */
	channel.playSoundClip = function (soundClip, startTime, startOffset) {
		try {
			var self = this;
			this.source = soundClip.createSourceNode();
			this.setupPanning();

			// Setup on ended callback
			this.source.onended = function () {
				self.source.isStopped = true;
				self.disconnectSource();
				if (self.callback) {
					dynCall("vi", self.callback, [self.userData]);
				}
			};

			this.source.loop = this.loop;
			this.source.loopStart = this.loopStart;
			this.source.loopEnd = this.loopEnd;
			this.source.start(startTime, startOffset);
			this.source.playbackStartTime = startTime - startOffset / this.source.playbackRate.value;
			this.source.setPitch(this.pitch);
		} catch (e) {
			// Need to catch exception, otherwise execution will stop on Safari if audio output is missing/broken
			console.error("Channel.playSoundClip error. Exception: " + e);
		}
	};

	/**
	 * Stop playback on channel
	 */
	channel.stop = function (delay) {
		if (!this.source) {
			return;
		}

		// stop source currently playing.
		try {
			channel.source.stop(WEBAudio.audioContext.currentTime + delay);
		} catch (e) {
			// when stop() is used more than once for the same source in Safari it causes the following exception:
			// InvalidStateError: DOM Exception 11: An attempt was made to use an object that is not, or is no longer, usable.
			// Ignore that exception.
		}

		if (delay == 0) {
			this.disconnectSource();
		}
	};

	/**
	 * Return wether the channel is currently paused
	 * @returns {boolean}
	 */
	channel.isPaused = function () {
		if (!this.source) {
			return true;
		}

		if (this.source.isPausedMockNode) {
			return true;
		}

		if (this.source.mediaElement) {
			return this.source.mediaElement.paused || this.source.pauseRequested;
		}

		return false;
	};

	/**
	 * Pause playback of channel
	 */
	channel.pause = function () {
		if (!this.source || this.source.isPausedMockNode) {
			return;
		}

		if (this.source.mediaElement) {
			this.source._pauseMediaElement();
			return;
		}

		// WebAudio does not have support for pausing and resuming AudioBufferSourceNodes (they are a fire-once abstraction)
		// When we want to pause a node, create a mocked object in its place that represents the needed state that is required
		// for resuming the clip.
		var pausedSource = {
			isPausedMockNode: true,
			buffer: this.source.buffer,
			loop: this.source.loop,
			loopStart: this.source.loopStart,
			loopEnd: this.source.loopEnd,
			playbackRate: this.source.playbackRate.value,
			scheduledStopTime: undefined,
			// Specifies in seconds the time at the clip where the playback was paused at.
			// Can be negative if the audio clip has not started yet.
			playbackPausedAtPosition: this.source.estimatePlaybackPosition(),
			setPitch: function (v) { this.playbackRate = v; },
			stop: function(when) { this.scheduledStopTime = when; }
		};
		// Stop and clear the real audio source...
		this.stop(0);
		this.disconnectSource();
		// .. and replace the source with a paused mock version.
		this.source = pausedSource;
	};

	/**
	 * Resume playback on channel.
	 */
	channel.resume = function () {
		// If the source is a compressed audio MediaElement, it was directly paused so we can
		// directly play it again.
		if (this.source && this.source.mediaElement) {
			this.source.start(undefined, this.source.currentTime);
			return;
		}

		// N.B. We only resume a source that has been previously paused. That is, resume() cannot be used to start playback if
		// channel was not playing an audio clip before, but playSoundClip() is to be used.
		if (!this.source || !this.source.isPausedMockNode) {
			return;
		}

		var pausedSource = this.source;
		var soundClip = jsAudioCreateUncompressedSoundClip(pausedSource.buffer, false);
		this.playSoundClip(soundClip, WEBAudio.audioContext.currentTime, Math.max(0, pausedSource.playbackPausedAtPosition));
		this.source.loop = pausedSource.loop;
		this.source.loopStart = pausedSource.loopStart;
		this.source.loopEnd = pausedSource.loopEnd;
		this.source.setPitch(pausedSource.playbackRate);

		// Apply scheduled stop of source if present
		if (typeof pausedSource.scheduledStopTime !== "undefined") {
			var delay = Math.max(pausedSource.scheduledStopTime - WEBAudio.audioContext.currentTime, 0);
			this.stop(delay);
		}
	};

	/**
	 * Set loop mode
	 * @param {boolean} loop If true audio will be looped.
	 */
	channel.setLoop = function (loop) {
		this.loop = loop;
		if (!this.source || this.source.loop == loop) {
			return;
		}

		this.source.loop = loop;
	}

	/**
	 * Set loop start and end
	 * @param {number} loopStart Start of the loop in seconds.
	 * @param {number} loopEnd End of the loop in seconds.
	 */
	channel.setLoopPoints = function (loopStart, loopEnd) {
		this.loopStart = loopStart;
		this.loopEnd = loopEnd;
		if (!this.source) {
			return;
		}

		if (this.source.loopStart !== loopStart) {
			this.source.loopStart = loopStart;
		}

		if (this.source.loopEnd !== loopEnd) {
			this.source.loopEnd = loopEnd;
		}
	}

	/**
	 * Set channel 3D mode
	 * @param {boolean} threeD If true the channel will be played back as 3D audio
	 */
	channel.set3D = function (threeD) {
		if (this.threeD == threeD) {
			return;
		}
		this.threeD = threeD;

		// Only update node graph is source is initialized
		if (!this.source) {
			return;
		}

		this.setupPanning();
	}

	/**
	 * Set the pitch of the channel
	 * @param {number} pitch Pitch of the channel
	 */
	channel.setPitch = function (pitch) {
		this.pitch = pitch;

		// Only update pitch if source is initialized
		if (!this.source) {
			return;
		}

		this.source.setPitch(pitch);
	}

	/**
	 * Set volume of channel
	 * @param {number} volume Volume of channel
	 */
	channel.setVolume = function (volume) {
		// Work around WebKit bug https://bugs.webkit.org/show_bug.cgi?id=222098
		// Updating volume only if it changes reduces sound distortion over time.
		// See case 1350204, 1348348 and 1352665
		if (this.gain.gain.value == volume) {
			return;
		}

		this.gain.gain.value = volume;
	}

	/**
	 * Set the 3D position of the audio channel
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 */
	channel.setPosition = function (x, y, z) {
		var p = this.panner;

		// Work around Chrome performance bug https://bugs.chromium.org/p/chromium/issues/detail?id=1133233
		// by only updating the PannerNode position if it has changed.
		// See case 1270768.
		if (p.positionX) {
			// Use new properties if they exist ...
			if (p.positionX.value !== x) p.positionX.value = x;
			if (p.positionY.value !== y) p.positionY.value = y;
			if (p.positionZ.value !== z) p.positionZ.value = z;
		} else if (p._x !== x || p._y !== y || p._z !== z) {
			// ... or the deprecated set function if they don't (and shadow cache the set values to avoid re-setting later)
			p.setPosition(x, y, z);
			p._x = x;
			p._y = y;
			p._z = z;
		}
	}

	/**
	 * Disconnect source node from graph
	 */
	channel.disconnectSource = function () {
		if (!this.source || this.source.isPausedMockNode) {
			return;
		}

		if (this.source.mediaElement) {
			// Pause playback of media element
			this.source._pauseMediaElement();
		}

		this.source.onended = null;
		this.source.disconnect();
		delete this.source;
	};

	/**
	 * Changes this audio channel to either 3D panning or 2D mode (no panning)
	 */
	channel.setupPanning = function () {
		// We have a mocked paused object in effect?
		if (this.source.isPausedMockNode) return;

		// Configure audio panning options either for 3D or 2D.
		this.source.disconnect();
		this.panner.disconnect();
		this.gain.disconnect();
		if (this.threeD) {
			// In 3D: AudioBufferSourceNode/MediaElementSourceNode -> PannerNode -> GainNode -> AudioContext.destination
			this.source.connect(this.panner);
			this.panner.connect(this.gain);
		} else {
			// In 2D: AudioBufferSourceNode/MediaElementSourceNode -> GainNode -> AudioContext.destination
			this.source.connect(this.gain);
		}
		this.gain.connect(WEBAudio.audioContext.destination);
	}

	/**
	 * Returns wether playback on a channel is stopped.
	 * @returns {boolean} Returns true if playback on channel is stopped.
	 */
	 channel.isStopped = function () {
		if (!this.source) {
			// Uncompressed audio
			// No playback source -> channel is stopped
			return true;
		}

		if (this.source.mediaElement) {
			// Compressed audio
			return this.source.isStopped;
		} 

		return false;
	}

	return channel;
},

JS_Sound_Init__proxy: 'sync',
JS_Sound_Init__sig: 'v',
JS_Sound_Init__deps: ['$jsAudioPlayBlockedAudios'],
JS_Sound_Init: function () {
	try {
		window.AudioContext = window.AudioContext || window.webkitAudioContext;
		WEBAudio.audioContext = new AudioContext();

		var tryToResumeAudioContext = function () {
			if (WEBAudio.audioContext.state === 'suspended')
				WEBAudio.audioContext.resume().catch(function (error) {
					console.warn("Could not resume audio context. Exception: " + error);
				});
			else
				Module.clearInterval(resumeInterval);
		};
		var resumeInterval = Module.setInterval(tryToResumeAudioContext, 400);

		WEBAudio.audioWebEnabled = 1;

		// Safari has the restriction where Audio elements need to be created from a direct user event,
		// even if the rest of the audio playback requirements is that a user event has happeend
		// at some point previously. The AudioContext also needs to be resumed, if paused, from a
		// direct user event. Catch user events here and use them to fill a cache of Audio
		// elements to be used by the rest of the system.
		var _userEventCallback = function () {
			try {
				// On Safari, resuming the audio context needs to happen from a user event.
				// The AudioContext is suspended by default, and on iOS if the user switches tabs
				// and comes back, it will be interrupted. Touching the page will resume audio
				// playback.
				if (WEBAudio.audioContext.state !== "running" && WEBAudio.audioContext.state !== "closed") {
					WEBAudio.audioContext.resume().catch(function (error) {
						console.warn("Could not resume audio context. Exception: " + error);
					});
				}

				// Play blocked audio elements
				jsAudioPlayBlockedAudios();

				// How many audio elements should we cache? How many compressed audio channels might
				// be played at a single time?
				var audioCacheSize = 20;
				while (WEBAudio.audioCache.length < audioCacheSize) {
					var audio = new Audio();
					audio.autoplay = false;
					WEBAudio.audioCache.push(audio);
				}
			} catch (e) {
				// Audio error, but don't need to notify here, they would have already been
				// informed of audio errors.
			}
		};
		window.addEventListener("mousedown", _userEventCallback);
		window.addEventListener("touchstart", _userEventCallback);

		// Make sure we release the event listeners when the app quits to avoid leaking memory.
		Module.deinitializers.push(function () {
			window.removeEventListener("mousedown", _userEventCallback);
			window.removeEventListener("touchstart", _userEventCallback);
		});
	}
	catch (e) {
		alert('Web Audio API is not supported in this browser');
	}
},

JS_Sound_ReleaseInstance__proxy: 'async',
JS_Sound_ReleaseInstance__sig: 'vi',
JS_Sound_ReleaseInstance: function (instance) {
	var object = WEBAudio.audioInstances[instance];
	if (object) {
		object.release();
	}

	// Let the GC free up the audio object.
	delete WEBAudio.audioInstances[instance];
},

JS_Sound_Load_PCM__proxy: 'sync',
JS_Sound_Load_PCM__sig: 'iiiii',
JS_Sound_Load_PCM__deps: ['$jsAudioCreateUncompressedSoundClipFromPCM'],
JS_Sound_Load_PCM: function (channels, length, sampleRate, ptr) {
	if (WEBAudio.audioWebEnabled == 0)
		return 0;

	var sound = jsAudioCreateUncompressedSoundClipFromPCM(channels, length, sampleRate, ptr);

	WEBAudio.audioInstances[++WEBAudio.audioInstanceIdCounter] = sound;
	return WEBAudio.audioInstanceIdCounter;
},

JS_Sound_Load__proxy: 'sync',
JS_Sound_Load__sig: 'iiiii',
JS_Sound_Load__deps: ['$jsAudioCreateUncompressedSoundClipFromCompressedAudio', '$jsAudioCreateCompressedSoundClip'],
JS_Sound_Load: function (ptr, length, decompress, fmodSoundType) {
	if (WEBAudio.audioWebEnabled == 0)
		return 0;

#if USE_PTHREADS
	// AudioContext.decodeAudioData() does not currently allow taking in a view to a
	// SharedArrayBuffer, so make a copy of the data over to a regular ArrayBuffer instead.
	// See https://github.com/WebAudio/web-audio-api/issues/1850
	var audioData = new ArrayBuffer(length);
	new Uint8Array(audioData).set(HEAPU8.subarray(ptr, ptr + length));
#else
	var audioData = HEAPU8.buffer.slice(ptr, ptr + length);
#endif

	// We don't ever want to play back really small audio clips as compressed, the compressor has a startup CPU cost,
	// and replaying the same audio clip multiple times (either individually or when looping) has an unwanted CPU
	// overhead if the same data will be decompressed on demand again and again. Hence we want to play back small
	// audio files always as fully uncompressed in memory.

	// However this will be a memory usage tradeoff.

	// Tests with aac audio sizes in a .m4a container shows:
	// 2.11MB stereo 44.1kHz .m4a file containing 90 seconds of 196kbps aac audio decompresses to 30.3MB of float32 PCM data. (~14.3x size increase)
	// 721KB stereo 44.1kHz .m4a file 29 seconds of 196kbps aac audio decompresses to 10.0MB of float32 PCM data. (~14x size increase)
	// 6.07KB mono 44.1kHZ .m4a file containing 1 second of 101kbps aac audio decompresses to 72kB of float32 PCM data. (~11x size increase)
	// -> overall AAC compression factor is ~10x-15x.

	// Based on above, take 128KB as a cutoff size: if we have a .m4a clip that is smaller than this,
	// we always uncompress it up front, receiving at most ~1.8MB of raw audio data, which can hold about ~10 seconds of mono audio.
	// In other words, heuristically all audio clips <= mono ~10 seconds (5 seconds if stereo) in duration will be always fully uncompressed in memory.
	if (length < 131072) decompress = 1;

	var sound;
	if (decompress) {
		sound = jsAudioCreateUncompressedSoundClipFromCompressedAudio(audioData);
	} else {
		sound = jsAudioCreateCompressedSoundClip(audioData, fmodSoundType);
	}

	WEBAudio.audioInstances[++WEBAudio.audioInstanceIdCounter] = sound;

	return WEBAudio.audioInstanceIdCounter;
},

JS_Sound_Create_Channel__proxy: 'sync',
JS_Sound_Create_Channel__sig: 'vii',
JS_Sound_Create_Channel__deps: ['$jsAudioCreateChannel'],
JS_Sound_Create_Channel: function (callback, userData)
{
	if (WEBAudio.audioWebEnabled == 0)
		return;

	WEBAudio.audioInstances[++WEBAudio.audioInstanceIdCounter] = jsAudioCreateChannel(callback, userData);
	return WEBAudio.audioInstanceIdCounter;
},

JS_Sound_Play__proxy: 'sync',
JS_Sound_Play__sig: 'viiii',
JS_Sound_Play: function (bufferInstance, channelInstance, offset, delay)
{
	if (WEBAudio.audioWebEnabled == 0)
		return;

	// stop sound clip which is currently playing in the channel.
	_JS_Sound_Stop(channelInstance, 0);

	var soundClip = WEBAudio.audioInstances[bufferInstance];
	var channel = WEBAudio.audioInstances[channelInstance];

	if (!soundClip) {
		console.log("Trying to play sound which is not loaded.");
		return;
	}

	try {
		channel.playSoundClip(soundClip, WEBAudio.audioContext.currentTime + delay, offset);
	} catch (error) {
		console.error("playSoundClip error. Exception: " + e);
	}
},

JS_Sound_SetLoop__proxy: 'sync',
JS_Sound_SetLoop__sig: 'vii',
JS_Sound_SetLoop: function (channelInstance, loop)
{
	if (WEBAudio.audioWebEnabled == 0)
		return;

	var channel = WEBAudio.audioInstances[channelInstance];
	channel.setLoop(loop);
},

JS_Sound_SetLoopPoints__proxy: 'sync',
JS_Sound_SetLoopPoints__sig: 'vidd',
JS_Sound_SetLoopPoints: function (channelInstance, loopStart, loopEnd)
{
	if (WEBAudio.audioWebEnabled == 0)
		return;
	var channel = WEBAudio.audioInstances[channelInstance];
	channel.setLoopPoints(loopStart, loopEnd);
},

JS_Sound_Set3D__proxy: 'sync',
JS_Sound_Set3D__sig: 'vii',
JS_Sound_Set3D: function (channelInstance, threeD)
{
	var channel = WEBAudio.audioInstances[channelInstance];
	channel.set3D(threeD);
},

JS_Sound_Stop__proxy: 'sync',
JS_Sound_Stop__sig: 'vid',
JS_Sound_Stop: function (channelInstance, delay)
{
	if (WEBAudio.audioWebEnabled == 0)
		return;

	var channel = WEBAudio.audioInstances[channelInstance];
	channel.stop(delay);
},

JS_Sound_SetPosition__proxy: 'sync',
JS_Sound_SetPosition__sig: 'viddd',
JS_Sound_SetPosition: function (channelInstance, x, y, z)
{
	if (WEBAudio.audioWebEnabled == 0)
		return;

	var channel = WEBAudio.audioInstances[channelInstance];
	channel.setPosition(x, y, z);
},

JS_Sound_SetVolume__proxy: 'sync',
JS_Sound_SetVolume__sig: 'vid',
JS_Sound_SetVolume: function (channelInstance, v)
{
	if (WEBAudio.audioWebEnabled == 0)
		return;

	try {
		var channel = WEBAudio.audioInstances[channelInstance];
		channel.setVolume(v);
	} catch (e) {
		console.error('JS_Sound_SetVolume(channel=' + channelInstance + ', volume=' + v + ') threw an exception: ' + e);
	}
},

JS_Sound_SetPaused__proxy: 'sync',
JS_Sound_SetPaused__sig: 'vii',
JS_Sound_SetPaused: function (channelInstance, paused)
{
	if (WEBAudio.audioWebEnabled == 0)
		return;
	var channel = WEBAudio.audioInstances[channelInstance];
	if (paused != channel.isPaused()) {
		if (paused) channel.pause();
		else channel.resume();
	}
},

JS_Sound_SetPitch__proxy: 'sync',
JS_Sound_SetPitch__sig: 'vid',
JS_Sound_SetPitch: function (channelInstance, v)
{
	if (WEBAudio.audioWebEnabled == 0)
		return;

	try {
		var channel = WEBAudio.audioInstances[channelInstance];
		channel.setPitch(v);
	} catch (e) {
		console.error('JS_Sound_SetPitch(channel=' + channelInstance + ', pitch=' + v + ') threw an exception: ' + e);
	}
},

JS_Sound_SetListenerPosition__proxy: 'sync',
JS_Sound_SetListenerPosition__sig: 'vddd',
JS_Sound_SetListenerPosition: function (x, y, z)
{
	if (WEBAudio.audioWebEnabled == 0)
		return;

	var l = WEBAudio.audioContext.listener;

	// Do not re-set same values here if the orientation has not changed. This avoid unpredictable performance issues in Chrome
	// and Safari Web Audio implementations.
	if (l.positionX) {
		// Use new properties if they exist ...
		if (l.positionX.value !== x) l.positionX.value = x;
		if (l.positionY.value !== y) l.positionY.value = y;
		if (l.positionZ.value !== z) l.positionZ.value = z;
	} else if (l._positionX !== x || l._positionY !== y || l._positionZ !== z) {
		// ... and old deprecated setPosition if new properties are not supported.
		l.setPosition(x, y, z);
		l._positionX = x;
		l._positionY = y;
		l._positionZ = z;
	}
},

JS_Sound_SetListenerOrientation__proxy: 'sync',
JS_Sound_SetListenerOrientation__sig: 'vdddddd',
JS_Sound_SetListenerOrientation: function (x, y, z, xUp, yUp, zUp)
{
	if (WEBAudio.audioWebEnabled == 0)
		return;

	// Web Audio uses a RHS coordinate system, Unity uses LHS, causing orientations to be flipped.
	// So we pass a negative direction here to compensate, otherwise channels will be flipped.
	x = -x;
	y = -y;
	z = -z;

	var l = WEBAudio.audioContext.listener;

	// Do not re-set same values here if the orientation has not changed. This avoid unpredictable performance issues in Chrome
	// and Safari Web Audio implementations.
	if (l.forwardX) {
		// Use new properties if they exist ...
		if (l.forwardX.value !== x) l.forwardX.value = x;
		if (l.forwardY.value !== y) l.forwardY.value = y;
		if (l.forwardZ.value !== z) l.forwardZ.value = z;

		if (l.upX.value !== xUp) l.upX.value = xUp;
		if (l.upY.value !== yUp) l.upY.value = yUp;
		if (l.upZ.value !== zUp) l.upZ.value = zUp;
	} else if (l._forwardX !== x || l._forwardY !== y || l._forwardZ !== z || l._upX !== xUp || l._upY !== yUp || l._upZ !== zUp) {
		// ... and old deprecated setOrientation if new properties are not supported.
		l.setOrientation(x, y, z, xUp, yUp, zUp);
		l._forwardX = x;
		l._forwardY = y;
		l._forwardZ = z;
		l._upX = xUp;
		l._upY = yUp;
		l._upZ = zUp;
	}
},

JS_Sound_GetLoadState__proxy: 'sync',
JS_Sound_GetLoadState__sig: 'ii',
JS_Sound_GetLoadState: function (bufferInstance)
{
	if (WEBAudio.audioWebEnabled == 0)
		return 2;

	var sound = WEBAudio.audioInstances[bufferInstance];
	if (sound.error)
		return 2;
	if (sound.buffer || sound.url)
		return 0;
	return 1;
},

JS_Sound_ResumeIfNeeded__proxy: 'sync',
JS_Sound_ResumeIfNeeded__sig: 'v',
JS_Sound_ResumeIfNeeded: function ()
{
	if (WEBAudio.audioWebEnabled == 0)
		return;

	if (WEBAudio.audioContext.state === 'suspended')
		WEBAudio.audioContext.resume().catch(function (error) {
			console.warn("Could not resume audio context. Exception: " + error);
		});

},

JS_Sound_GetLength__proxy: 'sync',
JS_Sound_GetLength__sig: 'ii',
JS_Sound_GetLength: function (bufferInstance)
{
	if (WEBAudio.audioWebEnabled == 0)
		return 0;

	var soundClip = WEBAudio.audioInstances[bufferInstance];

	if (!soundClip)
		return 0;

	return soundClip.getLength();
},

JS_Sound_GetData__proxy: 'sync',
JS_Sound_GetData__sig: 'iiii',
JS_Sound_GetData: function (bufferInstance, ptr, length)
{
	if (WEBAudio.audioWebEnabled == 0)
		return 0;

	var soundClip = WEBAudio.audioInstances[bufferInstance];

	if (!soundClip)
		return 0;

	return soundClip.getData(ptr, length);
},

JS_Sound_GetMetaData__proxy: 'sync',
JS_Sound_GetMetaData__sig: 'iii',
JS_Sound_GetMetaData: function (bufferInstance, metaData)
{
	if (WEBAudio.audioWebEnabled == 0)
	{
		HEAPU32[metaData >> 2] = 0;
		HEAPU32[(metaData >> 2) + 1] = 0;
		return false;
	}

	var soundClip = WEBAudio.audioInstances[bufferInstance];

	if (!soundClip)
	{

		HEAPU32[metaData >> 2] = 0;
		HEAPU32[(metaData >> 2) + 1] = 0;
		return false;
	}


	HEAPU32[metaData >> 2] = soundClip.getNumberOfChannels();
	HEAPU32[(metaData >> 2) + 1] = soundClip.getFrequency();

	return true;
},

JS_Sound_IsStopped__proxy: 'sync',
JS_Sound_IsStopped__sig: 'ii',
JS_Sound_IsStopped: function (channelInstance)
{
	if (WEBAudio.audioWebEnabled == 0)
		return true;
	
	var channel = WEBAudio.audioInstances[channelInstance];
	if (!channel)
		return true;

	return channel.isStopped();
}

};

autoAddDeps(LibraryAudioWebGL, '$WEBAudio');
mergeInto(LibraryManager.library, LibraryAudioWebGL);
