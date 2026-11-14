const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
const resolve=Module._resolveFilename,load=Module._load;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)}
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f)
function hooks(){const state=[],refs=[],effects=[];let si=0,ri=0,ei=0,pending=[];const api={useState(initial){const i=si++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value]},useRef(initial){const i=ri++;return refs[i]??(refs[i]={current:initial})},useEffect(fn,deps){const i=ei++,old=effects[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()}})}};return{api,render(fn){si=ri=ei=0;pending=[];const tree=fn();pending.forEach(fn=>fn());return tree},close(){effects.forEach(e=>e?.cleanup?.())}}}
function nodes(t){return !t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)]}
function text(t){return typeof t==='string'||typeof t==='number'?String(t):!t?'':[t.props?.children].flat(Infinity).map(text).join('')}
function button(t,label){const b=nodes(t).find(n=>n.type==='button'&&text(n)===label);assert.ok(b,label);return b}
require('react/jsx-runtime');const h=hooks();Module._load=function(id,...args){if(id==='react')return h.api;if(id==='next/link')return ()=>null;return load.call(this,id,...args)}
const {WINTER_EVENT_ID:event,WINTER_BANK_DETAILS:bank}=require('../lib/winter-event.ts'),{WinterSelfSettlement}=require('../components/winter-self-settlement.tsx')
const org='11111111-1111-4111-8111-111111111111',version='a'.repeat(64),account={bankDetails:bank,organization:{id:org,event_id:event,name:'テスト団体'},normalTotal:10000,horseRegistration:{count:1,unitFee:14000,total:14000},initialTotal:24000,extraTotal:8000,adjustmentTotal:-1000,total:31000,advancePaid:0,extraPaid:0,remaining:31000,adjustments:[{reason:'料金の訂正',delta:-1000}],lines:[{id:'q',action:'変更',competitionLabel:'競技1 → 競技2',rider:'選手A → 選手B',horse:'馬',amount:8000}],warnings:[]}
let posts=[],saved=null,mode='lost',prints=0,timers=[],now=Date.now();const originalNow=Date.now;Date.now=()=>now
global.document={visibilityState:'visible'};const listeners={};global.window={setInterval(fn){timers.push(fn);return timers.length},clearInterval(){},addEventListener(name,fn){listeners[name]=fn},removeEventListener(name){delete listeners[name]},print(){prints++;listeners.beforeprint?.();listeners.afterprint?.()}}
global.fetch=async(url,options)=>{if(options?.method==='POST'){const input=JSON.parse(options.body);posts.push(input);if(mode==='lost')throw Error('lost response');saved={id:input.id,event_id:event,organization_key:org,account_version:version,payment_method:input.method,confirmer_name:input.name,created_at:'2026-10-12T00:00:00Z',account};return{ok:true,json:async()=>({saved})}}return{ok:true,json:async()=>structuredClone(url.includes('history')?{records:[saved]}:url.includes('?org=')?{account,version,saved}:{organizations:[account.organization]})}}
const expand=require('./settlement-view-render.cjs')(hooks,h.api)
const render=()=>h.render(()=>{const tree=WinterSelfSettlement();return expand(tree.type(tree.props))}),flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve()}
;(async()=>{
 account.warnings=['事前入金は未確認です。本部に確認してください。']
 let t=render();await flush();t=render();button(t,'テスト団体 ›').props.onClick();await flush();t=render();assert.ok(text(t).includes('馬匹登録料（1頭）'));assert.ok(text(t).includes('¥14,000'));assert.ok(!text(t).includes('事前エントリーの明細'))
 const draftLabel='明細確認、印刷'
 assert.match(text(t),/内容が違う場合は係員にお尋ねください。/)
 assert.ok(!text(t).includes('内容が違う・係員に相談'))
 const check=nodes(t).find(n=>n.type==='input'&&n.props.type==='checkbox')
 assert.equal(check.props.checked,false);assert.ok(nodes(t).indexOf(button(t,draftLabel))<nodes(t).indexOf(check))
 assert.equal(button(t,draftLabel).props.disabled,true,'no preview before selecting and confirming payment')
 assert.equal(button(t,'この支払い方法で明細確認へ').props.disabled,true)
 assert.equal(check.props.disabled,true)
 assert.ok(!nodes(t).some(n=>n.type==='button'&&text(n)==='精算書をExcelに保存（確認用）'))
 assert.ok(!nodes(t).some(n=>n.props?.record?.draft),'no printable paper before payment is confirmed')
 const bankRadio=nodes(t).find(n=>n.type==='input'&&n.props.value==='bank_transfer')
 assert.ok(nodes(t).indexOf(bankRadio)<nodes(t).indexOf(button(t,draftLabel)))
 bankRadio.props.onChange();t=render()
 assert.equal(button(t,draftLabel).props.disabled,true,'selection alone is not confirmation')
 button(t,'この支払い方法で明細確認へ').props.onClick();t=render()
 assert.equal(posts.length,0,'payment choice does not save checkout or mark paid')
 assert.equal(button(t,'精算書をExcelに保存（確認用）').props.disabled,false)
 assert.ok(text(t).includes('入金は合計欄を参照'))
 const draftPaper=nodes(t).find(n=>n.props?.record?.draft)?.props.record
 assert.ok(draftPaper);assert.match(draftPaper.document.document.title,/精算書（確認用）/)
 assert.match(draftPaper.document.document.notice,/事前入金は未確認/)
 assert.equal(draftPaper.document.document.due,31000)
 assert.equal(draftPaper.document.document.method,'後日振込')
 assert.equal(draftPaper.document.document.bankDetails,bank)
 const {masterConfirmationContent}=require('../lib/master/settlement-print.ts')
 assert.match(masterConfirmationContent(draftPaper),/静岡銀行 御殿場西支店 普通 0110546 フジホースショー事務局 川口 雅美/)
 const draftButton=button(t,draftLabel)
 assert.ok(!draftButton.props.disabled);assert.ok(!nodes(t).some(n=>n.type==='button'&&text(n)==='印刷'))
 draftButton.props.onClick();t=render();assert.equal(prints,0);assert.equal(posts.length,0)
 const preview=nodes(t).find(n=>n.type==='section'&&n.props['aria-label']==='精算書の明細')
 assert.deepEqual(nodes(preview).find(n=>n.props?.record)?.props.record,draftPaper)
 // Public scope is only mounted inside the opened, payment-authorized preview.
 button(t,'日付・入金後の明細').props.onClick();t=render()
 assert.ok(nodes(t).some(n=>n.type?.name==='WinterSelfStatementScope'))
 assert.ok(!nodes(t).some(n=>n.props?.record?.draft),'full-period browser-print paper is hidden while scoped view is active')
 assert.ok(!nodes(t).some(n=>n.type==='button'&&text(n)==='印刷'))
 button(t,'全期間の精算書').props.onClick();t=render()
 assert.ok(!nodes(t).some(n=>n.type?.name==='WinterSelfStatementScope'))

 button(preview,'印刷').props.onClick();button(preview,'印刷').props.onClick()
 assert.equal(prints,2);assert.equal(posts.length,0,'draft printing does not confirm or receive a payment')
 // Acknowledging the displayed statement is possible; unresolved payment warnings still block saving.
 let checkbox=nodes(t).find(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checkbox.props.disabled,false);assert.equal(checkbox.props['aria-describedby'],'settlement-confirmation-blockers');assert.match(text(t),/「未確認」と「未入金」は別の状態/)
 checkbox.props.onChange({target:{checked:true}});nodes(t).find(n=>n.type==='input'&&n.props.maxLength===100).props.onChange({target:{value:'確認者'}});nodes(t).find(n=>n.type==='input'&&n.props.value==='cash_at_venue').props.onChange();t=render()
 assert.equal(nodes(t).find(n=>n.type==='input'&&n.props.type==='checkbox').props.checked,false,'changing payment resets acknowledgement')
 assert.equal(button(t,draftLabel).props.disabled,true)
 assert.ok(!nodes(t).some(n=>n.type==='section'&&n.props['aria-label']==='精算書の明細'),'old preview is closed')
 assert.ok(!nodes(t).some(n=>n.props?.record?.draft),'old paper cannot print via browser shortcut')
 button(t,'この支払い方法で明細確認へ').props.onClick();t=render()
 assert.equal(nodes(t).find(n=>n.props?.record?.draft)?.props.record.document.document.bankDetails,'','cash draft hides bank')
 nodes(t).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});t=render()

 const blocked=button(t,'本部確認待ち・精算は未確定');assert.equal(blocked.props.disabled,true);blocked.props.onClick();await flush();assert.equal(posts.length,0,'even a direct callback cannot bypass unresolved payment warnings')
 button(t,'本部確認後に明細を読み直す').props.onClick();await flush();t=render();assert.equal(button(t,'本部確認待ち・精算は未確定').props.disabled,true,'reading alone cannot mark unpaid as confirmed');assert.equal(posts.length,0)
 // Synthetic staff-side confirmation of zero paid; checkout itself must not create that record.
 account.warnings=[];account.advance={event_id:event,organization_id:org,paid_amount:0}
 assert.equal(button(t,'本部確認待ち・精算は未確定').props.disabled,true,'server-side changes require a fresh statement read')
 button(t,'本部確認後に明細を読み直す').props.onClick();await flush();t=render()
 assert.ok(!text(t).includes('本部確認待ち'));assert.equal(posts.length,0);assert.equal(button(t,'この内容で精算を確定').props.disabled,true)
 checkbox=nodes(t).find(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checkbox.props.checked,false,'fresh amounts require a fresh acknowledgement');assert.equal(nodes(t).find(n=>n.type==='input'&&n.props.maxLength===100).props.value,'')
 nodes(t).find(n=>n.type==='input'&&n.props.value==='cash_at_venue').props.onChange();t=render()
 assert.equal(nodes(t).find(n=>n.type==='input'&&n.props.value==='bank_transfer').props.disabled,false,'official event bank is available without individual instructions')
 if(process.env.FHS_TEST_BANK==='1'){nodes(t).find(n=>n.type==='input'&&n.props.value==='bank_transfer').props.onChange();t=render()}
 button(t,'この支払い方法で明細確認へ').props.onClick();t=render()
 nodes(t).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});nodes(t).find(n=>n.type==='input'&&n.props.maxLength===100).props.onChange({target:{value:'確認者'}});t=render()
 assert.equal(button(t,draftLabel).props.disabled,false);if(!button(t,draftLabel).props['aria-expanded'])button(t,draftLabel).props.onClick();t=render();button(t,'印刷').props.onClick();assert.equal(posts.length,0)
 const confirm=button(t,'この内容で精算を確定');assert.equal(confirm.props.disabled,false);confirm.props.onClick();confirm.props.onClick();t=render();assert.equal(nodes(t).find(n=>n.type==='input'&&n.props.type==='checkbox').props.disabled,true,'busy saving still locks acknowledgement');await flush();t=render();assert.equal(posts.length,1);assert.equal(button(t,draftLabel).props.disabled,true);button(t,draftLabel).props.onClick();assert.equal(prints,3);assert.ok(text(t).includes('同じ内容で再確認'));assert.equal(nodes(t).find(n=>n.type==='input'&&n.props.type==='checkbox').props.disabled,true,'uncertain saving still locks acknowledgement')
 assert.equal(nodes(t).find(n=>n.type==='input'&&n.props.maxLength===100).props.disabled,true);assert.equal(button(t,'← 団体を選び直す').props.disabled,true);now+=121000;timers.forEach(fn=>fn());t=render();assert.ok(text(t).includes('馬匹登録料'))
 mode='ok';button(t,'同じ登録番号で保存を再確認').props.onClick();await flush();t=render();assert.equal(posts.length,2);assert.deepEqual(posts[0],posts[1]);assert.ok(text(t).includes('サーバーに保存済み'));assert.equal(posts[1].method,process.env.FHS_TEST_BANK==='1'?'bank_transfer':'cash_at_venue');assert.equal(nodes(t).find(n=>n.props?.record?.document)?.props.record.document.document.bankDetails,process.env.FHS_TEST_BANK==='1'?bank:'')
 assert.ok(!nodes(t).some(n=>n.props?.record?.draft));assert.equal(button(t,draftLabel).props['aria-expanded'],false);button(t,draftLabel).props.onClick();t=render();assert.equal(prints,3);button(t,'印刷').props.onClick();button(t,'印刷').props.onClick();assert.equal(prints,5);assert.equal(posts.length,2,'reprint never saves')
 button(t,'終了・次の団体へ').props.onClick();t=render();assert.ok(text(t).includes('ご所属の団体'));assert.ok(!text(t).includes('馬匹登録料'));assert.ok(!nodes(t).some(n=>n.props?.record?.document));assert.ok(!text(t).includes(draftLabel))
 button(t,'テスト団体 ›').props.onClick();await flush();t=render();assert.ok(text(t).includes('サーバーに保存済み'));assert.equal(posts.length,2,'reload existing snapshot does not save')
 button(t,'終了・次の団体へ').props.onClick();t=render();saved=null
 account.advancePaid=account.total;account.remaining=0
 button(t,'テスト団体 ›').props.onClick();await flush();t=render()
 assert.ok(!nodes(t).some(n=>n.type==='input'&&n.props.type==='radio'))
 assert.equal(button(t,draftLabel).props.disabled,false,'zero due does not require choosing a payment')
 assert.equal(nodes(t).find(n=>n.props?.record?.draft)?.props.record.document.document.method,'お支払い不要')
 assert.equal(nodes(t).find(n=>n.props?.record?.draft)?.props.record.document.document.bankDetails,'')
 button(t,'← 団体を選び直す').props.onClick();t=render();account.advancePaid=account.total+1000;account.remaining=-1000;account.warnings=['過入金を本部で確認してください']
 button(t,'テスト団体 ›').props.onClick();await flush();t=render()
 assert.equal(button(t,draftLabel).props.disabled,false,'overpayment still permits reviewing the statement')
 assert.equal(button(t,'本部確認待ち・精算は未確定').props.disabled,true)
 button(t,'← 団体を選び直す').props.onClick();t=render();account.advancePaid=0;account.remaining=account.total;account.bankDetails='';account.warnings=[]
 button(t,'テスト団体 ›').props.onClick();await flush();t=render()
 assert.equal(nodes(t).find(n=>n.type==='input'&&n.props.value==='bank_transfer').props.disabled,true,'no guessed destination')
 assert.equal(button(t,draftLabel).props.disabled,true,'next visitor starts unconfirmed')
 h.close();Date.now=originalNow;Module._load=load;console.log('PASS: payment selection/confirmation precedes preview, print, Excel and acknowledgement; official Winter bank in draft; change resets old paper; cash/zero due/missing bank; blockers, uncertain retry, double-click, reprints and visitor reset')
})().catch(error=>{console.error(error);process.exitCode=1})
