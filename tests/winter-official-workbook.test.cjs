require('./register-ts.cjs')
const {test}=require('node:test'), assert=require('node:assert/strict')
const fs=require('node:fs'), path=require('node:path'), {unzipSync,strFromU8}=require('fflate')
const {buildLinkedEventWorkbook}=require('../lib/master/linked-event-workbook')
const {exportWinterWorkbook}=require('../lib/winter-official-workbook')
const {WINTER_EVENT_ID}=require('../lib/winter-event')
const layouts=fs.readFileSync(path.join(__dirname,'../public/winter-forms/official-layouts.zip'))
test('競技別の成績表を原本にし、障害と馬場で異なる明細開始行にリンクする',()=>{
 const entries=Array.from({length:62},(_,i)=>['',i+1,'同名','00042','馬＆A','','団体'])
 const jump={number:'①',name:'障害',dressage:false,official:false,venue:'第1競技場',entries}
 const dressage={...jump,number:'15',dressage:true,entries:[['OP',1,'別選手','00001','別馬','','団体']]}
 const files=unzipSync(buildLinkedEventWorkbook(layouts,'大会','2026-11-14',[jump,dressage]))
 const get=i=>strFromU8(files['xl/worksheets/sheet'+i+'.xml'])
 assert.match(get(1),/'①'!C75/);assert.match(get(2),/'15'!C13/);assert.match(get(2),/'15'!C42/)
 assert.match(get(3),/r="D75"[^>]*t="inlineStr"[^>]*>.*?00042/);assert.match(get(4),/RANK\(H13,H\$13:H\$52,0\)/)
 assert.match(get(4),/AVERAGE\(H13,J13,L13,N13,P13\)/)
 assert.doesNotMatch(get(3)+get(4),/#REF!|2025|<c r="H1[34]"[^>]*><v>/)
})

test('Winter番号の先頭ゼロと手書き枠を成績表から出番表・印刷範囲まで維持する',()=>{
 const event_id=WINTER_EVENT_ID, date='2026-11-14'
 const competition={id:'c',event_id,competition_date:date,competition_no:'15',name:'馬場',official:false}
 const data={eventId:event_id,competitions:[competition],riders:[],horses:[],entries:[]}
 const identifiers=[['1234','001234'],['001234','0001234'],[null,'']]
 identifiers.forEach(([rider,horse],i)=>{
   data.riders.push({id:'r'+i,event_id,name:'選手',jef_member_no:rider})
   data.horses.push({id:'h'+i,event_id,name:'馬',jef_registration_no:horse})
   data.entries.push({event_id,entry_id:String(i),competition_id:'c',rider_id:'r'+i,horse_id:'h'+i,start_order:i+3,organization_name:'団体',is_op:false,status:'active'})
 })
 const files=unzipSync(exportWinterWorkbook(layouts,data,date))
 const start=strFromU8(files['xl/worksheets/sheet1.xml']), result=strFromU8(files['xl/worksheets/sheet2.xml'])
 const cell=(sheet,at)=>sheet.match(new RegExp('<c r="'+at+'"[^>]*(?:/>|>.*?</c>)'))?.[0]
 assert.match(cell(result,'D13'),/t="inlineStr".*?>01234</)
 assert.match(cell(start,'D14'),/t="str".*?<v>01234<\/v>/)
 assert.match(cell(result,'F14'),/>01234</)
 assert.match(cell(start,'F15'),/<v>01234<\/v>/)
 for(const col of ['D','F']){
  assert.match(cell(start,col+'16'),/<v>-<\/v>/)
  assert.match(cell(result,col+'15'),/>-<\/t>/)
  assert.match(cell(start,col+'48'),/<v><\/v>/)
 }
 assert.match(cell(result,'B16'),/<v>6<\/v>/)
 assert.match(cell(start,'B46'),/'15'!B45.*?<v>35<\/v>/)
 assert.match(cell(start,'B47'),/<v><\/v>/)
 assert.match(cell(start,'C48'),/<v><\/v>/)
 assert.match(strFromU8(files['xl/workbook.xml']),/\$A\$6:\$G\$48/)
})

test('選択した日の競技だけを同じ帳票で印刷し、35番を超えた実出番も保持する',()=>{
 const event_id=WINTER_EVENT_ID,date='2026-11-14'
 const competitions=['1','15'].map(number=>({id:'c'+number,event_id,competition_date:date,competition_no:number,name:'競技'+number,official:false}))
 const entries=Array.from({length:36},(_,i)=>({entry_id:'e'+i,event_id,competition_id:'c1',rider_id:'r',horse_id:'h',organization_name:'団体',start_order:i+1,status:'active'}))
 const data={eventId:event_id,competitions,riders:[{id:'r',event_id,name:'選手'}],horses:[{id:'h',event_id,name:'馬'}],entries}
 const day=unzipSync(exportWinterWorkbook(layouts,data,date))
 for(const [i,c] of competitions.entries()){
  const single=unzipSync(exportWinterWorkbook(layouts,data,date,c.id))
  const book=strFromU8(single['xl/workbook.xml'])
  assert.equal((book.match(/<sheet name=/g)||[]).length,2)
  assert.deepEqual(single['xl/worksheets/sheet1.xml'],day['xl/worksheets/sheet'+(i+1)+'.xml'])
  assert.deepEqual(single['xl/worksheets/sheet2.xml'],day['xl/worksheets/sheet'+(i+3)+'.xml'])
  const sheet=strFromU8(single['xl/worksheets/sheet1.xml'])
  assert.match(sheet,/<c r="B48"[^>]*><f>[^<]+<\/f><v>35<\/v>/)
  if(i===0){
   assert.match(book,/\$A\$49:\$G\$83/)
   assert.match(sheet,/<c r="B49"[^>]*><f>[^<]+<\/f><v>36<\/v>/)
   assert.match(sheet,/<c r="B50"[^>]*><f>[^<]+<\/f><v><\/v>/)
  }else assert.doesNotMatch(book,/\$A\$49:/)
 }
 assert.throws(()=>exportWinterWorkbook(layouts,data,date,'missing'),/競技を確認/)
 assert.throws(()=>exportWinterWorkbook(layouts,data,'2026-11-15','c1'),/競技を確認/)
})
