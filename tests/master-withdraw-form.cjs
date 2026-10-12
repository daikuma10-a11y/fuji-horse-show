const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const resolve=Module._resolveFilename;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)}
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f)
const {MasterWithdrawForm}=require('../components/master/withdraw-form.tsx'),{winterWithdrawDraft}=require('../lib/winter-withdraw-form.ts'),{winterBatchPayload,emptyWinterQueue}=require('../lib/winter-batch.ts'),{WINTER_EVENT_ID:ev}=require('../lib/winter-event.ts')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,row={event_id:ev},org={...row,id:id(1),name:'テストクラブ'},rider={...row,id:id(2),name:'同名選手',organization_id:org.id},horse={...row,id:id(3),name:'馬',organization_id:org.id},competition={id:id(4),number:'1',name:'競技',date:'2026-11-13',entryFee:10000,official:false},entry={id:id(5),competitionId:competition.id,playerId:rider.id,horseId:horse.id,organizationId:org.id,order:1,isOp:true}
const original={...row,entry_id:entry.id,competition_id:competition.id,competition_no:'1',start_order:1,status:'active',rider_id:rider.id,horse_id:horse.id,organization_name:org.name,is_op:true}
const data={eventId:ev,organizations:[org],riders:[rider,{...rider,id:id(9),organization_id:id(8)}],horses:[horse],entries:[original]}
const payload={entryId:entry.id,competitionId:competition.id,playerId:rider.id,horseId:horse.id,organizationId:org.id},draft=winterWithdrawDraft(data,payload,'担当者',id(6))
assert.equal(draft.entry.is_op,true);assert.equal(draft.entry.rider_id,rider.id);assert.equal(draft.visitorName,'担当者')
const batch=winterBatchPayload({...emptyWinterQueue(),items:[draft]});assert.equal(batch.p_expected_total,0);assert.deepEqual(batch.p_items,[{type:'withdraw',args:{p_id:id(6),p_entry_id:entry.id,p_visitor_name:'担当者'}}])
assert.throws(()=>winterWithdrawDraft(data,payload,'',id(6)),/担当者/)
assert.throws(()=>winterWithdrawDraft({...data,eventId:'autumn'},payload,'担当者',id(6)))
assert.throws(()=>winterWithdrawDraft({...data,entries:[{...original,status:'withdrawn'}]},payload,'担当者',id(6)))
assert.throws(()=>winterWithdrawDraft(data,{...payload,playerId:id(9)},'担当者',id(6)),/変わりました/)
assert.throws(()=>winterWithdrawDraft({...data,horses:[{...horse,event_id:'autumn'}]},payload,'担当者',id(6)))
const {MasterCompetitionList}=require('../components/master/competition-list.tsx')
const categoryHtml=renderToStaticMarkup(React.createElement(MasterCompetitionList,{list:[{...competition,entryFee:0,entryFeeLabel:'会員 ¥5,000 ／ 非会員 ¥8,000'}],onSelect:()=>{}}));assert.ok(categoryHtml.includes('会員 ¥5,000'));assert.ok(!categoryHtml.includes('エントリー料金 ¥0'))
let values,cursor,staged=[],navigated=0,lock={current:false};const oldState=React.useState,oldRef=React.useRef
React.useState=initial=>{const index=cursor++;return [values[index]===undefined?initial:values[index],value=>{values[index]=typeof value==='function'?value(values[index]):value}]};React.useRef=()=>lock
const noop=()=>null,adapter={homeHref:'/winter',onExit:()=>{},getPlayer:()=>({...rider,orgId:org.id}),getHorse:()=>({...horse,orgId:org.id}),getOrg:()=>org,DateSelect:noop,CompetitionList:noop,StartList:noop,stageWithdraw:p=>{staged.push(p)},onStaged:()=>navigated++}
function tree(step,error=''){values=[false,error,step,competition.date,competition,entry];cursor=0;return MasterWithdrawForm({adapter})}
try {
 const html=renderToStaticMarkup(tree('confirm'));assert.ok(html.includes('この内容で棄権します'));assert.ok(html.includes('href="/winter"'));assert.ok(!html.includes('href="/"'));assert.ok(html.includes('同名選手'))
 const shell=tree('entry');const list=React.Children.toArray(shell.props.children).find(child=>child.type===noop);list.props.onSelect(entry);assert.equal(values[5],null,'second tap clears selection');list.props.onSelect(entry);assert.equal(values[5].id,entry.id)
 const c=tree('confirm'),action=c.props.footer.props.onClick;action();action()
 assert.equal(staged.length,1,'synchronous guard rejects duplicate confirmation taps');assert.deepEqual(staged[0],payload)
 Promise.resolve().then(()=>{assert.equal(navigated,1);console.log('PASS: shared withdrawal steps, scoped navigation, tap deselection, duplicate tap guard, zero-fee batch payload, OP, event isolation and affiliation IDs')})
} finally {React.useState=oldState;React.useRef=oldRef}
