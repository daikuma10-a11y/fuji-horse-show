require('./register-ts.cjs')
const assert=require('node:assert/strict'),Module=require('node:module'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const fixture=require('./winter-application-fixture.cjs'),originalLoad=Module._load
function hooks(){let index=0;const values=[];return {
 render(fn){index=0;return fn()},
 useState(initial){const i=index++;values[i]??={value:typeof initial==='function'?initial():initial};return [values[i].value,v=>{values[i].value=typeof v==='function'?v(values[i].value):v}]},
 useRef(initial){const i=index++;return values[i]??(values[i]={current:initial})},
 useMemo(fn){index++;return fn()},useEffect(){index++}
}}
let h=hooks(),reads=0,auth=0,authDenied=false,rosterReads=0,network=0,downloadBlob=null,nextApp=fixture(),map=new Map()
const id='11111111-1111-4111-8111-111111111111'
global.fetch=()=>{network++;throw Error('Network forbidden')}
global.window={confirm:()=>true,addEventListener(){},removeEventListener(){}}
global.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}
global.document={createElement:()=>({click(){}})}
const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL
URL.createObjectURL=blob=>{downloadBlob=blob;return 'blob:synthetic'};URL.revokeObjectURL=()=>{}
Module._load=function(name,...args){
 if(name==='react')return {...React,...Object.fromEntries(['useState','useRef','useMemo','useEffect'].map(k=>[k,(...args)=>h[k](...args)]))}
 if(name==='@/lib/winter-application'){const actual=originalLoad.call(this,name,...args);return {...actual,readWinterApplication:async()=>{reads++;return structuredClone(nextApp)}}}
 if(name==='@/lib/shared-roster')return {loadSharedRoster:async()=>{rosterReads++;return {entities:[{id,kind:'rider',name:'合成選手',reading:'ごうせいせんしゅ',jef_number:'',archived_at:null}],clubs:[{id:'club',name:'別所属'}],affiliations:[{entity_id:id,club_id:'club',ended_at:null}],participants:[]}}}
 if(name==='@/lib/supabase-rest')return {verifyAdminSession:async s=>{auth++;if(authDenied)throw Error('管理者権限を確認できません');return s}}
 return originalLoad.call(this,name,...args)
}
const {WinterApplicationImport}=require('../components/winter-application-import.tsx')
const {MasterApplicationReview}=require('../components/master/application-review.tsx')
const {parseApplicationDraft,applicationDraftKey}=require('../lib/winter-application-draft.ts')
const props={session:{accessToken:'synthetic-session-only'},onSession(){}}
const render=()=>h.render(()=>WinterApplicationImport(props)).props
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve();return render()}
const file={name:'synthetic.xlsx',size:1,arrayBuffer:async()=>new ArrayBuffer(1)}
;(async()=>{
 let p=render();assert.equal(p.edited,null);assert.equal(reads,0)
 p.onFiles([file]);p=render();assert.equal(reads,0,'select alone never reads or saves')
 p.onRead();p.onRead();p=await settle();assert.equal(reads,1,'double-click is locked');assert.equal(auth,0);assert.equal(rosterReads,0);assert.equal(p.edited.entries.length,1)
 p.onPaid('0');p=render();p.onAccountChecked(true);p=render();assert.equal(p.review.ready,true)
 p.onLoadRoster();p=await settle();assert.equal(auth,1);assert.equal(rosterReads,1);assert.equal(p.candidates.r1[0].clubs[0],'別所属');assert.deepEqual(p.choices,{})
 p.onChoice('r1',id);p=render();assert.equal(p.choices.r1,id)
 p.onPerson('r1',{name:'訂正選手'});p=render();assert.equal(p.original.people[0].name,'合成選手');assert.equal(p.edited.people[0].name,'訂正選手');assert.equal(p.choices.r1,undefined);assert.equal(p.accountChecked,false)
 p.onReference('TEST-ONLY');p=render();p.onSave();p=await settle();assert.match(p.message,/保存しました/)
 const stored=map.get(applicationDraftKey(p.original.digest));assert.equal(parseApplicationDraft(stored).edited.people[0].name,'訂正選手')
 p.onDownload();p=await settle();const downloaded=await downloadBlob.text();assert.equal(parseApplicationDraft(downloaded).reference,'TEST-ONLY');assert.ok(!downloaded.includes('synthetic-session-only'))
 nextApp=fixture();nextApp.digest='b'.repeat(64);nextApp.people[0].name='訂正版候補';p.onFiles([file]);p=render();p.onRead();p=await settle();assert.ok(p.differences.length);assert.equal(p.edited.people[0].name,'訂正選手','revision comparison does not replace current draft')
 const markup=renderToStaticMarkup(React.createElement(MasterApplicationReview,p));assert.ok(markup.includes('原本請求と料金の照合'));assert.ok(markup.includes('合成選手'));assert.ok(markup.includes('訂正選手'));assert.ok(markup.includes('DBへの登録は行いません'))
 // A different tab saved the same original after our last read.
 map.set(applicationDraftKey(p.original.digest),JSON.stringify({...parseApplicationDraft(stored),reference:'OTHER-TAB'}));p.onSave();p=await settle();assert.match(p.error,/別の確認/);assert.equal(parseApplicationDraft(map.get(applicationDraftKey(p.original.digest))).reference,'OTHER-TAB')
 const bad=JSON.stringify({...parseApplicationDraft(stored),eventId:'Autumn'});p.onRestoreFile({size:bad.length,arrayBuffer:async()=>new TextEncoder().encode(bad).buffer});p=await settle();assert.match(p.error,/Winter/);assert.equal(p.edited.people[0].name,'訂正選手')
 h=hooks();p=render();p.onRestoreFile({size:stored.length,arrayBuffer:async()=>new TextEncoder().encode(stored).buffer});p=await settle();assert.match(p.error,/異なる確認記録/);assert.equal(p.edited,null)
 map.clear();p.onRestoreFile({size:stored.length,arrayBuffer:async()=>new TextEncoder().encode(stored).buffer});p=await settle();assert.equal(p.edited.people[0].name,'訂正選手');assert.equal(p.rosterLoaded,false)
 authDenied=true;const previousReads=rosterReads;p.onLoadRoster();p=await settle();assert.match(p.error,/管理者権限/);assert.equal(rosterReads,previousReads);assert.equal(p.rosterLoaded,false);assert.equal(p.edited.people[0].name,'訂正選手')
 assert.equal(network,0,'no real auth, database or payment requests')
 Module._load=originalLoad;URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke
 console.log('PASS: file selection/read lock, original/edited review, explicit candidates, confirmation invalidation, saved review reload, revision preservation, conflict/auth-data guards and zero real network (component mocks)')
})().catch(e=>{console.error(e);process.exitCode=1})
