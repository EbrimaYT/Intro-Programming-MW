// Copyright 2022 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

// This file defines the JS file backend and JS file of the new file system.
// Current Status: Work in Progress.
// See https://github.com/emscripten-core/emscripten/issues/15041.

#pragma once

#include "backend.h"
#include "support.h"
#include "wasmfs.h"

//
// A JS Impl backend has files that are implemented by JS code. Each backend
// object in C++ can call JS to define the proper JS code on that side, and we
// keep a mapping of C++ pointer of backend => JS code in JS. Then, when we do
// something like a read from a JSImplFile we pass it the backend, find the
// proper code to run, and run it. This adds a layer of indirection at the JS
// level that makes it easy to write new backends in 99% JS.
//
// Each file operation in the _wasmfs_jsimpl_* APIs that we call from here take
// the backend and a pointer to this file itself. Those allow the JS to identify
// both the backend and the particular file. TODO: We could use dense indexes
// instead of pointers, and use an array instead of a map.
//
// To write a new backend in JS, you basically do the following:
//
//  1. Add a declaration of the C function to create the backend in the
//     "backend creation" section of emscripten/wasmfs.h. (One line.)
//  2. Add a cpp file for the new backend, and implement the C function from 1,
//     which should create it on both the C++ (using JSImplBackend) and JS
//     sides. (By convention, the C function should just call into C++ and JS
//     which do the interesting work; the C is just a thin wrapper.) (A few
//     lines.)
// 3. Write a new JS library, and add the implementation of the JS method just
//    mentioned, which should set up the mapping from the C++ backend object's
//    address to the JS code containing the hooks to read and write etc. (99%
//    of the work happens here.)
//
// For a simple example, see js_file_backend.cpp and library_wasmfs_js_file.js
//

using js_index_t = uint32_t;

extern "C" {
// JSImpl API (see below for overview).
void _wasmfs_jsimpl_alloc_file(js_index_t backend, js_index_t index);
void _wasmfs_jsimpl_free_file(js_index_t backend, js_index_t index);
int _wasmfs_jsimpl_write(js_index_t backend,
                         js_index_t index,
                         const uint8_t* buffer,
                         size_t length,
                         off_t offset);
int _wasmfs_jsimpl_read(js_index_t backend,
                        js_index_t index,
                        const uint8_t* buffer,
                        size_t length,
                        off_t offset);
int _wasmfs_jsimpl_get_size(js_index_t backend, js_index_t index);
}

namespace wasmfs {

class JSImplFile : public DataFile {
  js_index_t getBackendIndex() {
    static_assert(sizeof(backend_t) == sizeof(js_index_t), "TODO: wasm64");
    return js_index_t(getBackend());
  }

  js_index_t getFileIndex() {
    static_assert(sizeof(this) == sizeof(js_index_t), "TODO: wasm64");
    return js_index_t(this);
  }

  // TODO: Notify the JS about open and close events?
  void open(oflags_t) override {}
  void close() override {}

  __wasi_errno_t write(const uint8_t* buf, size_t len, off_t offset) override {
    return _wasmfs_jsimpl_write(
      getBackendIndex(), getFileIndex(), buf, len, offset);
  }

  __wasi_errno_t read(uint8_t* buf, size_t len, off_t offset) override {
    // The caller should have already checked that the offset + len does
    // not exceed the file's size.
    assert(offset + len <= getSize());
    return _wasmfs_jsimpl_read(
      getBackendIndex(), getFileIndex(), buf, len, offset);
  }

  void flush() override {}

  size_t getSize() override {
    return _wasmfs_jsimpl_get_size(getBackendIndex(), getFileIndex());
  }

  void setSize(size_t size) override {
    WASMFS_UNREACHABLE("TODO: JSImpl setSize");
  }

public:
  JSImplFile(mode_t mode, backend_t backend) : DataFile(mode, backend) {
    _wasmfs_jsimpl_alloc_file(getBackendIndex(), getFileIndex());
  }

  ~JSImplFile() { _wasmfs_jsimpl_free_file(getBackendIndex(), getFileIndex()); }
};

class JSImplBackend : public Backend {
public:
  std::shared_ptr<DataFile> createFile(mode_t mode) override {
    return std::make_shared<JSImplFile>(mode, this);
  }
};

} // namespace wasmfs
