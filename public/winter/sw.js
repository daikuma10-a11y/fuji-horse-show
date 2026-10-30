/* Winter reception only. No API caching, background sync, automatic upload, or queue deletion. */
const META='fhs-winter-shell-pointer-v1',POINTER='/winter/__active-shell',PREFIX='fhs-winter-shell-v1-';
const PAGES=['/winter','/winter/add','/winter/change','/winter/withdraw','/winter/confirm'];
self.addEventListener('install',()=>{});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function active(){return (await caches.open(META)).match(POINTER).then(r=>r?r.json():null)}
async function check(build){const meta=await active();if(!meta||meta.build!==build)return {ready:false,build};const cache=await caches.open(PREFIX+build);for(const path of meta.paths)if(!await cache.match(path))return {ready:false,build};return {ready:true,build}}
self.addEventListener('message',event=>{event.waitUntil((async()=>{try{
 const {type,build}=event.data;let result;
 if(type==='CHECK')result=await check(build);
 else if(type==='PREPARE'){
  const response=await fetch('/winter/offline-assets.json',{cache:'no-store'});if(!response.ok)throw Error('画面の準備一覧を取得できません');
  const manifest=await response.json();if(!/^[a-f0-9]{64}$/.test(manifest.build)||!Array.isArray(manifest.assets)||!manifest.assets.length||manifest.assets.some(p=>!p.startsWith('/_next/static/')||p.includes('..')))throw Error('画面の準備一覧が不正です');
  const cache=await caches.open(PREFIX+manifest.build),paths=[...PAGES,...manifest.assets];
  // Bounded parallelism; a partial cache is never activated.
  for(let i=0;i<paths.length;i+=6)await Promise.all(paths.slice(i,i+6).map(async path=>{
   const r=await fetch(path,{cache:'no-store',credentials:'same-origin',headers:{'X-FHS-Offline-Prepare':'1'}});
   if(!r.ok||r.redirected||new URL(r.url).origin!==self.location.origin)throw Error('受付画面の一部を保存できませんでした');
   if(PAGES.includes(path)){const html=await r.clone().text();if(!html.includes('data-winter-reception-shell="1"'))throw Error('受付画面の形式を確認できません');const refs=[...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+)/g)].map(m=>m[1].replace(/&amp;/g,'&'));if(refs.some(p=>!manifest.assets.includes(p)))throw Error('更新中です。少し待って準備し直してください')}
   await cache.put(path,r);if(!await cache.match(path))throw Error('画面の保存を読み戻せません');
  }));
  await cache.put('/winter/__manifest',new Response(JSON.stringify({build:manifest.build,paths})));
  result={build:manifest.build,ready:true};
 }else if(type==='ACTIVATE'){
  const cache=await caches.open(PREFIX+build),r=await cache.match('/winter/__manifest');if(!r)throw Error('画面を準備してください');const meta=await r.json();for(const p of meta.paths)if(!await cache.match(p))throw Error('画面の保存が不完全です');
  await (await caches.open(META)).put(POINTER,new Response(JSON.stringify(meta)));result=await check(build);
 }else throw Error('未対応の操作です');
 event.ports[0].postMessage(result);
 }catch(e){event.ports[0].postMessage({error:e.message||'端末の画面保存に失敗しました'})}})())});
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);if(u.origin!==self.location.origin||event.request.method!=='GET'||event.request.headers.get('X-FHS-Offline-Prepare'))return;
 // HTML only for actual navigations. Never return HTML to a Next RSC request.
 if(event.request.mode==='navigate'&&PAGES.includes(u.pathname)&&!u.searchParams.has('meeting'))event.respondWith((async()=>{const meta=await active();const cached=meta&&await (await caches.open(PREFIX+meta.build)).match(u.pathname);return cached||fetch(event.request)})());
 else if(u.pathname.startsWith('/_next/static/'))event.respondWith((async()=>{for(const name of (await caches.keys()).filter(n=>n.startsWith(PREFIX))){const r=await (await caches.open(name)).match(u.pathname);if(r)return r}return fetch(event.request)})());
});
