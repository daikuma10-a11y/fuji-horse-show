require('./register-ts.cjs')
const assert=require('node:assert/strict'),Module=require('node:module'),React=require('react')
let index=0;const values=[]
const hooks={useState(initial){const i=index++;values[i]??={value:typeof initial==='function'?initial():initial};return [values[i].value,v=>{values[i].value=typeof v==='function'?v(values[i].value):v}]},useRef(initial){const i=index++;return values[i]??(values[i]={current:initial})},useEffect(){}}
const old=Module._load;Module._load=function(name,...args){return name==='react'?{...React,...hooks}:old.call(this,name,...args)}
const {MasterStallAllocation}=require('../components/master/stall-allocation.tsx')
const groups=[{id:'a',name:'架空団体',horses:[{id:'h1',name:'架空馬'}]}]
let saved=null,saveCalls=0,release,fail=false
const props={groups,eventName:'Winter',onLoad:async()=>({groups,saved}),onSave:async(plan,expected)=>{saveCalls++;assert.equal(expected,saved?.requestId??null);await new Promise(r=>release=r);if(fail)throw Error('別端末で更新');return saved={plan,requestId:'a'.repeat(64),savedAt:'2026-10-30T00:00:00Z'}}}
const render=()=>{index=0;return MasterStallAllocation(props)}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(nodes)]
const by=fn=>nodes(render()).find(fn),button=label=>by(n=>n.type==='button'&&n.props.children===label)
const settle=async()=>{for(let i=0;i<25;i++)await Promise.resolve()}
;(async()=>{
 button('保存済みの厩舎割を読み直す').props.onClick();await settle()
 assert.equal(button('厩舎割を作成').props.disabled,true,'requires closing/import confirmation')
 const completed=by(n=>n.type==='label'&&React.Children.toArray(n.props.children).some(c=>typeof c==='string'&&c.includes('申込締切')))
 nodes(completed).find(n=>n.type==='input').props.onChange({target:{checked:true}})
 button('厩舎割を作成').props.onClick();await settle()
 assert.ok(by(n=>n.props?.role==='status'&&String(n.props.children).includes('まだ保存')))
 assert.equal(button('保存済みの厩舎割を印刷').props.disabled,true)
 button('厩舎割を保存').props.onClick();button('厩舎割を保存').props.onClick();await settle();assert.equal(saveCalls,1)
 assert.ok(by(n=>n.props?.role==='status'&&String(n.props.children).includes('保存中')))
 release();await settle();assert.ok(by(n=>n.props?.role==='status'&&String(n.props.children).includes('保存が完了')))
 assert.equal(button('保存済みの厩舎割を印刷').props.disabled,false)
 // Select the occupied S stall through the actual whole-map callback.
 by(n=>n.props?.dangerouslySetInnerHTML).props.onClick({target:{closest:()=>({getAttribute:()=> '1:1'})}})
 const slotField=by(n=>n.type==='fieldset'&&nodes(n).some(v=>v.type==='legend'&&React.Children.toArray(v.props.children).join('').includes('1:1')))
 nodes(slotField).find(n=>n.type==='select').props.onChange({target:{value:'empty'}})
 button('この区画に反映').props.onClick()
 assert.ok(by(n=>n.props?.role==='alert'&&JSON.stringify(n.props.children).includes('未配置')))
 assert.equal(button('保存済みの厩舎割を印刷').props.disabled,true)
 fail=true;button('厩舎割を下書き保存').props.onClick();await settle();release();await settle()
 assert.ok(by(n=>n.props?.role==='alert'&&String(n.props.children).includes('別端末')))
 assert.ok(button('厩舎割を下書き保存'),'failed save keeps editable incomplete plan')
 Module._load=old
 console.log('PASS: readiness gate, explicit generation, progress/success/failure, double-tap save lock, saved-only printing, map editing, unplaced warning, failure preserves draft')
})().catch(e=>{console.error(e);process.exit(1)})
