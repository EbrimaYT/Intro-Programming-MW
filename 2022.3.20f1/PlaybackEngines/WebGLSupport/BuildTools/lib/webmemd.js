mergeInto(LibraryManager.library, {
  GetJSMemoryInfo__proxy: 'sync',
  GetJSMemoryInfo__sig: 'vii',
  GetJSMemoryInfo: function(totalJSptr, usedJSptr) {
    if (performance.memory) {
      HEAPF64[totalJSptr >> 3] = performance.memory.totalJSHeapSize;
      HEAPF64[usedJSptr >> 3] = performance.memory.usedJSHeapSize;
    } else {
      HEAPF64[totalJSptr >> 3] = NaN;
      HEAPF64[usedJSptr >> 3] = NaN;
    }
  }
});
