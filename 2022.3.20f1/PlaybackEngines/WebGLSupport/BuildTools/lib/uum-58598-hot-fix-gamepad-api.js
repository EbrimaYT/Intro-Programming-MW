// Local Cherry-pick PR https://github.com/emscripten-core/emscripten/pull/20890 + https://github.com/emscripten-core/emscripten/pull/20915
// to fix https://jira.unity3d.com/browse/UUM-58598 .
// TODO: -JukkaJ: Delete this file after the next compiler update.
mergeInto(LibraryManager.library, {
  emscripten_set_gamepadconnected_callback_on_thread__proxy: 'sync',
  emscripten_set_gamepadconnected_callback_on_thread__deps: ['$registerGamepadEventCallback', 'emscripten_sample_gamepad_data'],
  emscripten_set_gamepadconnected_callback_on_thread: function(userData, useCapture, callbackfunc, targetThread) {
    if (_emscripten_sample_gamepad_data()) return -1 /*EMSCRIPTEN_RESULT_NOT_SUPPORTED*/;
    return registerGamepadEventCallback(2 /*EMSCRIPTEN_EVENT_TARGET_WINDOW*/, userData, useCapture, callbackfunc, 26 /*EMSCRIPTEN_EVENT_GAMEPADCONNECTED*/, "gamepadconnected", targetThread);
  },

  emscripten_set_gamepaddisconnected_callback_on_thread__proxy: 'sync',
  emscripten_set_gamepaddisconnected_callback_on_thread__deps: ['$registerGamepadEventCallback', 'emscripten_sample_gamepad_data'],
  emscripten_set_gamepaddisconnected_callback_on_thread: function(userData, useCapture, callbackfunc, targetThread) {
    if (_emscripten_sample_gamepad_data()) return -1 /*EMSCRIPTEN_RESULT_NOT_SUPPORTED*/;
    return registerGamepadEventCallback(2 /*EMSCRIPTEN_EVENT_TARGET_WINDOW*/, userData, useCapture, callbackfunc, 27 /*EMSCRIPTEN_EVENT_GAMEPADDISCONNECTED*/, "gamepaddisconnected", targetThread);
  },

  emscripten_sample_gamepad_data__docs: '/** @suppress {checkTypes} */', // We assign null to navigator.getGamepads, which Closure would like to complain about.
  emscripten_sample_gamepad_data__proxy: 'sync',
  emscripten_sample_gamepad_data__deps: ['$JSEvents'],
  emscripten_sample_gamepad_data: function() {
    try {
      if (navigator.getGamepads) return (JSEvents.lastGamepadState = navigator.getGamepads())
        ? 0 /*EMSCRIPTEN_RESULT_SUCCESS*/ : -1 /*EMSCRIPTEN_RESULT_NOT_SUPPORTED*/;
    } catch(e) {
#if ASSERTIONS
      err(`navigator.getGamepads() exists, but failed to execute with exception ${e}. Disabling Gamepad access.`);
#endif
      navigator.getGamepads = null; // Disable getGamepads() so that it won't be attempted to be used again.
    }
    return -1 /*EMSCRIPTEN_RESULT_NOT_SUPPORTED*/;
  }
});
