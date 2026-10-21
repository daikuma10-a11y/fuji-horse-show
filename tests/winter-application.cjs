require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {zipSync,strToU8}=require('fflate')
const {readInputXlsx}=require('../lib/master/xlsx-input.ts')
const {extractWinterApplication,applicationReview,applicationDifferences,rosterCandidates}=require('../lib/winter-application.ts')
// Entirely synthetic cells; no participant data or original workbook is bundled.
const sheet=(name,values)=>({name,hidden:false,cells:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{value:String(v)}]))})
const fixture=()=>({sheets:[
 sheet('選手名簿',{A2:'選手名簿',A66:30,B67:'ダミー 選手',B66:'だみーせんしゅ',E66:'未登録',C76:'団体名',D76:'試験クラブ'}),
 sheet('馬匹名簿',{H1:'馬匹名簿',A63:20,B64:'試験馬',B63:'しけんうま'}),
 sheet('障害',{D145:'種目',E145:'馬名',J145:'試験馬号',C146:5,J146:'ダミー 選手'}),
 sheet('馬場',{D81:'馬名',F81:'号'}),
 sheet('申込集計書',{A1:'2026 Fuji Horse Show Winter Grand Prix',A2:'申込集計書',F6:14000,F7:5000,F8:0,F10:19000})
]})
const extract=b=>extractWinterApplication(b,'dummy.xlsx','0'.repeat(64))
const app=extract(fixture())
assert.deepEqual(app.people.map(p=>p.key),['r30','h20']);assert.equal(app.entries.length,1);assert.equal(app.entries[0].rider,'r30');assert.equal(app.entries[0].horse,'h20')
assert.equal(applicationReview(app,'0',true).ready,false,'membership is never guessed')
app.people[0].sportsMember='会員'
assert.equal(applicationReview(app,'0',true).ready,true)
assert.equal(applicationReview(app,'',true).ready,false,'planned transfer is never treated as paid')
assert.equal(applicationReview(app,'0',false).ready,false)
let copy=structuredClone(app);copy.amounts.total='1';assert.match(applicationReview(copy,'0',true).amounts[3].reason,/確認/)
const book=fixture();book.sheets.push(sheet('JUMP (2)',{D4:'種目',E4:'馬名',J4:'試験馬号',C5:5,J5:'ダミー 選手'}));book.sheets[5].hidden=true
let parsed=extract(book);assert.equal(parsed.entries.length,2);assert.equal(applicationReview(parsed,'0',true).ready,false,'copied duplicate is blocked')
book.sheets[5].cells.J5.value='(ダミー 選手)\n未照合の選手';parsed=extract(book);assert.equal(parsed.entries[1].op,true);assert.equal(parsed.entries[2].rider,'')
const changed=structuredClone(app);changed.entries=[];assert.ok(applicationDifferences(app,changed).some(d=>d.kind==='取消候補'));assert.equal(app.entries.length,1,'diff never edits original')
const roster={entities:[{id:'one',kind:'rider',name:'ダミー選手',reading:'',jef_number:'',archived_at:null}],clubs:[],affiliations:[],participants:[]}
assert.equal(rosterCandidates(app.people[0],roster,app.club).length,1);assert.equal(app.people[0].entityId,undefined,'suggestion is not a binding')
const wrong=fixture();wrong.sheets[4].cells.A1.value='Autumn';assert.throws(()=>extract(wrong),/Winter/)
const err=fixture();err.sheets[0].cells.B67={value:'#REF!',error:true};assert.ok(extract(err).issues.length)
const missing=fixture();missing.sheets[0].cells.B67={value:'',formula:'other!A1'};assert.ok(extract(missing).issues.length)
function zip(cell,extra={}){const files={
 '[Content_Types].xml':'<Types/>',
 'xl/workbook.xml':'<workbook><sheets><sheet name="テスト" r:id="r1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':`<worksheet><sheetData><row r="1">${cell}</row></sheetData></worksheet>`,
 'xl/sharedStrings.xml':'<sst><si><r><t>試験</t></r><rPh><t>ふりがな</t></rPh><r><t>名</t></r></si></sst>',
 'xl/styles.xml':'<styleSheet><numFmts><numFmt numFmtId="164" formatCode="000000"/></numFmts><cellXfs><xf numFmtId="164"/></cellXfs></styleSheet>',...extra}
 return zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])))}
let x=readInputXlsx(zip('<c r="A1" t="s"><v>0</v></c><c r="B1" s="0"><v>123</v></c>'))
assert.equal(x.sheets[0].cells.A1.value,'試験名');assert.equal(x.sheets[0].cells.B1.value,'000123')
assert.throws(()=>readInputXlsx(zip('<c r="A1" t="s"/>')),/番号/)
assert.throws(()=>readInputXlsx(zip('',{'[Content_Types].xml':'macroEnabled'})),/マクロ/)
assert.throws(()=>readInputXlsx(zip('',{'xl/_rels/workbook.xml.rels':'<Relationship Id="r1" Target="https://invalid.test" TargetMode="External"/>'})),/外部/)
assert.throws(()=>readInputXlsx(new Uint8Array(8_000_001)),/8MB/)
console.log('PASS: last roster slots, hidden/copied entry sheets, explicit identity candidates, source diffs, fee/membership/paid guards, XML values and unsupported inputs')
