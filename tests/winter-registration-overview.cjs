require('./register-ts.cjs')
const assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {WINTER_EVENT_ID:eventId}=require('../lib/winter-event.ts')
const {winterRegistrationOverview}=require('../lib/winter-registration-overview.ts')
const {MasterRegistrationOverview}=require('../components/master/registration-overview.tsx')
let network=0;global.fetch=()=>{network++;throw Error('Real requests forbidden')}
const person=(id,name,org)=>({id,name,organization_id:org,event_id:eventId,is_participant:true,roster_source:'shared_roster'})
const comp=(id,no,date)=>({id,competition_no:no,competition_date:date,name:`合成競技${no}`,event_id:eventId})
const entry=(id,competition_id,rider_id,horse_id,organization_id,status='active',is_op=false)=>({entry_id:id,event_id:eventId,competition_id,rider_id,horse_id,organization_id,status,is_op,start_order:1})
const data={eventId,organizations:[{id:'a',name:'団体A',event_id:eventId},{id:'b',name:'団体B',event_id:eventId},{id:'empty',name:'団体C',event_id:eventId}],
 riders:[{...person('r1','同名選手','a'),jef_member_no:'101'},{...person('r2','同名選手','b'),jef_member_no:'202'}],
 horses:[{...person('h1','合成馬','a'),jef_registration_no:'301'},{...person('h2','未出場馬','a'),jef_registration_no:null}],
 competitions:[comp('day2','12','2026-11-14'),comp('circle','④','2026-11-13'),comp('day1','1','2026-11-13')],
 entries:[entry('withdrawn','day2','r1','h1','a','wd'),entry('later','day1','r1','h1','a','active',true),entry('earlier','circle','r2','h1','a')],timetable:[]}
const before=JSON.stringify(data),groups=winterRegistrationOverview(data),a=groups.find(g=>g.id==='a'),b=groups.find(g=>g.id==='b')
assert.equal(a.riders.length,2,'other-club rider appears with affiliation; equal names are not merged')
assert.deepEqual(a.riders.map(p=>p.number).sort(),['101','202'])
assert.equal(a.riders.find(p=>p.id==='r2').organization,'団体B')
assert.equal(a.horses.length,2,'participating horse without a start remains visible')
assert.equal(a.horses.find(p=>p.id==='h2').entryCount,0)
assert.equal(a.activeCount,2);assert.equal(a.withdrawnCount,1)
assert.deepEqual(a.entries.map(e=>e.id),['earlier','later','withdrawn'],'event date and official competition order, including circled numbers')
assert.equal(a.entries[1].isOp,true);assert.equal(a.entries[2].status,'棄権済み')
assert.equal(b.riders.length,1);assert.equal(b.entries.length,0,'entry belongs to its saved organization, not the visiting rider club')
assert.equal(groups.find(g=>g.id==='empty').horses.length,0)
const noOrg=structuredClone(data);delete noOrg.entries[0].organization_id
assert.equal(winterRegistrationOverview(noOrg).find(g=>g.id==='a').withdrawnCount,1,'legacy missing entry organization uses the horse affiliation')
assert.throws(()=>winterRegistrationOverview({...data,eventId:'Autumn'}),/Winter/)
assert.throws(()=>winterRegistrationOverview({...data,entries:[{...data.entries[0],event_id:'Autumn'}]}),/Winter/)
assert.throws(()=>winterRegistrationOverview({...data,entries:[{...data.entries[0],organization_id:'missing'}]}),/団体/)
assert.throws(()=>winterRegistrationOverview({...data,horses:[]}),/人馬/)
let selected='',props={groups,selectedId:'',onSelect:id=>{selected=id}}
const nodes=t=>!t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)]
const list=MasterRegistrationOverview(props),buttons=nodes(list).filter(n=>n.type==='button')
assert.equal(buttons.length,3);buttons[0].props.onClick();assert.equal(selected,'a')
const detail=renderToStaticMarkup(React.createElement(MasterRegistrationOverview,{...props,selectedId:'a'}))
for(const expected of ['選手名簿','馬名簿','未出場馬','出場登録なし','団体B','OP','棄権済み','エントリー一覧（2件'])assert.ok(detail.includes(expected),expected)
nodes(MasterRegistrationOverview({...props,selectedId:'a'})).find(n=>n.type==='button').props.onClick();assert.equal(selected,'')
for(const state of [{loading:true},{error:'読込失敗'}])assert.ok(!renderToStaticMarkup(React.createElement(MasterRegistrationOverview,{...props,...state,selectedId:'a'})).includes('合成馬'),'stale detail is hidden on loading/error')
assert.ok(renderToStaticMarkup(React.createElement(MasterRegistrationOverview,{...props,groups:[]})).includes('登録済みの団体はまだありません'))
assert.ok(renderToStaticMarkup(React.createElement(MasterRegistrationOverview,{...props,groups:[],selectedId:'a'})).includes('団体を選び直してください'))
assert.equal(JSON.stringify(data),before);assert.equal(network,0)
console.log('PASS: saved club grouping, other-club riders, same-name identity separation, unused horses, ordered entries, OP/withdrawals, event guard, list/detail navigation, loading/errors; read-only synthetic data')
