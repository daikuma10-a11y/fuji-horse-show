require('./register-ts.cjs')
const assert = require('node:assert/strict')
const React = require('react'), Module = require('node:module')
const { renderToStaticMarkup } = require('react-dom/server')
const { fitVendor, vendorMap, vendorLayoutFile, readVendorLayout, nextVendorPosition } = require('../lib/master/vendor-layout')
const { WinterVendorVenue } = require('../components/winter-vendor-venue')
const create = React.createElement
const event = 'winter-test'
const first = { id:'a', name:'飲食の見本', kind:'food', ...nextVendorPosition([], {x:115,y:458}) }
const second = { id:'b', name:'馬具の見本', kind:'tack', ...nextVendorPosition([first], {x:115,y:458}) }
assert.ok(Math.abs(first.x-second.x)>=vendorMap.boxWidth || Math.abs(first.y-second.y)>=vendorMap.boxHeight)
const file = vendorLayoutFile(event,[first,second])
assert.deepEqual(readVendorLayout(file,event),[first,second])
assert.throws(()=>readVendorLayout(file,'another-event'))
for (const invalid of [{...first,kind:'unknown'},{...first,x:-1},{...first,y:621},{...first,id:second.id}]) {
  assert.throws(()=>readVendorLayout(vendorLayoutFile(event,[invalid,second]),event))
}

const slots = [], effects = []
let cursor = 0
const hooks = {
  useState(value) {
    const i=cursor++
    if(!(i in slots)) slots[i]=value
    return [slots[i], x=>{slots[i]=typeof x==='function'?x(slots[i]):x}]
  },
  useRef(value) {const i=cursor++;return slots[i]??(slots[i]={current:value})},
  useEffect(fn) {const i=cursor++;if(!(i in slots)){slots[i]=true;effects.push(fn)}}
}
const old=Module._load
Module._load=function(id,...args){return id==='react'?{...React,...hooks}:old.call(this,id,...args)}
const { MasterVendorLayout } = require('../components/master/vendor-layout')
const { VendorMap } = require('../components/master/vendor-map')
Module._load=old
const nodes=n=>!n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(nodes)]
const render=(Component,props)=>{cursor=0;return Component(props)}
const reset=()=>{slots.length=effects.length=0}
const flush=async()=>{await new Promise(r=>setImmediate(r))}
const storage=new Map()
global.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}
global.window={addEventListener(){},removeEventListener(){},confirm(){return true}}
const props={eventId:event,eventName:'Winter',venue:create(WinterVendorVenue),storageKey:event,origin:{x:115,y:458}}
const editor=()=>render(MasterVendorLayout,props)
const find=(fn)=>nodes(editor()).find(fn)
const mapProps=()=>find(n=>n.type===VendorMap).props
const add=async(name,kind)=>{
  find(n=>n.type==='input'&&n.props.required).props.onChange({target:{value:name}})
  find(n=>n.type==='select'&&!n.props['aria-label']).props.onChange({target:{value:kind}})
  await find(n=>n.type==='form').props.onSubmit({preventDefault(){}})
}
;(async()=>{
  editor();effects.splice(0).forEach(fn=>fn())
  await add(first.name,'food');await add(second.name,'tack')
  const rows=mapProps().vendors
  assert.deepEqual(rows.map(v=>[v.name,v.kind]),[[first.name,'food'],[second.name,'tack']])
  mapProps().onMove(rows[0].id,{x:400,y:510});await flush()
  reset();editor();effects.splice(0).forEach(fn=>fn())
  assert.deepEqual(mapProps().vendors[0],{...rows[0],x:400,y:510})
  const fresh=mapProps().vendors
  reset()
  const moves=[]
  const board=()=>render(VendorMap,{...props,vendors:fresh,selected:fresh[0].id,onSelect(){},onMove:(id,pos)=>moves.push([id,pos])})
  const mapNode=()=>nodes(board()).find(n=>n.type==='svg')
  mapNode().props.ref.current={getBoundingClientRect:()=>({left:10,top:20,width:640,height:310})}
  const marker=()=>nodes(board()).find(n=>n.props['data-vendor-id']===fresh[0].id)
  const pointer={pointerId:11,pointerType:'touch',button:0,isPrimary:true,currentTarget:{focus(){},setPointerCapture(){}},clientX:220,clientY:280}
  marker().props.onPointerDown(pointer)
  marker().props.onPointerMove({...pointer,clientX:270,clientY:250})
  assert.equal(marker().props.transform,'translate(500 450)')
  marker().props.onPointerUp({...pointer,clientX:270,clientY:250})
  assert.deepEqual(moves.pop(),[fresh[0].id,{x:500,y:450}])
  marker().props.onPointerDown(pointer);marker().props.onPointerCancel(pointer);marker().props.onPointerUp(pointer)
  assert.equal(moves.length,0)
  nodes(board()).find(n=>n.type==='rect'&&n.props.onClick).props.onClick({clientX:0,clientY:0})
  assert.deepEqual(moves.pop(),[fresh[0].id,fitVendor(-50,-50)])
  const html=renderToStaticMarkup(mapNode())
  for(const label of ['丸馬場','駐車場','装蹄所','休憩室','HM室','オガコ倉庫',first.name,second.name,'#ffe09b','#c5e2ff']) assert.ok(html.includes(label),label)
  console.log('PASS: two categories, manual entry, non-overlapping initial positions, touch drag, cancelled drag, tap to place, edge clamp, persisted reload, file roundtrip, event isolation and fixed landmarks')
})().catch(e=>{console.error(e);process.exitCode=1})
