// Real component/hook and registration functions; synthetic services, storage and browser controls.
// This is not a real-browser or database test.
require('./register-ts.cjs')
const assert=require('node:assert/strict'),Module=require('node:module'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {setup}=require('./winter-application-registration-fixture.cjs')
const {parseApplicationRegistration,serializeApplicationRegistration,applicationRegistrationKey}=require('../lib/winter-application-registration.ts')
const originalLoad=Module._load
function hooks(){
 let index=0,pending=[];const cells=[]
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
 return {
  render(fn){index=0;pending=[];const value=fn();pending.forEach(f=>f());return value},
  useState(initial){const i=index++;cells[i]??={value:typeof initial==='function'?initial():initial};return[cells[i].value,v=>{cells[i].value=typeof v==='function'?v(cells[i].value):v}]},
  useRef(initial){const i=index++;return cells[i]??(cells[i]={current:initial})},
  useMemo(fn,deps){const i=index++;if(!cells[i]||!equal(cells[i].deps,deps))cells[i]={value:fn(),deps};return cells[i].value},
  useEffect(fn,deps){const i=index++;if(!cells[i]||!equal(cells[i].deps,deps))pending.push(()=>{cells[i]?.cleanup?.();cells[i]={deps,cleanup:fn()}})},
  close(){cells.forEach(c=>c?.cleanup?.())},
 }
}
let h=hooks(),env=setup(),map=new Map(),downloadBlob=null,downloads=0,network=0,loads=0,deny=false,lockHeld=false,missingLocks=false,failStorage=false,failKnownId=false,gateLoad=null,readOriginal=false,readCredentials=false,changeNavigation=0,rosterNavigation=0
const lockNames=[]
global.fetch=()=>{network++;throw Error('Real network forbidden')}
global.window={confirm:()=>true,addEventListener(){},removeEventListener(){}}
global.document={createElement:()=>({click(){downloads++}})}
global.localStorage={getItem:key=>map.get(key)??null,setItem:(key,value)=>{
 const parsed=JSON.parse(value)
 if(failStorage||failKnownId&&parsed.people?.r1?.entityId)throw Error('synthetic quota failure')
 map.set(key,value);if(parsed.kind==='winter-application-registration')env.stored=parsed
}}
const locks={request:async(name,options,fn)=>{lockNames.push(name);assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});if(lockHeld)return fn(null);lockHeld=true;try{return await fn({name})}finally{lockHeld=false}}}
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{get locks(){return missingLocks?undefined:locks}}})
const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL
URL.createObjectURL=blob=>{downloadBlob=blob;return 'blob:synthetic-only'};URL.revokeObjectURL=()=>{}
Module._load=function(name,...args){
 if(name==='react')return {...React,...Object.fromEntries(['useState','useRef','useMemo','useEffect'].map(k=>[k,(...args)=>h[k](...args)]))}
 if(name==='@/lib/winter-application-services')return {winterApplicationServices:()=>({
  load:async()=>{loads++;if(deny)throw Error('synthetic admin denied');if(gateLoad)await gateLoad;return structuredClone(env.snapshot)},
  saveCredential:input=>env.deps.saveCredential(input),savePerson:input=>env.deps.savePerson(input),saveParticipants:(...args)=>env.deps.saveParticipants(...args),saveEntry:input=>env.deps.saveEntry(input),
  correctPerson:async input=>{if(deny)throw Error('synthetic admin denied');const journal=[...map.values()].map(s=>JSON.parse(s)).find(r=>r.kind==='winter-roster-correction'&&r.input.requestId===input.requestId);assert(journal,'draft and request saved before sending');return env.deps.correctPerson(input)},
 })}
 if(name==='@/lib/winter-application'){const actual=originalLoad.call(this,name,...args);return {...actual,readWinterApplication:async()=>{const app=structuredClone(env.work.review.original);if(!readOriginal){app.digest='c'.repeat(64);app.people[0].name='訂正版の合成選手'}if(readCredentials){app.people[1].horseGrade='中B';app.people[1].credentialOrigin={sheet:'馬匹名簿',cell:'C7',value:'中Ｂ'}}return app}}}
 return originalLoad.call(this,name,...args)
}
const {WinterApplicationImport}=require('../components/winter-application-import.tsx')
const {MasterApplicationReview}=require('../components/master/application-review.tsx')
const {MasterApplicationRegistration}=require('../components/master/application-registration.tsx')
const props={session:{accessToken:'synthetic-secret-not-for-export',refreshToken:'synthetic-refresh',expiresAt:9999999999999,email:'synthetic@example.test'},onSession(){},onChanges(){changeNavigation++},onRoster(){rosterNavigation++}}
const render=()=>h.render(()=>WinterApplicationImport(props)).props
const panel=p=>p.registration.props
function importCheckbox(p){
 const matches=[]
 function visit(node){if(Array.isArray(node))return node.forEach(visit);if(!React.isValidElement(node))return;if(node.type==='input'&&node.props.name==='application-intent')matches.push(node);visit(node.props.children)}
 visit(MasterApplicationReview(p));assert.equal(matches.length,1,'one import confirmation, no competing change-mode selector');assert.equal(matches[0].props.type,'checkbox');return matches[0].props
}
function controls(p){
 const out=[]
 function visit(node){if(Array.isArray(node))return node.forEach(visit);if(!React.isValidElement(node))return;if(typeof node.type==='function')return visit(node.type(node.props));out.push(node);visit(node.props.children)}
 visit(MasterApplicationRegistration(panel(p)));return out
}
const tick=()=>new Promise(resolve=>setImmediate(resolve))
async function settled(){const deadline=Date.now()+3000;while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,1));const p=render();if(!p.busy)return p}throw Error('Synthetic action did not finish')}
const file=value=>{const bytes=new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));return {name:'synthetic.json',size:bytes.length,arrayBuffer:async()=>bytes.buffer}}
async function start(){
 h.close();h=hooks();env=setup();map.clear();downloadBlob=null;downloads=0;loads=0;deny=false;failStorage=false;failKnownId=false;missingLocks=false;lockHeld=false;gateLoad=null;readOriginal=false;readCredentials=false;changeNavigation=0;rosterNavigation=0
 let p=render();p.onRestoreFile(file(env.work.review));return settled()
}
async function ready(){let p=render();panel(p).onReview();p=await settled();assert.equal(panel(p).ready,true,panel(p).error);panel(p).onAccepted(true);p=render();panel(p).onSingleOperator(true);return render()}
async function main(){
 let p=await start();assert.equal(loads,1);assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 panel(p).onReview();p=await settled();assert.equal(panel(p).ready,true);assert.equal(panel(p).people.length,2);assert.equal(panel(p).entries.length,1);assert.equal(panel(p).originalTotal,'19000');assert.equal(panel(p).paid,'0')
 assert.deepEqual(env.posts,{person:0,participants:0,entry:0},'read/restore/review do not register')
 panel(p).onRun();p=await settled();assert.match(panel(p).error,/確認/);assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 p=await ready();const action=panel(p).onRun;action();action();p=await settled()
 assert.deepEqual(env.posts,{person:2,participants:1,entry:1});assert.equal(p.frozen,true);assert.equal(panel(p).people[0].state,'登録済み');assert.equal(panel(p).entries[0].state,'登録済み');assert.equal(panel(p).participantState,'登録済み')
 assert.equal(env.stored.review.paid,'0');assert.equal(env.stored.review.original.amounts.total,'19000')
 const frozen=JSON.stringify(p.edited);p.onPerson('r1',{name:'unauthorized overwrite'});p.onReference('CHANGED');p.onPaid('999');p=render();assert.equal(JSON.stringify(p.edited),frozen);assert.equal(p.reference,env.work.review.reference);assert.equal(p.paid,'0')
 const markup=renderToStaticMarkup(React.createElement(MasterApplicationReview,p));assert.match(markup,/fieldset disabled/);assert(!markup.includes('確認再開JSONを保存して別の申込書へ'));assert(markup.includes('④ 取り込み結果'))
 panel(p).onDownload();p=await settled();const raw=await downloadBlob.text();const saved=parseApplicationRegistration(raw);assert.equal(saved.people.r1.state,'registered');assert(!raw.includes('synthetic-secret'));assert(!raw.includes('synthetic-refresh'))
 // Revised Excel remains a comparison: no edits to the fixed review or stored registration.
 p.onFiles([{name:'synthetic-revision.xlsx',size:1,arrayBuffer:async()=>new ArrayBuffer(1)}]);p=render();p.onRead();p=await settled();assert(p.differences.length);assert.equal(JSON.stringify(p.edited),frozen);assert.deepEqual(env.posts,{person:2,participants:1,entry:1})
 p=await ready();panel(p).onRun();p=await settled();assert.deepEqual(env.posts,{person:2,participants:1,entry:1},'reimport/recheck never rebills the same entry')
 // Reopen from exported file, without assuming a remembered browser session or trusting flags.
 h.close();h=hooks();p=render();panel(p).onRestoreFile(file(raw));p=await settled();assert.equal(p.frozen,true);assert.equal(panel(p).hasPlan,false);assert.match(panel(p).people[0].state,/未再照合/)
 panel(p).onReview();p=await settled();assert.equal(panel(p).entries[0].state,'登録済み')
 panel(p).onClose();p=await settled();assert.equal(p.edited,null);assert.equal(panel(p).hasCheckpoint,false);assert(map.has(applicationRegistrationKey(saved.review.reference)))
 // Same original/review reaches the existing record, not a new-person create.
 const mapped=structuredClone(saved.review);p.onRestoreFile(file(mapped));p=await settled();panel(p).onReview();p=await settled();assert.equal(p.frozen,true);assert.equal(panel(p).entries[0].state,'登録済み')
 assert(lockNames.every(name=>name.includes(env.work.eventId)))

 // Autofill reaches the editable form after load, while preserving the source and manual corrections.
 p=await start();env.snapshot.riderGrades=[{member_no:'123',name:'合成選手',rider_grade:'Ａ級',import_date:'2026-10-23'}]
 p.onPerson('r1',{jef:'123'});p=render();p.onLoadRoster();p=await settled()
 assert.equal(p.edited.people[0].grade,'A');assert.equal(p.original.people[0].grade,'未登録');assert.equal(p.edited.people[0].gradeAutofill.importDate,'2026-10-23')
 p.onPerson('r1',{grade:'B'});p=render();p.onLoadRoster();p=await settled();assert.equal(p.edited.people[0].grade,'B');assert.equal(p.edited.people[0].gradeAutofill,undefined)
 p.onPerson('h1',{name:'サクラブルー',reading:''});p=render();assert.equal(p.edited.people[1].reading,'サクラブルー');assert.equal(p.original.people[1].name,'合成馬')
 p.onPerson('h1',{reading:'さくらぶるう'});p=render();p.onLoadRoster();p=await settled();assert.equal(p.edited.people[1].reading,'さくらぶるう');assert.deepEqual(env.posts,{person:0,participants:0,entry:0})

 // Registered-club import confirmation clears its warning; change/cancel is a separate navigation action.
 p=await start()
 const riderId=env.addPerson({kind:'rider',name:'合成選手',reading:'ごうせいせんしゅ',jefNumber:'',clubName:p.edited.club})
 const horseId=env.addPerson({kind:'horse',name:'合成馬',reading:'ごうせいうま',jefNumber:'',clubName:p.edited.club})
 env.publish(env.snapshot.roster.clubs[0].id,[riderId,horseId],[])
 p.onLoadRoster();p=await settled();assert.equal(p.clubSummary.state,'registered')
 p.onChoice('r1',riderId);p=await settled();p.onChoice('h1',horseId);p=await settled();assert.equal(p.accountChecked,false);p.onAccountChecked(true);p=render()
 assert.equal(importCheckbox(p).checked,false);assert.equal(panel(p).canReview,false)
 const importMarkup=renderToStaticMarkup(React.createElement(MasterApplicationReview,p));assert.match(importMarkup,/出番がすべて登録済みでも、資格級・グレード宣言を保存/);assert(!importMarkup.includes('type="radio"'));assert.equal(importMarkup.split('登録済み出番の変更・取消画面を開く').length-1,1)
 panel(p).onReview();p=await settled();assert.equal(panel(p).ready,false,'registered club requires an explicit purpose');assert.equal(panel(p).hasPlan,false);assert.match(panel(p).error,/このExcelを取り込む/);assert(!panel(p).message.includes('照合が終わりました'))
 panel(p).onAccepted(true);p=render();panel(p).onSingleOperator(true);p=render();panel(p).onRun();p=await settled();assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 importCheckbox(p).onChange({target:{checked:true}});p=render();assert.equal(panel(p).error,'');assert.equal(panel(p).canReview,true);assert(!p.todos.some(t=>t.target==='application-club'&&t.blocking));p=await ready();assert.equal(panel(p).ready,true);assert.equal(p.stage,3)
 importCheckbox(p).onChange({target:{checked:false}});p=render();assert.equal(panel(p).hasPlan,false,'withdrawing consent invalidates confirmation');assert.equal(panel(p).canReview,false);assert(p.todos.some(t=>t.target==='application-club'&&t.blocking))
 panel(p).onRun();p=await settled();assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 p.onChanges();p=await settled();assert.equal(changeNavigation,1);assert.equal(downloads,0);assert.deepEqual(env.posts,{person:0,participants:0,entry:0});assert.equal(env.credentialPosts,0)
 const {applicationDraftKey,parseApplicationDraft}=require('../lib/winter-application-draft.ts')
 assert.equal(parseApplicationDraft(map.get(applicationDraftKey(p.original.digest))).choices.r1,riderId,'navigation retains review locally')

 // Stage ③ is an editable reconciliation view. Resolve spelling and affiliation by
 // explicit identity selection, retain source evidence, then perform a new authoritative review.
 p=await start()
 const existingRider=env.addPerson({kind:'rider',name:'合成 選手',reading:'ゴウセイセンシュ',jefNumber:'12345',clubName:p.edited.club})
 const wrongHorse=env.addPerson({kind:'horse',name:'合成馬',reading:'ごうせいうま',jefNumber:'54321',clubName:'別の合成団体'})
 const correctHorse=env.addPerson({kind:'horse',name:'合成馬',reading:'ごうせいうま',jefNumber:'54321',clubName:p.edited.club})
 p.onLoadRoster();p=await settled();p.onChoice('r1',existingRider);p=await settled();p.onChoice('h1',wrongHorse);p=await settled();p.onAccountChecked(true);p=render()
 panel(p).onReview();p=await settled();assert.equal(panel(p).ready,false);assert.equal(panel(p).hasCorrections,true);assert.equal(p.stage,3)
 assert.match(panel(p).people[0].issues.join(),/既存名簿との差分/);assert.match(panel(p).people[1].issues.join(),/所属が確認できません/)
 const evidence=JSON.stringify(p.original),rosterBefore=JSON.stringify(env.snapshot.roster)
 let html=renderToStaticMarkup(React.createElement(MasterApplicationRegistration,panel(p)))
 assert.match(html,/この場で訂正/);assert.match(html,/bg-amber-200/);assert(!html.includes('min-w-[650px]'))
 const oldCorrection=panel(p).onCorrectPerson
 controls(p).find(c=>c.type==='button'&&c.props.children==='同じ人馬と確認し、名簿の表記を使う').props.onClick();p=await settled()
 assert.equal(p.edited.people[0].name,'合成 選手');assert.equal(p.edited.people[0].reading,'ゴウセイセンシュ');assert.equal(p.edited.people[0].jef,'12345');assert.equal(p.edited.people[0].checked,false)
 assert.equal(p.choices.r1,existingRider);assert.equal(p.accountChecked,false);assert.equal(panel(p).hasPlan,false);assert.equal(panel(p).reviewStale,true);assert.equal(panel(p).ready,false)
 assert.equal(panel(p).people.length,2,'editing one row does not remove correction controls for another')
 controls(p).find(c=>c.type==='input'&&c.props['aria-label']==='r1 照合結果のフリガナ').props.onChange({target:{value:'ごうせいせんしゅ'}});p=render()
 assert.equal(p.edited.people[0].reading,'ごうせいせんしゅ');assert.equal(p.choices.r1,existingRider,'editing the explicitly selected identity still requires exact-name and number revalidation')
 html=renderToStaticMarkup(React.createElement(MasterApplicationRegistration,panel(p)));assert.match(html,/前回の確認事項/);assert(!html.includes('エントリーの登録確認'),'stale entry results cannot look current')
 panel(p).onAccepted(true);p=render();panel(p).onSingleOperator(true);p=render();panel(p).onRun();p=await settled();assert.deepEqual(env.posts,{person:0,participants:0,entry:0},'old approval cannot register edited data')
 controls(p).find(c=>c.type==='select'&&c.props['aria-label']==='h1 照合結果の人馬選択').props.onChange({target:{value:correctHorse}});p=await settled()
 assert.equal(p.choices.h1,correctHorse);assert.equal(p.edited.people[1].jef,'54321');assert.equal(panel(p).people[1].correction.selected,correctHorse)
 panel(p).onAccountChecked(true);p=render();panel(p).onReview();p=await settled();assert.equal(panel(p).ready,true,panel(p).error);assert.equal(panel(p).hasCorrections,false);assert.equal(panel(p).reviewStale,false)
 assert.equal(JSON.stringify(p.original),evidence);assert.equal(JSON.stringify(env.snapshot.roster),rosterBefore);assert.deepEqual(env.posts,{person:0,participants:0,entry:0});assert.equal(env.credentialPosts,0)
 p=await ready();panel(p).onRun();p=await settled();assert.equal(panel(p).complete,true);assert.deepEqual(env.posts,{person:0,participants:1,entry:1})
 assert.equal(panel(p).hasCorrections,false);assert(panel(p).people.every(r=>!r.correction));const fixed=JSON.stringify(p.edited)
 oldCorrection('r1',{name:'cannot edit frozen registration'});p=render();assert.equal(JSON.stringify(p.edited),fixed,'even an old correction callback honors the frozen checkpoint')

 // The saved master is wrong: correct it here, preserve IDs, and continue the import.
 p=await start()
 const misspelled=env.addPerson({kind:'rider',name:'合成誤字選手',reading:'ごうせいせんしゅ',jefNumber:'',clubName:p.edited.club})
 const oldHorse=env.addPerson({kind:'horse',name:'合成馬',reading:'ごうせいうま',jefNumber:'',clubName:p.edited.club})
 const numbered=env.addPerson({kind:'horse',name:'合成馬',reading:'ごうせいうま',jefNumber:'54321',clubName:'別の合成団体'})
 env.publish(env.snapshot.roster.clubs[0].id,[misspelled],[])
 const beforeCorrectionBindings=JSON.stringify(env.snapshot.bindings)
 p.onLoadRoster();p=await settled();p.onChoice('r1',misspelled);p=await settled();p.onChoice('h1',numbered);p=await settled();p.onIntent('addition');p=render();p.onAccountChecked(true);p=render();panel(p).onReview();p=await settled()
 assert.equal(panel(p).hasCorrections,true);assert.equal(panel(p).people[0].correction.participantCount,1)
 html=renderToStaticMarkup(React.createElement(MasterApplicationRegistration,panel(p)))
 assert.match(html,/既存名簿を訂正・所属を保存/);assert.match(html,/変更前：/);assert.match(html,/変更後：/);assert(!html.includes('名簿の所属を確認・訂正する'))
 panel(p).onSaveRoster('r1');p=await settled();assert.match(panel(p).error,/変更内容を確認/);assert.equal(env.correctionPosts,0)
 panel(p).onCorrectionAccepted('r1',true);p=render();failStorage=true;panel(p).onSaveRoster('r1');p=await settled();assert.equal(env.correctionPosts,0);assert.match(panel(p).error,/quota/);failStorage=false
 panel(p).onCorrectionAccepted('r1',true);p=render();const saveCorrection=panel(p).onSaveRoster;saveCorrection('r1');saveCorrection('r1');p=await settled()
 assert.equal(env.correctionPosts,1);assert.equal(env.snapshot.roster.entities.find(e=>e.id===misspelled).name,'合成選手');assert.equal(env.snapshot.data.riders[0].name,'合成選手');assert.equal(JSON.stringify(env.snapshot.bindings),beforeCorrectionBindings)
 assert.equal(panel(p).people[0].state,'登録済み');assert.equal(p.choices.r1,misspelled);assert.equal(env.snapshot.roster.entities.length,3)
 assert.equal(p.original.people[0].name,'合成選手');assert.equal(p.original.people[1].jef,'')
 // A new number already owned by a second exact ID cannot be assigned to the old duplicate.
 panel(p).onCorrectChoice('h1',oldHorse);p=await settled();panel(p).onCorrectPerson('h1',{jef:'54321'});p=render();panel(p).onCorrectionAccepted('h1',true);p=render();panel(p).onSaveRoster('h1');p=await settled();assert.equal(env.correctionPosts,1);assert.match(panel(p).error,/別の既存候補/)
 panel(p).onCorrectChoice('h1',numbered);p=await settled();panel(p).onCorrectionAccepted('h1',true);p=render()
 panel(p).onCorrectPerson('h1',{reading:'ゴウセイウマ'});p=render();p=render();assert.equal(panel(p).people[1].correction.accepted,false,'editing after confirmation clears consent')
 panel(p).onCorrectionAccepted('h1',true);p=render();deny=true;panel(p).onSaveRoster('h1');p=await settled();assert.equal(env.correctionPosts,1);assert.match(panel(p).error,/admin denied/);deny=false
 // Save committed, reply lost: read back the exact selected identity and Winter snapshots.
 env.deps.correctPerson=async input=>{env.correctPerson(input);throw Error('synthetic lost response')}
 panel(p).onCorrectionAccepted('h1',true);p=render();panel(p).onSaveRoster('h1');p=await settled()
 assert.equal(env.correctionPosts,2);assert.match(panel(p).message,/保存結果を読み直しました/);assert.equal(env.snapshot.roster.entities.length,3);assert.equal(env.snapshot.roster.affiliations.filter(a=>a.entity_id===numbered).length,2)
 assert.equal(panel(p).showAccountConfirmation,true,'account confirmation stays in step ③ after identity issues clear')
 assert(!panel(p).people.some(r=>r.issues.length));assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 panel(p).onAccountChecked(true);p=render();p=await ready();panel(p).onRun();p=await settled();assert.equal(panel(p).complete,true,panel(p).error);assert.deepEqual(env.posts,{person:0,participants:1,entry:1});assert.equal(env.snapshot.roster.entities.length,3)
 for(const raw of map.values()){assert(!raw.includes('synthetic-secret'));assert(!raw.includes('synthetic-refresh'))}

 // A concurrent master edit is not overwritten: refresh before values, keep the desired input.
 p=await start()
 const conflict=env.addPerson({kind:'rider',name:'合成選手誤字',reading:'ごうせいせんしゅ',jefNumber:'',clubName:p.edited.club})
 p.onLoadRoster();p=await settled();p.onChoice('r1',conflict);p=await settled();p.onAccountChecked(true);p=render();panel(p).onReview();p=await settled()
 env.snapshot.roster.entities[0].name='別操作で訂正済み';env.snapshot.roster.entities[0].updated_at='2026-10-24T01:00:00Z'
 panel(p).onCorrectionAccepted('r1',true);p=render();panel(p).onSaveRoster('r1');p=await settled();assert.equal(env.correctionPosts,0);assert.match(panel(p).error,/別の操作で変わりました/);assert.equal(p.edited.people[0].name,'合成選手');assert.equal(panel(p).people[0].correction.candidates.find(c=>c.id===conflict).name,'別操作で訂正済み');assert.equal(panel(p).people[0].correction.accepted,false)

 // Navigation still retains a draft; it is no longer the required correction flow.
 p=await start()
 const outsider=env.addPerson({kind:'horse',name:'合成馬',reading:'ごうせいうま',jefNumber:'',clubName:'別の合成団体'})
 p.onLoadRoster();p=await settled();p.onChoice('h1',outsider);p=await settled();p.onAccountChecked(true);p=render();panel(p).onReview();p=await settled()
 assert.equal(panel(p).hasCorrections,true);assert.match(panel(p).people[1].issues.join(),/所属/)
 failStorage=true;panel(p).onRoster();p=await settled();assert.equal(rosterNavigation,0);assert.match(panel(p).editError,/quota/)
 failStorage=false;panel(p).onRoster();p=await settled();assert.equal(rosterNavigation,1);assert.equal(downloads,0)
 assert.equal(parseApplicationDraft(map.get(applicationDraftKey(p.original.digest))).choices.h1,outsider);assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 p.onReset();p=await settled();assert.equal(panel(p).hasCorrections,false);assert.equal(panel(p).people.length,0)

 // Same Excel automatically finds its checkpoint; next-file workflow requires no export download.
 p=await start();h.close();h=hooks();map.clear();readOriginal=true;p=render()
 const excel={name:'synthetic.xlsx',size:1,arrayBuffer:async()=>new ArrayBuffer(1)}
 p.onFiles([excel]);p=render();p.onRead();p=await settled();assert.match(p.reference,/^WINTER-2026-/)
 p.onChoice('r1','new');p=await settled();p.onChoice('h1','new');p=await settled();p.onPaid('0');p=render();p.onAccountChecked(true);p=render()
 p=await ready();panel(p).onRun();p=await settled();assert.equal(panel(p).complete,true)
 panel(p).onClose();p=await settled();assert.equal(p.edited,null);assert.equal(downloads,0)
 p.onFiles([excel]);p=render();p.onRead();p=await settled();assert.equal(p.frozen,true,'same-file checkpoint restored automatically');assert.equal(panel(p).hasPlan,false,'local completion never substitutes for fresh server review')
 panel(p).onReview();p=await settled();assert.equal(panel(p).complete,true);assert.equal(downloads,0);assert.deepEqual(env.posts,{person:2,participants:1,entry:1})

 // Re-reading a completed legacy import opens a review for newly supported credentials.
 panel(p).onClose();p=await settled();readCredentials=true
 p.onFiles([excel]);p=render();p.onRead();p=await settled();assert.equal(p.frozen,false);assert.equal(p.edited.people[1].horseGrade,'中B');assert.match(p.reference,/^WINTER-CREDENTIALS-/);assert.equal(p.accountChecked,false)
 p.onAccountChecked(true);p=render();p.onIntent('addition');p=render();p=await ready();assert.equal(panel(p).complete,false)
 const credentialMarkup=renderToStaticMarkup(React.createElement(MasterApplicationRegistration,panel(p)));assert.match(credentialMarkup,/確認した資格・グレードを保存する/);assert.match(credentialMarkup,/今回 中B を保存/)
 panel(p).onRun();p=await settled();assert.equal(panel(p).complete,true);assert.deepEqual(env.posts,{person:2,participants:1,entry:1});assert.equal(env.credentialPosts,2)

 // Stop after one person; the input cannot be edited while a save is active.
 p=await start();p=await ready();const savePerson=env.deps.savePerson;let release
 env.deps.savePerson=async input=>{const id=await savePerson(input);await new Promise(resolve=>release=resolve);return id}
 panel(p).onRun();for(let i=0;i<100&&!release;i++)await tick();assert(release,'save boundary reached');p=render();assert.equal(panel(p).running,true);assert.equal(p.busy,true)
 p.onPerson('r1',{name:'edited while saving'});p=render();assert.equal(p.edited.people[0].name,'合成選手')
 panel(p).onStop();release();p=await settled();assert.deepEqual(env.posts,{person:1,participants:0,entry:0});assert.equal(env.stored.people.r1.state,'registered');assert.equal(env.stored.people.h1.state,'unregistered')
 env.deps.savePerson=savePerson;p=await ready();panel(p).onRun();p=await settled();assert.deepEqual(env.posts,{person:2,participants:1,entry:1})

 // Lost new-person response never triggers a second create; resolve only by an explicit ID.
 p=await start();p=await ready();const create=env.deps.savePerson;let lostId
 env.deps.savePerson=async input=>{lostId=await create(input);throw Error('lost synthetic person response')}
 panel(p).onRun();p=await settled();assert.match(panel(p).error,/lost synthetic person response/);assert.equal(env.posts.person,1);assert.equal(env.stored.people.r1.state,'unknown')
 panel(p).onReview();p=await settled();assert.equal(panel(p).ready,false);assert.equal(panel(p).people[0].resolve,true);assert.equal(panel(p).people[0].selected,'');assert.equal(panel(p).people[0].candidates[0].id,lostId)
 panel(p).onRun();p=await settled();assert.equal(env.posts.person,1)
 panel(p).onReview();p=await settled();panel(p).onChoice('r1',lostId);p=render();panel(p).onResolve('r1');p=await settled();assert.equal(env.posts.person,1);assert.equal(env.stored.people.r1.entityId,lostId)
 env.deps.savePerson=create;p=await ready();panel(p).onRun();p=await settled();assert.deepEqual(env.posts,{person:2,participants:1,entry:1})

 // Lost entry response has its stable ID checkpoint; re-read establishes success without rebilling.
 p=await start();p=await ready();const saveEntry=env.deps.saveEntry
 env.deps.saveEntry=async input=>{await saveEntry(input);throw Error('lost synthetic entry response')}
 panel(p).onRun();p=await settled();assert.equal(Object.values(env.stored.entries.states)[0],'unknown');assert.equal(env.posts.entry,1)
 env.deps.saveEntry=saveEntry;p=await ready();assert.equal(panel(p).entries[0].state,'登録済み');panel(p).onRun();p=await settled();assert.equal(env.posts.entry,1)

 // Local write failure after an ID was returned must not discard that recoverable ID.
 p=await start();p=await ready();failKnownId=true;panel(p).onRun();p=await settled();assert.equal(env.posts.person,1);assert.match(panel(p).error,/quota/);assert(panel(p).people[0].id)
 panel(p).onDownload();p=await settled();const rescue=parseApplicationRegistration(await downloadBlob.text());assert(rescue.people.r1.entityId);assert.equal(rescue.people.r1.state,'unknown')
 // Reopen the newer exported result against the older local record, preserving both source and known ID.
 failKnownId=false;h.close();h=hooks();p=render();const oldLocal=map.get(applicationRegistrationKey(rescue.review.reference))
 panel(p).onRestoreFile(file(rescue));p=await settled();assert.equal(panel(p).people[0].id,rescue.people.r1.entityId);assert.equal(map.get(applicationRegistrationKey(rescue.review.reference)),oldLocal,'opening a newer file does not overwrite local history')
 p=await ready();panel(p).onRun();p=await settled();assert.deepEqual(env.posts,{person:2,participants:1,entry:1})

 // Every blocking condition is tested against the controller's real save action.
 for(const condition of ['lock-held','unsupported-lock','auth','storage','price-change']){
  p=await start();p=await ready();if(condition==='lock-held')lockHeld=true;if(condition==='unsupported-lock')missingLocks=true;if(condition==='auth')deny=true;if(condition==='storage')failStorage=true;if(condition==='price-change')env.snapshot.data.competitions[0].member_fee++
  panel(p).onRun();p=await settled();assert(panel(p).error,condition);assert.deepEqual(env.posts,{person:0,participants:0,entry:0},condition)
 }
 p=await start();p=await ready();p.onPaid('1');p=render();assert.equal(panel(p).hasPlan,false,'edited input invalidates old confirmation');panel(p).onRun();p=await settled();assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 p=await start();p=await ready();p.onPaid('1'.repeat(101));assert.doesNotThrow(()=>{p=render()});assert.equal(panel(p).hasPlan,false,'malformed in-progress edits do not crash rendering or retain confirmation')
 p=await start();panel(p).onRestoreFile(file({...env.work,eventId:'Autumn'}));p=await settled();assert.match(panel(p).error,/Winter/);assert.equal(p.frozen,false);assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 // Another tab's saved record is never overwritten by a frozen work instance.
 p=await start();p=await ready();panel(p).onRun();p=await settled();p=await ready()
 const key=applicationRegistrationKey(env.work.review.reference),changed=JSON.parse(map.get(key));changed.people.r1.state='unknown';map.set(key,JSON.stringify(changed))
 panel(p).onRun();p=await settled();assert.match(panel(p).error,/別の画面/);assert.equal(JSON.parse(map.get(key)).people.r1.state,'unknown');assert.deepEqual(env.posts,{person:2,participants:1,entry:1})
 // Leaving the mounted screen during preflight must not later start writes.
 p=await start();p=await ready();gateLoad=new Promise(resolve=>release=resolve);panel(p).onRun();await tick();h.close();release();gateLoad=null;await tick();assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 assert.equal(network,0)
 h.close();Module._load=originalLoad;URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke
 console.log('PASS: common registration UI/controller synthetic end-to-end; explicit confirmation, frozen input/revision diff, authoritative results, JSON export/reload, duplicate protection, stop/resume, unknown-person resolution, lost entry response, post-ID storage failure recovery, tab locks, auth/event/fee/storage guards, stale checkpoints and unmount before writes (component mocks; no real browser/DB)')
}
main().catch(error=>{console.error(error);process.exitCode=1})
