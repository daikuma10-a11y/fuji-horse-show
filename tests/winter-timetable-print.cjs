require('./register-ts.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {timetablePrintHtml}=require('../lib/master/timetable-print.ts'),{winterTimetablePrintData}=require('../lib/winter-timetable-print.ts')
const prep=require('../config/winter-2026-preparation.json'),ev=prep.eventId
function fixture(){return{eventId:ev,competitions:prep.competitions.map(c=>({id:'c'+c.number,event_id:ev,competition_no:c.number,competition_date:c.date,name:c.name,official:c.official})),entries:prep.competitions.flatMap(c=>['active','active','withdrawn'].map((status,i)=>({entry_id:c.number+'-'+i,event_id:ev,competition_id:'c'+c.number,status,is_op:i===1}))),timetable:prep.competitions.map(c=>({event_id:ev,competition_id:'c'+c.number,inspection_time:'組み換え時間',start_time:c.number==='32'?'15:00':'前競技に引き続き',phase:'provisional'}))}}
const data=fixture(),original=JSON.stringify(data),mapped=winterTimetablePrintData(data),html=timetablePrintHtml(mapped,'2026/11/5 09:00')
const [jumpTable, dressageTable] = [...html.matchAll(/<table>([\s\S]*?)<\/table>/g)].map(match => match[1])
assert(jumpTable.includes('<th>下見開始</th>') && jumpTable.includes('<td>組み換え時間</td>'))
assert(!dressageTable.includes('下見') && !dressageTable.includes('組み換え時間'))
assert(dressageTable.includes('<th>競技開始</th>') && dressageTable.includes('<td>15:00</td>'))
assert(!dressageTable.includes('colspan="5"') && dressageTable.includes('colspan="4"'))
assert.equal(mapped.items.length,40);assert.equal(mapped.items.filter(i=>i.section==='dressage').length,9)
assert(mapped.items.every(i=>i.count===2),'OP counted and withdrawn excluded')
assert.equal((html.match(/data-timetable-sheet/g)||[]).length,1);assert.equal((html.match(/data-competition-id=/g)||[]).length,40)
assert(html.includes('第1競技場')&&html.includes('第2競技場')&&html.includes('15:00'));assert(!html.includes('2025'))
const single=timetablePrintHtml(mapped,'now',['2026-11-15']);assert.equal((single.match(/data-timetable-sheet/g)||[]).length,1);assert.equal((single.match(/data-competition-id=/g)||[]).length,18)
assert.throws(()=>timetablePrintHtml(mapped,'now',['2025-12-12']),/日付/)
assert.throws(()=>timetablePrintHtml(mapped,'now',[]),/日付/)
const weekend=timetablePrintHtml(mapped,'now',['2026-11-15','2026-11-14'])
assert.equal((weekend.match(/data-competition-id=/g)||[]).length,36)
assert(!weekend.includes('2026-11-13'))
assert(weekend.indexOf('data-timetable-date="2026-11-14"')<weekend.indexOf('data-timetable-date="2026-11-15"'),'selected dates retain calendar order')
assert.equal((timetablePrintHtml(mapped,'now',['2026-11-14','2026-11-14']).match(/data-competition-id=/g)||[]).length,18)
assert.throws(()=>winterTimetablePrintData({...data,eventId:'autumn'}),/Winter/)
assert.throws(()=>winterTimetablePrintData({...data,competitions:[{...data.competitions[0],competition_no:'unknown'}]}),/会場設定/)
const unknown=winterTimetablePrintData({...data,timetable:[]});assert(timetablePrintHtml(unknown,'now').includes('未定'))
const hostile={...mapped,title:'<script>alert(1)</script>',items:[{...mapped.items[0],name:'<img onerror="alert(1)">'}]};const escaped=timetablePrintHtml(hostile,'<svg>');assert(!escaped.includes('<script')&&!escaped.includes('<img'));assert(escaped.includes('&lt;img'))
assert.equal(JSON.stringify(data),original)
// Execute the real adapter's print loader, against a mocked GET-only database transport.
const {WinterTimetable}=require('../components/winter-timetable.tsx')
let requests=[]
global.fetch=async(url,options)=>{
 assert(!options.method||options.method==='GET');const u=new URL(url);requests.push(u)
 assert.equal(u.searchParams.get('event_id'),'eq.'+ev)
 const table=u.pathname.split('/').at(-1)
 const values=table==='competitions'?data.competitions.map(c=>({...c,notes:JSON.stringify({winterTimetable:{...data.timetable.find(t=>t.competition_id===c.id),start_time:'16:45'}})})):[]
 return {ok:true,json:async()=>values}
}
;(async()=>{
 const tree=WinterTimetable({data,session:{},onSession(){},onChanged(){}})
 const refreshed=await tree.props.loadPrint(['2026-11-15']);assert(refreshed.includes('16:45')&&!refreshed.includes('15:00'),'reload saved times rather than stale editor props');assert.equal(requests.length,5)
 global.fetch=async()=>{throw Error('offline')};await assert.rejects(tree.props.loadPrint(['2026-11-15']),/offline/)
 if(process.env.TIMETABLE_TEST_OUTPUT){fs.mkdirSync(process.env.TIMETABLE_TEST_OUTPUT,{recursive:true});fs.writeFileSync(path.join(process.env.TIMETABLE_TEST_OUTPUT,'timetable.html'),html)
 for(let mask=1;mask<8;mask++){
  const dates=mapped.dates.filter((d,i)=>mask&(1<<i)).map(d=>d.value)
  fs.writeFileSync(path.join(process.env.TIMETABLE_TEST_OUTPUT,`selection-${mask}.html`),timetablePrintHtml(mapped,'2026/11/5 09:00',dates))
 }
 const long={...mapped,items:mapped.items.map((i,n)=>({...i,name:`確認番号${n+1} ${i.name} 長い競技名の改行と公認表示を含む用紙の収まりを確認`,phase:'final'}))}
 fs.writeFileSync(path.join(process.env.TIMETABLE_TEST_OUTPUT,'long.html'),timetablePrintHtml(long,'2026/11/5 09:00'))}
 console.log('PASS: all 40 competitions in configured arenas/dates, named times, unknown times, active/OP counts, multi-date one-sheet content, escaped content, event guards, fresh saved-data loader and fail-closed offline; no writes')
})().catch(e=>{console.error(e);process.exitCode=1})
module.exports={fixture}
