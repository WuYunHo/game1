const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compilerPath } = require('./typescript.cjs');
const result = spawnSync(process.execPath, [path.join(path.dirname(compilerPath),'tsc.js'),'--noEmit','--pretty','false'], {
    cwd: path.resolve(__dirname,'..'), stdio: 'inherit',
});
process.exit(result.status ?? 1);
