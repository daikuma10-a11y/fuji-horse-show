const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const listeners={},storage=new Map(),build='a'.repeat(64),assets=['/_next/static/a.js','/_next/static/b.css'];let network=true,failPath='',claims=0,requests=[];
const caches={async open(name){if(!storage.has(name))storage.set(name,new Map());const m=storage.get(name);return {async put(k,v){m.set(k,v.clone())},async match(k){return m.get(k)?.clone()}}},async keys(){return [...storage.keys()]}};
const self={location:{origin:'https://winter.test'},clients:{async claim(){claims++}},addEventListener:(type,fn)=>listeners[type]=fn};
const fetch=async(request)=>{const path=typeof request==='string'?request:new URL(request.url).pathname;requests.push(path);if(!network||path===failPath)throw Error('offline');let r=path==='/winter/offline-assets.json'?Response.json({build,assets}):new Response(path.startsWith('/_next/')?'asset':'<div data-winter-reception-shell="1"><script src="/_next/static/a.js"></script>受付</div>');Object.defineProperty(r,'url',{value:'https://winter.test'+path});return r};
vm.runInNewContext(fs.readFileSync('public/winter/sw.js','utf8'),{self,caches,fetch,URL,Response,Promise,Error});
async function message(type,b=build){let result,work;listeners.message({data:{type,build:b},ports:[{postMessage:r=>result=r}],waitUntil:p=>work=p});await work;return result}
async function navigation(path,mode='navigate',headers={get:()=>null}){let response;listeners.fetch({request:{url:'https://winter.test'+path,method:'GET',mode,headers},respondWith:p=>response=p});return response?await response:null}
;(async()=>{
 assert.equal((await message('CHECK')).ready,false);assert.equal((await message('PREPARE')).ready,true);assert.equal((await message('CHECK')).ready,false,'precache alone is not readiness');assert.equal((await message('ACTIVATE')).ready,true);
 network=false;for(const p of ['/winter','/winter/add','/winter/change','/winter/withdraw','/winter/confirm'])assert.match(await (await navigation(p)).text(),/受付/);assert.equal(await (await navigation(assets[0],'cors')).text(),'asset');
 assert.equal(await navigation('/winter/admin'),null);assert.equal(await navigation('/winter/settlement'),null);assert.equal(await navigation('/winter/add?meeting=1'),null);assert.equal(await navigation('/winter/add?_rsc=123','cors'),null);assert.equal(await navigation('/api/winter-reception','cors'),null);
 network=true;failPath='/winter/change';assert.ok((await message('PREPARE')).error);assert.equal((await message('CHECK')).ready,true,'failed refresh preserves old complete shell');
 storage.get('fhs-winter-shell-v1-'+build).delete(assets[1]);assert.equal((await message('CHECK')).ready,false,'eviction/incomplete cache is not ready');
 let work;listeners.activate({waitUntil:p=>work=p});await work;assert.equal(claims,1);assert.ok(storage.has('fhs-winter-shell-v1-'+build),'updates do not delete caches');
 assert.equal(listeners.sync,undefined);assert.equal(listeners.online,undefined);
 console.log('PASS: complete-shell activation, offline HTML and assets, RSC/admin/settlement/API exclusions, failed preparation, cache eviction, no automatic upload or destructive activation; service-worker protocol simulation, not iPad')
})().catch(e=>{console.error(e);process.exitCode=1});
