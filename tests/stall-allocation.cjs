require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {stalls,standardTR,defaultStallOptions:currentOptions,createStallPlan,groupAllocation,stallPlanIssues,readStallPlan,moveStallGroup,editStall,reconcileStallGroups,stallSourceKey}=require('../lib/master/stall-allocation.ts')
const {stallPlanSvg,stallPlanPrintHtml}=require('../lib/master/stall-allocation-print.ts')
// Preserve regression coverage of existing version-1 saved plans without extended layout.
const defaultStallOptions=groups=>{const {layout,...old}=currentOptions(groups);return {...old,smallMax:3,useSCorridor:true}}
const group=(id,n,name=id)=>({id,name,horses:Array.from({length:n},(_,i)=>({id:`${id}-h${i}`,name:`馬${i+1}`}))})
assert.equal(stalls.length,224);assert.equal(stalls.filter(s=>s.wire).length,20)
assert.equal(stalls.filter(s=>s.barn==='S').length,24)
for(let b=1;b<=10;b++){const s=stalls.filter(s=>s.barn===String(b));assert.equal(s.length,20);assert.deepEqual(s.filter(s=>!s.wire).map(s=>s.number),Array.from({length:18},(_,i)=>i+1));assert.ok(s.filter(s=>s.wire).every(s=>s.row===4))}
for(const [total,counts] of [[100,[1,1,1,2,2,2,2,3,3,3,4,4,4,5,5,5]],[101,[1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4]],[150,[1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4]],[151,[1,1,1,1,1,2,2,2,2,2,3,3,3,3,3,4]],[200,[1,1,1,1,1,2,2,2,2,2,3,3,3,3,3,4]]])counts.forEach((expected,i)=>assert.equal(standardTR(total,i+1),expected,`${total}/${i+1}`))
assert.equal(standardTR(100,17),null);assert.equal(standardTR(150,17),null);assert.equal(standardTR(201,3),null);assert.equal(standardTR(151,32),4)
const groups=[group('fuji',9,'ライディングクラブフジファーム'),group('small',2),group('a',8),group('b',5)]
const original=JSON.stringify(groups),p=createStallPlan(groups,defaultStallOptions(groups),'2026-10-30T00:00:00Z')
assert.equal(JSON.stringify(groups),original);assert.deepEqual(stallPlanIssues(p),[])
assert.deepEqual(groupAllocation(p,groups[0]).barns,['S']);assert.deepEqual(groupAllocation(p,groups[1]).barns,['S'])
assert.ok(p.corridors.includes('small'));assert.deepEqual(groupAllocation(p,groups[2]).barns,['1'])
assert.equal(groupAllocation(p,groups[2]).indoor,3);assert.equal(Object.keys(p.tents).length,0)
assert.equal(stalls.filter(s=>s.wire&&p.cells[s.id]?.kind==='horse').length,0)
assert.deepEqual(createStallPlan(groups,defaultStallOptions(groups),p.createdAt),p,'deterministic')
const total150=Array.from({length:10},(_,i)=>group(`g${i}`,15)),o={...defaultStallOptions(total150),smallMax:0}
const p150=createStallPlan(total150,o);assert.equal(Object.keys(p150.tents).length,0)
const total151=[...total150,group('last',1)],p151=createStallPlan(total151,{...defaultStallOptions(total151),smallMax:3})
assert.deepEqual(stallPlanIssues(p151),[]);assert.ok(Object.keys(p151.tents).length>0)
for(let b=1;b<=10;b++)assert.ok(Object.keys(p151.tents).filter(id=>id.startsWith(`${b}:`)).length<=2)
for(const g of total151)if(!groupAllocation(p151,g).corridor)assert.ok(groupAllocation(p151,g).indoor>=1)
// An overcrowded allocation must report every unplaced horse instead of dropping applicants.
const large=Array.from({length:30},(_,i)=>group(`large${i}`,16)),overrides=Object.fromEntries(large.map(g=>[g.id,{count:4,reason:'検証用の個別設定'}]))
const full=createStallPlan(large,{priorityId:'',smallMax:0,useSCorridor:false,trOverrides:overrides})
assert.equal(full.groups.length,30);assert.ok(stallPlanIssues(full).some(s=>s.includes('未配置')));assert.throws(()=>stallPlanPrintHtml(full,'test'),/未配置/)
// Horse stalls may need to span barns to preserve all required TR rooms.
const sixteen=[group('sixteen',16)],split=createStallPlan(sixteen,defaultStallOptions(sixteen))
assert.deepEqual(stallPlanIssues(split),[]);assert.deepEqual(groupAllocation(split,sixteen[0]).barns,['1','2']);assert.equal(groupAllocation(split,sixteen[0]).indoor,5)
// An oversized priority club must not lose S to small clubs.
const priorityLarge=[group('fuji',25,'フジファーム'),group('tiny',2)]
const reserved=createStallPlan(priorityLarge,{...defaultStallOptions(priorityLarge),trOverrides:{fuji:{count:5,reason:'25頭の個別指定'}}})
assert.ok(stallPlanIssues(reserved).some(v=>v.includes('S厩舎の優先団体')))
assert.ok(!Object.keys(reserved.cells).some(id=>id.startsWith('S:')))
const moved=moveStallGroup(p,'b','3');assert.deepEqual(groupAllocation(moved,groups[3]).barns,['3']);assert.deepEqual(stallPlanIssues(moved),[])
assert.throws(()=>moveStallGroup(p,'fuji','1'),/空き/)
const slot=stalls.find(s=>s.barn==='2'&&s.wire).id,h=groups[2].horses[0]
assert.throws(()=>editStall(p,slot,{kind:'horse',groupId:'a',horseId:h.id,note:''},false),/ワイヤー/)
const wire=editStall(p,slot,{kind:'horse',groupId:'a',horseId:h.id,note:'現場確認'},true)
assert.ok(wire.wireHorseSlots.includes(slot));assert.equal(Object.values(wire.cells).filter(c=>c.horseId===h.id).length,1)
const bad=JSON.parse(JSON.stringify(p));bad.cells['10:1']=Object.values(bad.cells).find(c=>c.kind==='horse');assert.throws(()=>readStallPlan(bad),/保存形式/)
assert.throws(()=>readStallPlan({...p,tents:{'1:tent1':'a'}}),/保存形式/)
assert.throws(()=>readStallPlan({...p,template:'other'}),/保存形式/)
const newer=reconcileStallGroups(p,[...groups.slice(0,3),group('new',1)])
assert.ok(stallPlanIssues(newer).some(s=>s.includes('new')));assert.ok(!Object.values(newer.cells).some(c=>c.groupId==='b'))
assert.equal(stallSourceKey(groups),stallSourceKey([...groups].reverse()));assert.notEqual(stallSourceKey(groups),stallSourceKey(newer.groups))
const xss=createStallPlan([group('x',1,'<script>alert(1)</script>')],defaultStallOptions([group('x',1)]))
const svg=stallPlanSvg(xss,'<event>');assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));assert.equal((svg.match(/data-slot=/g)||[]).length,224)
const html=stallPlanPrintHtml(p,'Winter');assert.ok(html.includes('A4 landscape'));assert.ok(html.includes('団体別の割り当て'));assert.ok(html.includes('屋内TRの場所'));assert.ok(html.includes('1厩舎：TR1'));assert.ok(html.includes('TR2'))
console.log('PASS: template topology, all TR bands/boundaries, Fuji/S priority, shared tents, first-fit, capacity overflow, manual moves, braced exceptions, identity/dedup, stale reconciliation, escaped print')
