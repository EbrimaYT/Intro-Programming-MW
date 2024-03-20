/**
 * @license
 * Copyright 2014 The Emscripten Authors
 * SPDX-License-Identifier: MIT
 */

var LibraryJSEvents = {
  $registerTouchEventCallback__deps: ['$JSEvents', '$findEventTarget', '$getBoundingClientRect'],
  $registerTouchEventCallback: function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
#if USE_PTHREADS
    targetThread = JSEvents.getTargetThreadForEventCallback(targetThread);
#endif
    if (!JSEvents.touchEvent) JSEvents.touchEvent = _malloc( {{{ C_STRUCTS.EmscriptenTouchEvent.__size__ }}} );

    target = findEventTarget(target);

    var touchEventHandlerFunc = function(e) {
#if ASSERTIONS
      assert(e);
#endif
      var t, touches = {}, et = e.touches;
      // To ease marshalling different kinds of touches that browser reports (all touches are listed in e.touches,
      // only changed touches in e.changedTouches, and touches on target at a.targetTouches), mark a boolean in
      // each Touch object so that we can later loop only once over all touches we see to marshall over to Wasm.

      for (var i = 0; i < et.length; ++i) {
        t = et[i];
        // Browser might recycle the generated Touch objects between each frame (Firefox on Android), so reset any
        // changed/target states we may have set from previous frame.
        t.isChanged = t.onTarget = 0;
        touches[t.identifier] = t;
      }

      // Mark which touches are part of the changedTouches list.
      for (var i = 0; i < e.changedTouches.length; ++i) {
        t = e.changedTouches[i];
        t.isChanged = 1;
        touches[t.identifier] = t;
      }
      // Mark which touches are part of the targetTouches list.
      for (var i = 0; i < e.targetTouches.length; ++i) {
        touches[e.targetTouches[i].identifier].onTarget = 1;
      }

#if USE_PTHREADS
      var touchEvent = targetThread ? _malloc( {{{ C_STRUCTS.EmscriptenTouchEvent.__size__ }}} ) : JSEvents.touchEvent;
#else
      var touchEvent = JSEvents.touchEvent;
#endif
      var idx = touchEvent>>2; // Pre-shift the ptr to index to HEAP32 to save code size
      HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchEvent.ctrlKey / 4}}}] = e.ctrlKey;
      HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchEvent.shiftKey / 4}}}] = e.shiftKey;
      HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchEvent.altKey / 4}}}] = e.altKey;
      HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchEvent.metaKey / 4}}}] = e.metaKey;
      idx += {{{ C_STRUCTS.EmscriptenTouchEvent.touches / 4 }}}; // Advance to the start of the touch array.
#if !DISABLE_DEPRECATED_FIND_EVENT_TARGET_BEHAVIOR
      var canvasRect = Module['canvas'] ? getBoundingClientRect(Module['canvas']) : undefined;
#endif
      var targetRect = getBoundingClientRect(target);
      var numTouches = 0;
      for (var i in touches) {
        var t = touches[i];
        HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchPoint.identifier / 4}}}] = t.identifier;
        HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchPoint.screenX / 4}}}] = t.screenX;
        HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchPoint.screenY / 4}}}] = t.screenY;
        HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchPoint.clientX / 4}}}] = t.clientX;
        HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchPoint.clientY / 4}}}] = t.clientY;
        HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchPoint.pageX / 4}}}] = t.pageX;
        HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchPoint.pageY / 4}}}] = t.pageY;
        HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchPoint.isChanged / 4}}}] = t.isChanged;
        HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchPoint.onTarget / 4}}}] = t.onTarget;
        HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchPoint.targetX / 4}}}] = t.clientX - targetRect.left;
        HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchPoint.targetY / 4}}}] = t.clientY - targetRect.top;
#if !DISABLE_DEPRECATED_FIND_EVENT_TARGET_BEHAVIOR
        HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchPoint.canvasX / 4}}}] = canvasRect ? t.clientX - canvasRect.left : 0;
        HEAP32[idx + {{{ C_STRUCTS.EmscriptenTouchPoint.canvasY / 4}}}] = canvasRect ? t.clientY - canvasRect.top : 0;
#endif

        idx += {{{ C_STRUCTS.EmscriptenTouchPoint.__size__ / 4 }}};

        if (++numTouches > 31) {
          break;
        }
      }
      {{{ makeSetValue('touchEvent', C_STRUCTS.EmscriptenTouchEvent.numTouches, 'numTouches', 'i32') }}};

#if USE_PTHREADS
      if (targetThread) JSEvents.queueEventHandlerOnThread_iiii(targetThread, callbackfunc, eventTypeId, touchEvent, userData);
      else
#endif
      if ({{{ makeDynCall('iiii', 'callbackfunc') }}}(eventTypeId, touchEvent, userData)) e.preventDefault();
    };

    var eventHandler = {
      target: target,
#if HTML5_SUPPORT_DEFERRING_USER_SENSITIVE_REQUESTS
      allowsDeferredCalls: eventTypeString == 'touchstart' || eventTypeString == 'touchend',
#endif
      eventTypeString: eventTypeString,
      callbackfunc: callbackfunc,
      handlerFunc: touchEventHandlerFunc,
      useCapture: useCapture
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
  }
};

mergeInto(LibraryManager.library, LibraryJSEvents);
