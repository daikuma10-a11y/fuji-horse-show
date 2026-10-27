require('./register-ts.cjs')
const assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {MasterApplicationImportStatus}=require('../components/master/application-import-status.tsx')
const progress={phase:'entries',detail:'3件中 2件目：保存結果を確認しています',peopleConfirmed:4,peopleTotal:4,entriesConfirmed:1,entriesTotal:3}
let reads=0,stops=0
const props={busy:false,canReview:true,onReview(){reads++},onStop(){stops++},value:{operation:'save',state:'running',progress,detail:''}}
const html=value=>renderToStaticMarkup(React.createElement(MasterApplicationImportStatus,{...props,value}))
const active=html(props.value);assert.match(active,/反映中/);assert.match(active,/fixed inset-x-3 bottom-3/);assert.match(active,/motion-reduce:animate-none/);assert.match(active,/max="3" value="1"/);assert.match(active,/処理中の1件を確認して停止/)
assert(!active.includes('✓'))
const stop=html({...props.value,stopRequested:true});assert.match(stop,/停止を受け付けました/);assert.match(stop,/disabled=""/)
const review=html({...props.value,operation:'review'});assert.match(review,/保存結果を確認中/);assert.match(review,/新しい登録は行っていません/);assert(!review.includes('処理中の1件を確認して停止'))
for(const state of ['success','ready','stopped','error','attention']){
 const value={...props.value,state,detail:state==='error'?'合成通信エラー':'保存結果を確認しました',checkedAt:'2026-10-27T05:00:00Z'}
 const text=html(value);assert(!text.includes('fixed inset-x'));assert.match(text,/14:00:00/)
 if(state==='success'){assert.match(text,/反映完了/);assert.match(text,/border-emerald-700/)}
 if(state==='error'){assert.match(text,/合成通信エラー/);assert.match(text,/border-red-700/)}
 if(['stopped','error','attention'].includes(state)){
  const controls=[];const visit=n=>{if(Array.isArray(n))return n.forEach(visit);if(!React.isValidElement(n))return;if(n.type==='button')controls.push(n.props);visit(n.props.children)}
  visit(MasterApplicationImportStatus({...props,value}));assert.equal(controls.length,1);assert.equal(controls[0].children,'保存結果を確認する');controls[0].onClick()
 }
}
assert.equal(reads,3);assert.equal(stops,0)
console.log('PASS: visible running/result states, determinate verified counts, text plus color, reduced motion, Japan confirmation time, read-only recovery action and available stop control')
