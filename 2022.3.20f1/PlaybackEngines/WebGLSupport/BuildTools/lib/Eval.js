var LibraryEvalWebGL = {

JS_Eval_EvalJS__proxy: 'sync',
JS_Eval_EvalJS__sig: 'vi',
JS_Eval_EvalJS: function(ptr)
{
	var str = UTF8ToString(ptr);
	try {
		eval (str);
	}
	catch (exception)
	{
		console.error(exception);
	}
},

JS_Eval_OpenURL__proxy: 'sync',
JS_Eval_OpenURL__sig: 'vi',
JS_Eval_OpenURL: function(ptr)
{
	var str = UTF8ToString(ptr);
	window.open(str, '_blank', '');
},


JS_RunQuitCallbacks__proxy: 'sync',
JS_RunQuitCallbacks__sig: 'v',
JS_RunQuitCallbacks: function() {
	Module.QuitCleanup();
},

JS_UnityEngineShouldQuit__proxy: 'sync',
JS_UnityEngineShouldQuit__sig: 'i',
JS_UnityEngineShouldQuit: function() {
	return !!Module.shouldQuit;
},


};

mergeInto(LibraryManager.library, LibraryEvalWebGL);
