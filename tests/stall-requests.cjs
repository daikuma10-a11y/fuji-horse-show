require('./register-ts.cjs')
const assert=require('node:assert/strict')
const R=require('../lib/master/stall-request.ts'),A=require('../lib/master/stall-allocation.ts')
const {stallPlanSvg,stallPlanPrintHtml}=require('../lib/master/stall-allocation-print.ts')
const {layoutClubSigns,signBox,rowTop,rowHeight,bayWidth}=require('../lib/master/stall-club-signs.ts')
const {reviewStallImport,stallRequestId}=require('../lib/winter-stall-requests.ts')
const g=(id,n,name=id)=>({id,name,horses:Array.from({length:n},(_,i)=>({id:id+'h'+i,name:'検証馬'+i}))})
const groups=[g('fuji',8,'輸送元クラブ'),g('near',6,'輸送共用クラブ'),g('flex',3,'日程調整クラブ'),g('four',5,'希望棟クラブ'),g('next',3,'隣接希望クラブ')]
const request=patch=>({...R.emptyStallRequest(),confirmed:true,...patch})
let o=A.defaultStallOptions(groups);o.priorityId='fuji';o.layout.requests={near:request({neighborId:'fuji',relation:'near',reason:'馬運車の共用'}),flex:request({barn:'S',reason:'入厩日の変更に備える'}),four:request({manual:'4番厩舎が良い',barn:'4'}),next:request({neighborId:'four',relation:'adjacent'})}
let p=A.createStallPlan(groups,o,'2026-10-31T00:00:00Z')
assert.deepEqual(A.stallPlanIssues(p),[]);assert.equal(p.corridors.length,0)
assert.deepEqual(A.groupAllocation(p,groups[2]).barns,['S']);assert.deepEqual(A.groupAllocation(p,groups[3]).barns,['4']);assert.deepEqual(A.groupAllocation(p,groups[4]).barns,['4'])
for(const group of groups)for(const b of A.groupAllocation(p,group).barns)assert.equal(A.zoneComponents(p,group.id,b).length,1)
assert.ok(!A.stalls.some(s=>s.wire&&p.cells[s.id]?.kind==='horse'))
const svg=stallPlanSvg(p,'合成試験'),printed=stallPlanPrintHtml(p,'合成試験')
for(const group of groups){
  assert.ok(printed.includes(group.name), 'retain full names in the detailed assignments')
  const zones=A.barnIds.flatMap(b=>A.zoneComponents(p,group.id,b))
  assert.equal(svg.split('data-zone-label="'+group.id+'"').length-1,zones.length)
}
assert.equal((svg.match(/>TR<\/text>/g)||[]).length,Object.values(p.cells).filter(c=>c.kind==='tr').length)

