const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{execFileSync}=require('node:child_process')
const resolve=Module._resolveFilename,load=Module._load
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)}
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f)
const comp={id:'c',date:'2026-09-11',number:1,name:'競技1',entryFee:7000,official:false},to={...comp,id:'c2',number:2,entryFee:10000,name:'競技2'},org={id:'o',name:'選手クラブ'},org2={id:'o2',name:'馬クラブ'},player={id:'p',name:'同名選手',orgId:'o',officialId:'TEST',jefRegistered:true},horse={id:'h',name:'馬',orgId:'o2',officialId:'TEST',jefRegistered:true},entry={id:'e',competitionId:'c',playerId:'p',horseId:'h',organizationId:'o',order:1,isOp:true}
const store={getCompetition:id=>[comp,to].find(c=>c.id===id),getPlayer:()=>player,getHorse:()=>horse,getOrg:id=>[org,org2].find(o=>o.id===id),competitionsByDate:()=>[comp,to],entriesByCompetition:()=>[entry],players:[player],horses:[horse],organizations:[org,org2],stageAdd:()=>{},stageChange:()=>{}}
Module._load=function(id,...args){if(id==='@/lib/store')return {useStore:()=>store};if(id==='next/navigation')return {useRouter:()=>({push:()=>{}})};return load.call(this,id,...args)}
function legacy(file){const m=new Module(path.resolve(file),module);m.filename=path.resolve(file);m.paths=module.paths;m._compile(ts.transpileModule(execFileSync('git',['show','841c888:'+file],{encoding:'utf8'}),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,m.filename);return m.exports.default}
const LegacyAdd=legacy('app/add/page.tsx'),LegacyChange=legacy('app/change/page.tsx'),{MasterAddForm}=require('../components/master/add-form.tsx'),{MasterChangeForm}=require('../components/master/change-form.tsx'),{AutumnDateSelect,AutumnCompetitionList}=require('../components/autumn-reception-selectors.tsx'),{PlayerPicker,HorsePicker}=require('../components/entity-picker.tsx'),{StartList}=require('../components/start-list.tsx'),fees=require('../lib/fees.ts'),{canonicalOrgId}=require('../lib/organization-aliases.ts')
const adapter={...store,homeHref:'/',onExit:()=>{},onStaged:()=>{},DateSelect:AutumnDateSelect,CompetitionList:AutumnCompetitionList,PlayerPicker,HorsePicker,StartList,canonicalOrganizationId:canonicalOrgId,getFee:(c,op)=>fees.calcAddFee(c,op)}
let values=[],cursor=0;const oldState=React.useState,oldRef=React.useRef
React.useState=initial=>{const index=cursor++;return [index<values.length?values[index]:typeof initial==='function'?initial():initial,()=>{}]};React.useRef=initial=>({current:initial})
function render(component,props,state){values=state;cursor=0;return renderToStaticMarkup(React.createElement(component,props))}
try{
 for(const step of ['date','competition','input','confirm']){
  const state=[false,'',step,comp.date,comp,player.id,horse.id,'選手02の前',true,org.id,null]
  assert.equal(render(MasterAddForm,{adapter},state),render(LegacyAdd,{},state),'Autumn add markup: '+step)
 }
 const changeAdapter={...adapter,getFee:s=>s.fromCompetition&&s.toCompetition?(s.treatedAsWithdrawAdd?fees.calcWithdrawAddFee(s.toCompetition,s.toIsOp):fees.calcChangeFee(s.fromCompetition,s.toCompetition,!!s.entry.isOp,s.toIsOp)):null}
 for(const step of ['date','competition','entry','edit','confirm']){
  const state=[false,'',step,comp.date,comp,entry,to.id,player.id,horse.id,false,org.id,null,to.date]
  assert.equal(render(MasterChangeForm,{adapter:changeAdapter},state),render(LegacyChange,{},state),'Autumn change markup: '+step)
 }
 const {MasterPlayerPicker}=require('../components/master/entity-picker.tsx')
 const duplicate={...player,id:'p-other',orgId:'o2'}
 const source={players:[player,duplicate],horses:[horse],organizations:[org,org2]}
 const html=render(MasterPlayerPicker,{source,onSelect:()=>{}},[null]);assert.ok(html.includes('選手クラブ'));assert.ok(html.includes('馬クラブ'));assert.equal((html.match(/1件/g)||[]).length,2,'same person name keeps two affiliations')
 const official=render(MasterPlayerPicker,{source:{...source,players:[player,{...duplicate,jefRegistered:false}]},registeredOnly:true,onSelect:()=>{}},[null]);assert.ok(!official.includes('馬クラブ'))
 console.log('PASS: exact original Autumn add (4 steps) and change (5 steps) markup; shared pickers keep same-name affiliation IDs and official eligibility')
}finally{React.useState=oldState;React.useRef=oldRef;Module._load=load}
