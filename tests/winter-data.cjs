require('./register-ts.cjs')
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), Module = require('node:module'), path = require('node:path')
function load(relative, mocks = {}) {
  const file = path.resolve(relative), m = new Module(file, module)
  m.filename = file; m.paths = module.paths
  m.require = name => name in mocks ? mocks[name] : require(Module._resolveFilename(name, m))
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText, file)
  return m.exports
}
const event = load('lib/winter-event.ts')
const { loadWinterData } = load('lib/winter-data.ts', { './winter-event': event, './winter-display-order': load('lib/winter-display-order.ts') })
const event_id = event.WINTER_EVENT_ID
let mode = 'valid', calls = []
global.fetch = async (url, options) => {
  const u = new URL(url); calls.push(u)
  assert.equal(u.searchParams.get('event_id'), `eq.${event_id}`)
  const table = u.pathname.split('/').at(-1)
  let data = []
  if (table === 'organizations') data = [{ id: 'org', name: 'ライディングクラブフジファーム', event_id },{id:'org2',name:'小山乗馬クラブ',event_id},{id:'org3',name:'アシェンダ乗馬学校',event_id}]
  if (table === 'fhs_winter_event_affiliations' && mode === 'affiliation') data = [{organization_id:'org',official_name:'大会用クラブ名',event_id}]
  if (table === 'riders') data = [{ id: 'rider', organization_id: 'org', event_id }]
  if (table === 'horses') data = [{ id: 'horse', organization_id: 'org', event_id }]
  if (table === 'competitions') data = ['10','2','④','①','1','36'].map(no=>({id:no==='10'?'competition':no,competition_no:no,name:'Ｌ－Ｂ級　障害飛越競技',competition_date:'2026-11-14',event_id}))
  if (table === 'reception_entries') data = [{ entry_id: 'entry', organization_id:'org', organization_name:'申込時の団体', competition_id: 'competition', rider_id: mode === 'bad-link' ? 'autumn-rider' : 'rider', horse_id: 'horse', event_id }]
  if (mode === 'meeting') {
    if (table === 'reception_entries') data = ['entry','reversed','pre-cancel','ordinary'].map((id,i)=>({...data[0],entry_id:id,status:'withdrawn',source:i===2?'winter-initial-cancelled':'winter-reception'}))
    if (table === 'reception_requests'){
      assert.equal(options.headers.Authorization,'Bearer test-admin')
      assert.equal(u.searchParams.get('request_type'),'eq.withdraw')
      assert.equal(u.searchParams.get('status'),'eq.reflected')
      data=[{event_id,original_entry_id:'ordinary',from_competition_id:'competition'}]
    }
    if (table === 'fhs_winter_meeting_requests') {
      assert.equal(options.headers.Authorization,'Bearer test-admin')
      assert.equal(u.searchParams.get('reception_requests.status'),'eq.reflected')
      data=[{event_id,reception_requests:{entry_id:'entry',original_entry_id:'entry',from_competition_id:'competition',request_type:'withdraw'}}]
    }
  }
  if (mode === 'wrong-event') data = data.map(row => ({ ...row, event_id: 'autumn' }))
  if (mode === 'network-error') return { ok: false, status: 503 }
  return { ok: true, json: async () => data }
}
;(async () => {
  const data = await loadWinterData(); assert.equal(data.entries.length, 1); assert.equal(calls.length, 6); assert.deepEqual(data.competitions.map(c=>c.competition_no),['①','④','1','2','10','36']); assert.deepEqual(data.organizations.map(o=>o.id),['org3','org2','org']); assert.equal(data.competitions[0].name,'L-B級 障害飛越競技')
  mode = 'affiliation'
  const updated = await loadWinterData()
  const {winterAffiliatedOrganizations} = require('../lib/winter-display-order')
  assert.equal(updated.entries[0].organization_name, '大会用クラブ名')
  assert.equal(updated.entries[0].organization_id, 'org')
  assert.equal(winterAffiliatedOrganizations(updated).find(o => o.id === 'org').name, '大会用クラブ名')
  assert.equal(updated.organizations.find(o => o.id === 'org').name, 'ライディングクラブフジファーム')
  assert.deepEqual(updated.riders, data.riders)
  mode = 'meeting'
  const confirmed=await loadWinterData(undefined,'test-admin')
  assert.deepEqual(confirmed.entries.map(e=>[e.entry_id,!!e.meetingWithdrawal]),[['entry',true],['reversed',false],['ordinary',false]])
  assert.deepEqual(confirmed.entries.filter(e=>e.receptionWithdrawal).map(e=>e.entry_id),['ordinary'])
  mode = 'wrong-event'; await assert.rejects(loadWinterData(), /Winter以外/)
  mode = 'bad-link'; await assert.rejects(loadWinterData(), /所属大会/)
  mode = 'network-error'; await assert.rejects(loadWinterData(), /取得に失敗/)
  console.log('PASS: Winter-only queries, foreign-event rejection, foreign-master rejection no fallback on network failure; shuffled competition/club records ordered and display-width normalized')
})().catch(error => { console.error(error); process.exitCode = 1 })
