const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const Module = require('node:module')
function load(file, mocks={}) {
  const mod = new Module(file, module)
  mod.paths = module.paths
  mod.require = name => name in mocks ? mocks[name] : require(name)
  mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,file)
  return mod.exports
}
const helper = load('lib/entry-change-marks.ts')
const request = (id,type,fields=[],status='reflected') => ({officialEntryId:id,type,status,change:type==='change'?{changedFields:fields}:undefined})
const rows=[request('a','change',['horse']),request('a','change',['player']),request('a','add'),request('b','change',['op']),request('b','change',['horse'],'pending'),request('c','add',[],'cancelled'),request('missing','add'),request('b','withdraw')]
const snapshot=JSON.stringify(rows)
const marks=helper.collectEntryChangeMarks(rows,new Set(['a','b','c']))
assert.equal(helper.entryChangeLabel(marks.get('a')),'追加・選手変更・馬変更')
assert.equal(helper.entryChangeLabel(marks.get('b')),'OP区分変更')
assert.equal(marks.size,2)
assert.equal(JSON.stringify(rows),snapshot)
assert.deepEqual([...helper.collectEntryChangeMarks([...rows].reverse(),new Set(['a','b','c']))].sort(),[...marks].sort())
assert.equal(helper.entryChangeLabel({adminChangeMark:'changed'}),'変更')
const entries=['a','b','c'].map((id,i)=>({id,competitionId:'comp',order:i+1,playerId:'p'+i,horseId:'h'+i,organizationId:'org',...marks.get(id)}))
const store={entriesByCompetition:()=>entries,getPlayer:id=>({name:id}),getHorse:id=>({name:id}),getOrg:()=>({name:'テスト団体'}),moveEntry:()=>{},reorderSaving:false}
const {StartList}=load('components/start-list.tsx',{'@/lib/store':{useStore:()=>store},'@/lib/entry-change-marks':helper,'@/lib/organization-aliases':{canonicalOrgId:id=>id}})
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const render=props=>renderToStaticMarkup(React.createElement(StartList,{competitionId:'comp',readOnly:true,compact:true,dense:true,...props}))
const html=render({showAdminChanges:true,orderedIds:['b','a','c']})
assert.match(html,/border-green-300 bg-green-50/)
assert.match(html,/border-blue-300 bg-blue-50/)
assert.match(html,/追加・選手変更・馬変更/)
assert.match(html,/OP区分変更/)
assert.ok(html.indexOf('data-start-entry-id="b"')<html.indexOf('data-start-entry-id="a"'))
assert.equal(render({showAdminChanges:false}).includes('追加・選手変更'),false)
entries[0].withdrawn=true
assert.equal(render({showAdminChanges:true}).includes('追加・選手変更'),false)
console.log('PASS: accumulated history, stable IDs, excluded requests, reorder, admin-only colors and withdrawn precedence')
