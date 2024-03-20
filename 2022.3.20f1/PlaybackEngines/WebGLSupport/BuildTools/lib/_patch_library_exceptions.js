#if DISABLE_EXCEPTION_CATCHING

// Patch for FogBugz 1343976
// Remove when we update Emscripten to include upstream PR https://github.com/emscripten-core/emscripten/pull/14192

var PatchLibraryExceptions = {};

[
  '__cxa_allocate_exception',
  '__cxa_free_exception',
  '__cxa_increment_exception_refcount',
  '__cxa_decrement_exception_refcount',
  '__cxa_throw',
  '__cxa_rethrow',
  'llvm_eh_typeid_for',
  '__cxa_begin_catch',
  '__cxa_end_catch',
  '__cxa_get_exception_ptr',
  '_ZSt18uncaught_exceptionv',
  '__cxa_call_unexpected',
  '__cxa_current_primary_exception',
  '__cxa_rethrow_primary_exception',
  '__cxa_find_matching_catch',
  '__resumeException',
].forEach(function(name) {
  PatchLibraryExceptions[name] = function() { abort(); };
  PatchLibraryExceptions[name + '__deps'] = [];
});

// In LLVM, exceptions generate a set of functions of form __cxa_find_matching_catch_1(), __cxa_find_matching_catch_2(), etc.
// where the number specifies the number of arguments. In Emscripten, route all these to a single function '__cxa_find_matching_catch'
// that variadically processes all of these functions using JS 'arguments' object.
addCxaCatch = function(n) {
  LibraryManager.library['__cxa_find_matching_catch_' + n] = function() { abort(); };
  LibraryManager.library['__cxa_find_matching_catch_' + n + '__sig'] = new Array(n + 2).join('i');
  LibraryManager.library['__cxa_find_matching_catch_' + n + '__deps'] = PatchLibraryExceptions['__cxa_find_matching_catch__deps'];
};

mergeInto(LibraryManager.library, PatchLibraryExceptions);
#endif
