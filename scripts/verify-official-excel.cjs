const fs = require('fs'), path = require('path'), ts = require('typescript'), assert = require('node:assert/strict')
const { unzipSync, zipSync, strFromU8, strToU8 } = require('fflate')
const cache = new Map()
function load(file) {
  if (!path.extname(file)) file += '.ts'
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020 } }).outputText)(name => name.startsWith('.') ? load(path.resolve(path.dirname(file),name)) : require(name),module,module.exports)
  return module.exports
}
const { exportOfficialExcel, entryValues } = load(path.resolve('lib/official-excel.ts'))
const template = fs.readFileSync('templates/autumn-1-10.xlsm')
const fixture = Array.from({ length: 10 }, (_, index) => ({ entry_id:`entry-${index}`, competition_no:String(index+1), start_order:1, status:index===0?'withdrawn':'active', rider_name:'検証選手<&', jef_member_no:'00123', horse_name:'検証馬', jef_registration_no:'00456', organization_name:'検証団体', is_op:true }))
const original = unzipSync(template), output = unzipSync(exportOfficialExcel(template, fixture, new Date('2026-10-02T07:40:00Z')))
assert.deepEqual(entryValues(fixture[0]).slice(0,2),['WD',1])
const changed = Object.keys(original).filter(key => !Buffer.from(original[key]).equals(Buffer.from(output[key])))
assert.equal(changed.length,21)
assert(changed.every(key => key==='xl/workbook.xml' || /^xl\/worksheets\/sheet(?:[2468]|1[02468]|20|2[1-9]|30)\.xml$/.test(key)))
assert(Buffer.from(original['xl/vbaProject.bin']).equals(Buffer.from(output['xl/vbaProject.bin'])))
for(let number=1;number<=10;number++) {
  const score=`xl/worksheets/sheet${number+20}.xml`, start=`xl/worksheets/sheet${number*2}.xml`
  const stripInputs=xml=>xml.replace(/<c\b[^>]*\br="[A-G](?:1[4-9]|[2-9]\d)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g,'')
  assert.equal(stripInputs(strFromU8(original[score])),stripInputs(strFromU8(output[score])))
  const formulas=xml=>[...xml.matchAll(/<f\b[^>]*(?:\/>|>[\s\S]*?<\/f>)/g)].map(match=>match[0])
  assert.deepEqual(formulas(strFromU8(original[start])),formulas(strFromU8(output[start])))
  assert(strFromU8(output[score]).includes('検証選手&lt;&amp;'))
  assert(strFromU8(output[start]).includes('<v>00123</v>'))
  assert(strFromU8(output[start]).includes('<v>00456</v>'))
  assert(!strFromU8(output[score]).includes('<t xml:space="preserve">小野'))
}
const scored = { ...original }
scored['xl/worksheets/sheet21.xml']=strToU8(strFromU8(scored['xl/worksheets/sheet21.xml']).replace(/<c r="H14"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/, '<c r="H14"><v>0</v></c>'))
assert.throws(()=>exportOfficialExcel(zipSync(scored),fixture),/成績欄/)
assert.throws(()=>exportOfficialExcel(template,[]),/空/)
assert.throws(()=>exportOfficialExcel(template,[{...fixture[0],start_order:2}]),/連続/)
assert.throws(()=>exportOfficialExcel(template,[{...fixture[0],rider_name:''}]),/未確認/)
assert.throws(()=>exportOfficialExcel(template,Array.from({length:61},(_,index)=>({...fixture[0],entry_id:String(index),start_order:index+1}))),/行数/)
const { loadOfficialExcelEntries } = load(path.resolve('lib/supabase-rest.ts'))
;(async()=>{
  let calls=0
  global.fetch=async()=>{calls++;return {ok:false}}
  await assert.rejects(loadOfficialExcelEntries('invalid'),/認証/);assert.equal(calls,1)
  calls=0;global.fetch=async()=>{calls++;return {ok:true,json:async()=>({app_metadata:{role:'customer'}})}}
  await assert.rejects(loadOfficialExcelEntries('customer'),/認証/);assert.equal(calls,1)
  calls=0;global.fetch=async url=>{calls++;return {ok:true,json:async()=>url.includes('/auth/')?{app_metadata:{role:'admin'}}:fixture}}
  assert.deepEqual(await loadOfficialExcelEntries('admin'),fixture);assert.equal(calls,2)
  console.log('Official Excel: 10 competitions / WD before OP / leading-zero IDs / formula, style and macro preservation / old-row clearing / score protection / auth guards: PASS')
})().catch(error=>{console.error(error);process.exitCode=1})
