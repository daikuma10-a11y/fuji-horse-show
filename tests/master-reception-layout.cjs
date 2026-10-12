const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const resolve=Module._resolveFilename;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)}
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f)
const {MasterReceptionHome}=require('../components/master/reception-home.tsx'),{MasterRequestCard}=require('../components/master/request-list.tsx')
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props))
const home=render(MasterReceptionHome,{}),winter=render(MasterReceptionHome,{basePath:'/winter'})
assert.equal(winter.replaceAll('/winter/','/').replace('href="/winter"','href="/"'),home,'Reception layout must be identical with route replacement')
for(const route of ['/add','/change','/withdraw','/settlement','/admin'])assert.ok(winter.includes('href="/winter'+route+'"'))
assert.ok(home.indexOf('href="/withdraw"')<home.indexOf('href="/settlement"'))
const request={type:'change',status:'pending',organization:'テスト所属',createdAt:'2026-10-12T00:00:00Z',before:{competition:'競技1',rider:'選手1',horse:'馬1'},after:{competition:'競技2',rider:'選手2',horse:'馬2',isOp:true},amount:2000,treatedAsWithdrawAdd:true}
const pending=render(MasterRequestCard,{request,actions:React.createElement('button',{},'反映')})
for(const text of ['変更前','変更後','選手1','馬2','（OP）','未反映','¥2,000','棄権＋追加','反映'])assert.ok(pending.includes(text))
const cancelled=render(MasterRequestCard,{request:{...request,status:'cancelled'},actions:null});assert.ok(cancelled.includes('¥0'));assert.ok(cancelled.includes('精算対象外'));assert.ok(!cancelled.includes('¥2,000'))
console.log('PASS: identical tournament home markup with scoped routes; request before/after, OP, saved fee and cancelled exclusion')
