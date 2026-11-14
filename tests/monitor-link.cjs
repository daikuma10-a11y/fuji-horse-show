const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module')
function load(file,mocks={}){mocks={'@/lib/monitor-presentation':presentation,...mocks};const m=new Module(file,module);m.paths=module.paths;m.require=n=>n in mocks?mocks[n]:require(n);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,file);return m.exports}
require('./register-ts.cjs')
const presentation=require('../lib/monitor-presentation.ts')
const helper=load('lib/monitor-link.ts')
let context,channels=[],posts=0
function within(c,fn){const old=context;context=c;global.window=c.window;global.document=c.document;try{return fn()}finally{context=old;global.window=old?.window;global.document=old?.document}}
class Channel{constructor(name){this.name=name;this.context=context;channels.push(this)}postMessage(data){assert.ok(++posts<100,'messages must not loop');for(const p of channels)if(p!==this&&!p.closed&&p.name===this.name)within(p.context,()=>p.onmessage?.({data}))}close(){this.closed=true}}
global.BroadcastChannel=Channel
function make(controller){const events={},docEvents={},timers=[],cleanup=[];const c={};c.window={location:{hash:'#fhs-startlist-11111111-1111-4111-8111-111111111111',search:controller?'?control=1':''},scrollX:0,scrollY:0,innerWidth:1280,innerHeight:720,setInterval(fn){timers.push(fn);return timers.length},clearInterval(){},addEventListener(n,fn){events[n]=fn},removeEventListener(n){delete events[n]},scrollTo(pos){this.scrollX=pos.left;this.scrollY=pos.top;events.scroll?.()}};c.window.parent=controller?{}:c.window;c.document={fullscreenElement:null,visibilityState:'visible',querySelectorAll:()=>[{dataset:{monitorCompetition:'第5競技 テスト'},getBoundingClientRect:()=>({top:0,bottom:600})}],addEventListener(n,fn){docEvents[n]=fn},removeEventListener(n){delete docEvents[n]}};c.timers=timers;c.events=events;c.react={useRef:v=>({current:v}),useEffect(fn){const end=fn();if(end)cleanup.push(end)}};c.close=()=>within(c,()=>cleanup.forEach(fn=>fn()));return c}
const external=make(false),replica=make(true)
let externalFont=21,replicaFont=21
const extInput={competition:'第1競技',pending:true,ready:true,fontSize:21,setFontSize:n=>externalFont=n}
const repInput={...extInput,setFontSize:n=>replicaFont=n}
const ext=load('components/monitor-link.tsx',{'react':external.react,'@/lib/monitor-link':helper})
const rep=load('components/monitor-link.tsx',{'react':replica.react,'@/lib/monitor-link':helper})
within(external,()=>ext.useMonitorLink(extInput));const changeFont=within(replica,()=>rep.useMonitorLink(repInput))
within(external,()=>external.timers[0]());assert.equal(replicaFont,21)
within(replica,()=>replica.window.scrollTo({left:0,top:500}));assert.equal(external.window.scrollY,500,'preview controls audience scroll')
within(external,()=>external.window.scrollTo({left:0,top:900}));assert.equal(replica.window.scrollY,900,'audience scroll updates preview')
within(replica,()=>changeFont(18));assert.equal(externalFont,18)
const report={kind:'monitor-status',competition:'第5競技',pending:false,fullscreen:false,ready:true,hidden:false,width:1280,height:720,x:0,y:900,fontSize:18}
assert.equal(helper.isMonitorReport(report),true);assert.equal(helper.isMonitorReport({...report,width:Infinity}),false)
assert.equal(helper.isMonitorReport({...report,fontSize:100}),false)
external.close();replica.close();assert.ok(channels.every(c=>c.closed));console.log('PASS: two-way monitor scroll, font control, status validation, loop prevention and cleanup')

const winterExternal=make(false),winterPreview=make(true)
winterExternal.window.location.hash='';winterPreview.window.location.hash=''
const winterLink=(c,extra)=>within(c,()=>load('components/monitor-link.tsx',{'react':c.react,'@/lib/monitor-link':helper}).useMonitorLink({channelName:'winter-fixture',competition:'日別',ready:true,pending:false,...extra}))
winterLink(winterExternal,{});winterExternal.document.fullscreenElement={}
let seen
winterLink(winterPreview,{onAudienceReport:report=>{seen=report}})
assert.ok(seen.ready && seen.fullscreen,'winter preview immediately requests external status without a hash')
within(winterPreview,()=>winterPreview.window.scrollTo({left:0,top:360}))
assert.equal(winterExternal.window.scrollY,360)
winterExternal.close();winterPreview.close()
console.log('PASS: Winter daily monitor handshake, fullscreen and manual scroll')

const sender=make(false),mini=make(true),queue=[]
class DelayedChannel extends Channel{
 postMessage(data){for(const p of channels)if(p!==this&&!p.closed&&p.name===this.name)queue.push(()=>within(p.context,()=>p.onmessage?.({data})))}
}
global.BroadcastChannel=DelayedChannel
const delivered=[]
mini.document.scrollingElement={scrollHeight:2720}
winterLink(sender,{})
winterLink(mini,{onPreviewScroll:p=>delivered.push(p.y)})
function flush(){for(let count=0;queue.length;count++){assert.ok(count<40);queue.shift()()}}
flush()
within(sender,()=>sender.timers[0]()) // A stale report is already in flight.
within(mini,()=>mini.window.scrollTo({left:0,top:200}))
within(mini,()=>mini.window.scrollTo({left:0,top:420}))
flush()
assert.equal(sender.window.scrollY,420)
assert.equal(mini.window.scrollY,420)
within(sender,()=>sender.window.scrollTo({left:0,top:900}));flush()
within(mini,()=>mini.window.scrollTo({left:0,top:700}));flush()
assert.equal(sender.window.scrollY,700,'immediate reverse is accepted after following external scroll')
sender.close()
within(mini,()=>mini.window.scrollTo({left:0,top:333}));flush()
assert.equal(delivered.at(-1),333,'manual input can reach a monitor on a different device without local reports')
mini.close()
const packet=load('lib/winter-monitor-scroll.ts')
;(async()=>{
 const owner=await packet.createScrollController(),foreign=await packet.createScrollController(),view='2026-11-14/day/0',seen=[]
 const sub=packet.listenToScroll({view,controller:owner.controller},p=>seen.push(p.y))
 const first=await owner.sign(view,{y:120,extent:600,fraction:.2})
 const second=await owner.sign(view,{y:300,extent:600,fraction:.5})
 await sub.receive(second);await sub.receive(first);await sub.receive({...second,sequence:100,y:599})
 await sub.receive(await foreign.sign(view,{y:10,extent:600,fraction:1/60}))
 await sub.receive(await owner.sign('other',{y:90,extent:600,fraction:.15}))
 assert.deepEqual(seen,[300],'ignore late replay, tampered, other view and unauthorized device packets')
 sub.close();await sub.receive(await owner.sign(view,{y:0,extent:600,fraction:0}));assert.deepEqual(seen,[300])
 console.log('PASS queued reports, direction reversal, standalone preview, cross-device authorization and ordering')
})().catch(e=>{console.error(e);process.exitCode=1})
