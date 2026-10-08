const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), Module = require('node:module'), path = require('node:path')
function load(relative, mocks = {}) {
 const file = path.resolve(relative), m = new Module(file, module); m.filename = file; m.paths = module.paths
 m.require = name => name in mocks ? mocks[name] : require(Module._resolveFilename(name, m))
 m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, file); return m.exports
}
const event = load('lib/winter-event.ts'), api = load('lib/winter-reception.ts', {'./winter-event':event})
const id='00000000-0000-0000-0000-000000000099'; let mode='pages', offsets=[]
global.fetch=async (url,options)=>{
 assert.equal(options.headers.Authorization,'Bearer admin-test'); const args=JSON.parse(options.body)
 if(url.endsWith('list_winter_reception_requests')) {
  offsets.push(args.p_offset)
  const rows=mode==='pages'?Array.from({length:args.p_offset===0?200:1},()=>({event_id:event.WINTER_EVENT_ID})): [{event_id:'Autumn'}]
  return {ok:true,json:async()=>rows}
 }
 if(mode==='failure') return {ok:false,json:async()=>({message:'保存に失敗'})}
 if(url.endsWith('submit_winter_reception_withdraw')) assert.equal(args.p_id,id)
 return {ok:true,json:async()=>mode==='wrong-id'?'unexpected':id}
}
;(async()=>{
 assert.equal((await api.loadWinterRequests('admin-test')).length,201); assert.deepEqual(offsets,[0,200])
 mode='foreign'; await assert.rejects(api.loadWinterRequests('admin-test'),/Winter以外/)
 mode='good'; assert.equal(await api.submitWinterWithdraw(id,'entry','担当','admin-test'),id)
 mode='wrong-id'; await assert.rejects(api.submitWinterWithdraw(id,'entry','担当','admin-test'),/保存結果/)
 mode='failure'; await assert.rejects(api.reflectWinterRequest(id,'admin-test'),/保存に失敗/)
 await assert.rejects(api.loadWinterRequests(''),/本部ログイン/)
 console.log('PASS: paginated Winter requests, foreign-event rejection, authenticated calls, stable withdrawal ID and explicit save/reflection errors')
})().catch(error=>{console.error(error);process.exitCode=1})
