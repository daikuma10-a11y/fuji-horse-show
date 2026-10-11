const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
function load(file,mocks={}){const full=path.resolve(file),m=new Module(full,module);m.filename=full;m.paths=module.paths;m.require=n=>n in mocks?mocks[n]:require(Module._resolveFilename(n,m));m._compile(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,full);return m.exports}
const event=load('lib/winter-event.ts'),data=load('lib/winter-data.ts',{'./winter-event':event,'./winter-display-order':{}}),api=load('lib/winter-horse-registration.ts',{'./winter-event':event,'./winter-data':data})
const horse=(id,org,participant=true)=>({id,organization_id:org,event_id:event.WINTER_EVENT_ID,name:'同名馬',jef_registration_no:null,roster_source:'shared_roster',is_participant:participant})
const horses=[horse('a','club-a'),horse('b','club-a'),horse('a','club-a'),horse('c','club-b'),horse('d','club-a',false),{...horse('e','club-a'),is_participant:undefined}]
let r=api.winterHorseRegistration(horses,'club-a');assert.equal(r.count,2);assert.equal(r.total,28000);assert.equal(r.unitFee,14000);assert.equal(r.horses.length,2)
assert.equal(api.winterHorseRegistration(horses,'club-b').total,14000);assert.equal(api.winterHorseRegistration(horses,'empty').total,0)
assert.equal(api.winterHorseRegistration([horse('a','club-a'),horse('b','club-a',false)],'club-a').total,14000)
assert.equal(api.winterHorseRegistration([{...horse('x','club-a',false),roster_source:null}],'club-a').total,0)
assert.throws(()=>api.winterHorseRegistration([horse('a','club-a'),{...horse('a','club-a'),name:'違う名前'}],'club-a'),/重複/)
assert.throws(()=>api.winterHorseRegistration([{...horse('a','club-a'),event_id:'autumn'}],'club-a'),/Winter/)
console.log('PASS: official 14000 fee, per-horse ID not per start/name, owning-club billing, only saved participants, count changes, empty club, duplicate/conflict and Autumn guards')
