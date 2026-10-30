import type { StableGroup } from './stable-information'

/** Gotemba layout transcribed from the supplied 2025 workbook, sheet マスター.
 * Normal barns have 18 numbered stalls AND two unnumbered braced TR bays. */
export const STALL_TEMPLATE = 'gotemba-2025-v1'
export const barnIds = ['S', ...Array.from({ length: 10 }, (_, i) => String(i + 1))]
export type Stall = { id: string; barn: string; number: number | null; side: number; row: number; wire: boolean }
export const stalls: Stall[] = barnIds.flatMap(barn => Array.from({ length: barn === 'S' ? 24 : 20 }, (_, i) => {
  const side = Math.floor(i / (barn === 'S' ? 12 : 10)), row = i % (barn === 'S' ? 12 : 10)
  const wire = barn !== 'S' && row === 4
  const number = wire ? null : barn === 'S' ? i + 1 : side * 9 + row + 1 - (row > 4 ? 1 : 0)
  return { id: `${barn}:${wire ? `TR${side + 1}` : number}`, barn, number, side, row, wire }
}))
export const tentIds = barnIds.slice(1).flatMap(b => [`${b}:tent1`, `${b}:tent2`])
export type StallUse = { kind: 'horse' | 'tr' | 'blocked'; groupId: string; horseId: string; note: string }
export type StallOptions = { priorityId: string; smallMax: number; useSCorridor: boolean; trOverrides: Record<string, { count: number; reason: string }> }
export type StallPlan = {
  version: 1; template: typeof STALL_TEMPLATE; groups: StableGroup[]; options: StallOptions;
  cells: Record<string, StallUse>; tents: Record<string, string>; corridors: string[]; wireHorseSlots: string[];
  registrationComplete: true; createdAt: string
}
export type SavedStallPlan = { requestId: string; savedAt: string; plan: StallPlan }
export const horseTotal = (groups: StableGroup[]) => groups.reduce((sum, g) => sum + g.horses.length, 0)
export function standardTR(total: number, count: number): number | null {
  if (count < 1 || total < count || !Number.isInteger(total) || !Number.isInteger(count)) return null
  if (total <= 100) return count <= 3 ? 1 : count <= 7 ? 2 : count <= 10 ? 3 : count <= 13 ? 4 : count <= 16 ? 5 : null
  if (total <= 150) return count <= 16 ? Math.ceil(count / 4) : null
  if (total <= 200) return Math.min(4, Math.ceil(count / 5))
  return null
}
export function requiredTR(plan: Pick<StallPlan, 'groups' | 'options'>, g: StableGroup) {
  return plan.options.trOverrides[g.id]?.count ?? standardTR(horseTotal(plan.groups), g.horses.length)
}
export function defaultStallOptions(groups: StableGroup[]): StallOptions {
  const candidates = groups.filter(g => ['ライディングクラブフジファーム', 'フジファーム'].includes(g.name.normalize('NFKC').replace(/\s/g, '')))
  return { priorityId: candidates.length === 1 ? candidates[0].id : '', smallMax: 3, useSCorridor: true, trOverrides: {} }
}
export const stallSourceKey = (groups: StableGroup[]) => JSON.stringify(groups.map(g => ({ id: g.id, name: g.name, horses: g.horses.map(h => ({ id: h.id, name: h.name })).sort((a,b) => a.id.localeCompare(b.id)) })).sort((a,b) => a.id.localeCompare(b.id)))
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const use = (kind: StallUse['kind'], groupId = '', horseId = '', note = ''): StallUse => ({ kind, groupId, horseId, note })
const groupHorseSlots = (p: StallPlan, id: string) => stalls.filter(s => p.cells[s.id]?.kind === 'horse' && p.cells[s.id].groupId === id)
export function groupAllocation(p: StallPlan, g: StableGroup) {
  const horseSlots = groupHorseSlots(p, g.id)
  const indoor = Object.values(p.cells).filter(c => c.kind === 'tr' && c.groupId === g.id).length
  const tent = Object.values(p.tents).filter(id => id === g.id).length
  const corridor = p.corridors.includes(g.id) && horseSlots.length === g.horses.length && horseSlots.every(s => s.barn === 'S')
  return { horses: horseSlots.length, indoor, tent, corridor, barns: barnIds.filter(b => horseSlots.some(s => s.barn === b)), needed: requiredTR(p,g) }
}

