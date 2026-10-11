const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module')
function load(file,mocks={}){const m=new Module(file,module);m.paths=module.paths;m.require=n=>n in mocks?mocks[n]:require(n);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,file);return m.exports}
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
