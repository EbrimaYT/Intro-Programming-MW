var videoInputDevices = []; // Set to null to disable video input devices altogether.
var videoInputDevicesEnumerated = false;
var removeEnumerateMediaDevicesRunDependency;
var enumerateWatchdog = null;

// Bug/limitation: Chrome does not specify deviceIds for any MediaDeviceInfo input devices at least in Chrome 85 on Windows 10
// This means that we need to use an awkward heuristic way of matching old video input connections to new ones.
function matchToOldDevice(newDevice) {
	var oldDevices = Object.keys(videoInputDevices);
	// First match by deviceId
	for(var i = 0; i < oldDevices.length; ++i) {
		var old = videoInputDevices[oldDevices[i]];
		if (old.deviceId && old.deviceId == newDevice.deviceId) return old;
	}
	// Then by object identity, in case that is supported.
	for(var i = 0; i < oldDevices.length; ++i) {
		var old = videoInputDevices[oldDevices[i]];
		if (old == newDevice) return old;
	}
	// Then by label
	for(var i = 0; i < oldDevices.length; ++i) {
		var old = videoInputDevices[oldDevices[i]];
		if (old.label && old.label == newDevice.label) return old;
	}
	// Last, by groupId + kind combination
	for(var i = 0; i < oldDevices.length; ++i) {
		var old = videoInputDevices[oldDevices[i]];
		if (old.groupId && old.kind && old.groupId == newDevice.groupId && old.kind == newDevice.kind) return old;
	}
}

function assignNewVideoInputId() {
	for(var i = 0;; ++i) {
		if (!videoInputDevices[i]) return i;
	}
}

function updateVideoInputDevices(devices) {
	removeEnumerateMediaDevicesRunDependency();
	// we're going to clear the list of videoInputDevices and regenerate it to get more accurate info after being granted camera access
	videoInputDevices = [];
	var retainedDevices = {};
	var newDevices = [];

	// Find devices that still exist
	devices.forEach(function (device) {
		if (device.kind === 'videoinput') { // Only interested in WebCam inputs
			var oldDevice = matchToOldDevice(device);
			if (oldDevice) {
				retainedDevices[oldDevice.id] = oldDevice;
			} else {
				newDevices.push(device);
			}
		}
	});
	videoInputDevices = retainedDevices;

	// Assign IDs to video input devices that are new
	newDevices.forEach(function (device) {
		if (!device.id) {
			device.id = assignNewVideoInputId();
			// Attempt to name the device. In both Firefox and Chrome, label is null.
			// In Chrome, deviceId is null. (could use it here, but human-readable
			// name is probably better than a long hash)
			device.name = device.label || ("Video input #" + (device.id + 1));

			// Chrome 85 on Android labels camera provides devices with labels like
			// "camera2 0, facing back" and "camera2 1, facing front", use that to
			// determine whether the device is front facing or not.
			// some labels don't provide that info, like the camera on a 2019 MacbookPro: FaceTime HD Camera (Built-in)
			// so if there's no "front" or "back" in the label or name, we're going to assume it's front facing


			device.isFrontFacing = device.name.toLowerCase().includes('front') || (!(device.name.toLowerCase().includes('front')) && !(device.name.toLowerCase().includes('back')));

			videoInputDevices[device.id] = device;
		}
	});
}

function enumerateMediaDeviceList() {
	if (!videoInputDevices) return;
	// Bug/limitation: If there are multiple video or audio devices connected,
	// Chrome only lists one of each category (audioinput/videoinput/audioutput) (tested Chrome 85 on Windows 10)
	navigator.mediaDevices.enumerateDevices().then(function(devices) {
		updateVideoInputDevices(devices);
		videoInputDevicesEnumerated = true;
	}).catch(function(e) {
		console.warn('Unable to enumerate media devices: ' + e + '\nWebcams will not be available.');
		disableAccessToMediaDevices();
	});

	// Work around Firefox 81 bug on Windows:
	// https://bugzilla.mozilla.org/show_bug.cgi?id=1397977, devicechange
	// events do not fire, so resort to polling for device changes once every
	// 60 seconds.
	if (/Firefox/.test(navigator.userAgent)) {
		setTimeout(enumerateMediaDeviceList, 60000);
		warnOnce('Applying workaround to Firefox bug https://bugzilla.mozilla.org/show_bug.cgi?id=1397977');
	}
}

function disableAccessToMediaDevices() {
	// Safari 11 has navigator.mediaDevices, but navigator.mediaDevices.add/removeEventListener is undefined
	if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
		navigator.mediaDevices.removeEventListener('devicechange', enumerateMediaDeviceList);
	}
	videoInputDevices = null;
}
Module['disableAccessToMediaDevices'] = disableAccessToMediaDevices;

if (!navigator.mediaDevices) {
	console.warn('navigator.mediaDevices not supported by this browser. Webcam access will not be available.' + (location.protocol == 'https:' ? '' : ' Try hosting the page over HTTPS, because some browsers disable webcam access when insecure HTTP is being used.'));
	disableAccessToMediaDevices();
} else if (typeof ENVIRONMENT_IS_PTHREAD === "undefined" || !ENVIRONMENT_IS_PTHREAD) setTimeout(function() {
	try {
		// Do not start engine main() until we have completed enumeration.
		addRunDependency('enumerateMediaDevices');
		removeEnumerateMediaDevicesRunDependency = function() {
			if (enumerateWatchdog !== null) clearTimeout(enumerateWatchdog);
			removeRunDependency('enumerateMediaDevices');
			if (navigator.mediaDevices) console.log('navigator.mediaDevices support available');
			removeEnumerateMediaDevicesRunDependency = function(){};
		}
		// Enumerate media devices now at startup..
		enumerateMediaDeviceList();
		// Firefox won't complete device enumeration if the window isn't in focus causing the startup to hang, so we
		// wait a second before removing the dependency and starting with an empty list of devices. Moving forward it's
		// likely more browsers will assume this standard.
		// See https://w3c.github.io/mediacapture-main/#dom-mediadevices-enumeratedevices
		enumerateWatchdog = setTimeout(removeEnumerateMediaDevicesRunDependency, 1000);

		// .. and whenever the connected devices list changes.
		navigator.mediaDevices.addEventListener('devicechange', enumerateMediaDeviceList);
	} catch(e) {
		console.warn('Unable to enumerate media devices: ' + e);
		disableAccessToMediaDevices();
	}
}, 0);
