const fs = require('node:fs');
const path = require('node:path');

// Reuse the project's Creator compiler; no network install is necessary.
function findTypeScript() {
    try { return require.resolve('typescript'); } catch {}
    const declaration = path.resolve(__dirname, '../temp/declarations/cc.d.ts');
    if (fs.existsSync(declaration)) {
        const reference = fs.readFileSync(declaration, 'utf8').match(/reference path="([^"]+)"/);
        if (reference) {
            const engine = path.resolve(path.dirname(reference[1]), '../..');
            const candidate = path.join(engine, 'node_modules/typescript');
            if (fs.existsSync(candidate)) return require.resolve(candidate);
        }
    }
    throw new Error('Open this project in Cocos Creator 3.8.7 once, or install TypeScript locally.');
}
const compilerPath = findTypeScript();
const ts = require(compilerPath);
function transpile(source, filename) {
    return ts.transpileModule(source, { fileName: filename, compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, experimentalDecorators: true,
    }}).outputText;
}
function register() {
    require.extensions['.ts'] = (module, filename) => module._compile(transpile(fs.readFileSync(filename,'utf8'),filename),filename);
}
module.exports = { ts, transpile, register, compilerPath };
