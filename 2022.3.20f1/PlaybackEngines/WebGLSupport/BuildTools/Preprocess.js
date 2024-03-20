var locals = {
  fs: require("fs"),
  path: require("path"),
  assert: require("assert"),
  evaluate: (string) => eval(string),
};

function readBinary(filename) {
  var relativePath = locals.path.resolve(locals.cwd, locals.path.join(locals.path.dirname(locals.inputPath), filename));
  return locals.fs.readFileSync(locals.fs.existsSync(relativePath) ? relativePath : locals.path.resolve(locals.cwd, filename));
}

function read(filename) {
  return readBinary(filename).toString();
}

for (locals.i = 2; locals.i < process.argv.length; locals.i++) {
  locals.assert(/^(locals\.(cwd|inputPath|outputPath|webglIncludes|minifyOutput)|[a-zA-Z_$][a-zA-Z0-9_$]*)=(true|false|\d+|'[0-9a-zA-Z \.\/\\]*')$/.test(process.argv[locals.i]), "Invalid preprocessor argument: " + process.argv[locals.i]);
  eval(process.argv[locals.i]);
}

if (!locals.cwd) {
  locals.cwd = process.cwd();
}

if (!locals.outputPath) {
  locals.variables = {};
  locals.parseGlobals = require(locals.path.resolve(locals.cwd, "acorn/node_modules/acorn-globals"));
  locals.evaluate = (string) => {
    locals.parseGlobals(string).forEach(function (global) {
      if (!locals.variables[global.name] && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(global.name) && eval('typeof ' + global.name + ' == "undefined"'))
        locals.variables[global.name] = true;
    });
    return true;
  };
}

locals.output = "";
locals.showStack = [];
locals.fs.readFileSync(locals.path.resolve(locals.cwd, locals.inputPath), "utf8").replace(/\n$/, "").split("\n").forEach(function (line, index) {
  try {
    if (!line.match(/^\s*#(if|else|endif)(\s|$)/)) {
      if (locals.showStack.indexOf(false) == -1)
        locals.output += line + "\n";
    } else if (line.match(/^\s*#if\s+[^\s]/)) {
      locals.showStack.push(!!locals.evaluate(line.substring(line.indexOf("#") + 3)));
    } else if (line.match(/^\s*#else(\s*$|\s+\/\/)/)) {
      locals.assert(locals.showStack.length, "found #else without matching #if");
      locals.showStack.push(!locals.showStack.pop() || !locals.outputPath);
    } else if (line.match(/^\s*#endif(\s*$|\s+\/\/)/)) {
      locals.assert(locals.showStack.length, "found #endif without matching #if");
      locals.showStack.pop();
    } else {
      throw "invalid preprocessor command"
    }
  } catch (e) {
    throw "Preprocessor error \"" + e + "\" occured in file \"" + locals.inputPath + "\" at line " + (index + 1) + " when evaluating expression \"" + line + "\"";
  }
});


locals.assert(!locals.showStack.length, "Preprocessor error \"missing #endif\" occured in file \"" + locals.inputPath + "\"");
locals.output = locals.output.replace(/{{{([^}]|}(?!}))+}}}/g, function (preprocessedBlock) {
  var expression = preprocessedBlock.substring(3, preprocessedBlock.length - 3);

  try {
    var value = locals.evaluate(expression);
    return value !== null ? value.toString() : "";
  } catch (e) {
    throw "Preprocessor error \"" + e + "\" occured in file \"" + locals.inputPath + "\" when evaluating expression \"" + expression + "\"";
  }
});

locals.output = locals.output.replace(/<<<\s*([\w\.\-\/]*)\s*>>>/g, function (preprocessedBlock, includedFile) {
  if (!locals.webglIncludes) {
    return;
  }
  var unityFilePath = locals.path.join(locals.webglIncludes, includedFile);
  var relativePath = locals.path.dirname(locals.outputPath);
  var localFilePath = locals.path.join(relativePath, includedFile);
  locals.fs.copyFileSync(unityFilePath, localFilePath);

  if (!locals.fs.existsSync(localFilePath)) {
    throw "Preprocessor error: could not copy " + localFilePath + "\n";
  }
  return includedFile;
});

if (!locals.outputPath) {
  console.log(JSON.stringify(Object.keys(locals.variables)));
  return;
}

if (locals.minifyOutput){
  var uglified = require(locals.path.resolve(locals.cwd, "uglify-js")).minify(locals.output, { output: { "ascii_only": true } });
  if (uglified.error) {
    throw uglified.error;
  }
  locals.output = uglified.code;
}
locals.fs.writeFileSync(locals.outputPath, locals.output);
