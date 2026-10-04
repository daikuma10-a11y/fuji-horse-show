const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module')
function load(file,mocks={},extra='') {
 const mod=new Module(file,module);mod.paths=module.paths;mod.require=name=>name in mocks?mocks[name]:require(name)
 mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText+extra,file)
 return mod.exports
}
const helper=load('lib/startlist-preview.ts')
const entries=['a','b','c'].map((id,i)=>({id,order:i+1,competitionId:'comp',playerId:id,horseId:id,organizationId:'org',isOp:id==='a'}))
const withdrawn={...entries[0],id:'wd',withdrawn:true,order:4}
const draft={ids:['b','a','c'],base:['a','b','c']}
assert.deepEqual(helper.previewEntryOrder([...entries,withdrawn],draft).entries.map(e=>e.id),['b','a','c','wd'])
assert.equal(helper.previewEntryOrder(entries,draft).pending,true)
assert.equal(helper.previewEntryOrder(entries,undefined).pending,false)
assert.equal(helper.previewEntryOrder(entries,{...draft,ids:['a','a','c']}).conflict,true)
assert.equal(helper.previewEntryOrder([...entries,{...entries[0],id:'new'}],draft).conflict,true)
assert.equal(helper.isStartListPreview({kind:'startlist-preview',selectedId:'comp',orders:{comp:draft}}),true)
assert.equal(helper.isStartListPreview({kind:'startlist-preview',selectedId:'comp',orders:{comp:{ids:[3],base:[]}}}),false)
assert.equal(entries[0].order,1)
// Run the actual publisher/receiver React effects with two independent hook contexts.
function hooks() {
 const state=[],refs=[],effects=[];let si=0,ri=0,ei=0,pending=[]
 const api={useState(initial){const i=si++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}]},useRef(initial){const i=ri++;return refs[i]??(refs[i]={current:initial})},useEffect(fn,deps){const i=ei++,old=effects[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()}})},useLayoutEffect(){}}
 return{api,state,render(fn){si=ri=ei=0;pending=[];const tree=fn();pending.forEach(fn=>fn());return tree},close(){effects.forEach(e=>e?.cleanup?.())}}
}
const channels=new Map();let now=10000;const timers=new Map();let ti=0
class Channel{constructor(name){this.name=name;this.closed=false;const group=channels.get(name)||[];group.push(this);channels.set(name,group)}postMessage(data){if(this.muted)return;for(const peer of channels.get(this.name))if(peer!==this&&!peer.closed)peer.onmessage?.({data:structuredClone(data)})}close(){this.closed=true}}
global.BroadcastChannel=Channel
const originalNow=Date.now;Date.now=()=>now
let opened=''
const listeners=new Map()
global.window={addEventListener(name,fn){listeners.set(name,fn)},removeEventListener(name){listeners.delete(name)},location:{hash:''},open(url){opened=url;return{}},setInterval(fn){timers.set(++ti,fn);return ti},clearInterval(id){timers.delete(id)}}
global.localStorage={getItem:()=>null,setItem(){}}
global.sessionStorage={getItem:()=>'{"accessToken":"test"}',setItem(){}}
let current=entries
const competition={id:'comp',number:1,name:'テスト',date:'day'}
const store={competitions:[competition],competitionsByDate:()=>[competition],entriesByCompetition:()=>current,getPlayer:id=>({name:id}),getHorse:id=>({name:id}),getOrg:()=>({name:'所属'}),reconciliation:{state:'verified'},lastSyncedAt:1,syncError:'',liveConnected:true,applySavedEntryOrder(_id,ids){current=helper.previewEntryOrder(current,{ids,base:current.map(e=>e.id)}).entries}}
const vh=hooks(),mh=hooks(),StartList=()=>null
const {StartListViewer}=load('components/admin/startlist-viewer.tsx',{'react':vh.api,'@/lib/store':{useStore:()=>store},'@/lib/mock-data':{COMPETITION_DATES:[{value:'day',label:'日'}]},'@/lib/entry-change-marks':{entryChangeLabel:()=>''},'@/lib/startlist-preview':helper,'@/components/start-list':{StartList},'@/components/official-badge':{OfficialBadge:()=>null},'@/lib/supabase-rest':{ADMIN_SESSION_KEY:'session',refreshAdminSession:async session=>session,reorderEntries:async()=>{}}})
const monitor=load('components/startlist-monitor.tsx',{'react':mh.api,'@/lib/store':{useStore:()=>store},'@/lib/mock-data':{COMPETITION_DATES:[{value:'day',label:'日'}]},'@/lib/startlist-preview':helper,'@/lib/meeting-monitor':{monitorRows:rows=>rows.map(e=>({id:e.id,order:e.order,player:e.id,horse:e.id,organization:'所属',op:e.isOp,withdrawn:e.withdrawn}))}},'\nexports.TestMonitor=OfficialStartListMonitor;')
function nodes(tree){if(!tree||typeof tree!=='object')return[];return[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)]}
function text(tree){if(typeof tree==='string'||typeof tree==='number')return String(tree);if(!tree)return'';return[tree.props?.children].flat(Infinity).map(text).join('')}
const view=()=>vh.render(()=>StartListViewer({})),screen=()=>mh.render(()=>monitor.TestMonitor())
function button(tree,label){return nodes(tree).find(n=>n.type==='button'&&text(n)===label)}
async function main(){
 vh.state[1]='comp';let v=view();button(v,'モニター表示').props.onClick();v=view()
 assert.match(opened,/^\/startlist-display#fhs-startlist-/);window.location.hash='#'+opened.split('#')[1]
 let m=screen();m=screen();assert.ok(text(m).includes('（正式）'))
 nodes(v).find(n=>n.type===StartList).props.onReorder('a','b');v=view();m=screen()
 assert.deepEqual(mh.state[2].orders.comp.ids,['b','a','c']);assert.ok(text(m).includes('確認中・未確定'))
 button(v,'変更を取り消す').props.onClick();v=view();m=screen();assert.deepEqual(mh.state[2].orders,{});assert.ok(text(m).includes('（正式）'))
 nodes(v).find(n=>n.type===StartList).props.onReorder('a','b');v=view();button(v,'出番順を保存').props.onClick();for(let i=0;i<8;i++)await Promise.resolve();v=view();m=screen()
 assert.deepEqual(current.map(e=>e.id),['b','a','c']);assert.deepEqual(mh.state[2].orders,{});assert.ok(text(m).includes('（正式）'))
 nodes(v).find(n=>n.type===StartList).props.onReorder('a','b');v=view();m=screen();assert.ok(text(m).includes('未確定'))
 current=[...current,{...current[0],id:'new',order:4}];m=screen();assert.ok(text(m).includes('正式表が更新されたため'))
 const sender=[...channels.values()].flat().find(c=>!c.closed&&c.onmessage&&c.name===opened.split('#')[1]);sender.muted=true;now+=9000;for(const fn of [...timers.values()].slice(-1))fn();m=screen();assert.equal(mh.state[2],null);assert.ok(text(m).includes('連携が終了'));
 sender.muted=false;vh.close();m=screen();assert.equal(mh.state[2],null);assert.ok(text(m).includes('連携が終了'))
 mh.close();Date.now=originalNow
 console.log('PASS: draft order, OP/withdrawn preservation, stale/invalid order rejection; two-window live preview, cancellation, save, conflict and disconnect fallback')
}
main().catch(error=>{console.error(error);process.exitCode=1})
