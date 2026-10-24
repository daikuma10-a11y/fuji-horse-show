// Component contract tests; browser interaction is a separate, explicit check.
require('./register-ts.cjs')
const assert=require('node:assert/strict'),Module=require('node:module')
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const originalLoad=Module._load
function hooks(){
 const cells=[],effects=[];let index=0,pending=[]
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
 const api={...React,
  useState(initial){const i=index++;cells[i]??={value:typeof initial==='function'?initial():initial};return[cells[i].value,v=>{cells[i].value=typeof v==='function'?v(cells[i].value):v}]},
  useRef(initial){const i=index++;return cells[i]??(cells[i]={current:initial})},
  useCallback(fn,deps){const i=index++;if(!cells[i]||!equal(cells[i].deps,deps))cells[i]={fn,deps};return cells[i].fn},
  useEffect(fn,deps){const i=index++;if(!cells[i]||!equal(cells[i].deps,deps))pending.push(()=>{cells[i]?.cleanup?.();cells[i]={deps,cleanup:fn()};effects.push(i)})},
 }
 return{api,render(fn){index=0;pending=[];const tree=fn();pending.forEach(f=>f());return tree},close(){[...new Set(effects)].forEach(i=>cells[i]?.cleanup?.())}}
}
let h=hooks(),saved=null,hash='',writes=0
const hookApi={...React,...Object.fromEntries(['useState','useRef','useCallback','useEffect'].map(name=>[name,(...args)=>h.api[name](...args)]))}
const data={eventId:'mock-winter',organizations:[],riders:[],horses:[],competitions:[],entries:[],timetable:[]}
const stubs={};const stub=name=>stubs[name]??(stubs[name]=Object.assign(()=>null,{displayName:name}))
global.window={location:{get hash(){return hash}}};global.sessionStorage={getItem:()=>saved,setItem:(_key,value)=>{saved=value},removeItem:()=>{saved=null}}
global.requestAnimationFrame=fn=>{fn();return 1};global.document={getElementById:()=>({focus(){},scrollIntoView(){}})}
global.fetch=()=>{writes++;throw new Error('No network allowed')}
Module._load=function(id,...args){
 if(id==='react')return hookApi
 if(id==='next/link')return stub('Link')
 if(id==='@/lib/supabase-rest')return{verifyAdminSession:async session=>session,signInAdmin:async()=>{throw Error('Not part of this test')}}
 if(id==='@/lib/winter-data')return{loadWinterData:async()=>data}
 if(id==='@/lib/winter-live')return{subscribeWinterUpdates:()=>()=>{}}
 if(id.startsWith('@/components/')&&!['@/components/winter-admin-navigation','@/components/master/pre-registration'].includes(id))return new Proxy({}, {get:(_target,name)=>name==='__esModule'?true:stub(String(name))})
 return originalLoad.call(this,id,...args)
}
const {WinterAdminDashboard}=require('../components/winter-admin-dashboard.tsx')
const {MasterPreRegistration}=require('../components/master/pre-registration.tsx')
const {WinterAdminNavigation,winterAdminTabs}=require('../components/winter-admin-navigation.tsx')
const nodes=t=>!t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)]
const text=t=>typeof t==='string'?t:!t?'':[t.props?.children].flat(Infinity).map(text).join('')
const find=(tree,type)=>nodes(tree).find(n=>n.type===type)
const render=()=>h.render(WinterAdminDashboard)
async function settle(){let tree;for(let i=0;i<5;i++){tree=render();await Promise.resolve()}return tree}
function restart(nextHash='',signedIn=true){h.close();h=hooks();hash=nextHash;saved=signedIn?JSON.stringify({accessToken:'synthetic',refreshToken:'synthetic',expiresAt:9999999999999,email:'ui-test@example.test'}):null}
;(async()=>{
 restart('',false);let tree=await settle();assert.equal(find(tree,WinterAdminNavigation),undefined);assert.equal(find(tree,MasterPreRegistration),undefined)
 restart();tree=await settle();assert.equal(winterAdminTabs.find(t=>t.id==='roster').label,'事前登録')
 find(tree,WinterAdminNavigation).props.onSelect('roster');tree=render()
 let workspace=find(tree,MasterPreRegistration);assert.ok(workspace);assert.equal(workspace.props.selected,'roster')
 const rosterComponent=find(workspace.props.roster,stub('SharedRosterManager'))
 const entryComponent=find(workspace.props.entries,stub('WinterInitialEntryRegistration'))
 assert.ok(rosterComponent);assert.ok(entryComponent);assert.equal(entryComponent.props.data,data)
 const panel=()=>nodes(tree).find(n=>n.props?.id==='winter-panel-roster')
 const originalKey=panel().key
 workspace.props.onSelect('entries');tree=render();workspace=find(tree,MasterPreRegistration)
 assert.equal(workspace.props.selected,'entries');assert.equal(panel().key,originalKey)
 const entryView=MasterPreRegistration(workspace.props)
 assert.equal(nodes(entryView).find(n=>n.props?.id==='pre-registration-roster').props.hidden,true)
 assert.equal(nodes(entryView).find(n=>n.props?.id==='pre-registration-entries').props.hidden,false)
 assert.equal(find(workspace.props.roster,stub('SharedRosterManager')).type,rosterComponent.type)
 assert.equal(find(workspace.props.entries,stub('WinterInitialEntryRegistration')).type,entryComponent.type)
 find(tree,WinterAdminNavigation).props.onSelect('startlist');tree=render()
 assert.equal(panel().props.hidden,true);assert.equal(panel().key,originalKey)
 assert.ok(find(tree,MasterPreRegistration),'Registration tree is retained on another tab')
 const start=nodes(tree).find(n=>n.props?.id==='winter-panel-startlist')
 assert.ok(find(start,stub('WinterStartList')));assert.equal(find(start,stub('WinterInitialEntryRegistration')),undefined)
 find(tree,WinterAdminNavigation).props.onSelect('roster');tree=render();workspace=find(tree,MasterPreRegistration)
 assert.equal(workspace.props.selected,'entries')
 find(workspace.props.entries,stub('WinterInitialEntryRegistration')).props.onChooseParticipants();tree=render()
 assert.equal(find(tree,MasterPreRegistration).props.selected,'roster')
 assert.ok(find(workspace.props.application,stub('WinterApplicationImport')))
 workspace.props.onSelect('application');tree=render();workspace=find(tree,MasterPreRegistration)
 assert.equal(workspace.props.selected,'application')
 find(workspace.props.application,stub('WinterApplicationImport')).props.onRoster();tree=render();workspace=find(tree,MasterPreRegistration)
 assert.equal(workspace.props.selected,'roster');assert.ok(find(workspace.props.application,stub('WinterApplicationImport')),'correction route retains the Excel component')
 workspace.props.onSelect('application');tree=render();workspace=find(tree,MasterPreRegistration)
 assert.equal(nodes(MasterPreRegistration(workspace.props)).find(n=>n.props?.id==='pre-registration-application').props.hidden,false)
 assert.ok(text(MasterPreRegistration(workspace.props)).includes('申込書の読み込み'))
 assert.equal(find(workspace.props.overview,stub('WinterRegistrationOverview')).props.data,data)
 assert.equal(find(workspace.props.overview,stub('WinterRegistrationOverview')).props.active,false)
 assert.equal(find(workspace.props.overview,stub('WinterRegistrationOverview')).props.token,'synthetic')
 workspace.props.onSelect('overview');tree=render();workspace=find(tree,MasterPreRegistration)
 assert.equal(find(workspace.props.overview,stub('WinterRegistrationOverview')).props.active,true)
 assert.equal(nodes(MasterPreRegistration(workspace.props)).find(n=>n.props?.id==='pre-registration-overview').props.hidden,false)
 assert.ok(find(workspace.props.application,stub('WinterApplicationImport')),'Excel form remains mounted while viewing saved registration')
 assert.equal(nodes(tree).filter(n=>n.props?.href==='/winter/prepare').length,1,'Only one import link exists')
 assert.equal(nodes(workspace.props.children).filter(n=>n.props?.href==='/winter/prepare').length,1)
 restart('#winter-initial-registration');tree=await settle();assert.equal(find(tree,MasterPreRegistration).props.selected,'entries')
 restart('#winter-admin-tools');tree=await settle();assert.equal(find(tree,MasterPreRegistration).props.selected,'roster')
 restart('#winter-application-import');tree=await settle();assert.equal(find(tree,MasterPreRegistration).props.selected,'application')
 restart('#winter-registration-overview');tree=await settle();assert.equal(find(tree,MasterPreRegistration).props.selected,'overview')
 const props={selected:'roster',onSelect(){},roster:React.createElement('input',{defaultValue:'dummy-roster-draft'}),entries:React.createElement('input',{defaultValue:'dummy-entry-draft'})}
 for(const selected of ['roster','entries']){
  const markup=renderToStaticMarkup(React.createElement(MasterPreRegistration,{...props,selected}))
  assert.ok(markup.includes('dummy-roster-draft')&&markup.includes('dummy-entry-draft'),'Both forms remain in the tree')
  assert.equal((markup.match(/aria-pressed="true"/g)||[]).length,1)
  assert.equal((markup.match(/hidden=""/g)||[]).length,1)
  assert.ok(!markup.includes('pre-registration-application'),'Existing event adapters without Excel retain two sections')
 }
 for(const selected of ['roster','entries','application']){
  const markup=renderToStaticMarkup(React.createElement(MasterPreRegistration,{...props,selected,application:React.createElement('input',{defaultValue:'dummy-application-draft'})}))
  assert.equal((markup.match(/aria-pressed="true"/g)||[]).length,1)
  assert.equal((markup.match(/hidden=""/g)||[]).length,2)
  assert.ok(markup.includes('dummy-application-draft')&&markup.includes('dummy-roster-draft')&&markup.includes('dummy-entry-draft'))
 }
 for(const selected of ['roster','entries','application','overview']){
  const markup=renderToStaticMarkup(React.createElement(MasterPreRegistration,{...props,selected,application:React.createElement('input',{defaultValue:'dummy-application-draft'}),overview:React.createElement('p',null,'saved-overview')}))
  assert.equal((markup.match(/aria-pressed="true"/g)||[]).length,1)
  assert.equal((markup.match(/hidden=""/g)||[]).length,3)
  assert.ok(markup.includes('dummy-application-draft')&&markup.includes('dummy-roster-draft')&&markup.includes('dummy-entry-draft'))
 }
 assert.equal(writes,0)
 h.close();Module._load=originalLoad
 console.log('PASS: preregistration grouping, retained form tree/keys, entry and roster callbacks, hidden-state contracts, start-list separation, import scope, legacy links and signed-out guard (component mocks; no browser/DB)')
})().catch(error=>{console.error(error);process.exitCode=1})