/** First fit by barn number. Use braced TR before consuming numbered stalls.
 * Each normal-barn club keeps >=1 indoor TR; tents are a shared 2-unit budget. */
function placeGroup(p: StallPlan, g: StableGroup, barn: string): boolean {
  const need = requiredTR(p,g)
  if (need === null) return false
  const corridor = barn === 'S' && p.options.useSCorridor
  const free = stalls.filter(s => s.barn === barn && !p.cells[s.id])
  const horses = free.filter(s => !s.wire)
  const wire = free.filter(s => s.wire)
  const tentFree = horseTotal(p.groups) > 150 && barn !== 'S' ? tentIds.filter(t => t.startsWith(`${barn}:`) && !p.tents[t]) : []
  const tentCount = corridor ? 0 : Math.min(Math.max(0,need-1),tentFree.length)
  const indoor = corridor ? 0 : need-tentCount
  if (horses.length < g.horses.length + Math.max(0,indoor-wire.length)) return false
  const rooms = [...wire,...horses.slice(g.horses.length)].slice(0,indoor)
  g.horses.forEach((h,i) => { p.cells[horses[i].id]=use('horse',g.id,h.id) })
  rooms.forEach(s => { p.cells[s.id]=use('tr',g.id) })
  tentFree.slice(0,tentCount).forEach(t => { p.tents[t]=g.id })
  if(corridor) p.corridors.push(g.id)
  return true
}
export function createStallPlan(groups: StableGroup[], options: StallOptions, createdAt = new Date().toISOString()): StallPlan {
  const p: StallPlan = { version:1,template:STALL_TEMPLATE,groups:clone(groups),options:clone(options),cells:{},tents:{},corridors:[],wireHorseSlots:[],registrationComplete:true,createdAt }
  if(!groups.length) throw new Error('参加登録済みの馬がいません。')
  for(const g of groups) if(requiredTR(p,g)===null) throw new Error(`${g.name}：この頭数のTR数は未設定です。個別指定してください。`)
  const allocated = new Set<string>()
  const priority=groups.find(g=>g.id===options.priorityId)
  if(priority&&placeGroup(p,priority,'S'))allocated.add(priority.id)
  const small=groups.filter(g=>g.id!==options.priorityId&&g.horses.length<=options.smallMax).sort((a,b)=>a.horses.length-b.horses.length||a.name.localeCompare(b.name,'ja')||a.id.localeCompare(b.id))
  // Reserve S when its priority club needs a manual split; never give its
  // space away just because the whole club could not fit in one barn.
  if(!priority||allocated.has(priority.id))for(const g of small)if(placeGroup(p,g,'S'))allocated.add(g.id)
  const rest=groups.filter(g=>!allocated.has(g.id)).sort((a,b)=>b.horses.length-a.horses.length||a.name.localeCompare(b.name,'ja')||a.id.localeCompare(b.id))
  for(const g of rest){
    if(barnIds.slice(1).some(b=>placeGroup(p,g,b)))continue
    // Large clubs may span barns. Keep all horses visible, even if capacity runs out.
    const need=requiredTR(p,g)!
    const trial=clone(p); let remaining=[...g.horses], indoor=0, tent=0
    for(const b of barnIds.slice(1)){
      const free=stalls.filter(s=>s.barn===b&&!trial.cells[s.id]&&!s.wire)
      if(!free.length)continue
      const wires=stalls.filter(s=>s.barn===b&&!trial.cells[s.id]&&s.wire)
      const tentFree=horseTotal(groups)>150?tentIds.filter(t=>t.startsWith(`${b}:`)&&!trial.tents[t]):[]
      const stillNeeded=Math.max(0,need-indoor-tent)
      const tentTake=Math.min(Math.max(0,stillNeeded-(indoor===0?1:0)),tentFree.length)
      // Reserve equipment space BEFORE horses, so a 16-horse / 5-TR club
      // splits across barns instead of filling a barn and losing its fifth TR.
      const indoorTake=Math.min(stillNeeded-tentTake,wires.length+Math.max(0,free.length-1))
      const numberedRooms=Math.max(0,indoorTake-wires.length)
      const rooms=[...wires,...(numberedRooms?free.slice(-numberedRooms):[])].slice(0,indoorTake)
      const horseSpace=free.filter(s=>!rooms.some(r=>r.id===s.id))
      const take=remaining.splice(0,horseSpace.length)
      if(!take.length)continue
      take.forEach((h,i)=>{trial.cells[horseSpace[i].id]=use('horse',g.id,h.id)})
      rooms.forEach(s=>{trial.cells[s.id]=use('tr',g.id);indoor++})
      tentFree.slice(0,tentTake).forEach(t=>{trial.tents[t]=g.id;tent++})
      if(!remaining.length)break
    }
    const occupiedBarns=new Set(groupHorseSlots(trial,g.id).map(s=>s.barn))
    for(const s of stalls)if(occupiedBarns.has(s.barn)&&!trial.cells[s.id]&&indoor+tent<need){trial.cells[s.id]=use('tr',g.id);indoor++}
    Object.assign(p,trial)
  }
  return readStallPlan(p)
}
export function moveStallGroup(p: StallPlan, groupId: string, barn: string): StallPlan {
  const g=p.groups.find(g=>g.id===groupId);if(!g||!barnIds.includes(barn))throw new Error('移動先・団体を選んでください。')
  const next=clone(p)
  for(const [id,c] of Object.entries(next.cells))if(c.groupId===groupId)delete next.cells[id]
  for(const [id,gid] of Object.entries(next.tents))if(gid===groupId)delete next.tents[id]
  next.corridors=next.corridors.filter(id=>id!==groupId)
  next.wireHorseSlots=next.wireHorseSlots.filter(id=>next.cells[id]?.kind==='horse')
  if(!placeGroup(next,g,barn))throw new Error(`${barn}厩舎には、この団体の馬とTRをまとめて置く空きがありません。馬房ごとの編集で分けて配置できます。`)
  return next
}
export function editStall(p: StallPlan, slotId: string, value: StallUse|null, allowWire: boolean): StallPlan {
  const slot=stalls.find(s=>s.id===slotId);if(!slot)throw new Error('馬房を選んでください。')
  if(value?.kind==='horse'&&slot.wire&&!allowWire)throw new Error('ワイヤー区画への馬の配置は個別確認が必要です。')
  const next=clone(p)
  if(value?.kind==='horse')for(const [id,c] of Object.entries(next.cells))if(c.kind==='horse'&&c.horseId===value.horseId)delete next.cells[id]
  if(value)next.cells[slotId]=value;else delete next.cells[slotId]
  next.wireHorseSlots=next.wireHorseSlots.filter(id=>next.cells[id]?.kind==='horse'&&id!==slotId)
  if(value?.kind==='horse'&&slot.wire&&allowWire)next.wireHorseSlots.push(slotId)
  return readStallPlan(next)
}
export function reconcileStallGroups(p: StallPlan, groups: StableGroup[]): StallPlan {
  const n=clone(p);n.groups=clone(groups)
  const ids=new Set(groups.map(g=>g.id)), horses=new Map(groups.flatMap(g=>g.horses.map(h=>[h.id,g.id] as const)))
  for(const [id,c] of Object.entries(n.cells))if(c.kind!=='blocked'&&(!ids.has(c.groupId)||c.kind==='horse'&&horses.get(c.horseId)!==c.groupId))delete n.cells[id]
  for(const [id,gid] of Object.entries(n.tents))if(!ids.has(gid))delete n.tents[id]
  n.corridors=n.corridors.filter(id=>ids.has(id));n.wireHorseSlots=n.wireHorseSlots.filter(id=>n.cells[id]?.kind==='horse')
  if(!ids.has(n.options.priorityId))n.options.priorityId=''
  for(const id of Object.keys(n.options.trOverrides))if(!ids.has(id))delete n.options.trOverrides[id]
  if(horseTotal(groups)<=150)n.tents={}
  return n
}
export function stallPlanIssues(p: StallPlan): string[] {
  const issues:string[]=[]
  const priority=p.groups.find(g=>g.id===p.options.priorityId)
  if(priority&&!groupHorseSlots(p,priority.id).some(s=>s.barn==='S'))issues.push(`${priority.name}：S厩舎の優先団体がSに未配置です。馬房ごとの編集でSへの配置を調整してください。`)
  for(const g of p.groups){
    const a=groupAllocation(p,g)
    if(a.horses!==g.horses.length)issues.push(`${g.name}：馬が${g.horses.length-a.horses}頭未配置です。`)
    if(a.needed===null)issues.push(`${g.name}：必要TR数を個別指定してください。`)
    else if(!a.corridor&&(a.indoor<1||a.indoor+a.tent<a.needed))issues.push(`${g.name}：TR不足（屋内${a.indoor}・テント${a.tent}／必要${a.needed}）。`)
    const horseBarns=new Set(a.barns)
    if(Object.entries(p.cells).some(([id,c])=>c.kind==='tr'&&c.groupId===g.id&&!horseBarns.has(stalls.find(s=>s.id===id)!.barn))||Object.entries(p.tents).some(([id,gid])=>gid===g.id&&!horseBarns.has(id.split(':')[0])))issues.push(`${g.name}：馬がいない厩舎に荷物区画があります。`)
  }
  return issues
}
/** Validate stored/imported data, independent of the rendering and allocator. */
export function readStallPlan(value: unknown): StallPlan {
  const fail=()=>{throw new Error('厩舎割の保存形式を確認できません。')}
  const p=value as StallPlan
  if(!p||p.version!==1||p.template!==STALL_TEMPLATE||p.registrationComplete!==true||typeof p.createdAt!=='string'||!Number.isFinite(Date.parse(p.createdAt))||!Array.isArray(p.groups)||!p.groups.length||p.groups.length>300) return fail()
  const ids=new Set<string>(),horseIds=new Map<string,string>()
  for(const g of p.groups){
    if(!g||typeof g.id!=='string'||!g.id||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>200||!Array.isArray(g.horses)||!g.horses.length||g.horses.length>500)return fail()
    ids.add(g.id)
    for(const h of g.horses){if(!h||typeof h.id!=='string'||!h.id||horseIds.has(h.id)||typeof h.name!=='string'||!h.name.trim()||h.name.length>200)return fail();horseIds.set(h.id,g.id)}
  }
  const o=p.options
  if(!o||typeof o.priorityId!=='string'||o.priorityId&&!ids.has(o.priorityId)||!Number.isInteger(o.smallMax)||o.smallMax<0||o.smallMax>24||typeof o.useSCorridor!=='boolean'||!o.trOverrides||Array.isArray(o.trOverrides)||typeof o.trOverrides!=='object')return fail()
  for(const [id,v] of Object.entries(o.trOverrides))if(!ids.has(id)||!v||!Number.isInteger(v.count)||v.count<1||v.count>50||typeof v.reason!=='string'||!v.reason.trim()||v.reason.length>500)return fail()
  if(!p.cells||typeof p.cells!=='object'||Array.isArray(p.cells)||!p.tents||typeof p.tents!=='object'||Array.isArray(p.tents)||!Array.isArray(p.corridors)||!Array.isArray(p.wireHorseSlots))return fail()
  if(new Set(p.corridors).size!==p.corridors.length||p.corridors.some(id=>!ids.has(id))||new Set(p.wireHorseSlots).size!==p.wireHorseSlots.length)return fail()
  const assigned=new Set<string>()
  for(const [id,c] of Object.entries(p.cells)){
    const s=stalls.find(s=>s.id===id)
    if(!s||!c||!['horse','tr','blocked'].includes(c.kind)||typeof c.note!=='string'||c.note.length>500||typeof c.groupId!=='string'||typeof c.horseId!=='string')return fail()
    if(c.kind==='blocked'){if(c.groupId||c.horseId)return fail();continue}
    if(!ids.has(c.groupId))return fail()
    if(c.kind==='tr'){if(c.horseId)return fail();continue}
    if(horseIds.get(c.horseId)!==c.groupId||assigned.has(c.horseId)||s.wire&&!p.wireHorseSlots.includes(id))return fail()
    assigned.add(c.horseId)
  }
  if(p.wireHorseSlots.some(id=>!stalls.find(s=>s.id===id)?.wire||p.cells[id]?.kind!=='horse'))return fail()
  for(const [id,gid] of Object.entries(p.tents))if(horseTotal(p.groups)<=150||!tentIds.includes(id)||!ids.has(gid))return fail()
  return clone(p)
}
