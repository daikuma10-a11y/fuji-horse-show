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
let h=hooks(),env=setup(),map=new Map(),downloadBlob=null,downloads=0,network=0,loads=0,deny=false,lockHeld=false,missingLocks=false,failStorage=false,failKnownId=false,gateLoad=null,readOriginal=false,readCredentials=false,changeNavigation=0,rosterNavigation=0,holdFinal=false,releaseFinal=null
const lockNames=[]
global.fetch=()=>{network++;throw Error('Real network forbidden')}
global.window={confirm:()=>true,addEventListener(){},removeEventListener(){}}
global.requestAnimationFrame=fn=>fn()
global.document={getElementById:()=>null,createElement:()=>({click(){downloads++}})}
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
  load:async()=>{loads++;if(deny)throw Error('synthetic admin denied');if(gateLoad)await gateLoad;if(holdFinal&&env.posts.entry>0&&env.stored?.entries&&Object.values(env.stored.entries.states).every(s=>s==='registered')){holdFinal=false;await new Promise(resolve=>releaseFinal=resolve)}return structuredClone(env.snapshot)},
  saveCredential:input=>env.deps.saveCredential(input),savePerson:input=>env.deps.savePerson(input),saveParticipants:(...args)=>env.deps.saveParticipants(...args),saveEntry:input=>env.deps.saveEntry(input),
  correctPerson:async input=>{if(deny)throw Error('synthetic admin denied');const journal=[...map.values()].map(s=>JSON.parse(s)).find(r=>r.kind==='winter-roster-correction'&&r.input.requestId===input.requestId||r.kind==='winter-application-registration'&&Object.values(r.review.rosterPreparation?.corrections??{}).some(c=>c.requestId===input.requestId));assert(journal,'draft and request saved before sending');return env.deps.correctPerson(input)},
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
function controls(p,review=false){
 const out=[]
 function visit(node){if(Array.isArray(node))return node.forEach(visit);if(!React.isValidElement(node))return;if(typeof node.type==='function')return visit(node.type(node.props));out.push(node);visit(node.props.children)}
 visit(review?MasterApplicationReview(p):MasterApplicationRegistration(panel(p)));return out
}
const tick=()=>new Promise(resolve=>setImmediate(resolve))
async function settled(){const deadline=Date.now()+3000;while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,1));const p=render();if(!p.busy)return p}throw Error('Synthetic action did not finish')}
const file=value=>{const bytes=new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));return {name:'synthetic.json',size:bytes.length,arrayBuffer:async()=>bytes.buffer}}
async function start(){
 h.close();h=hooks();env=setup();map.clear();downloadBlob=null;downloads=0;loads=0;deny=false;failStorage=false;failKnownId=false;missingLocks=false;lockHeld=false;gateLoad=null;readOriginal=false;readCredentials=false;changeNavigation=0;rosterNavigation=0;holdFinal=false;releaseFinal=null
 let p=render();p.onRestoreFile(file(env.work.review));return settled()
}
async function ready(){let p=render();if(!p.frozen&&!p.rosterPrepared){p.onPrepareRoster();p=await settled();assert.equal(p.rosterPrepared,true,p.error)}panel(p).onReview();p=await settled();assert.equal(panel(p).ready,true,panel(p).error);panel(p).onAccepted(true);p=render();panel(p).onSingleOperator(true);return render()}
async function main(){
 let p=await start();assert.equal(loads,1);assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 const entryStage=p=>controls(p,true).find(n=>n.type==='fieldset'&&React.Children.toArray(n.props.children).some(c=>c.type==='legend'&&c.props.children==='②-2 仮確定した人馬でエントリーを確認'))
 assert.equal(entryStage(p).props.disabled,true,'entry controls are disabled until preparation')
 assert.equal(p.rosterPrepared,false);p.onPrepareRoster();p=await settled();assert.equal(p.rosterPrepared,true,p.error);assert.equal(entryStage(p).props.disabled,false)
 panel(p).onReview();p=await settled();assert.equal(panel(p).ready,true);assert.equal(panel(p).people.length,2);assert.equal(panel(p).entries.length,1);assert.equal(panel(p).originalTotal,'19000');assert.equal(panel(p).paid,'0');assert.equal(panel(p).feedback.state,'ready')
 assert.deepEqual(env.posts,{person:0,participants:0,entry:0},'read/restore/review do not register')
 panel(p).onRun();p=await settled();assert.match(panel(p).error,/確認/);assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 p=await ready();const action=panel(p).onRun;action();action();p=await settled()
 assert.deepEqual(env.posts,{person:2,participants:1,entry:1});assert.equal(p.frozen,true);assert.equal(panel(p).people[0].state,'登録済み');assert.equal(panel(p).entries[0].state,'登録済み');assert.equal(panel(p).participantState,'登録済み');assert.equal(panel(p).feedback.state,'success');assert.equal(panel(p).feedback.progress.entriesConfirmed,1);assert(panel(p).feedback.checkedAt)
 assert.equal(env.stored.review.paid,'0');assert.equal(env.stored.review.original.amounts.total,'19000')
 const frozen=JSON.stringify(p.edited);p.onPerson('r1',{name:'unauthorized overwrite'});p.onReference('CHANGED');p.onPaid('999');p=render();assert.equal(JSON.stringify(p.edited),frozen);assert.equal(p.reference,env.work.review.reference);assert.equal(p.paid,'0')
 const markup=renderToStaticMarkup(React.createElement(MasterApplicationReview,p));assert.match(markup,/fieldset disabled/);assert(!markup.includes('確認再開JSONを保存して別の申込書へ'));assert(markup.includes('④ 取り込み結果'))
 panel(p).onDownload();p=await settled();const raw=await downloadBlob.text();const saved=parseApplicationRegistration(raw);assert.equal(saved.people.r1.state,'registered');assert(!raw.includes('synthetic-secret'));assert(!raw.includes('synthetic-refresh'))
 // Revised Excel remains a comparison: no edits to the fixed review or stored registration.
 p.onFiles([{name:'synthetic-revision.xlsx',size:1,arrayBuffer:async()=>new ArrayBuffer(1)}]);p=render();p.onRead();p=await settled();assert(p.differences.length);assert.equal(JSON.stringify(p.edited),frozen);assert.deepEqual(env.posts,{person:2,participants:1,entry:1})
 p=await ready();panel(p).onRun();p=await settled();assert.deepEqual(env.posts,{person:2,participants:1,entry:1},'reimport/recheck never rebills the same entry')
 // Reopen from exported file, without assuming a remembered browser session or trusting flags.
 h.close();h=hooks();p=render();panel(p).onRestoreFile(file(raw));p=await settled();assert.equal(p.frozen,true);assert.equal(panel(p).hasPlan,false);assert.equal(panel(p).feedback,undefined,'local saved flags never show success before a fresh read');assert.match(panel(p).people[0].state,/未再照合/)
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
 importCheckbox(p).onChange({target:{checked:true}});p=render();assert.equal(panel(p).error,'');assert.equal(panel(p).canReview,false);p.onPrepareRoster();p=await settled();assert.equal(panel(p).canReview,true,p.error);assert(!p.todos.some(t=>t.target==='application-club'&&t.blocking));p=await ready();assert.equal(panel(p).ready,true);assert.equal(p.stage,3)
 importCheckbox(p).onChange({target:{checked:false}});p=render();assert.equal(panel(p).hasPlan,false,'withdrawing consent invalidates confirmation');assert.equal(panel(p).canReview,false);assert(p.todos.some(t=>t.target==='application-club'&&t.blocking))
 panel(p).onRun();p=await settled();assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 p.onChanges();p=await settled();assert.equal(changeNavigation,1);assert.equal(downloads,0);assert.deepEqual(env.posts,{person:0,participants:0,entry:0});assert.equal(env.credentialPosts,0)
 const {applicationDraftKey,parseApplicationDraft}=require('../lib/winter-application-draft.ts')
 assert.equal(parseApplicationDraft(map.get(applicationDraftKey(p.original.digest))).choices.r1,riderId,'navigation retains review locally')

 // The roster is prepared once before entry assignment. Cosmetic differences do not become corrections.
 p=await start()
 const spaced=env.addPerson({kind:'rider',name:'合成 選手',reading:'ゴウセイセンシュ',jefNumber:'',clubName:p.edited.club})
 const horse=env.addPerson({kind:'horse',name:'合成馬',reading:'ゴウセイウマ',jefNumber:'',clubName:p.edited.club})
 p.onLoadRoster();p=await settled();p.onChoice('r1',spaced);p=await settled();p.onChoice('h1',horse);p=await settled()
 const evidence=JSON.stringify(p.original)
 p.onPrepareRoster();p=await settled();assert.equal(p.rosterPrepared,true,p.error);assert.equal(p.edited.people[0].name,'合成 選手');assert.equal(p.edited.people[0].reading,'ゴウセイセンシュ');assert.equal(p.rosterChanges.length,0)
 assert.equal(env.correctionPosts,0);assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 p.onAccountChecked(true);p=render();p=await ready();assert.equal(panel(p).hasCorrections,false);assert(panel(p).people.every(r=>!r.correction))
 p.onEntry(p.edited.entries[0].key,{op:false});p=render();assert.equal(p.rosterPrepared,true,'entry-only changes retain roster preparation')
 p.onPerson('r1',{name:'訂正後の合成選手'});p=render();assert.equal(p.choices.r1,spaced,'explicit identity survives correction');assert(p.candidates.r1.some(c=>c.id===spaced));assert.equal(p.rosterPrepared,false);assert.equal(panel(p).canReview,false)
 assert(p.rosterChanges.some(r=>r.changes.some(c=>c.label==='名前・馬名')))
 failStorage=true;p.onPrepareRoster();p=await settled();assert.equal(p.rosterPrepared,false);assert.match(p.error,/quota/);assert.equal(env.correctionPosts,0);failStorage=false
 p.onPrepareRoster();p=await settled();assert.equal(p.rosterPrepared,true,p.error);p.onAccountChecked(true);p=render();p=await ready();assert.equal(panel(p).rosterCorrectionCount,1);assert.equal(panel(p).hasCorrections,false)
 const html=renderToStaticMarkup(React.createElement(MasterApplicationRegistration,panel(p)));assert.match(html,/仮確定/)
 // Lost reply is read back before entry registration, using the frozen request journal.
 env.deps.correctPerson=async input=>{env.correctPerson(input);throw Error('synthetic lost reply')}
 panel(p).onRun();p=await settled();assert.equal(panel(p).complete,true,panel(p).error);assert.equal(env.correctionPosts,1);assert.deepEqual(env.posts,{person:0,participants:1,entry:1});assert.equal(JSON.stringify(p.original),evidence)
 p=await ready();panel(p).onRun();p=await settled();assert.equal(env.correctionPosts,1);assert.equal(env.posts.entry,1)

 // Existing-club and manual affiliation controls now belong to step ②, before preparation.
 p=await start()
 const moving=env.addPerson({kind:'rider',name:'合成選手',reading:'ごうせいせんしゅ',jefNumber:'',clubName:p.edited.club})
 const importClub=env.snapshot.roster.clubs[0]
 env.addPerson({kind:'horse',name:'対象外の合成馬',reading:'タイショウガイ',jefNumber:'',clubName:'選択先の合成クラブ'})
 const destinationClub=env.snapshot.roster.clubs[1];env.publish(importClub.id,[moving],[])
 p.onLoadRoster();p=await settled();p.onChoice('r1',moving);p=await settled();p.onIntent('addition');p=render()
 let affiliationControl=controls(p,true).find(c=>c.props['aria-label']==='r1 所属先の指定方法')
 assert.equal(affiliationControl.props.value,'application');assert.equal(React.Children.toArray(affiliationControl.props.children)[0].props.value,'application')
 affiliationControl.props.onChange({target:{value:'existing'}});p=render()
 controls(p,true).find(c=>c.props['aria-label']==='r1 登録済みの所属先クラブ').props.onChange({target:{value:destinationClub.id}});p=render()
 controls(p,true).find(c=>c.props['aria-label']===`r1 ${importClub.name}への所属を終了`).props.onChange({target:{checked:true}});p=render()
 assert(p.rosterChanges.some(r=>r.changes.some(c=>c.label==='所属を終了')))
 p.onPrepareRoster();p=await settled();assert.equal(p.rosterPrepared,true,p.error)
 const transferDraft=parseApplicationDraft(map.get(applicationDraftKey(p.original.digest)));assert.equal(transferDraft.rosterEdits.r1.clubId,destinationClub.id)
 controls(p,true).find(c=>c.props['aria-label']==='r1 所属先の指定方法').props.onChange({target:{value:'manual'}});p=render();assert.equal(p.rosterPrepared,false)
 controls(p,true).find(c=>c.props['aria-label']==='r1 所属先のクラブ名').props.onChange({target:{value:'手入力の合成クラブ'}});p=render()
 controls(p,true).find(c=>c.props['aria-label']===`r1 ${importClub.name}への所属を終了`).props.onChange({target:{checked:true}});p=render()
 p.onPrepareRoster();p=await settled();p.onAccountChecked(true);p=render();p=await ready();panel(p).onRun();p=await settled();assert.equal(panel(p).complete,true,panel(p).error)
 assert.equal(env.correctionPosts,1);assert(env.snapshot.roster.affiliations.find(a=>a.entity_id===moving&&a.club_id===importClub.id).ended_at)
 assert.equal(env.snapshot.roster.clubs.filter(c=>c.name==='手入力の合成クラブ').length,1)
 assert.equal(env.snapshot.roster.participants.find(r=>r.entity_id===moving).club_id,importClub.id)

 // Concurrent edits invalidate the prepared plan without overwriting another operator.
 p=await start()
 const conflict=env.addPerson({kind:'rider',name:'合成選手誤字',reading:'ごうせいせんしゅ',jefNumber:'',clubName:p.edited.club})
 // It is an explicit ID selected by the administrator, not inferred by a new spelling.
 env.snapshot.roster.entities[0].reading=p.edited.people[0].reading
 p.onLoadRoster();p=await settled();p.onChoice('r1',conflict);p=await settled();p.onPrepareRoster();p=await settled();p.onAccountChecked(true);p=render();p=await ready()
 env.snapshot.roster.entities[0].name='別操作で訂正済み';env.snapshot.roster.entities[0].updated_at='2026-10-24T01:00:00Z'
 panel(p).onRun();p=await settled();assert.equal(env.correctionPosts,0);assert.match(panel(p).error,/仮確定後/);assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 // Return to the editable stage; only another explicit preparation adopts a new before-value.
 p.onPrepareRoster();p=await settled();assert.equal(p.rosterPrepared,true,p.error)
 for(const raw of map.values()){assert(!raw.includes('synthetic-secret'));assert(!raw.includes('synthetic-refresh'))}

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
 panel(p).onRun();for(let i=0;i<100&&!release;i++)await tick();assert(release,'save boundary reached');p=render();assert.equal(panel(p).running,true);assert.equal(p.busy,true);assert.equal(panel(p).feedback.state,'running');assert.equal(panel(p).feedback.progress.phase,'people');assert.equal(panel(p).feedback.progress.peopleConfirmed,0,'a returned POST without readback is not counted')
 p.onPerson('r1',{name:'edited while saving'});p=render();assert.equal(p.edited.people[0].name,'合成選手')
 panel(p).onStop();p=render();assert.equal(panel(p).feedback.stopRequested,true);assert.equal(panel(p).feedback.state,'running');release();p=await settled();assert.equal(panel(p).feedback.state,'stopped');assert.equal(panel(p).feedback.progress.peopleConfirmed,1);assert.deepEqual(env.posts,{person:1,participants:0,entry:0});assert.equal(env.stored.people.r1.state,'registered');assert.equal(env.stored.people.h1.state,'unregistered')
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
 panel(p).onRun();p=await settled();assert.equal(Object.values(env.stored.entries.states)[0],'unknown');assert.equal(env.posts.entry,1);assert.equal(panel(p).feedback.state,'error');assert.equal(panel(p).feedback.progress.entriesConfirmed,0,'lost reply cannot be reported as a success')
 env.deps.saveEntry=saveEntry;p=await ready();assert.equal(panel(p).entries[0].state,'登録済み');assert.equal(panel(p).feedback.state,'success');panel(p).onRun();p=await settled();assert.equal(env.posts.entry,1)

 // Local write failure after an ID was returned must not discard that recoverable ID.
 p=await start();p=await ready();failKnownId=true;panel(p).onRun();p=await settled();assert.equal(env.posts.person,1);assert.match(panel(p).error,/quota/);assert(panel(p).people[0].id)
 panel(p).onDownload();p=await settled();const rescue=parseApplicationRegistration(await downloadBlob.text());assert(rescue.people.r1.entityId);assert.equal(rescue.people.r1.state,'unknown')
 // Reopen the newer exported result against the older local record, preserving both source and known ID.
 failKnownId=false;h.close();h=hooks();p=render();const oldLocal=map.get(applicationRegistrationKey(rescue.review.reference))
 panel(p).onRestoreFile(file(rescue));p=await settled();assert.equal(panel(p).people[0].id,rescue.people.r1.entityId);assert.equal(map.get(applicationRegistrationKey(rescue.review.reference)),oldLocal,'opening a newer file does not overwrite local history')
 p=await ready();panel(p).onRun();p=await settled();assert.deepEqual(env.posts,{person:2,participants:1,entry:1})

 // Feedback appears during preflight, and stop before the first mutation actually stops.
 p=await start();p=await ready();gateLoad=new Promise(resolve=>release=resolve)
 panel(p).onRun();await tick();p=render();assert.equal(panel(p).feedback.state,'running');assert.equal(panel(p).feedback.progress.phase,'checking');assert.equal(panel(p).running,true);assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 panel(p).onStop();p=render();assert.equal(panel(p).feedback.stopRequested,true);release();gateLoad=null;p=await settled();assert.equal(panel(p).feedback.state,'stopped');assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 // 100% of entry readbacks is still not success until the final authoritative review completes.
 p=await start();p=await ready();holdFinal=true;panel(p).onRun()
 for(let i=0;i<500&&!releaseFinal;i++)await tick();assert(releaseFinal,'final verification boundary reached');p=render()
 assert.equal(panel(p).feedback.state,'running');assert.equal(panel(p).feedback.progress.phase,'verifying');assert.equal(panel(p).feedback.progress.entriesConfirmed,1);assert.equal(panel(p).complete,false)
 releaseFinal();p=await settled();assert.equal(panel(p).feedback.state,'success');assert.equal(panel(p).complete,true)
 const successMarkup=renderToStaticMarkup(React.createElement(MasterApplicationRegistration,panel(p)));assert.match(successMarkup,/反映完了/);assert.match(successMarkup,/border-emerald-700/);assert.match(successMarkup,/保存結果の確認時刻/)

 // Every blocking condition is tested against the controller's real save action.
 for(const condition of ['lock-held','unsupported-lock','auth','storage','price-change']){
  p=await start();p=await ready();if(condition==='lock-held')lockHeld=true;if(condition==='unsupported-lock')missingLocks=true;if(condition==='auth')deny=true;if(condition==='storage')failStorage=true;if(condition==='price-change')env.snapshot.data.competitions[0].member_fee++
  panel(p).onRun();p=await settled();assert(panel(p).error,condition);assert.equal(panel(p).feedback.state,'error',condition);assert.deepEqual(env.posts,{person:0,participants:0,entry:0},condition)
 }
 p=await start();p=await ready();p.onPaid('1');p=render();assert.equal(panel(p).hasPlan,false,'edited input invalidates old confirmation');assert.equal(panel(p).feedback,undefined,'old feedback is hidden after an edit');panel(p).onRun();p=await settled();assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
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
