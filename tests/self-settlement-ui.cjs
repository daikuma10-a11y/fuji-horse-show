const assert=require('node:assert/strict')
const {load}=require('./self-settlement.cjs')
function hooks(){const state=[],refs=[],effects=[];let si=0,ri=0,ei=0,pending=[];const api={useState(initial){const i=si++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value]},useRef(initial){const i=ri++;return refs[i]??(refs[i]={current:initial})},useEffect(fn,deps){const i=ei++,old=effects[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()}})}};return{api,state,render(fn){si=ri=ei=0;pending=[];const tree=fn();pending.forEach(fn=>fn());return tree},close(){effects.forEach(e=>e?.cleanup?.())}}}
function nodes(t){return !t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)]}
function text(t){return typeof t==='string'||typeof t==='number'?String(t):!t?'':[t.props?.children].flat(Infinity).map(text).join('')}
function button(t,label){const b=nodes(t).find(n=>n.type==='button'&&text(n)===label);assert.ok(b,label);return b}
let prints=0,posts=0,now=Date.now(),timers=[];const originalNow=Date.now;Date.now=()=>now
const h=hooks();global.document={visibilityState:'visible'};let savedRecord=null;const listeners={};global.window={setInterval(fn){timers.push(fn);return timers.length},clearInterval(){},addEventListener(name,fn){listeners[name]=fn},removeEventListener(name){delete listeners[name]},print(){prints++;listeners.beforeprint?.();listeners.afterprint?.()}}
const account={document:{organization:'テスト団体',organizationKey:'org-1',due:8000,normalTotal:0,extraTotal:8000,advancePaid:0,extraPaid:0,lines:[],method:'後日振込'},normalLines:[],warnings:[]}
let resolveConfirm;global.fetch=async(url,options)=>{let result;if(options?.method==='POST'){posts++;result=await new Promise(resolve=>resolveConfirm=resolve)}else if(url.includes('history'))result={records:[{id:'saved-id',document:account,amount:8000,created_at:new Date().toISOString()}]};else if(url.includes('?org='))result={account,version:'v1',savedRecord};else result={organizations:[{id:'org-1',name:'テスト団体'}]};return{ok:true,json:async()=>result}}
const {SelfSettlement}=load('components/self-settlement.tsx',{'react':h.api,'next/link':()=>null,'@/lib/fees':{formatYen:n=>n+'円'},'@/components/admin/settlement-print-layouts':{StatementPrint:()=>null}})
const render=()=>h.render(SelfSettlement),flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve()}
async function main(){let t=render();await flush();t=render();button(t,'テスト団体 ›').props.onClick();await flush();t=render();assert.match(text(t),/8000円/)
 let confirm=button(t,'この内容で精算を確定');assert.equal(confirm.props.disabled,true)
 nodes(t).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}})
 nodes(t).find(n=>n.type==='input'&&n.props.maxLength===100).props.onChange({target:{value:'確認者'}})
 nodes(t).find(n=>n.type==='input'&&n.props.value==='bank_transfer').props.onChange();t=render();confirm=button(t,'この内容で精算を確定');assert.equal(confirm.props.disabled,false)
 const pending=confirm.props.onClick();confirm.props.onClick();assert.equal(posts,1,'rapid double click must not send twice')
 resolveConfirm({record:{id:'saved-id',document:account,amount:8000,payment_method:'bank_transfer',created_at:new Date().toISOString()}});await pending;await flush();t=render();assert.match(text(t),/精算内容を確定しました/)
 button(t,'精算書を印刷・再印刷').props.onClick();button(t,'精算書を印刷・再印刷').props.onClick();assert.equal(prints,2);assert.equal(posts,1,'reprinting does not confirm again')
 button(t,'終了・次の団体へ').props.onClick();t=render();assert.match(text(t),/ご所属の団体を選んでください/);assert.equal(text(t).includes('8000円'),false)
 button(t,'テスト団体 ›').props.onClick();await flush();t=render();assert.equal(nodes(t).find(n=>n.type==='input'&&n.props.maxLength===100).props.value,'')
 savedRecord={id:'saved-id',organization_key:'org-1',document:account,amount:8000,payment_method:'bank_transfer',created_at:new Date().toISOString()};
 button(t,'← 団体を選び直す').props.onClick();t=render();button(t,'テスト団体 ›').props.onClick();await flush();t=render();assert.match(text(t),/サーバーに保存済みです/);button(t,'精算書を印刷・再印刷').props.onClick();assert.equal(posts,1);
 button(t,'明細を確認・支払い方法を変更').props.onClick();t=render();
 now+=121000;timers.forEach(fn=>fn());t=render();assert.match(text(t),/ご所属の団体を選んでください/)
 h.close();Date.now=originalNow;console.log('PASS: organization → detail → acknowledgment/method → confirmation; rapid double-click, reprint, clear next visitor, inactivity reset')
}
main().catch(error=>{console.error(error);process.exitCode=1})
