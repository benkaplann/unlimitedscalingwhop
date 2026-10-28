const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
exports.loadTypeScript = function(path, dependencies = {}, globals = {}) {
  const output = ts.transpileModule(readFileSync(join(__dirname, '..', path), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    exports: module.exports, module, Request, Response, URL, URLSearchParams, ...globals,
    require(name) { if (dependencies[name]) return dependencies[name]; throw new Error(`Unexpected dependency: ${name}`); },
  }, { filename: path });
  return module.exports;
};
