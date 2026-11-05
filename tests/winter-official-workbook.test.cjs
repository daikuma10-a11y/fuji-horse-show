require('./register-ts.cjs')
const {test}=require('node:test'), assert=require('node:assert/strict')
const fs=require('node:fs'), path=require('node:path'), {unzipSync,strFromU8}=require('fflate')
const {buildLinkedEventWorkbook}=require('../lib/master/linked-event-workbook')
const layouts=fs.readFileSync(path.join(__dirname,'../public/winter-forms/official-layouts.zip'))
test('競技別の成績表を原本にし、障害と馬場で異なる明細開始行にリンクする',()=>{
 const entries=Array.from({length:62},(_,i)=>['',i+1,'同名','00042','馬＆A','','団体'])
 const jump={number:'①',name:'障害',dressage:false,official:false,venue:'第1競技場',entries}
 const dressage={...jump,number:'15',dressage:true,entries:[['OP',1,'別選手','00001','別馬','','団体']]}
 const files=unzipSync(buildLinkedEventWorkbook(layouts,'大会','2026-11-14',[jump,dressage]))
 const get=i=>strFromU8(files['xl/worksheets/sheet'+i+'.xml'])
 assert.match(get(1),/'①'!C75/);assert.match(get(2),/'15'!C13/);assert.match(get(2),/'15'!C42/)
 assert.match(get(3),/r="D75"[^>]*t="inlineStr"[^>]*>.*?00042/);assert.match(get(4),/RANK\(H13,H\$13:H\$42,0\)/)
 assert.match(get(4),/AVERAGE\(H13,J13,L13,N13,P13\)/)
 assert.doesNotMatch(get(3)+get(4),/#REF!|2025|<c r="H1[34]"[^>]*><v>/)
})
