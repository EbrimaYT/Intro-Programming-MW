// This file cherry-picks upstream Emscripten PR https://github.com/emscripten-core/emscripten/pull/19226

mergeInto(LibraryManager.library, {
  glShaderSource__sig: 'viiii',
#if GL_EXPLICIT_UNIFORM_LOCATION || GL_EXPLICIT_UNIFORM_BINDING
  glShaderSource__deps: ['$preprocess_c_code', '$remove_cpp_comments_in_shaders', '$jstoi_q', '$find_closing_parens_index'],
#endif
  glShaderSource: function(shader, count, string, length) {
#if GL_ASSERTIONS
    GL.validateGLObjectID(GL.shaders, shader, 'glShaderSource', 'shader');
#endif
    var source = GL.getSource(shader, count, string, length);

#if WEBGL2_BACKWARDS_COMPATIBILITY_EMULATION
    if ({{{ isCurrentContextWebGL2() }}}) {
      // If a WebGL 1 shader happens to use GL_EXT_shader_texture_lod extension,
      // it will not compile on WebGL 2, because WebGL 2 no longer supports that
      // extension for WebGL 1 shaders. Therefore upgrade shaders to WebGL 2
      // by doing a bunch of dirty hacks. Not guaranteed to work on all shaders.
      // One might consider doing this for only the shaders that actually use
      // the GL_EXT_shader_texture_lod extension, but the problem is that
      // vertex and fragment shader versions need to match, and when compiling
      // the corresponding vertex shader, we would not know if that needed to
      // be compiled with or without the patch, so we must patch all shaders.
      if (source.includes('#version 100')) {
        source = source.replace(/#extension GL_OES_standard_derivatives : enable/g, "");
        source = source.replace(/#extension GL_EXT_shader_texture_lod : enable/g, '');
        var prelude = '';
        if (source.includes('gl_FragColor')) {
          prelude += 'out mediump vec4 GL_FragColor;\n';
          source = source.replace(/gl_FragColor/g, 'GL_FragColor');
        }
        if (source.includes('attribute')) {
          source = source.replace(/attribute/g, 'in');
          source = source.replace(/varying/g, 'out');
        } else {
          source = source.replace(/varying/g, 'in');
        }

        source = source.replace(/textureCubeLodEXT/g, 'textureCubeLod');
        source = source.replace(/texture2DLodEXT/g, 'texture2DLod');
        source = source.replace(/texture2DProjLodEXT/g, 'texture2DProjLod');
        source = source.replace(/texture2DGradEXT/g, 'texture2DGrad');
        source = source.replace(/texture2DProjGradEXT/g, 'texture2DProjGrad');
        source = source.replace(/textureCubeGradEXT/g, 'textureCubeGrad');

        source = source.replace(/textureCube/g, 'texture');
        source = source.replace(/texture1D/g, 'texture');
        source = source.replace(/texture2D/g, 'texture');
        source = source.replace(/texture3D/g, 'texture');
        source = source.replace(/#version 100/g, '#version 300 es\n' + prelude);
      }
    }
#endif

#if GL_EXPLICIT_UNIFORM_LOCATION || GL_EXPLICIT_UNIFORM_BINDING
#if GL_DEBUG
    out('Input shader source: ' + source);
#endif

#if ASSERTIONS
    // These are not expected to be meaningful in WebGL, but issue a warning if they are present, to give some diagnostics about if they are present.
    if (source.includes('__FILE__')) warnOnce('When compiling shader: ' + source + ': Preprocessor variable __FILE__ is not handled by -sGL_EXPLICIT_UNIFORM_LOCATION/-sGL_EXPLICIT_UNIFORM_BINDING options!');
    if (source.includes('__LINE__')) warnOnce('When compiling shader: ' + source + ': Preprocessor variable __LINE__ is not handled by -sGL_EXPLICIT_UNIFORM_LOCATION/-sGL_EXPLICIT_UNIFORM_BINDING options!');
#endif
    // Remove comments and C-preprocess the input shader first, so that we can appropriately
    // parse the layout location directives.
    source = preprocess_c_code(remove_cpp_comments_in_shaders(source), {
      'GL_FRAGMENT_PRECISION_HIGH': () => 1,
      'GL_ES': () => 1,
      '__VERSION__': () => source.includes('#version 300') ? 300 : 100
    });

#if GL_DEBUG
    out('Shader source after preprocessing: ' + source);
#endif
#endif // ~GL_EXPLICIT_UNIFORM_LOCATION || GL_EXPLICIT_UNIFORM_BINDING

#if GL_EXPLICIT_UNIFORM_LOCATION
    // Extract the layout(location = x) directives.
    var regex = /layout\s*\(\s*location\s*=\s*(-?\d+)\s*\)\s*(uniform\s+((lowp|mediump|highp)\s+)?\w+\s+(\w+))/g, explicitUniformLocations = {}, match;
    while(match = regex.exec(source)) {
#if GL_DEBUG
      console.dir(match);
#endif
      explicitUniformLocations[match[5]] = jstoi_q(match[1]);
#if GL_TRACK_ERRORS
      if (!(explicitUniformLocations[match[5]] >= 0 && explicitUniformLocations[match[5]] < 1048576)) {
        err('Specified an out of range layout(location=x) directive "' + explicitUniformLocations[match[5]] + '"! (' + match[0] + ')');
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
#endif
    }

    // Remove all the layout(location = x) directives so that they do not make
    // their way to the actual WebGL shader compiler.
    source = source.replace(regex, '$2');

    // Remember all the directives to be handled after glLinkProgram is called.
    GL.shaders[shader].explicitUniformLocations = explicitUniformLocations;

#if GL_DEBUG
    out('Shader source after removing layout location directives: ' + source);
    out('Explicit uniform locations recorded in the shader:');
    console.dir(explicitUniformLocations);
#endif

#endif // ~GL_EXPLICIT_UNIFORM_LOCATION

#if GL_EXPLICIT_UNIFORM_BINDING
    // Extract the layout(binding = x) directives. Four types we need to handle:
    // layout(binding = 3) uniform sampler2D mainTexture;
    // layout(binding = 1, std140) uniform MainBlock { ... };
    // layout(std140, binding = 1) uniform MainBlock { ... };
    // layout(binding = 1) uniform MainBlock { ... };
    var bindingRegex = /layout\s*\(.*?binding\s*=\s*(-?\d+).*?\)\s*uniform\s+(\w+)\s+(\w+)?/g, samplerBindings = {}, uniformBindings = {}, bindingMatch;
    while(bindingMatch = bindingRegex.exec(source)) {
      // We have a layout(binding=x) enabled uniform. Parse the array length of that uniform, if it is an array, i.e. a
      //    layout(binding = 3) uniform sampler2D mainTexture[arrayLength];
      // or 
      //    layout(binding = 1, std140) uniform MainBlock { ... } name[arrayLength];
      var arrayLength = 1;
      for(var i = bindingMatch.index; i < source.length && source[i] != ';'; ++i) {
        if (source[i] == '[') {
          arrayLength = jstoi_q(source.slice(i+1));
          break;
        }
        if (source[i] == '{') i = find_closing_parens_index(source, i, '{', '}') - 1;
      }
#if GL_DEBUG
      console.dir(bindingMatch);
#endif
      var binding = jstoi_q(bindingMatch[1]);
#if GL_TRACK_ERRORS
      var bindingsType = 0x8872/*GL_MAX_TEXTURE_IMAGE_UNITS*/;
#endif
      if (bindingMatch[3] && bindingMatch[2].indexOf('sampler') != -1) {
        samplerBindings[bindingMatch[3]] = [binding, arrayLength];
      } else {
#if GL_TRACK_ERRORS
        bindingsType = 0x8A2E/*GL_MAX_COMBINED_UNIFORM_BLOCKS*/;
#endif
        uniformBindings[bindingMatch[2]] = [binding, arrayLength];
      }
#if GL_TRACK_ERRORS
      var numBindingPoints = GLctx.getParameter(bindingsType);
      if (!(binding >= 0 && binding + arrayLength <= numBindingPoints)) {
        err('Specified an out of range layout(binding=x) directive "' + binding + '"! (' + bindingMatch[0] + '). Valid range is [0, ' + numBindingPoints + '-1]');
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
#endif
    }

    // Remove all the layout(binding = x) directives so that they do not make
    // their way to the actual WebGL shader compiler. These regexes get quite hairy, check against
    // https://regex101.com/ when working on these.
    source = source.replace(/layout\s*\(.*?binding\s*=\s*([-\d]+).*?\)/g, ''); // "layout(binding = 3)" -> ""
    source = source.replace(/(layout\s*\((.*?)),\s*binding\s*=\s*([-\d]+)\)/g, '$1)'); // "layout(std140, binding = 1)" -> "layout(std140)"
    source = source.replace(/layout\s*\(\s*binding\s*=\s*([-\d]+)\s*,(.*?)\)/g, 'layout($2)'); // "layout(binding = 1, std140)" -> "layout(std140)"

#if GL_DEBUG
    out('Shader source after removing layout binding directives: ' + source);
    out('Sampler binding locations recorded in the shader:');
    console.dir(samplerBindings);
    out('Uniform binding locations recorded in the shader:');
    console.dir(uniformBindings);
#endif

    // Remember all the directives to be handled after glLinkProgram is called.
    GL.shaders[shader].explicitSamplerBindings = samplerBindings;
    GL.shaders[shader].explicitUniformBindings = uniformBindings;

#endif // ~GL_EXPLICIT_UNIFORM_BINDING

    GLctx.shaderSource(GL.shaders[shader], source);
  }
});
