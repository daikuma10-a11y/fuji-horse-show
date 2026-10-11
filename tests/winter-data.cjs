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
global.fetch = async url => {
  const u = new URL(url); calls.push(u)
  assert.equal(u.searchParams.get('event_id'), `eq.${event_id}`)
  const table = u.pathname.split('/').at(-1)
  let data = []
  if (table === 'organizations') data = [{ id: 'org', name: 'ライディングクラブフジファーム', event_id },{id:'org2',name:'小山乗馬クラブ',event_id},{id:'org3',name:'アシェンダ乗馬学校',event_id}]
  if (table === 'riders') data = [{ id: 'rider', organization_id: 'org', event_id }]
  if (table === 'horses') data = [{ id: 'horse', organization_id: 'org', event_id }]
  if (table === 'competitions') data = ['10','2','④','①','1','36'].map(no=>({id:no==='10'?'competition':no,competition_no:no,name:'Ｌ－Ｂ級　障害飛越競技',competition_date:'2026-11-14',event_id}))
  if (table === 'reception_entries') data = [{ entry_id: 'entry', competition_id: 'competition', rider_id: mode === 'bad-link' ? 'autumn-rider' : 'rider', horse_id: 'horse', event_id }]
  if (mode === 'wrong-event') data = data.map(row => ({ ...row, event_id: 'autumn' }))
  if (mode === 'network-error') return { ok: false, status: 503 }
  return { ok: true, json: async () => data }
}
;(async () => {
  const data = await loadWinterData(); assert.equal(data.entries.length, 1); assert.equal(calls.length, 5); assert.deepEqual(data.competitions.map(c=>c.competition_no),['①','④','1','2','10','36']); assert.deepEqual(data.organizations.map(o=>o.id),['org3','org2','org']); assert.equal(data.competitions[0].name,'L-B級 障害飛越競技')
  mode = 'wrong-event'; await assert.rejects(loadWinterData(), /Winter以外/)
  mode = 'bad-link'; await assert.rejects(loadWinterData(), /所属大会/)
  mode = 'network-error'; await assert.rejects(loadWinterData(), /取得に失敗/)
  console.log('PASS: Winter-only queries, foreign-event rejection, foreign-master rejection no fallback on network failure; shuffled competition/club records ordered and display-width normalized')
})().catch(error => { console.error(error); process.exitCode = 1 })
