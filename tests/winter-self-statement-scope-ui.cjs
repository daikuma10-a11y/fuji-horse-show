require('./register-ts.cjs')
const assert=require('node:assert/strict'),React=require('react')
const {WINTER_EVENT_ID:event,WINTER_BANK_DETAILS:bank}=require('../lib/winter-event')
const org='11111111-1111-4111-8111-111111111111',version='a'.repeat(64)
const account={organization:{id:org,name:'検証団体',event_id:event},normalTotal:0,initialTotal:0,horseRegistration:{count:0,unitFee:14000,total:0},extraTotal:15000,adjustmentTotal:0,total:15000,advancePaid:0,extraPaid:8000,remaining:7000,bankDetails:bank,adjustments:[],warnings:[],lines:[{id:'old',action:'追加',competitionLabel:'旧明細',rider:'選手',horse:'馬',amount:8000},{id:'new',action:'追加',competitionLabel:'新明細',rider:'選手',horse:'馬',amount:7000,isOp:true}]}
const context={eventId:event,orgId:org,dates:['2026-11-15'],sources:[{id:'old',date:'2026-11-15',at:'2026-11-14T00:00:00Z'},{id:'new',date:'2026-11-15',at:'2026-11-15T00:00:00Z'}],payments:[{id:'pay',at:'2026-11-14T07:00:00Z',amount:8000,method:'cash_at_venue',reversesId:null}],adjustments:[]}
let state=[],cursor=0,cleanups=[],calls=0,opens=0,prints=0,mode='ok',release,printedPaper='',reloads=0
const original=[React.useState,React.useRef,React.useEffect]
React.useState=initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],x=>state[i]=typeof x==='function'?x(state[i]):x]}
React.useRef=initial=>{const i=cursor++;return state[i]??(state[i]={current:initial})}
React.useEffect=fn=>{const i=cursor++;if(!(i in state)){state[i]=true;cleanups.push(fn())}}
global.fetch=async(url,options)=>{calls++;assert.ok(url.startsWith('/api/winter-self-settlement?'));assert.ok(url.includes('scope=1'));assert.equal(options.method,undefined);assert.equal(options.cache,'no-store');return Response.json(mode==='error'?{error:'取得失敗'}:{account,context,version:mode==='stale'?'b'.repeat(64):version},{status:mode==='error'?409:200})}
const popup={opener:{},closed:false,document:{write:s=>printedPaper=s,close:()=>{},fonts:{ready:new Promise(resolve=>release=resolve)}},focus:()=>{},print:()=>prints++,close:()=>{popup.closed=true}}
global.window={open:()=>{opens++;return popup}}
const {WinterSelfStatementScope}=require('../components/winter-self-statement-scope')
const props={orgId:org,version,method:'bank_transfer',disabled:false,onReload:()=>reloads++,onPrinting:()=>{}}
const render=()=>{cursor=0;return WinterSelfStatementScope(props)}
const view=()=>render().props.children[0].props
const flush=()=>new Promise(resolve=>setImmediate(resolve))
;(async()=>{
 render();await flush();let v=view();assert.equal(calls,1);assert.equal(v.record.document.document.scope.total,7000);assert.equal(v.record.document.document.bankDetails,bank)
 v.onScope({date:'',paymentId:''});v=view();assert.equal(v.record,null);v.onPreview();v.onPreview();await flush();v=view();assert.equal(calls,2);assert.equal(v.record.document.document.scope.total,15000)
 v.onPrint();v.onPrint();assert.equal(opens,1);assert.equal(popup.opener,null);assert.match(printedPaper,/対象明細合計/);assert.match(printedPaper,/後日振込/);release();await flush();assert.equal(prints,1)
 mode='stale';v=view();v.onPreview();await flush();v=view();assert.equal(v.record,null);assert.equal(v.disabled,true);assert.match(v.error,/更新/);render().props.children[1].props.onClick();assert.equal(reloads,1)
 // A new visit drops both the old paper and its chosen scope; failed reads cannot print it.
 cleanups.forEach(fn=>fn?.());state=[];cleanups=[];mode='error';render();await flush();v=view();assert.equal(v.record,null);assert.match(v.error,/取得失敗/);v.onPrint();assert.equal(opens,1)
 console.log('PASS: reception scope GET only, fresh preview, confirmed bank destination, filter reset, no duplicate reads/prints, changed-account gate and next-visitor reset')
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{cleanups.forEach(fn=>fn?.());[React.useState,React.useRef,React.useEffect]=original;delete global.window})
