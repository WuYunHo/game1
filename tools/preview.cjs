const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { transpile } = require('./typescript.cjs');
const root = path.resolve(__dirname,'..');
const port = Number(process.env.PORT || 4173);
function bundle() {
    const names=['FishRushModel','FishRushPresentation'];
    let output='const modules = Object.create(null);\n';
    for(const name of names) {
        const file=path.join(root,'assets/scripts',name+'.ts');
        output+=`modules['./${name}'] = function(module,exports,require){\n${transpile(fs.readFileSync(file,'utf8'),file)}\n};\n`;
    }
    return output+`const cache = {}; function require(name) { if(cache[name]) return cache[name].exports; const m=cache[name]={exports:{}}; modules[name](m,m.exports,require); return m.exports; }
    window.FishRush = { ...require('./FishRushModel'), ...require('./FishRushPresentation') };\n`;
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};
http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/game.js') { res.writeHead(200,{'Content-Type':types['.js'],'Cache-Control':'no-store'}); res.end(bundle()); return; }
    const relative=pathname==='/'?'preview/index.html':pathname.slice(1);
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep) || !(relative.startsWith('preview/') || relative.startsWith('assets/resources/art/'))) {
        res.writeHead(403);res.end();return;
    }
    fs.readFile(file,(error,data)=>{
        if(error){res.writeHead(404);res.end('Not found');return;}
        res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
    });
}).listen(port,'127.0.0.1',()=>console.log(`Fish Rush preview: http://127.0.0.1:${port}`));
