require('./register-ts.cjs')
const assert=require('node:assert/strict'),Module=require('node:module'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const fixture=require('./winter-application-fixture.cjs'),originalLoad=Module._load
function hooks(){let index=0;const values=[];return {
 render(fn){index=0;return fn()},
 useState(initial){const i=index++;values[i]??={value:typeof initial==='function'?initial():initial};return [values[i].value,v=>{values[i].value=typeof v==='function'?v(values[i].value):v}]},
 useRef(initial){const i=index++;return values[i]??(values[i]={current:initial})},
 useMemo(fn){index++;return fn()},useEffect(){index++}
}}
let h=hooks(),reads=0,auth=0,authDenied=false,contextFailed=false,rosterReads=0,network=0,downloadBlob=null,nextApp=fixture(),map=new Map()
const id='11111111-1111-4111-8111-111111111111',horseId='22222222-2222-4222-8222-222222222222',noNumberId='33333333-3333-4333-8333-333333333333'
let lookupNumbers=[],photoNetwork=0,photoFail=false,cache=new Map(),photoPages=[]
const entities=[{id,kind:'rider',name:'合成選手',reading:'ごうせいせんしゅ',jef_number:'',archived_at:null},
 {id:horseId,kind:'horse',name:'合成馬',reading:'ごうせいうま',jef_number:'900002',archived_at:null},
 {id:noNumberId,kind:'horse',name:'合成馬',reading:'ごうせいうま',jef_number:null,archived_at:null}]
global.fetch=async(url,options)=>{assert.equal(url,'/api/winter-application/photo');photoNetwork++;if(photoFail)throw Error('synthetic connection failure');assert.equal(options.headers.Authorization,'Bearer synthetic-session-only');return new Response(JSON.stringify({application:nextApp}))};Object.defineProperty(global,'navigator',{value:{onLine:true},configurable:true})
global.window={confirm:()=>true,addEventListener(){},removeEventListener(){}}
global.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}
global.document={createElement:()=>({click(){}}),getElementById:()=>null};global.requestAnimationFrame=fn=>fn()
const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL
URL.createObjectURL=blob=>{downloadBlob=blob;return 'blob:synthetic'};URL.revokeObjectURL=()=>{}
Module._load=function(name,...args){
 if(name==='react')return {...React,...Object.fromEntries(['useState','useRef','useMemo','useEffect'].map(k=>[k,(...args)=>h[k](...args)]))}
 if(name==='@/lib/master/application-photo'){const actual=originalLoad.call(this,name,...args);return {...actual,prepareApplicationPhotos:async()=>structuredClone(photoPages),loadApplicationPhotos:async key=>cache.get(key)||null,saveApplicationPhotos:async value=>{if(!cache.has(value.digest))cache.set(value.digest,structuredClone(value));return cache.get(value.digest)}}}
 if(name==='@/lib/winter-application'){const actual=originalLoad.call(this,name,...args);return {...actual,readWinterApplication:async()=>{reads++;return structuredClone(nextApp)}}}
 if(name==='@/lib/winter-application-services')return {winterApplicationServices:()=>({loadRoster:async()=>{if(authDenied)throw Error('管理者権限を確認できません');return {entities:structuredClone(entities),clubs:[],affiliations:[],participants:[]}},load:async numbers=>{lookupNumbers=numbers??[];auth++;if(authDenied)throw Error('管理者権限を確認できません');rosterReads++;if(contextFailed)throw Error('合成料金読込失敗');return {roster:{entities:structuredClone(entities),clubs:[{id:'club',name:'別所属'}],affiliations:[{entity_id:id,club_id:'club',ended_at:null}],participants:[]},riderGrades:lookupNumbers.includes('900001')?[{member_no:'900001',name:'合成選手',rider_grade:'A',import_date:'2026-10-24'}]:[],bindings:[],initial:[],data:{eventId:nextApp.eventId,organizations:[],entries:[],riders:[],horses:[],competitions:[]}}}})}
 if(name==='@/lib/supabase-rest')return {verifyAdminSession:async s=>{auth++;if(authDenied)throw Error('管理者権限を確認できません');return s}}
 return originalLoad.call(this,name,...args)
}
const {WinterApplicationImport}=require('../components/winter-application-import.tsx')
const {MasterApplicationReview}=require('../components/master/application-review.tsx')
const {parseApplicationDraft,applicationDraftKey}=require('../lib/winter-application-draft.ts')
const props={session:{accessToken:'synthetic-session-only'},onSession(){}}
const render=()=>h.render(()=>WinterApplicationImport(props)).props
const settle=async()=>{for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,5));const p=render();if(!p.busy)return p}throw Error('photo action did not settle')}
const file={name:'synthetic.xlsx',size:1,arrayBuffer:async()=>new ArrayBuffer(1)}
;(async()=>{
 const {applicationFromPhotos}=require('../lib/winter-application-photo.ts'),{MasterApplicationPhotoReview}=require('../components/master/application-photo-input.tsx')
 photoPages=[{name:'synthetic.png',digest:'a'.repeat(64),dataUrl:'data:image/png;base64,iVBORw0KGgoAAAAAAAAAAAAAAAAAAAAAAAAAAAA='}]
 nextApp=await applicationFromPhotos(require('./winter-photo-fixture.cjs')(),photoPages)
 let p=render();assert.equal(p.edited,null)
 p.photoInput.props.onRead([file]);p.photoInput.props.onRead([file]);p=await settle();assert.equal(photoNetwork,1);assert.equal(p.edited.entries.length,2);assert.equal(p.edited.people.length,3);assert.equal(p.review.ready,false)
 assert.equal(p.photoInput.key,p.original.digest,'file input resets when a draft opens')
 let markup=renderToStaticMarkup(React.createElement(MasterApplicationPhotoReview,{...p.photoReview.props,pages:[]}));assert.match(markup,/disabled=""/);assert.match(markup,/原本写真がありません/)
 p.photoReview.props.onConfirm(true);p=render();assert.equal(require('../lib/master/application-photo.ts').photoReviewComplete(p.edited),true)
 p.onPerson('r1',{name:'CORRECTED TEST NAME'});p=render();assert.equal(require('../lib/master/application-photo.ts').photoReviewComplete(p.edited),false)
 p.photoReview.props.onStallRequest('訂正した厩舎要望');p=render();assert.equal(p.edited.stallRequest,'訂正した厩舎要望');assert.equal(p.original.stallRequest,'4番厩舎希望')
 p.photoInput.props.onRead([file]);p=await settle();assert.equal(photoNetwork,1);assert.equal(p.edited.people[0].name,'CORRECTED TEST NAME','reselect same photos retains corrections')
 p.onSave();p=await settle();p.onReset();p=await settle();assert.equal(p.edited,null);assert.equal(p.photoInput.key,'new')
 p.photoInput.props.onRead([file]);p=await settle();assert.equal(photoNetwork,1,'cached recognition never calls AI again');assert.equal(p.edited.people[0].name,'CORRECTED TEST NAME')
 p.onReset();p=await settle();photoPages[0].digest='b'.repeat(64);photoFail=true;p.photoInput.props.onRead([file]);p=await settle();assert.equal(p.edited,null);assert.match(p.error,/synthetic connection failure/);assert.equal(photoNetwork,2)
 photoFail=false;navigator.onLine=false;p.photoInput.props.onRead([file]);p=await settle();assert.match(p.error,/通信が必要/);assert.equal(photoNetwork,2)
 assert.equal(network,0);console.log('PASS: actual Winter photo adapter selection lock, no automatic registration, correction/confirmation, original preservation, cache reuse, next-form reset and failed/offline reads (mocked services; no live writes)')
})().catch(e=>{console.error(e);process.exitCode=1})
