// Exercise the same horse picker used by both meeting forms; fixtures contain no event data.
require('./register-ts.cjs')
const assert=require('node:assert/strict')
const React=require('react')
const {MasterHorsePicker}=require('../components/master/entity-picker')
const {MasterAddForm}=require('../components/master/add-form')
const {MasterChangeForm}=require('../components/master/change-form')
const {sortWinterCandidates,winterAffiliatedOrganizations,winterPickerOrder}=require('../lib/winter-display-order')
const {searchRosterMemberships}=require('../lib/shared-roster')

const groups=winterAffiliatedOrganizations({organizations:[{id:'z',name:'わクラブ'},{id:'a',name:'あクラブ'},{id:'k',name:'かクラブ'}]})
const horse=(id,name,reading,orgId,reg=true)=>({id,name,reading,orgId,jefRegistered:reg,officialId:reg?'TEST':''})
const horses=[horse('a1','同名','さくら','a'),horse('k2','乙','ワカ','k'),horse('k1','甲','ｱｵ','k'),horse('k3','未登録','あ','k',false)]
const source={players:[],horses,organizations:groups}
let picked='',state=null
const previousState=React.useState
React.useState=()=>[state,v=>{state=v}]
function flatten(node){
  if(Array.isArray(node))return node.flatMap(flatten)
  if(!React.isValidElement(node))return typeof node==='string'?[node]:[]
  if(typeof node.type==='function')return flatten(node.type(node.props))
  return [node,...flatten(node.props.children)]
}
function view(pref='k'){
  return flatten(MasterHorsePicker({source,registeredOnly:true,preferredOrganizationId:pref,onSelect:id=>{picked=id}}))
}
function click(items,text){
  const button=items.find(node=>node?.type==='button'&&flatten(node.props.children).includes(text))
  assert.ok(button,text)
  button.props.onClick()
}
try{
  const v=view()
  assert.deepEqual(groups.map(g=>g.id),['a','k','z'])
  assert.ok(v.indexOf('甲')>=0 && v.indexOf('甲')<v.indexOf('乙') && v.indexOf('乙')<v.indexOf('他の団体の馬を選ぶ'))
  assert.ok(!v.includes('未登録'))
  assert.equal(picked,'')
  click(v,'甲');assert.equal(picked,'k1')
  click(v,'あクラブ');click(view(),'同名');assert.equal(picked,'a1')
  click(view(),'← 団体一覧へ')
  const empty=view('z')
  assert.ok(empty.includes('この団体に選択できる馬はいません。'))
  click(empty,'かクラブ');click(view('z'),'乙');assert.equal(picked,'k2')
}finally{React.useState=previousState}
const candidate=(id,reading,clubs)=>({id,name:'同名',reading,clubs})
assert.deepEqual(sortWinterCandidates([candidate('a','ヲ',['か','あ']),candidate('b','ア',['あ']),candidate('c','ア',[])]).map(r=>[r.id,r.clubs]),[['b',['あ']],['a',['あ','か']],['c',[]]])
const roster={entities:[candidate('b','あ',[]),candidate('a','や',[])],clubs:groups,affiliations:[['a','k'],['a','a'],['b','k']].map(([entity_id,club_id])=>({entity_id,club_id,ended_at:null}))}
assert.deepEqual(searchRosterMemberships(roster,'同名').map(r=>[r.club.id,r.entity.id]),[['a','a'],['k','b'],['k','a']])
const mixed=[{id:'1',name:'甲',organization_id:'a',pickerRank:2},{id:'2',name:'乙',organization_id:'a',pickerRank:1},{id:'3',name:'丙',organization_id:'k',pickerRank:0}]
assert.deepEqual(mixed.sort(winterPickerOrder(groups)).map(r=>r.id),['2','1','3'])

// Open the horse step of the actual add and change forms. The rider's ID-linked membership
// controls the preference even if the original entry and the selected horse have a different club.
const rider={id:'r',orgId:'k',name:'選手'},comp={id:'c',name:'競技',date:'2026-11-14',number:1,official:true}
const entry={id:'e',playerId:'r',horseId:'a1',competitionId:'c',organizationId:'a'}
const HorsePicker=()=>null
const adapter={getPlayer:()=>rider,getHorse:()=>horses[0],getCompetition:()=>comp,getFee:()=>null,getOrg:id=>groups.find(g=>g.id===id),HorsePicker}
const previousRef=React.useRef
function pickerFrom(component,values,preferRiderHorses){
  let cursor=0
  React.useRef=initial=>({current:initial})
  React.useState=()=>[values[cursor++],()=>{}]
  const root=component({adapter:{...adapter,preferRiderHorses},initialCompetition:comp,initialEntry:entry})
  const child=React.Children.toArray(root.props.children).find(c=>c.type===HorsePicker)
  assert.ok(child)
  assert.equal(child.props.registeredOnly,true)
  return child.props.preferredOrganizationId
}
try{
  const add=[false,'','input',comp.date,comp,'r','a1','',false,'a','horse']
  const change=[false,'','edit',comp.date,comp,entry,'c','r','a1',false,'a','horse',comp.date]
  for(const [form,values] of [[MasterAddForm,add],[MasterChangeForm,change]]){
    assert.equal(pickerFrom(form,values,true),'k')
    assert.equal(pickerFrom(form,values,false),undefined)
  }
}finally{React.useRef=previousRef;React.useState=previousState}
console.log('PASS: meeting add/change, cross-club selection and return, empty and JEF-filtered clubs, ranks, pronunciation and independent memberships')
