require('./register-ts.cjs')
const assert=require('node:assert/strict'),Module=require('node:module'),React=require('react'),{emptyStallRequest}=require('../lib/master/stall-request.ts')
let index=0;const values=[]
const hooks={useState(initial){const i=index++;values[i]??={value:typeof initial==='function'?initial():initial};return [values[i].value,v=>{values[i].value=typeof v==='function'?v(values[i].value):v}]},useRef(initial){const i=index++;return values[i]??(values[i]={current:initial})},useEffect(){}}
const old=Module._load;Module._load=function(name,...args){return name==='react'?{...React,...hooks}:old.call(this,name,...args)}
const {MasterStallRequestEditor}=require('../components/master/stall-request-editor.tsx')
let saves=0,release,fail=false,saved
const props={rows:[{id:'g',name:'架空団体',value:emptyStallRequest(),revision:'a'.repeat(64)}],loading:false,error:'',onReload:async()=>{},onSave:async(id,value,expected)=>{saves++;assert.equal(id,'g');assert.equal(expected,'a'.repeat(64));await new Promise(r=>release=r);if(fail)throw Error('別の端末で更新');saved=value}}
const render=()=>{index=0;return MasterStallRequestEditor(props)}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(nodes)]
const all=()=>nodes(render()),button=t=>all().find(n=>n.type==='button'&&React.Children.toArray(n.props.children).join('')===t)
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
;(async()=>{
 button('架空団体の要望を入力・修正').props.onClick()
 all().find(n=>n.type==='textarea').props.onChange({target:{value:'4番厩舎が良い'}})
 button('原文から配置条件の候補を入力').props.onClick()
 assert.equal(nodes(all().find(n=>n.type==='fieldset')).find(n=>n.type==='select').props.value,'4')
 fail=true;button('この団体の要望を保存').props.onClick();button('この団体の要望を保存').props.onClick();await settle();assert.equal(saves,1);release();await settle()
 assert.ok(all().some(n=>n.props?.role==='alert'&&n.props.children==='別の端末で更新'))
 assert.equal(all().find(n=>n.type==='textarea').props.value,'4番厩舎が良い')
 fail=false;button('この団体の要望を保存').props.onClick();await settle();release();await settle()
 assert.equal(saved.manual,'4番厩舎が良い');assert.equal(saved.barn,'4')
 assert.ok(all().some(n=>n.props?.role==='status'&&String(n.props.children).includes('保存しました')))
 console.log('PASS: actual request editor, text-to-condition suggestions, stable expected revision, double-click lock, error preserves edits, successful readback closes editor')
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Module._load=old})
