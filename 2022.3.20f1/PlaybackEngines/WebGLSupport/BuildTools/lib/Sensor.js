// Sensor API support for a series of physical sensors available on mobile web devices
// Interface here divides sensors according to W3C Sensor API with the following notes:
// - If Sensor API is not available (Safari, FireFox) it falls back to DeviceMotionEvent and DeviceOrientationEvent
// - If the Gravity Sensor API is present (Chrome M91) it will be used, othewise it is calculated from the Accelerometer and LinearAccelerationSensor
// - Units are adjusted to what Unity wants
// - All use the device coordinate system, compensation for screen orientation is not handled here
mergeInto(LibraryManager.library, {
    $JS_OrientationSensor_frequencyRequest: 0,
    $JS_OrientationSensor_callback: 0,
    $JS_OrientationSensor: null,

    $JS_Accelerometer_frequencyRequest: 0,
    $JS_Accelerometer_callback: 0,
    $JS_Accelerometer: null,
    $JS_Accelerometer_multiplier: 1,

    $JS_LinearAccelerationSensor_frequencyRequest: 0,
    $JS_LinearAccelerationSensor_callback: 0,
    $JS_LinearAccelerationSensor: null,

    $JS_GravitySensor_frequencyRequest: 0,
    $JS_GravitySensor_callback: 0,
    $JS_GravitySensor: null,
    // If Gravity API is not present, then the Gravity sensor is calculated from Accelerometer and LinearAccelerationSensor
    // So we need some extra info about them
    $JS_Accelerometer_frequency: 0,
    $JS_Accelerometer_lastValue: {x:0, y:0, z:0},
    $JS_LinearAccelerationSensor_frequency: 0,

    $JS_Gyroscope_frequencyRequest: 0,
    $JS_Gyroscope_callback: 0,
    $JS_Gyroscope: null,

    $JS_DeviceSensorPermissions: 0,

    $JS_DefineAccelerometerMultiplier__deps: ['$JS_Accelerometer_multiplier'],
    $JS_DefineAccelerometerMultiplier: function() {
        // Earth's gravity in m/s^2, same as ASENSOR_STANDARD_GRAVITY
        var g = 9.80665;

        // Multiplier is 1/g to normalize acceleration
        // iOS has its direction opposite to Android and Windows (tested Surface Pro tablet)
        // We include Macintosh in the test to capture Safari on iOS viewing in Desktop mode (the default now on iPads)
        JS_Accelerometer_multiplier = (/(iPhone|iPad|Macintosh)/i.test(navigator.userAgent)) ? 1/g : -1/g;
    },

    JS_RequestDeviceSensorPermissionsOnTouch__deps: ['$JS_DeviceSensorPermissions', '$JS_RequestDeviceSensorPermissions'],
    JS_RequestDeviceSensorPermissionsOnTouch: function() {
        if (JS_DeviceSensorPermissions == 0) return;

        // Re-request any required device sensor permissions (iOS requires that permissions are requested on a user interaction event)
        JS_RequestDeviceSensorPermissions(JS_DeviceSensorPermissions);
    },

    $JS_RequestDeviceSensorPermissions__deps: ['$JS_DeviceSensorPermissions'],
    $JS_RequestDeviceSensorPermissions: function(permissions) {
        // iOS requires that we request permissions before using device sensor events
        if (permissions & 1/*DeviceOrientationEvent permission*/) {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(function(permissionState) {
                        if (permissionState === 'granted') {
                            JS_DeviceSensorPermissions &= ~1; // Remove DeviceOrientationEvent permission bit
                        } else {
                            warnOnce("DeviceOrientationEvent permission not granted");
                        }
                    })
                    .catch(function(err) {
                        // Permissions cannot be requested unless on a user interaction (a touch event)
                        // So in this case set JS_DeviceSensorPermissions and we will try again on a touch event
                        warnOnce(err);
                        JS_DeviceSensorPermissions |= 1/*DeviceOrientationEvent permission*/;
                    });
            }
        }
        if (permissions & 2/*DeviceMotionEvent permission*/) {
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                DeviceMotionEvent.requestPermission()
                    .then(function(permissionState) {
                        if (permissionState === 'granted') {
                            JS_DeviceSensorPermissions &= ~2; // Remove DeviceMotionEvent permission bit
                        } else {
                            warnOnce("DeviceMotionEvent permission not granted");
                        }
                    })
                    .catch(function(err) {
                        // Permissions cannot be requested unless on a user interaction (a touch event)
                        // So in this case set JS_DeviceSensorPermissions and we will try again on a touch event
                        warnOnce(err);
                        JS_DeviceSensorPermissions |= 2/*DeviceMotionEvent permission*/;
                    });
            }
        }
    },

    $JS_OrientationSensor_eventHandler__deps: ['$JS_OrientationSensor', '$JS_OrientationSensor_callback'],
    $JS_OrientationSensor_eventHandler: function() {
        if (JS_OrientationSensor_callback != 0)
            dynCall_vffff(JS_OrientationSensor_callback, JS_OrientationSensor.quaternion[0], JS_OrientationSensor.quaternion[1], JS_OrientationSensor.quaternion[2], JS_OrientationSensor.quaternion[3]);
    },

    $JS_Accelerometer_eventHandler__deps: ['$JS_Accelerometer',
        '$JS_Accelerometer_callback',
        '$JS_Accelerometer_multiplier',
        '$JS_Accelerometer_lastValue'],
    $JS_Accelerometer_eventHandler: function() {
        // Record the last value for gravity computation
        JS_Accelerometer_lastValue = {
            x: JS_Accelerometer.x * JS_Accelerometer_multiplier,
            y: JS_Accelerometer.y * JS_Accelerometer_multiplier,
            z: JS_Accelerometer.z * JS_Accelerometer_multiplier
        };
        if (JS_Accelerometer_callback != 0)
            dynCall_vfff(JS_Accelerometer_callback, JS_Accelerometer_lastValue.x, JS_Accelerometer_lastValue.y, JS_Accelerometer_lastValue.z);
    },

    $JS_ComputeGravity__deps: [],
    $JS_ComputeGravity: function(accelerometerValue, linearAccelerationValue) {
        // On some Android devices, the linear acceleration direction is reversed compared to its accelerometer
        // So, compute both the difference and sum (difference of the negative) and return the one that's the smallest in magnitude
        var difference = {
            x: accelerometerValue.x - linearAccelerationValue.x,
            y: accelerometerValue.y - linearAccelerationValue.y,
            z: accelerometerValue.z - linearAccelerationValue.z
        };
        var differenceMagnitudeSq = difference.x*difference.x + difference.y*difference.y + difference.z*difference.z;

        var sum = {
            x: accelerometerValue.x + linearAccelerationValue.x,
            y: accelerometerValue.y + linearAccelerationValue.y,
            z: accelerometerValue.z + linearAccelerationValue.z
        };
        var sumMagnitudeSq = sum.x*sum.x + sum.y*sum.y + sum.z*sum.z;

        return (differenceMagnitudeSq <= sumMagnitudeSq) ? difference : sum;
    },

    $JS_LinearAccelerationSensor_eventHandler__deps: ['$JS_LinearAccelerationSensor',
        '$JS_LinearAccelerationSensor_callback',
        '$JS_GravitySensor_callback',
        '$JS_Accelerometer_multiplier',
        '$JS_Accelerometer_lastValue',
        '$JS_ComputeGravity'],
    $JS_LinearAccelerationSensor_eventHandler: function() {
        var linearAccelerationValue = {
            x: JS_LinearAccelerationSensor.x * JS_Accelerometer_multiplier,
            y: JS_LinearAccelerationSensor.y * JS_Accelerometer_multiplier,
            z: JS_LinearAccelerationSensor.z * JS_Accelerometer_multiplier
        };
        if (JS_LinearAccelerationSensor_callback != 0)
            dynCall_vfff(JS_LinearAccelerationSensor_callback, linearAccelerationValue.x, linearAccelerationValue.y, linearAccelerationValue.z);

        // Calculate and call the Gravity callback if the Gravity Sensor API isn't present
        if (JS_GravitySensor_callback != 0 && typeof GravitySensor === 'undefined') {
            var gravityValue = JS_ComputeGravity(JS_Accelerometer_lastValue, linearAccelerationValue);
            dynCall_vfff(JS_GravitySensor_callback, gravityValue.x, gravityValue.y, gravityValue.z);
        }
    },

    $JS_GravitySensor_eventHandler__deps: ['$JS_GravitySensor', '$JS_GravitySensor_callback', '$JS_Accelerometer_multiplier'],
    $JS_GravitySensor_eventHandler: function() {
        if (JS_GravitySensor_callback != 0)
            dynCall_vfff(JS_GravitySensor_callback,
                JS_GravitySensor.x * JS_Accelerometer_multiplier,
                JS_GravitySensor.y * JS_Accelerometer_multiplier,
                JS_GravitySensor.z * JS_Accelerometer_multiplier);
    },

    $JS_Gyroscope_eventHandler__deps: ['$JS_Gyroscope', '$JS_Gyroscope_callback'],
    $JS_Gyroscope_eventHandler: function() {
        // Radians per second
        if (JS_Gyroscope_callback != 0)
            dynCall_vfff(JS_Gyroscope_callback, JS_Gyroscope.x, JS_Gyroscope.y, JS_Gyroscope.z);
    },

    $JS_DeviceOrientation_eventHandler__deps: ['$JS_OrientationSensor_callback'],
    $JS_DeviceOrientation_eventHandler: function(event) {
        if (JS_OrientationSensor_callback) {
            // OBSERVATION: On Android Firefox, absolute = false, webkitCompassHeading = null
            // OBSERVATION: On iOS Safari, absolute is undefined, webkitCompassHeading and webkitCompassAccuracy are set

            // Convert alpha, beta, gamma Euler angles to a quaternion
            var degToRad = Math.PI / 180;
            var x = event.beta * degToRad;
            var y = event.gamma * degToRad;
            var z = event.alpha * degToRad;

            var cx = Math.cos(x/2);
            var sx = Math.sin(x/2);
            var cy = Math.cos(y/2);
            var sy = Math.sin(y/2);
            var cz = Math.cos(z/2);
            var sz = Math.sin(z/2);

            var qx = sx * cy * cz - cx * sy * sz;
            var qy = cx * sy * cz + sx * cy * sz;
            var qz = cx * cy * sz + sx * sy * cz;
            var qw = cx * cy * cz - sx * sy * sz;

            dynCall_vffff(JS_OrientationSensor_callback, qx, qy, qz, qw);
        }
    },

    $JS_DeviceMotion_eventHandler__deps: ['$JS_Accelerometer_callback',
        '$JS_LinearAccelerationSensor_callback',
        '$JS_GravitySensor_callback',
        '$JS_Gyroscope_callback',
        '$JS_Accelerometer_multiplier',
        '$JS_ComputeGravity'],
    $JS_DeviceMotion_eventHandler: function(event) {
        // The accelerationIncludingGravity property is the amount of acceleration recorded by the device, in meters per second squared (m/s2).
        // Its value is the sum of the acceleration of the device as induced by the user and the acceleration caused by gravity.
        // Apply the JS_Accelerometer_multiplier to convert to g
        var accelerometerValue = {
            x: event.accelerationIncludingGravity.x * JS_Accelerometer_multiplier,
            y: event.accelerationIncludingGravity.y * JS_Accelerometer_multiplier,
            z: event.accelerationIncludingGravity.z * JS_Accelerometer_multiplier
        };
        if (JS_Accelerometer_callback != 0)
            dynCall_vfff(JS_Accelerometer_callback, accelerometerValue.x, accelerometerValue.y, accelerometerValue.z);

        // The acceleration property is the amount of acceleration recorded by the device, in meters per second squared (m/s2), compensated for gravity.
        // Apply the JS_Accelerometer_multiplier to convert to g
        var linearAccelerationValue = {
            x: event.acceleration.x * JS_Accelerometer_multiplier,
            y: event.acceleration.y * JS_Accelerometer_multiplier,
            z: event.acceleration.z * JS_Accelerometer_multiplier
        };
        if (JS_LinearAccelerationSensor_callback != 0)
            dynCall_vfff(JS_LinearAccelerationSensor_callback, linearAccelerationValue.x, linearAccelerationValue.y, linearAccelerationValue.z);

        // Compute and raise the gravity sensor vector
        if (JS_GravitySensor_callback != 0) {
#if ASSERTIONS
            assert(typeof GravitySensor === 'undefined');
#endif
            var gravityValue = JS_ComputeGravity(accelerometerValue, linearAccelerationValue);
            dynCall_vfff(JS_GravitySensor_callback, gravityValue.x, gravityValue.y, gravityValue.z);
        }

        // The rotationRate property describes the rotation rates of the device around each of its axes (deg/s), but we want in radians/s so must scale
        // Note that the spec here has been updated so x,y,z axes are alpha,beta,gamma.
        // Therefore the order of axes at https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/rotationRate is incorrect
        //
        // There is a bug in Chrome < M66 where rotationRate values are not in deg/s https://bugs.chromium.org/p/chromium/issues/detail?id=541607
        // But that version is too old to include a check here
        if (JS_Gyroscope_callback != 0) {
            var degToRad = Math.PI / 180;
            dynCall_vfff(JS_Gyroscope_callback, event.rotationRate.alpha * degToRad, event.rotationRate.beta * degToRad, event.rotationRate.gamma * degToRad);
        }
    },

    $JS_DeviceMotion_add__deps: ['$JS_DeviceMotion_eventHandler',
        '$JS_RequestDeviceSensorPermissions',
        '$JS_Accelerometer_callback',
        '$JS_LinearAccelerationSensor_callback',
        '$JS_GravitySensor_callback',
        '$JS_Gyroscope_callback'],
    $JS_DeviceMotion_add: function() {
        // Only add the event listener if we don't yet have any of the motion callbacks set
        if (JS_Accelerometer_callback == 0 &&
            JS_LinearAccelerationSensor_callback == 0 &&
            JS_GravitySensor_callback == 0 &&
            JS_Gyroscope_callback == 0) {
            JS_RequestDeviceSensorPermissions(2/*DeviceMotionEvent permission*/);
            window.addEventListener('devicemotion', JS_DeviceMotion_eventHandler);
        }
    },

    $JS_DeviceMotion_remove__deps: ['$JS_DeviceMotion_eventHandler',
        '$JS_Accelerometer_callback',
        '$JS_LinearAccelerationSensor_callback',
        '$JS_GravitySensor_callback',
        '$JS_Gyroscope_callback'],
    $JS_DeviceMotion_remove: function() {
        // If we've removed the last callback, remove the devicemotion event listener
        if (JS_Accelerometer_callback == 0 &&
            JS_LinearAccelerationSensor_callback == 0 &&
            JS_GravitySensor_callback == 0 &&
            JS_Gyroscope_callback == 0 ) {
            window.removeEventListener('devicemotion', JS_DeviceOrientation_eventHandler);
        }
    },

    JS_OrientationSensor_Start__deps: ['$JS_OrientationSensor',
        '$JS_OrientationSensor_eventHandler',
        '$JS_OrientationSensor_callback',
        '$JS_OrientationSensor_frequencyRequest',
        '$JS_DeviceOrientation_eventHandler',
        '$JS_RequestDeviceSensorPermissions'],
    JS_OrientationSensor_Start__proxy: 'sync',
    JS_OrientationSensor_Start__sig: 'vii',
    JS_OrientationSensor_Start: function(callback, frequency) {
#if ASSERTIONS
        assert(callback != 0, 'Invalid callback passed to JS_OrientationSensor_Start');
#endif

        // If we don't have new sensor API, fallback to old DeviceOrientationEvent
        if (typeof RelativeOrientationSensor === 'undefined') {
            if (JS_OrientationSensor_callback == 0) {
                JS_OrientationSensor_callback = callback;
                JS_RequestDeviceSensorPermissions(1/*DeviceOrientationEvent permission*/);
                window.addEventListener('deviceorientation', JS_DeviceOrientation_eventHandler);
            }
            return;
        }

        JS_OrientationSensor_callback = callback;

        function InitializeOrientationSensor(frequency) {
            // Use device referenceFrame, since New Input System package does its own compensation
            // Use relative orientation to match native players
            JS_OrientationSensor = new RelativeOrientationSensor({ frequency: frequency, referenceFrame: 'device' });
            JS_OrientationSensor.addEventListener('reading', JS_OrientationSensor_eventHandler);
            JS_OrientationSensor.addEventListener('error', function(e) {
                // e.error could be DOMException: Could not connect to a sensor
                warnOnce((e.error) ? e.error : e);
            });
            JS_OrientationSensor.start();
        }

        // If the sensor is already created, stop and re-create it with new frequency
        if (JS_OrientationSensor) {
            JS_OrientationSensor.stop();
            JS_OrientationSensor.removeEventListener('reading', JS_OrientationSensor_eventHandler);
            InitializeOrientationSensor(frequency);
        }
        else if (JS_OrientationSensor_frequencyRequest != 0) {
            // If the permissions promise is currently in progress, then note new frequency only
            JS_OrientationSensor_frequencyRequest = frequency;
        }
        else {
            JS_OrientationSensor_frequencyRequest = frequency;

            // Request required permissions for the RelativeOrientationSensor
            Promise.all([navigator.permissions.query({ name: "accelerometer" }),
                         navigator.permissions.query({ name: "gyroscope" })])
                .then(function(results) {
                    if (results.every(function(result) {return(result.state === "granted");})) {
                        InitializeOrientationSensor(JS_OrientationSensor_frequencyRequest);
                    } else {
                        warnOnce("No permissions to use RelativeOrientationSensor.");
                    }
                    JS_OrientationSensor_frequencyRequest = 0;
            });
        }
    },

    JS_OrientationSensor_Stop__deps: ['$JS_OrientationSensor',
        '$JS_OrientationSensor_eventHandler',
        '$JS_OrientationSensor_callback',
        '$JS_DeviceOrientation_eventHandler'],
    JS_OrientationSensor_Stop__proxy: 'sync',
    JS_OrientationSensor_Stop__sig: 'v',
    JS_OrientationSensor_Stop: function() {
        if (JS_OrientationSensor) {
            JS_OrientationSensor.stop();
            JS_OrientationSensor.removeEventListener('reading', JS_OrientationSensor_eventHandler);
            JS_OrientationSensor = null;
        }
        else if (JS_OrientationSensor_callback != 0) {
            window.removeEventListener('deviceorientation', JS_DeviceOrientation_eventHandler);
        }
        JS_OrientationSensor_callback = 0;
    },

    JS_OrientationSensor_IsRunning__deps: ['$JS_OrientationSensor', '$JS_OrientationSensor_callback'],
    JS_OrientationSensor_IsRunning__proxy: 'sync',
    JS_OrientationSensor_IsRunning__sig: 'i',
    JS_OrientationSensor_IsRunning: function() {
        // Sensor is running if there is an activated new JS_OrientationSensor; or the DeviceOrientation handler is hooked up
        return (JS_OrientationSensor && JS_OrientationSensor.activated) || (JS_OrientationSensor_callback != 0);
    },

    JS_Accelerometer_Start__deps: ['$JS_Accelerometer',
        '$JS_Accelerometer_eventHandler',
        '$JS_Accelerometer_callback',
        '$JS_Accelerometer_frequencyRequest',
        '$JS_Accelerometer_frequency',
        '$JS_DeviceMotion_add',
        '$JS_DefineAccelerometerMultiplier'],
    JS_Accelerometer_Start__proxy: 'sync',
    JS_Accelerometer_Start__sig: 'vii',
    JS_Accelerometer_Start: function(callback, frequency) {
        // callback can be zero here when called via JS_GravitySensor_Start

        JS_DefineAccelerometerMultiplier();

        // If we don't have new sensor API, fallback to old DeviceMotionEvent
        if (typeof Accelerometer === 'undefined') {
            JS_DeviceMotion_add(); // Must call before we set the callback
            if (callback != 0) JS_Accelerometer_callback = callback;
            return;
        }

        if (callback != 0) JS_Accelerometer_callback = callback;

        function InitializeAccelerometer(frequency) {
            // Use device referenceFrame, since New Input System package does its own compensation
            JS_Accelerometer = new Accelerometer({ frequency: frequency, referenceFrame: 'device' });
            JS_Accelerometer.addEventListener('reading', JS_Accelerometer_eventHandler);
            JS_Accelerometer.addEventListener('error', function(e) {
                // e.error could be DOMException: Could not connect to a sensor
                warnOnce((e.error) ? e.error : e);
            });
            JS_Accelerometer.start();
            JS_Accelerometer_frequency = frequency;
        }

        // If the sensor is already created, stop and re-create it with new frequency
        if (JS_Accelerometer) {
            if (JS_Accelerometer_frequency != frequency) {
                JS_Accelerometer.stop();
                JS_Accelerometer.removeEventListener('reading', JS_Accelerometer_eventHandler);
                InitializeAccelerometer(frequency);
            }
        }
        else if (JS_Accelerometer_frequencyRequest != 0) {
            // If the permissions promise is currently in progress, then note new frequency only
            JS_Accelerometer_frequencyRequest = frequency;
        }
        else {
            JS_Accelerometer_frequencyRequest = frequency;

            // Request required permission for the Accelerometer
            navigator.permissions.query({name: 'accelerometer'})
                .then(function(result) {
                    if (result.state === "granted") {
                        InitializeAccelerometer(JS_Accelerometer_frequencyRequest);
                    } else {
                        warnOnce("No permission to use Accelerometer.");
                    }
                    JS_Accelerometer_frequencyRequest = 0;
            });
        }
    },

    JS_Accelerometer_Stop__deps: ['$JS_Accelerometer',
        '$JS_Accelerometer_eventHandler',
        '$JS_Accelerometer_callback',
        '$JS_Accelerometer_frequency',
        '$JS_GravitySensor_callback',
        '$JS_DeviceMotion_remove'],
    JS_Accelerometer_Stop__proxy: 'sync',
    JS_Accelerometer_Stop__sig: 'v',
    JS_Accelerometer_Stop: function() {
        if (JS_Accelerometer) {
            // Only actually stop the accelerometer if we don't need it to compute gravity values
            if (typeof GravitySensor !== 'undefined' || JS_GravitySensor_callback == 0) {
                JS_Accelerometer.stop();
                JS_Accelerometer.removeEventListener('reading', JS_Accelerometer_eventHandler);
                JS_Accelerometer = null;
            }
            JS_Accelerometer_callback = 0;
            JS_Accelerometer_frequency = 0;
        }
        else if (JS_Accelerometer_callback != 0) {
            JS_Accelerometer_callback = 0;
            JS_DeviceMotion_remove();
        }
    },

    JS_Accelerometer_IsRunning__deps: ['$JS_Accelerometer', '$JS_Accelerometer_callback'],
    JS_Accelerometer_IsRunning__proxy: 'sync',
    JS_Accelerometer_IsRunning__sig: 'i',
    JS_Accelerometer_IsRunning: function() {
        // Sensor is running if there is an activated new JS_Accelerometer; or the JS_Accelerometer_callback is hooked up
        return (JS_Accelerometer && JS_Accelerometer.activated) || (JS_Accelerometer_callback != 0);
    },

    JS_LinearAccelerationSensor_Start__deps: ['$JS_LinearAccelerationSensor',
        '$JS_LinearAccelerationSensor_eventHandler',
        '$JS_LinearAccelerationSensor_callback',
        '$JS_LinearAccelerationSensor_frequencyRequest',
        '$JS_LinearAccelerationSensor_frequency',
        '$JS_DeviceMotion_add',
        '$JS_DefineAccelerometerMultiplier'],
    JS_LinearAccelerationSensor_Start__proxy: 'sync',
    JS_LinearAccelerationSensor_Start__sig: 'vii',
    JS_LinearAccelerationSensor_Start: function(callback, frequency) {
        // callback can be zero here when called via JS_GravitySensor_Start

        JS_DefineAccelerometerMultiplier();

        // If we don't have new sensor API, fallback to old DeviceMotionEvent
        if (typeof LinearAccelerationSensor === 'undefined') {
            JS_DeviceMotion_add(); // Must call before we set the callback
            if (callback != 0) JS_LinearAccelerationSensor_callback = callback;
            return;
        }

        if (callback != 0) JS_LinearAccelerationSensor_callback = callback;

        function InitializeLinearAccelerationSensor(frequency) {
            // Use device referenceFrame, since New Input System package does its own compensation
            JS_LinearAccelerationSensor = new LinearAccelerationSensor({ frequency: frequency, referenceFrame: 'device' });
            JS_LinearAccelerationSensor.addEventListener('reading', JS_LinearAccelerationSensor_eventHandler);
            JS_LinearAccelerationSensor.addEventListener('error', function(e) {
                // e.error could be DOMException: Could not connect to a sensor
                warnOnce((e.error) ? e.error : e);
            });
            JS_LinearAccelerationSensor.start();
            JS_LinearAccelerationSensor_frequency = frequency;
        }

        // If the sensor is already created, stop and re-create it with new frequency
        if (JS_LinearAccelerationSensor) {
            if (JS_LinearAccelerationSensor_frequency != frequency) {
                JS_LinearAccelerationSensor.stop();
                JS_LinearAccelerationSensor.removeEventListener('reading', JS_LinearAccelerationSensor_eventHandler);
                InitializeLinearAccelerationSensor(frequency);
            }
        }
        else if (JS_LinearAccelerationSensor_frequencyRequest != 0) {
            // If the permissions promise is currently in progress, then note new frequency only
            JS_LinearAccelerationSensor_frequencyRequest = frequency;
        }
        else {
            JS_LinearAccelerationSensor_frequencyRequest = frequency;

            // Request required permission for the LinearAccelerationSensor
            navigator.permissions.query({name: 'accelerometer'})
                .then(function(result) {
                    if (result.state === "granted") {
                        InitializeLinearAccelerationSensor(JS_LinearAccelerationSensor_frequencyRequest);
                    } else {
                        warnOnce("No permission to use LinearAccelerationSensor.");
                    }
                    JS_LinearAccelerationSensor_frequencyRequest = 0;
            });
        }
    },

    JS_LinearAccelerationSensor_Stop__deps: ['$JS_LinearAccelerationSensor',
        '$JS_LinearAccelerationSensor_eventHandler',
        '$JS_LinearAccelerationSensor_callback',
        '$JS_LinearAccelerationSensor_frequency',
        '$JS_GravitySensor_callback',
        '$JS_DeviceMotion_remove'],
    JS_LinearAccelerationSensor_Stop__proxy: 'sync',
    JS_LinearAccelerationSensor_Stop__sig: 'v',
    JS_LinearAccelerationSensor_Stop: function() {
        if (JS_LinearAccelerationSensor) {
            // Only actually stop the Linear Acceleration Sensor if we don't need it to compute gravity values
            if (typeof GravitySensor !== 'undefined' || JS_GravitySensor_callback == 0) {
                JS_LinearAccelerationSensor.stop();
                JS_LinearAccelerationSensor.removeEventListener('reading', JS_LinearAccelerationSensor_eventHandler);
                JS_LinearAccelerationSensor = null;
            }
            JS_LinearAccelerationSensor_callback = 0;
            JS_LinearAccelerationSensor_frequency = 0;
        }
        else if (JS_LinearAccelerationSensor_callback != 0) {
            JS_LinearAccelerationSensor_callback = 0;
            JS_DeviceMotion_remove();
        }
    },

    JS_LinearAccelerationSensor_IsRunning__deps: ['$JS_LinearAccelerationSensor', '$JS_LinearAccelerationSensor_callback'],
    JS_LinearAccelerationSensor_IsRunning__proxy: 'sync',
    JS_LinearAccelerationSensor_IsRunning__sig: 'i',
    JS_LinearAccelerationSensor_IsRunning: function() {
        // Sensor is running if there is an activated new JS_LinearAccelerationSensor; or the JS_LinearAccelerationSensor_callback is hooked up
        return (JS_LinearAccelerationSensor && JS_LinearAccelerationSensor.activated) || (JS_LinearAccelerationSensor_callback != 0);
    },

    JS_GravitySensor_Start__deps: ['$JS_GravitySensor',
        '$JS_GravitySensor_eventHandler',
        '$JS_GravitySensor_callback',
        '$JS_GravitySensor_frequencyRequest',
        'JS_Accelerometer_Start',
        '$JS_Accelerometer_frequency',
        'JS_LinearAccelerationSensor_Start',
        '$JS_LinearAccelerationSensor_frequency',
        '$JS_DefineAccelerometerMultiplier'],
    JS_GravitySensor_Start__proxy: 'sync',
    JS_GravitySensor_Start__sig: 'vii',
    JS_GravitySensor_Start: function(callback, frequency) {
#if ASSERTIONS
        assert(callback != 0, 'Invalid callback passed to JS_GravitySensor_Start');
#endif

        // If we don't have explicit new Gravity Sensor API, start the Accelerometer and LinearAccelerationSensor
        // and we will compute the gravity value from those readings
        if (typeof GravitySensor === 'undefined') {
            // Start both Accelerometer and LinearAccelerationSensor
            _JS_Accelerometer_Start(0, Math.max(frequency, JS_Accelerometer_frequency));
            _JS_LinearAccelerationSensor_Start(0, Math.max(frequency, JS_LinearAccelerationSensor_frequency));

            // Add the gravity sensor callback (must be after Accelerometer and LinearAccelerationSensor start)
            JS_GravitySensor_callback = callback;
            return;
        }

        JS_DefineAccelerometerMultiplier();

        JS_GravitySensor_callback = callback;

        function InitializeGravitySensor(frequency) {
            // Use device referenceFrame, since New Input System package does its own compensation
            JS_GravitySensor = new GravitySensor({ frequency: frequency, referenceFrame: 'device' });
            JS_GravitySensor.addEventListener('reading', JS_GravitySensor_eventHandler);
            JS_GravitySensor.addEventListener('error', function(e) {
                // e.error could be DOMException: Could not connect to a sensor
                warnOnce((e.error) ? e.error : e);
            });
            JS_GravitySensor.start();
        }

        // If the sensor is already created, stop and re-create it with new frequency
        if (JS_GravitySensor) {
            JS_GravitySensor.stop();
            JS_GravitySensor.removeEventListener('reading', JS_GravitySensor_eventHandler);
            InitializeGravitySensor(frequency);
        }
        else if (JS_GravitySensor_frequencyRequest != 0) {
            // If the permissions promise is currently in progress, then note new frequency only
            JS_GravitySensor_frequencyRequest = frequency;
        }
        else {
            JS_GravitySensor_frequencyRequest = frequency;

            // Request required permission for the GravitySensor
            navigator.permissions.query({name: 'accelerometer'})
                .then(function(result) {
                    if (result.state === "granted") {
                        InitializeGravitySensor(JS_GravitySensor_frequencyRequest);
                    } else {
                        warnOnce("No permission to use GravitySensor.");
                    }
                    JS_GravitySensor_frequencyRequest = 0;
            });
        }
    },

    JS_GravitySensor_Stop__deps: ['$JS_GravitySensor',
        '$JS_GravitySensor_eventHandler',
        '$JS_GravitySensor_callback',
        '$JS_Accelerometer_callback',
        '$JS_LinearAccelerationSensor_callback',
        'JS_Accelerometer_Stop',
        'JS_LinearAccelerationSensor_Stop'],
    JS_GravitySensor_Stop__proxy: 'sync',
    JS_GravitySensor_Stop__sig: 'v',
    JS_GravitySensor_Stop: function() {
        JS_GravitySensor_callback = 0;

        // If we don't have Gravity Sensor API, stop the Accelerometer and LinearAccelerationSensor
        if (typeof GravitySensor === 'undefined') {
            // Stop the source sensors if they're not used explicitly by Unity
            if (JS_Accelerometer_callback == 0) _JS_Accelerometer_Stop();
            if (JS_LinearAccelerationSensor_callback == 0) _JS_LinearAccelerationSensor_Stop();
            return;
        }

        if (JS_GravitySensor) {
            JS_GravitySensor.stop();
            JS_GravitySensor.removeEventListener('reading', JS_GravitySensor_eventHandler);
            JS_GravitySensor = null;
        }
    },

    JS_GravitySensor_IsRunning__deps: ['$JS_GravitySensor', '$JS_GravitySensor_callback'],
    JS_GravitySensor_IsRunning__proxy: 'sync',
    JS_GravitySensor_IsRunning__sig: 'i',
    JS_GravitySensor_IsRunning: function() {
        return (typeof GravitySensor !== 'undefined') ? (JS_GravitySensor && JS_GravitySensor.activated) : JS_GravitySensor_callback != 0;
    },

    JS_Gyroscope_Start__deps: ['$JS_Gyroscope',
        '$JS_Gyroscope_eventHandler',
        '$JS_Gyroscope_callback',
        '$JS_Gyroscope_frequencyRequest',
        '$JS_DeviceMotion_add'],
    JS_Gyroscope_Start__proxy: 'sync',
    JS_Gyroscope_Start__sig: 'vii',
    JS_Gyroscope_Start: function(callback, frequency) {
#if ASSERTIONS
        assert(callback != 0, 'Invalid callback passed to JS_Gyroscope_Start');
#endif

        // If we don't have new sensor API, fallback to old DeviceMotionEvent
        if (typeof Gyroscope === 'undefined') {
            JS_DeviceMotion_add(); // Must call before we set the callback
            JS_Gyroscope_callback = callback;
            return;
        }

        JS_Gyroscope_callback = callback;

        function InitializeGyroscope(frequency) {
            // Use device referenceFrame, since New Input System package does its own compensation
            JS_Gyroscope = new Gyroscope({ frequency: frequency, referenceFrame: 'device' });
            JS_Gyroscope.addEventListener('reading', JS_Gyroscope_eventHandler);
            JS_Gyroscope.addEventListener('error', function(e) {
                // e.error could be DOMException: Could not connect to a sensor
                warnOnce((e.error) ? e.error : e);
            });
            JS_Gyroscope.start();
        }

        // If the sensor is already created, stop and re-create it with new frequency
        if (JS_Gyroscope) {
            JS_Gyroscope.stop();
            JS_Gyroscope.removeEventListener('reading', JS_Gyroscope_eventHandler);
            InitializeGyroscope(frequency);
        }
        else if (JS_Gyroscope_frequencyRequest != 0) {
            // If the permissions promise is currently in progress, then note new frequency only
            JS_Gyroscope_frequencyRequest = frequency;
        }
        else {
            JS_Gyroscope_frequencyRequest = frequency;

            // Request required permission for the Gyroscope
            navigator.permissions.query({name: 'gyroscope'})
                .then(function(result) {
                    if (result.state === "granted") {
                        InitializeGyroscope(JS_Gyroscope_frequencyRequest);
                    } else {
                        warnOnce("No permission to use Gyroscope.");
                    }
                    JS_Gyroscope_frequencyRequest = 0;
            });
        }
    },

    JS_Gyroscope_Stop__deps: ['$JS_Gyroscope',
        '$JS_Gyroscope_eventHandler',
        '$JS_Gyroscope_callback',
        '$JS_DeviceMotion_remove'],
    JS_Gyroscope_Stop__proxy: 'sync',
    JS_Gyroscope_Stop__sig: 'v',
    JS_Gyroscope_Stop: function() {
        if (JS_Gyroscope) {
            JS_Gyroscope.stop();
            JS_Gyroscope.removeEventListener('reading', JS_Gyroscope_eventHandler);
            JS_Gyroscope = null;
            JS_Gyroscope_callback = 0;
        }
        else if (JS_Gyroscope_callback != 0) {
            JS_Gyroscope_callback = 0;
            JS_DeviceMotion_remove();
        }
    },

    JS_Gyroscope_IsRunning__deps: ['$JS_Gyroscope', '$JS_Gyroscope_callback'],
    JS_Gyroscope_IsRunning__proxy: 'sync',
    JS_Gyroscope_IsRunning__sig: 'i',
    JS_Gyroscope_IsRunning: function() {
        // Sensor is running if there is an activated new JS_Gyroscope; or the JS_Gyroscope_callback is hooked up
        return (JS_Gyroscope && JS_Gyroscope.activated) || (JS_Gyroscope_callback != 0);
    }
});
