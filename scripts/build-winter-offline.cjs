// Run after next build so every lazy chunk used by the shared reception UI is available offline.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)])}
const list=files('.next/static').sort(),assets=list.map(p=>'/'+p.replace(/^\.next\//,'_next/'));
const hash=crypto.createHash('sha256');for(const f of list){hash.update(f);hash.update(fs.readFileSync(f))}
fs.mkdirSync('public/winter',{recursive:true});fs.writeFileSync('public/winter/offline-assets.json',JSON.stringify({build:hash.digest('hex'),assets}));
console.log(`Winter offline shell: ${assets.length} assets (no reception data)`);