// One club may have several isolated areas, even in a legacy plan. A single TR
// must keep its own readable marker as well as a club sign in the same bay.
const split=structuredClone(p)
delete split.options.layout
split.groups=[g('left',1,'乗馬クラブ東'),g('right',1,'東馬事センター')]
split.cells=Object.fromEntries([['S:1','left'],['S:3','left'],['S:13','right']].map(([id,groupId])=>[id,{kind:'tr',groupId,horseId:'',note:''}]))
const layout=layoutClubSigns(split)
const splitZones=layout.get('S')
assert.equal(splitZones.length,3)
for(const {slots,sign,groupId} of splitZones){
  const s=slots[0],top=rowTop(s.row),box=signBox(sign,0)
  assert.equal(sign.lines.map(l=>l.text).join(''),split.groups.find(g=>g.id===groupId).name,'retain distinct names')
  assert.ok(box.y>=top+23 && box.y+sign.height<=top+rowHeight-1,'keep the TR, number and club mark clear')
  assert.ok(box.x>=72*s.side && box.x+sign.width<=72*s.side+64,'stay inside the single bay')
}
// The same fixed rectangles are used for an empty plan, this allocation and a sparse legacy plan.
for(const plan of [p,split,{...p,cells:{}}]){
  const rendered=stallPlanSvg(plan,'寸法確認')
  const boxes=[...rendered.matchAll(/<g data-slot="([^"]+)"[^>]*><title>[^<]*<\/title><rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)]
  assert.equal(boxes.length,A.stalls.length)
  for(const [,id,,y,width,height] of boxes){
    const slot=A.stalls.find(s=>s.id===id)
    assert.deepEqual([Number(y),Number(width),Number(height)],[rowTop(slot.row),bayWidth,rowHeight],id)
  }
}
assert.ok(!printed.includes('団体記号一覧'))
assert.ok(printed.includes('団体別の割り当て'))
const corridorOptions=structuredClone(o);corridorOptions.layout.requests.flex.corridor=true
const corridorPlan=A.createStallPlan(groups,corridorOptions);assert.equal(A.groupAllocation(corridorPlan,groups[2]).corridor,true);assert.equal(A.groupAllocation(corridorPlan,groups[0]).corridor,false)
const sameOptions=structuredClone(o);sameOptions.layout.requests.next.relation='same';assert.deepEqual(A.stallPlanIssues(A.createStallPlan(groups,sameOptions)),[])
const awayOptions=structuredClone(o);awayOptions.layout.requests.next.relation='avoid';const away=A.createStallPlan(groups,awayOptions);assert.ok(!A.groupAllocation(away,groups[4]).barns.includes('4'));assert.deepEqual(A.stallPlanIssues(away),[])
o.layout.enabledBarns=o.layout.enabledBarns.filter(b=>b!=='4');p=A.createStallPlan(groups,o);assert.ok(A.stallPlanIssues(p).some(i=>i.includes('希望の4厩舎')))
assert.ok(Object.keys(p.cells).every(id=>!id.startsWith('4:')))
const crowded=[g('a',18),g('b',18)],co=A.defaultStallOptions(crowded);co.layout.enabledBarns=['1'];co.trOverrides={a:{count:3,reason:'試験'},b:{count:3,reason:'試験'}}
assert.ok(A.stallPlanIssues(A.createStallPlan(crowded,co)).some(i=>i.includes('未配置')))
// New layout retains oversized-club split support and never drops horses.
const largeGroup=g('large',16),largePlan=A.createStallPlan([largeGroup],A.defaultStallOptions([largeGroup]))
assert.equal(A.groupAllocation(largePlan,largeGroup).horses,16);assert.ok(A.groupAllocation(largePlan,largeGroup).indoor>=5);assert.deepEqual(A.stallPlanIssues(largePlan),[])
// Same size distribution as the comparison, with fictional identities only.
const comparisonCounts=[7,5,5,4,2,6,1,7,2,8,8,3,3,2,3,3,5,4,7,5,3,6,3,1,8]
const comparisonGroups=comparisonCounts.map((n,i)=>g('test'+i,n)),comparisonOptions=A.defaultStallOptions(comparisonGroups)
comparisonOptions.priorityId='test24';comparisonOptions.layout.extraTR=true
comparisonOptions.layout.requests={test21:request({neighborId:'test24',relation:'near',reason:'共同輸送'}),test12:request({barn:'S',reason:'日程変更に備える'})}
const comparison=A.createStallPlan(comparisonGroups,comparisonOptions)
assert.deepEqual(A.stallPlanIssues(comparison),[]);assert.equal(A.horseTotal(comparisonGroups),111)
assert.equal(Object.values(comparison.cells).filter(c=>c.kind==='tr').length,73)
for(let b=1;b<=8;b++){const count=A.stalls.filter(s=>s.barn===String(b)&&comparison.cells[s.id]?.kind==='horse').length;assert.ok(count>=11&&count<=13)}
assert.ok(!Object.keys(comparison.cells).some(id=>/^(9|10):/.test(id)))
for(const group of comparisonGroups)for(const b of A.groupAllocation(comparison,group).barns)assert.equal(A.zoneComponents(comparison,group.id,b).length,1)
const text=request({manual:'４番厩舎が良い。輸送元クラブの横にして欲しい',confirmed:false})
assert.deepEqual(R.suggestStallRequest(text,groups,'near'),{barn:'4',neighborId:'fuji',relation:'adjacent',issues:[]})
assert.equal(R.suggestStallRequest(request({manual:'4番厩舎以外がよい'}),groups,'near').barn,'')
assert.ok(R.suggestStallRequest(request({manual:'略称クラブの横に'}),groups,'near').issues.length)
const imported={digest:'a'.repeat(64),text:'4番厩舎希望',source:'申込.xlsx 集計!C20'}
const saved=R.mergeStallImport(request({manual:'日程変更があるのでS希望',barn:'S',reason:'運営対応'}),imported)
assert.equal(saved.barn,'S');assert.equal(saved.manual,'日程変更があるのでS希望');assert.equal(saved.confirmed,false)
assert.deepEqual(R.mergeStallImport(saved,imported),saved)
assert.deepEqual(R.mergeStallImport(saved,{...imported,text:''}),saved)
assert.throws(()=>R.mergeStallImport(saved,{...imported,text:'改変'}),/異なります/)
const excel=R.extractStallRequest([{name:'集計',hidden:false,cells:{B20:{value:'要望欄'},C20:{value:'4番厩舎が良い\n輸送元クラブの横にして欲しい'},B21:{value:'電話番号'},C21:{value:'000000'}}}])
assert.equal(excel.stallRequestOrigins.length,1);assert.ok(!excel.stallRequest.includes('000000'))
assert.equal(R.extractStallRequest([{name:'集計',hidden:false,cells:{B20:{value:'要望'},B21:{value:'4番厩舎希望'}}}]).stallRequest,'4番厩舎希望')
assert.equal(R.extractStallRequest([{name:'集計',hidden:false,cells:{B20:{value:'馬房要望欄：'},C20:{value:'4番厩舎希望'}}}]).stallRequest,'4番厩舎希望')
assert.equal(R.extractStallRequest([{name:'集計',hidden:false,cells:{B20:{value:'入厩予定日'},C20:{value:'2026-11-13'}}}]).stallRequest,'')
const draft={original:{digest:'b'.repeat(64),fileName:'test.xlsx',stallRequestOrigins:[]},edited:{club:'希望棟クラブ',stallRequest:'4番厩舎希望'}}
const rows=[{organization_id:'four',request_id:'c'.repeat(64),value:saved}]
const review=reviewStallImport(draft,rows,[{id:'four',name:'希望棟クラブ'}])
assert.equal(review.expectation.value.manual,saved.manual);assert.equal(review.expectation.value.imports.length,2)
assert.ok(reviewStallImport(draft,[{...rows[0],request_id:'d'.repeat(64)}],[{id:'four',name:'希望棟クラブ'}],review.expectation).issues.some(i=>i.includes('別の操作')))
;(async()=>{
 const a=await stallRequestId('four',review.expectation),b=await stallRequestId('four',{expected:review.expectation.expected,value:JSON.parse(JSON.stringify(review.expectation.value))})
 assert.equal(a,b)
 console.log('PASS: contiguous horse/TR zones, barn/near/adjacent constraints, unmet requests/capacity, no wire horses, original extraction, append-only import/manual preservation, review conflict and stable retry IDs')
})().catch(e=>{console.error(e);process.exitCode=1})
