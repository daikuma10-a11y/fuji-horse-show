// Check resolved HTML metadata and actual launch routes, not just source literals.
const assert=require('node:assert/strict')
const base=new URL(process.argv[2]??'http://127.0.0.1:3100')
const read=async path=>{const r=await fetch(new URL(path,base),{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,path);return r}
const attr=(tag,name)=>tag.match(new RegExp('\\b'+name+'="([^"]*)"'))?.[1]
async function run(){
 for(const path of ['/winter','/winter/settlement','/winter/admin','/winter/add','/winter/change','/winter/withdraw']){
  const html=await (await read(path)).text()
  const manifests=(html.match(/<link\b[^>]*>/g)??[]).filter(tag=>attr(tag,'rel')==='manifest')
  assert.equal(manifests.length,1,path+' must have one manifest')
  assert.equal(attr(manifests[0],'href'),'/winter/manifest.webmanifest',path)
  const apple=(html.match(/<meta\b[^>]*>/g)??[]).find(tag=>attr(tag,'name')==='apple-mobile-web-app-title')
  assert.equal(attr(apple??'','content'),'FHS Winter',path)
 }
 const response=await read('/winter/manifest.webmanifest')
 assert.match(response.headers.get('content-type'),/application\/manifest\+json/)
 const manifest=await response.json(),launch=new URL(manifest.start_url,base),scope=new URL(manifest.scope,base)
 assert.equal(manifest.id,'/winter')
 assert.equal(launch.origin,base.origin)
 assert.equal(launch.pathname,'/winter')
 assert(launch.href.startsWith(scope.href),'launch must remain inside Winter scope')
 assert(!new URL('/',base).href.startsWith(scope.href),'Autumn home must be outside Winter scope')
 assert.equal(manifest.short_name,'FHS Winter')
 assert.equal(manifest.display,'standalone')
 const home=await (await read(launch.pathname)).text()
 for(const action of ['add','change','withdraw','settlement'])assert(home.includes('href="/winter/'+action+'"'),'Winter launch action '+action)
 for(const icon of manifest.icons)assert.match((await read(icon.src)).headers.get('content-type'),/^image\//)
 // Existing Autumn install behavior is untouched.
 const autumn=await (await read('/')).text()
 const autumnLinks=(autumn.match(/<link\b[^>]*>/g)??[]).filter(tag=>attr(tag,'rel')==='manifest')
 assert.equal(autumnLinks.length,1)
 assert.equal(attr(autumnLinks[0],'href'),'/manifest.webmanifest')
 const original=await (await read('/manifest.webmanifest')).json()
 assert.equal(original.start_url,'/')
 assert.equal(original.scope,'/')
 console.log('PASS: six Winter routes use one dedicated manifest; launch stays in Winter; four reception actions and icon load; Autumn manifest unchanged (HTTP checks, not physical iPad installation)')
}
run().catch(e=>{console.error(e);process.exitCode=1})
