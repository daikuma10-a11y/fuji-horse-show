const fs = require('fs'), path = require('path'), ts = require('typescript'), assert = require('node:assert/strict')
const React = require('react'), cache = new Map(), root = process.cwd()
const competitions = [1, 5].map(number => ({ id: `c-${number}`, number, official: number === 5, date: '2026-09-11', name: `競技${number}`, entryFee: 8000 }))
const baseEntries = ['a', 'b', 'c'].map((id, index) => ({ id, competitionId: index === 2 ? 'c-5' : 'c-1', order: index === 2 ? 1 : index + 1, playerId: `p${index}`, horseId: `h${index}`, organizationId: 'org' }))
const organizations = [{ id: 'org', name: '団体' }]
let current, writes = []
const hooks = { ...React, useState(initial) { const h = current, index = h.index++; if (!(index in h.state)) h.state[index] = initial; return [h.state[index], next => h.state[index] = typeof next === 'function' ? next(h.state[index]) : next] }, useEffect() {}, useRef(value) { return { current: value } } }
function load(file) {
  if (!path.extname(file)) file += fs.existsSync(file + '.tsx') ? '.tsx' : '.ts'
  if (cache.has(file)) return cache.get(file).exports
  const m = { exports: {} }; cache.set(file, m)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return hooks
    if (name === '@/lib/store') return { useStore: () => ({ competitions, startEntries: baseEntries, organizations, getPlayer: id => ({ name: id }), getHorse: id => ({ name: id }), getOrg: id => organizations.find(org => org.id === id), reconciliation: { state: 'verified' } }) }
    if (name === '@/components/start-list') return { StartList: function StartList() {} }
    if (name === './on-site-reception') return { OnSiteReception: function OnSiteReception() {} }
    if (name === '@/lib/meeting-drafts') return { ...load(path.join(root, 'lib/meeting-drafts.ts')), saveMeetingDraft: async (id, revision, content) => { writes.push(['save', content]); return { id, revision: revision + 1, status: 'draft', updated_at: new Date().toISOString(), content } }, applyMeetingDraft: async () => writes.push(['apply']) }
    return name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name)
  }, m, m.exports)
  return m.exports
}
function elements(node, test) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(child => elements(child, test)); return [...(test(node) ? [node] : []), ...elements(node.props?.children, test)] }
function text(node) { return Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null ? '' : String(node) }
const { meetingEntries } = load(path.join(root, 'lib/meeting-drafts.ts'))
const { MeetingPanel } = load(path.join(root, 'components/admin/meeting-panel.tsx'))
const initial = { baseEntries, baseOfficial: [], staged: [], orders: { 'c-1': ['b', 'a'] } }
const instance = { state: [null, initial, JSON.stringify(initial), 'c-1', undefined, 'change', undefined, false, '', false, true], index: 0, render() { current = this; this.index = 0; return MeetingPanel({ session: {} }) } }
const stagedItem = (id, type, competitionId, payload) => ({ request: { id, type, status: 'pending', orgId: 'org', fee: { total: type === 'withdraw' ? 0 : 11000 }, [type]: payload }, record: { competition_key: competitionId }, label: `${type} ${id}` })
let view
const input = () => { view = instance.render(); return elements(view, node => node.props?.meeting)[0].props.meeting }
global.requestAnimationFrame = callback => callback()
for (const action of ['変更する', '棄権する']) {
  view = instance.render()
  elements(view, node => node.props?.onNameSelect)[0].props.onNameSelect(baseEntries[0])
  view = instance.render()
  elements(view, node => node.type === 'button' && text(node) === action)[0].props.onClick()
  assert.equal(input().selectedEntry.id, 'a')
  assert.equal(input().selectedAction, action === '変更する' ? 'change' : 'withdraw')
  assert.equal(writes.length, 0)
}
input().onStage(stagedItem('add' , 'add', 'c-1', { competitionId: 'c-1', playerId: 'p4', horseId: 'h4' }))
assert.deepEqual(meetingEntries(instance.state[1], competitions).filter(row => row.competitionId === 'c-1' && !row.withdrawn).map(row => row.id), ['b', 'a', 'request:add'])
input().onStage(stagedItem('official', 'add', 'c-5', { competitionId: 'c-5', playerId: 'p5', horseId: 'h5' }))
assert.deepEqual(meetingEntries(instance.state[1], competitions).filter(row => row.competitionId === 'c-5' && !row.withdrawn).map(row => row.id), ['request:official', 'c'])
input().onStage(stagedItem('change', 'change', 'c-1', { entryId: 'a', fromCompetitionId: 'c-1', toCompetitionId: 'c-1', toPlayerId: 'p6', toHorseId: 'h0', changedFields: ['player'] }))
assert.deepEqual(meetingEntries(instance.state[1], competitions).filter(row => row.competitionId === 'c-1' && !row.withdrawn).map(row => row.id), ['b', 'request:change', 'request:add'])
input().onStage(stagedItem('withdraw', 'withdraw', 'c-1', { entryId: 'b', competitionId: 'c-1' }))
let rows = meetingEntries(instance.state[1], competitions).filter(row => row.competitionId === 'c-1')
assert(rows.find(row => row.id === 'b').withdrawn)
assert.deepEqual(rows.map(row => row.order), [1, 2, 3])
assert.equal(baseEntries[1].withdrawn, undefined)
view = instance.render()
const changeRow = elements(view, node => node.type === 'div' && elements(node, child => child.type === 'p' && text(child) === 'change change').length === 1 && elements(node, child => child.type === 'button' && text(child) === '外す').length === 1).at(-1)
elements(changeRow, node => node.type === 'button' && text(node) === '外す')[0].props.onClick()
rows = meetingEntries(instance.state[1], competitions).filter(row => row.competitionId === 'c-1' && !row.withdrawn)
assert.equal(rows[0].id, 'a'); assert.equal(rows[0].playerId, 'p0')
assert.equal(writes.length, 0)
global.crypto ??= require('node:crypto').webcrypto
global.window = { location: { reload() {} } }; global.sessionStorage = { removeItem() {} }
;(async () => {
  view = instance.render()
  assert.equal(elements(view, node => node.type === 'button' && text(node).includes('正式出番表・精算へまとめて反映')).length, 0)
  await elements(view, node => node.type === 'button' && text(node) === '全競技をまとめて下書き保存')[0].props.onClick()
  // The handler deliberately starts an async task; let its promise settle.
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(writes.map(row => row[0]), ['save'])
  view = instance.render()
  const reflect = elements(view, node => node.type === 'button' && text(node) === '正式出番表・精算へまとめて反映')[0]
  assert(reflect.props.disabled)
  elements(view, node => node.type === 'input' && node.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } })
  view = instance.render()
  elements(view, node => node.type === 'button' && text(node) === '正式出番表・精算へまとめて反映')[0].props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(writes.map(row => row[0]), ['save', 'apply'])
  console.log('Meeting workspace: multi-competition staging, active order, official-first, removal restoration, draft isolation and confirmation: PASS')
})().catch(error => { console.error(error); process.exitCode = 1 })
