require('./register-ts.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),Module=require('node:module'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {WinterTimetable}=require('../components/winter-timetable.tsx'),{MasterCompetitionTime}=require('../components/master/timetable.tsx')
const ev=require('../lib/winter-event.ts').WINTER_EVENT_ID
const data={eventId:ev,competitions:[{id:'c',event_id:ev,competition_no:'1',competition_date:'2026-11-13',name:'競技テスト',official:true}],timetable:[{competition_id:'c',event_id:ev,inspection_time:'08:15',start_time:'08:30',phase:'final',updated_at:'old'}],entries:[{competition_id:'c',status:'active'},{competition_id:'c',status:'withdrawn'}]}
const html=renderToStaticMarkup(React.createElement(WinterTimetable,{data,session:{accessToken:'test'},onSession(){},onChanged(){}}))
for(const value of ['タイムテーブル','11/13','11/14','11/15','08:15','08:30','確定','時間を編集','★公認'])assert(html.includes(value),value)
assert(html.includes('text-right">1</td>'),'withdrawn entries are excluded from head count')
const time=renderToStaticMarkup(React.createElement(MasterCompetitionTime,{inspection:'08:15',start:'08:30',phase:'final'}));assert(time.includes('08:15')&&time.includes('08:30')&&time.includes('確定'))
const empty=renderToStaticMarkup(React.createElement(MasterCompetitionTime,{}));assert(empty.includes('未定')&&empty.includes('予定'))
// Drive the real authenticated editor: edits, save arguments, retry conflict, reload and clear.
let state=[],index=0,ref={current:false},calls=[],changed=0,mode='ok'
const hooks={useState(initial){let i=index++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef(){return ref}}
const file=path.resolve('components/winter-timetable-editor.tsx'),m=new Module(file,module);m.paths=module.paths
m.require=n=>n==='react'?hooks:n==='@/lib/supabase-rest'?{verifyAdminSession:async s=>s}:n==='@/lib/winter-data'?{loadWinterData:async()=>({...data,timetable:[{...data.timetable[0],start_time:'09:00',updated_at:'new'}]})}:n==='@/lib/winter-reception'?{winterRpc:async(name,args,token)=>{calls.push({name,args,token});if(mode==='conflict')throw Error('時間が別の操作で更新されています');return{...data.timetable[0],inspection_time:args.p_inspection,start_time:args.p_start,phase:args.p_phase}}}:require(n)
m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,file)
const render=()=>{index=0;return m.exports.WinterTimetableEditor({competitionId:'c',initial:data.timetable[0],session:{accessToken:'test'},onSession(){},onChanged(){changed++}})}
function nodes(t){return !t||typeof t!=='object'?[]:typeof t.type==='function'?nodes(t.type(t.props)):[t,...[t.props?.children].flat(Infinity).flatMap(nodes)]}
function button(t,label){return nodes(t).find(n=>n.type==='button'&&n.props.children===label)}
async function main(){
 let t=render(),inputs=nodes(t).filter(n=>n.type==='input');inputs[1].props.onChange({target:{value:'08:45'}});t=render();button(t,'時間を保存').props.onClick();await new Promise(setImmediate)
 assert.equal(calls[0].name,'save_winter_timetable');assert.equal(calls[0].token,'test');assert.equal(calls[0].args.p_start,'08:45');assert.deepEqual(calls[0].args.p_expected,data.timetable[0]);assert.equal(changed,1)
 mode='conflict';t=render();button(t,'時間を保存').props.onClick();await new Promise(setImmediate);assert.equal(changed,1);assert(nodes(render()).some(n=>n.props?.role==='alert'))
 global.window={confirm:()=>true};t=render();button(t,'最新の時間を読み込む').props.onClick();await new Promise(setImmediate);assert.equal(nodes(render()).filter(n=>n.type==='input')[1].props.value,'09:00')
 mode='ok';t=render();nodes(t).filter(n=>n.type==='input').forEach(n=>n.props.onChange({target:{value:''}}));t=render();button(t,'時間を保存').props.onClick();await new Promise(setImmediate);assert.equal(calls.at(-1).args.p_start,null);assert.equal(calls.at(-1).args.p_inspection,null)
 for(const inspection of ['オープン','組み換え時間']){t=render();let fields=nodes(t).filter(n=>n.type==='select');fields[0].props.onChange({target:{value:inspection}});fields[1].props.onChange({target:{value:'前競技に引き続き'}});t=render();button(t,'時間を保存').props.onClick();await new Promise(setImmediate);assert.equal(calls.at(-1).args.p_inspection,inspection);assert.equal(calls.at(-1).args.p_start,'前競技に引き続き');assert.equal(nodes(render()).filter(n=>n.type==='input').length,0)}
 t=render();nodes(t).filter(n=>n.type==='select').slice(0,2).forEach(n=>n.props.onChange({target:{value:'time'}}));t=render();assert.equal(nodes(t).filter(n=>n.type==='input').length,2);button(t,'時間を保存').props.onClick();await new Promise(setImmediate);assert.equal(calls.at(-1).args.p_start,null);assert.equal(calls.at(-1).args.p_inspection,null)
 const start=fs.readFileSync('components/winter-start-list.tsx','utf8');assert(start.includes('<MasterCompetitionTime inspection={timetable?.inspection_time}'));assert(start.includes('inspection={data.timetable.find(t=>t.competition_id===c.id)'))
 console.log('PASS: daily shared timetable, active counts, saved time/unknown labels, actual editor authenticated save/CAS conflict/reload/clear; screen and print integration')
}
main().catch(e=>{console.error(e);process.exitCode=1})
