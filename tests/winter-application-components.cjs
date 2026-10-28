require('./register-ts.cjs')
const assert=require('node:assert/strict'),Module=require('node:module'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const fixture=require('./winter-application-fixture.cjs'),originalLoad=Module._load
function hooks(){let index=0;const values=[];return {
 render(fn){index=0;return fn()},
 useState(initial){const i=index++;values[i]??={value:typeof initial==='function'?initial():initial};return [values[i].value,v=>{values[i].value=typeof v==='function'?v(values[i].value):v}]},
 useRef(initial){const i=index++;return values[i]??(values[i]={current:initial})},
 useMemo(fn){index++;return fn()},useEffect(){index++}
}}
let h=hooks(),reads=0,auth=0,authDenied=false,contextFailed=false,rosterReads=0,network=0,downloadBlob=null,nextApp=fixture(),map=new Map()
const id='11111111-1111-4111-8111-111111111111',horseId='22222222-2222-4222-8222-222222222222',noNumberId='33333333-3333-4333-8333-333333333333'
let lookupNumbers=[]
const entities=[{id,kind:'rider',name:'合成選手',reading:'ごうせいせんしゅ',jef_number:'',archived_at:null},
 {id:horseId,kind:'horse',name:'合成馬',reading:'ごうせいうま',jef_number:'900002',archived_at:null},
 {id:noNumberId,kind:'horse',name:'合成馬',reading:'ごうせいうま',jef_number:null,archived_at:null}]
global.fetch=()=>{network++;throw Error('Network forbidden')}
global.window={confirm:()=>true,addEventListener(){},removeEventListener(){}}
global.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}
global.document={createElement:()=>({click(){}}),getElementById:()=>null};global.requestAnimationFrame=fn=>fn()
const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL
URL.createObjectURL=blob=>{downloadBlob=blob;return 'blob:synthetic'};URL.revokeObjectURL=()=>{}
Module._load=function(name,...args){
 if(name==='react')return {...React,...Object.fromEntries(['useState','useRef','useMemo','useEffect'].map(k=>[k,(...args)=>h[k](...args)]))}
 if(name==='@/lib/winter-application'){const actual=originalLoad.call(this,name,...args);return {...actual,readWinterApplication:async()=>{reads++;return structuredClone(nextApp)}}}
 if(name==='@/lib/winter-application-services')return {winterApplicationServices:()=>({loadRoster:async()=>{if(authDenied)throw Error('管理者権限を確認できません');return {entities:structuredClone(entities),clubs:[],affiliations:[],participants:[]}},load:async numbers=>{lookupNumbers=numbers??[];auth++;if(authDenied)throw Error('管理者権限を確認できません');rosterReads++;if(contextFailed)throw Error('合成料金読込失敗');return {roster:{entities:structuredClone(entities),clubs:[{id:'club',name:'別所属'}],affiliations:[{entity_id:id,club_id:'club',ended_at:null}],participants:[]},riderGrades:lookupNumbers.includes('900001')?[{member_no:'900001',name:'合成選手',rider_grade:'A',import_date:'2026-10-24'}]:[],bindings:[],initial:[],data:{eventId:nextApp.eventId,organizations:[],entries:[],riders:[],horses:[],competitions:[]}}}})}
 if(name==='@/lib/supabase-rest')return {verifyAdminSession:async s=>{auth++;if(authDenied)throw Error('管理者権限を確認できません');return s}}
 return originalLoad.call(this,name,...args)
}
const {WinterApplicationImport}=require('../components/winter-application-import.tsx')
const {MasterApplicationReview}=require('../components/master/application-review.tsx')
const {parseApplicationDraft,applicationDraftKey}=require('../lib/winter-application-draft.ts')
const props={session:{accessToken:'synthetic-session-only'},onSession(){}}
const render=()=>h.render(()=>WinterApplicationImport(props)).props
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve();return render()}
const file={name:'synthetic.xlsx',size:1,arrayBuffer:async()=>new ArrayBuffer(1)}
;(async()=>{
 let p=render();assert.equal(p.edited,null);assert.equal(reads,0)
 p.onFiles([file]);p=render();assert.equal(reads,0,'select alone never reads or saves')
 p.onRead();p.onRead();p=await settle();assert.equal(reads,1,'double-click is locked');assert.equal(auth,1);assert.equal(rosterReads,1);assert.equal(p.edited.entries.length,1)
 p.onPaid('0');p=render();p.onAccountChecked(true);p=render();assert.equal(p.review.ready,true)
 p.onLoadRoster();p=await settle();assert.equal(auth,2);assert.equal(rosterReads,2);assert.equal(p.candidates.r1[0].clubs[0],'別所属');assert.deepEqual(p.choices,{})
 p.onChoice('r1',id);p=await settle();assert.equal(p.choices.r1,id)
 p.onClub('');p=render();assert.equal(p.choices.r1,id);assert.equal(p.rosterLoaded,true);assert.equal(p.candidates.r1[0].id,id);assert.match(p.clubSummary.detail,/団体名/);p.onChoice('r1',id);p=await settle();assert.equal(p.choices.r1,id);p.onClub('合成クラブ');p=render();assert.equal(p.choices.r1,id)
 p.onAddEntry(p.edited.entries[0].key);p=render();assert.equal(p.edited.entries.length,2);const addedKey=p.edited.entries[1].key;assert.equal(p.edited.entries[1].horse,'h1');p.onEntry(addedKey,{rider:'r1'});p=render();p.onRemoveAddition(addedKey);p=render();assert.equal(p.edited.entries.length,1);p.onAddPerson('rider');p=render();assert.equal(p.edited.people.length,3);p.onRemoveAddition(p.edited.people.at(-1).key);p=render();assert.equal(p.edited.people.length,2)
 // Explicit candidate selection copies numbers and invalidates confirmation without rewriting Excel.
 p.onChoice('h1',horseId);p=await settle();assert.equal(p.edited.people[1].jef,'900002');assert.equal(p.original.people[1].jef,'');assert.equal(p.choices.h1,horseId);assert.equal(p.edited.people[1].checked,false)
 p.onPerson('h1',{checked:true});p=render();p.onAccountChecked(true);p=render()
 p.onChoice('h1',noNumberId);p=await settle();assert.equal(p.edited.people[1].jef,'');assert.equal(p.edited.people[1].checked,false);assert.equal(p.accountChecked,false);assert.equal(p.choices.h1,noNumberId)
 const emptyMarkup=renderToStaticMarkup(React.createElement(MasterApplicationReview,p));assert.match(emptyMarkup,/placeholder="なし"/);assert.match(emptyMarkup,/日馬連番号：なし/);assert.match(emptyMarkup,/日馬連 なし/)
 p.onChoice('h1',horseId);p=await settle();p.onPerson('h1',{checked:true});p=render();p.onPerson('h1',{jef:'777'});p=render();assert.equal(p.edited.people[1].checked,false);assert.equal(p.choices.h1,horseId,'explicit selected identity retained for number correction')
 p.onChoice('h1',noNumberId);p=await settle()
 // A number absent from the workbook must trigger the qualification lookup when selected.
 entities[0].jef_number='900001';p.onLoadRoster();p=await settle();p.onChoice('r1',id);p=await settle()
 assert.deepEqual(lookupNumbers,['900001']);assert.equal(p.edited.people[0].jef,'900001');assert.equal(p.edited.people[0].grade,'A');assert.equal(p.edited.people[0].checked,false);assert.equal(p.original.people[0].jef,'');assert.equal(p.original.people[0].grade,'未登録');assert.equal(p.choices.r1,id)
 p.onPerson('r1',{grade:'C'});p=render();p.onChoice('r1',id);p=await settle();assert.equal(p.edited.people[0].grade,'C','manual qualification is preserved')
 p.onChoice('h1','44444444-4444-4444-8444-444444444444');p=await settle();assert.match(p.error,/候補を確認できません/);assert.equal(p.choices.h1,noNumberId)

 p.onPerson('r1',{name:'訂正選手'});p=render();assert.equal(p.original.people[0].name,'合成選手');assert.equal(p.edited.people[0].name,'訂正選手');assert.equal(p.choices.r1,id,'renaming retains the selected identity');assert.equal(p.accountChecked,false)
 p.onReference('TEST-ONLY');p=render();p.onSave();p=await settle();assert.match(p.message,/保存しました/)
 const stored=map.get(applicationDraftKey(p.original.digest));assert.equal(parseApplicationDraft(stored).edited.people[0].name,'訂正選手')
 p.onDownload();p=await settle();const downloaded=await downloadBlob.text();assert.equal(parseApplicationDraft(downloaded).reference,'TEST-ONLY');assert.ok(!downloaded.includes('synthetic-session-only'))
 nextApp=fixture();nextApp.digest='b'.repeat(64);nextApp.people[0].name='訂正版候補';p.onFiles([file]);p=render();p.onRead();p=await settle();assert.ok(p.differences.length);assert.equal(p.edited.people[0].name,'訂正選手','revision comparison does not replace current draft')
 const markup=renderToStaticMarkup(React.createElement(MasterApplicationReview,p));assert.ok(markup.includes('原本請求と料金の照合'));assert.ok(markup.includes('合成選手'));assert.ok(markup.includes('訂正選手'));assert.ok(markup.includes('読み込んだだけでは登録しません'));assert.ok(markup.includes('③ 確認した内容を取り込む'))
 // A different tab saved the same original after our last read.
 map.set(applicationDraftKey(p.original.digest),JSON.stringify({...parseApplicationDraft(stored),reference:'OTHER-TAB'}));p.onSave();p=await settle();assert.match(p.error,/別の確認/);assert.equal(parseApplicationDraft(map.get(applicationDraftKey(p.original.digest))).reference,'OTHER-TAB')
 const bad=JSON.stringify({...parseApplicationDraft(stored),eventId:'Autumn'});p.onRestoreFile({size:bad.length,arrayBuffer:async()=>new TextEncoder().encode(bad).buffer});p=await settle();assert.match(p.error,/Winter/);assert.equal(p.edited.people[0].name,'訂正選手')
 h=hooks();p=render();p.onRestoreFile({size:stored.length,arrayBuffer:async()=>new TextEncoder().encode(stored).buffer});p=await settle();assert.match(p.error,/異なる確認記録/);assert.equal(p.edited,null)
 map.clear();p.onRestoreFile({size:stored.length,arrayBuffer:async()=>new TextEncoder().encode(stored).buffer});p=await settle();assert.equal(p.edited.people[0].name,'訂正選手');assert.equal(p.rosterLoaded,true)
 contextFailed=true;p.onLoadRoster();p=await settle();assert.match(p.error,/人馬候補は選択できます/);assert.equal(p.rosterLoaded,true);assert.equal(p.candidates.h1.length,2);contextFailed=false;
 authDenied=true;const previousReads=rosterReads;p.onLoadRoster();p=await settle();assert.match(p.error,/管理者権限/);assert.equal(rosterReads,previousReads);assert.equal(p.rosterLoaded,false);assert.equal(p.edited.people[0].name,'訂正選手')
 // Supplement a saved older draft by reading the same file, without losing corrected identities.
 authDenied=false;nextApp=fixture();nextApp.entryCounts=[{key:'障害!C13',block:'障害!4',competition:'5',horseKeys:['h1'],entryKeys:[nextApp.entries[0].key],membership:'sportsMember',buckets:[{kind:'nonmember',origin:{sheet:'障害',cell:'Q14',value:'0'}},{kind:'member',origin:{sheet:'障害',cell:'U14',value:'0'}}]}]
 p.onFiles([file]);p=render();p.onRead();p=await settle();assert.match(p.message,/競技ごとの集計人数/);assert.equal(p.edited.people[0].name,'訂正選手');assert.equal(p.original.entryCounts.length,1);assert.equal(p.review.entryCounts[0].buckets[1].actual,1)
 p.onAccountChecked(true);p=render();p.onEntryCount('障害!C13:member','1');p=render();assert.equal(p.accountChecked,false);assert.equal(p.original.entryCounts[0].buckets[1].origin.value,'0');assert.equal(p.edited.entryCountCorrections['障害!C13:member'],'1');assert(p.review.entryCounts[0].buckets.every(b=>!b.reason))
 // Similar names are visible even if an older draft had selected new. Searching never edits names.
 h=hooks();map.clear();nextApp=fixture();nextApp.people[1].name='ハリーポッターD';nextApp.people[1].reading=''
 const harryId='77777777-7777-4777-8777-777777777777';entities.push({id:harryId,kind:'horse',name:'ハリーポッター・D',reading:'ハリーポッターディー',jef_number:'900777',archived_at:null})
 p=render();p.onFiles([file]);p=render();p.onRead();p=await settle();assert(p.candidates.h1.some(c=>c.id===harryId));assert.equal(p.edited.people[1].jef,'');assert.equal(p.choices.h1,undefined,'suggestion never selects an identity automatically')
 p.onChoice('h1','new');p=await settle();const nameBefore=p.edited.people[1].name,originalBefore=JSON.stringify(p.original),lookupBefore=auth
 p.onAccountChecked(true);p=render();p.onCandidateSearch('h1','ハリー');p=render();assert(p.candidates.h1.some(c=>c.id===harryId));assert.equal(p.edited.people[1].name,nameBefore);assert.equal(JSON.stringify(p.original),originalBefore);assert.equal(p.accountChecked,true);assert.equal(auth,lookupBefore,'typing searches loaded roster without requests')
 const candidatesMarkup=renderToStaticMarkup(React.createElement(MasterApplicationReview,p));assert.match(candidatesMarkup,/登録済みの候補が1件あります/);assert.match(candidatesMarkup,/bg-amber-100/);assert.match(candidatesMarkup,/候補を検索（名前の一部・番号）/);assert.match(candidatesMarkup,/ハリーポッター・D/)
 p.onChoice('h1',harryId);p=await settle();assert.equal(p.choices.h1,harryId);assert.equal(p.edited.people[1].jef,'900777');assert.equal(p.edited.people[1].name,'ハリーポッターD');assert.equal(p.original.people[1].jef,'');assert.equal(p.accountChecked,false)
 // Inline count repair changes only the local draft and retains its prepared roster.
 assert.match(p.onAddCountEntry('missing',{rider:'r1',horse:'h1',op:false}),/仮確定/)
 const {createApplicationDraft,serializeApplicationDraft}=require('../lib/winter-application-draft.ts'),{applicationRosterSignature}=require('../lib/winter-application-roster-stage.ts')
 h=hooks();map.clear();const prepared=createApplicationDraft(fixture());prepared.original.digest=prepared.edited.digest='d'.repeat(64)
 const countRows=[{key:'障害!C9',competition:'1',block:'障害!4',horseKeys:['h1'],entryKeys:[],buckets:[{kind:'regular',origin:{sheet:'障害',cell:'Q9',value:'1'}},{kind:'op',origin:{sheet:'障害',cell:'U9',value:''}}]}]
 prepared.original.entryCounts=structuredClone(countRows);prepared.edited.entryCounts=structuredClone(countRows);prepared.choices={r1:'new',h1:'new'};prepared.accountChecked=true;prepared.paid='0';prepared.rosterPreparation={signature:applicationRosterSignature(prepared),corrections:{}}
 const savedPreparation=JSON.stringify(prepared.rosterPreparation),preparedJson=serializeApplicationDraft(prepared)
 p=render();p.onRestoreFile({size:preparedJson.length,arrayBuffer:async()=>new TextEncoder().encode(preparedJson).buffer});p=await settle();assert.equal(p.rosterPrepared,true)
 const countOriginal=JSON.stringify(p.original),requestsBefore=auth
 assert.equal(p.onAddCountEntry('障害!C9',{rider:'r1',horse:'h1',op:false}),undefined);p=render()
 const countEntry=p.edited.entries.at(-1);assert.deepEqual([countEntry.competition,countEntry.countBlock,countEntry.rider,countEntry.horse],['1','障害!4','r1','h1']);assert.equal(p.review.entryFeeTotal,13000);assert.equal(p.accountChecked,false);assert(p.review.entryCounts[0].buckets.every(b=>!b.reason));assert.equal(p.rosterPrepared,true);assert.equal(JSON.stringify(p.original),countOriginal);assert.equal(auth,requestsBefore)
 assert.match(p.onAddCountEntry('障害!C9',{rider:'r1',horse:'h1',op:false}),/すでにあります/);p=render();assert.equal(p.edited.entries.length,2)
 p.onSave();p=await settle();const restoredCount=parseApplicationDraft(map.get(applicationDraftKey(p.original.digest)));assert.equal(restoredCount.edited.entries.at(-1).key,countEntry.key);assert.equal(JSON.stringify(restoredCount.rosterPreparation),savedPreparation)
 p.onRemoveAddition(countEntry.key);p=render();assert.equal(p.edited.entries.length,1);assert.equal(p.review.entryCounts[0].buckets[0].actual,0)
 assert.equal(network,0,'no real auth, database or payment requests')
 Module._load=originalLoad;URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke
 console.log('PASS: file selection/read lock, original/edited review, explicit candidates, confirmation invalidation, saved review reload, revision preservation, conflict/auth-data guards and zero real network (component mocks)')
})().catch(e=>{console.error(e);process.exitCode=1})
