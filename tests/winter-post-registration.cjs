require('./register-ts.cjs')
const assert=require('node:assert/strict')
const React=require('react')
const {renderToStaticMarkup}=require('react-dom/server')
const {WinterPostRegistration}=require('../components/winter-settlement-actions')
const props={data:{organizations:[{id:'test-club',name:'検証団体'}],riders:[],horses:[],entries:[],competitions:[]},session:{email:'test@example.invalid'},onChanged(){},onSession(){},onChooseParticipants(){}}
const original=React.useState
let mode='add'
function screen(){
 React.useState=()=>[mode,v=>{mode=v}]
 try{return WinterPostRegistration(props)}finally{React.useState=original}
}
const view=screen(),children=React.Children.toArray(view.props.children)
const choices=children.find(e=>e.type==='fieldset').props.children[1]
assert.deepEqual(choices.map(e=>e.props.children[1]),['追加・再走行','変更'])
const panels=children.filter(e=>e.type==='div')
assert.deepEqual(panels.map(e=>e.props.hidden),[false,true])
choices[1].props.children[0].props.onChange()
const switched=React.Children.toArray(screen().props.children).filter(e=>e.type==='div')
assert.deepEqual(switched.map(e=>e.props.hidden),[true,false])
assert.deepEqual(switched.map(e=>e.props.children.type),panels.map(e=>e.props.children.type),'keep drafts mounted when switching modes')
const add=renderToStaticMarkup(panels[0].props.children),change=renderToStaticMarkup(switched[1].props.children)
assert.ok(add.includes('現場追加・再走行')&&change.includes('対象の出番'))
assert.ok(!change.includes('棄権')&&!add.includes('棄権'))
console.log('PASS: one post-registration entry, add/re-run and change, retained form state, no withdrawal option')
