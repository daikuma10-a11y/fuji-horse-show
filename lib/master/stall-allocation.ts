import {readStallRequest,stallRequestConditions,type StallRequest} from './stall-request'
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
export type StallLayout = {enabledBarns:string[];normalHorseLimit:number;extraTR:boolean;requests:Record<string,StallRequest>;requestVersions:Record<string,string>}
export type StallOptions = {layout?:StallLayout; priorityId: string; smallMax: number; useSCorridor: boolean; trOverrides: Record<string, { count: number; reason: string }> }
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
  return { priorityId: candidates.length === 1 ? candidates[0].id : '', smallMax: 0, useSCorridor: false, trOverrides: {}, layout:{enabledBarns:[...barnIds],normalHorseLimit:13,extraTR:false,requests:{},requestVersions:{}} }
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
  if(p.options.layout)return placeZone(p,g,barn)
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
  if(options.layout)return createZonePlan(p)
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
  if(n.options.layout){for(const id of Object.keys(n.options.layout.requests))if(!ids.has(id)){delete n.options.layout.requests[id];delete n.options.layout.requestVersions[id]}}
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
  if(p.options.layout)issues.push(...zoneIssues(p))
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
  if(o.layout){
    const l=o.layout
    if(!Array.isArray(l.enabledBarns)||!l.enabledBarns.length||new Set(l.enabledBarns).size!==l.enabledBarns.length||l.enabledBarns.some(b=>!barnIds.includes(b))||!Number.isInteger(l.normalHorseLimit)||l.normalHorseLimit<1||l.normalHorseLimit>18||typeof l.extraTR!=='boolean'||!l.requests||typeof l.requests!=='object'||Array.isArray(l.requests)||!l.requestVersions||typeof l.requestVersions!=='object'||Array.isArray(l.requestVersions))return fail()
    for(const [id,r] of Object.entries(l.requests)){if(!ids.has(id))return fail();readStallRequest(r)}
    for(const [id,r] of Object.entries(l.requestVersions))if(!ids.has(id)||!l.requests[id]||!/^[0-9a-f]{64}$/.test(r))return fail()
  }
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

/** A single zone can cross the aisle. Face-to-face bays are adjacent, while
 * diagonal bays are not. This also validates manual edits independently. */
export function zoneComponents(p:StallPlan,groupId:string,barn:string):Stall[][]{
  const remaining=new Map(stalls.filter(s=>s.barn===barn&&p.cells[s.id]?.groupId===groupId).map(s=>[s.id,s])),components:Stall[][]=[]
  while(remaining.size){const first=remaining.values().next().value!,part=[first];remaining.delete(first.id)
    for(let i=0;i<part.length;i++)for(const [id,s] of remaining)if(Math.abs(s.side-part[i].side)+Math.abs(s.row-part[i].row)===1){remaining.delete(id);part.push(s)}
    components.push(part)
  }
  return components
}
function zoneDistance(p:StallPlan,a:string,b:string):number{
  const aa=stalls.filter(s=>p.cells[s.id]?.groupId===a),bb=stalls.filter(s=>p.cells[s.id]?.groupId===b)
  let best=Infinity
  for(const x of aa)for(const y of bb)best=Math.min(best,x.barn===y.barn?Math.abs(x.row-y.row)+Math.abs(x.side-y.side):20*Math.abs(barnIds.indexOf(x.barn)-barnIds.indexOf(y.barn))+Math.abs(x.row-y.row))
  return best
}
function placeZone(p:StallPlan,g:StableGroup,barn:string):boolean{
  const l=p.options.layout!,need=requiredTR(p,g)
  if(need===null||!l.enabledBarns.includes(barn))return false
  const corridor=barn==='S'&&!!l.requests[g.id]?.corridor
  const tentFree=horseTotal(p.groups)>150&&barn!=='S'?tentIds.filter(t=>t.startsWith(barn+':')&&!p.tents[t]):[]
  const tentCount=corridor?0:Math.min(Math.max(0,need-1),tentFree.length),indoor=corridor?0:need-tentCount
  // The two-column snake visits every bay once with only side/face adjacency.
  const path=stalls.filter(s=>s.barn===barn).sort((a,b)=>a.row-b.row||(a.row%2?b.side-a.side:a.side-b.side))
  let best:{cells:Stall[];score:number}|undefined
  for(let size=g.horses.length+indoor;size<=g.horses.length+indoor+2;size++)for(let start=0;start+size<=path.length;start++){
    const cells=path.slice(start,start+size)
    if(cells.some(s=>p.cells[s.id])||cells.filter(s=>!s.wire).length<g.horses.length)continue
    if(corridor&&cells.some(s=>s.wire))continue
    const min=Math.min(...cells.map(s=>s.row)),max=Math.max(...cells.map(s=>s.row))
    const cond=l.requests[g.id]?stallRequestConditions(l.requests[g.id],p.groups,g.id):null
    const target=cond?.neighborId?stalls.filter(s=>p.cells[s.id]?.groupId===cond.neighborId):[]
    let distance=0
    if(target.length&&cond?.relation!=='avoid')distance=Math.min(...cells.flatMap(c=>target.map(t=>t.barn===barn?Math.abs(c.row-t.row)+Math.abs(c.side-t.side):20*Math.abs(barnIds.indexOf(barn)-barnIds.indexOf(t.barn))+Math.abs(c.row-t.row))))
    const score=distance*1000+(size-g.horses.length-indoor)*100+(max-min+1)*10+start
    if(!best||score<best.score)best={cells,score}
  }
  if(!best)return false
  // Wire bays inside this club's zone are TR; never borrow wire bays from another zone.
  const horses=best.cells.filter(s=>!s.wire).slice(0,g.horses.length)
  horses.forEach((s,i)=>{p.cells[s.id]=use('horse',g.id,g.horses[i].id)})
  best.cells.filter(s=>!horses.includes(s)).forEach(s=>{p.cells[s.id]=use('tr',g.id)})
  tentFree.slice(0,tentCount).forEach(t=>{p.tents[t]=g.id})
  if(corridor)p.corridors.push(g.id)
  return true
}
function createZonePlan(p:StallPlan,balanceBarns?:string[]):StallPlan{
  const l=p.options.layout!,conditions=new Map(p.groups.map(g=>[g.id,l.requests[g.id]?stallRequestConditions(l.requests[g.id],p.groups,g.id):{barn:'',neighborId:'',relation:'',issues:[]}])),done=new Set<string>(),visiting=new Set<string>()
  const ordered=[...p.groups].sort((a,b)=>Number(b.id===p.options.priorityId)-Number(a.id===p.options.priorityId)||Number(!!conditions.get(b.id)?.barn)-Number(!!conditions.get(a.id)?.barn)||b.horses.length-a.horses.length||a.id.localeCompare(b.id))
  function allocate(g:StableGroup){
    if(done.has(g.id)||visiting.has(g.id))return;visiting.add(g.id)
    const c=conditions.get(g.id)!,target=p.groups.find(x=>x.id===c.neighborId)
    if(target)allocate(target)
    const targetBarns=target?groupAllocation(p,target).barns:[]
    let barns=l.enabledBarns.filter(b=>!balanceBarns||balanceBarns.includes(b))
    const preferred=g.id===p.options.priorityId?'S':c.barn
    // S is selected by an explicit reason/request or small-club setting, not name exceptions.
    if(!preferred&&!targetBarns.includes('S')&&g.horses.length>p.options.smallMax)barns=barns.filter(b=>b!=='S')
    barns.sort((a,b)=>{
      const score=(barn:string)=>{
        let n=barnIds.indexOf(barn)+(balanceBarns?100*stalls.filter(s=>s.barn===barn&&p.cells[s.id]?.kind==='horse').length:0)
        if(preferred)n+=barn===preferred?-10000:10000
        if(targetBarns.length)n+=c.relation==='avoid'?(targetBarns.includes(barn)?100000:0):Math.min(...targetBarns.map(t=>Math.abs(barnIds.indexOf(t)-barnIds.indexOf(barn))))*1000
        return n
      };return score(a)-score(b)
    })
    let placed=false
    for(const relax of [false,true]){
      for(const b of barns){
        if(!relax&&b!=='S'&&stalls.filter(s=>s.barn===b&&p.cells[s.id]?.kind==='horse').length+g.horses.length>l.normalHorseLimit)continue
        if(placeZone(p,g,b)){placed=true;break}
      }
      if(placed)break
    }
    if(!placed){
      // Preserve the existing large-club fallback. Each occupied barn keeps a
      // connected horse/TR zone; every remaining horse stays visibly unplaced.
      const trial=clone(p),originalOverride=trial.options.trOverrides[g.id],remaining=[...g.horses]
      let rooms=0
      for(const b of barns.filter(b=>b!=='S')){
        const budget=Math.max(1,requiredTR(p,g)!-rooms)
        trial.options.trOverrides[g.id]={count:budget,reason:'分割時のTR確保（内部計算）'}
        for(let n=Math.min(remaining.length,l.normalHorseLimit);n>=1;n--){
          const before=Object.values(trial.cells).filter(c=>c.kind==='tr'&&c.groupId===g.id).length+Object.values(trial.tents).filter(id=>id===g.id).length
          if(placeZone(trial,{...g,horses:remaining.slice(0,n)},b)){
            remaining.splice(0,n);rooms+=Object.values(trial.cells).filter(c=>c.kind==='tr'&&c.groupId===g.id).length+Object.values(trial.tents).filter(id=>id===g.id).length-before;break
          }
        }
        if(!remaining.length)break
      }
      if(originalOverride)trial.options.trOverrides[g.id]=originalOverride;else delete trial.options.trOverrides[g.id]
      Object.assign(p,trial)
    }
    done.add(g.id);visiting.delete(g.id)
  }
  ordered.forEach(allocate)
  if(!balanceBarns){
    const used=barnIds.filter(b=>Object.keys(p.cells).some(id=>id.startsWith(b+':')))
    if(used.filter(b=>b!=='S').length>1){
      const balanced=createZonePlan({...clone(p),cells:{},tents:{},corridors:[],wireHorseSlots:[]},used)
      // Rebalance only when it preserves capacity and does not worsen any request.
      if(Object.values(balanced.cells).filter(c=>c.kind==='horse').length===Object.values(p.cells).filter(c=>c.kind==='horse').length&&zoneIssues(balanced).length<=zoneIssues(p).length)return balanced
    }
  }
  if(l.extraTR){
    const used=new Set(stalls.filter(s=>p.cells[s.id]?.kind==='horse').map(s=>s.barn))
    let changed=true
    while(changed){changed=false
      for(const s of stalls.filter(s=>used.has(s.barn)&&!p.cells[s.id])){
        const owners=[...new Set(stalls.filter(t=>t.barn===s.barn&&Math.abs(t.row-s.row)+Math.abs(t.side-s.side)===1&&p.cells[t.id]?.groupId).map(t=>p.cells[t.id].groupId))]
        const eligible=owners.filter(id=>!p.corridors.includes(id)).sort((a,b)=>Object.values(p.cells).filter(c=>c.kind==='tr'&&c.groupId===a).length-Object.values(p.cells).filter(c=>c.kind==='tr'&&c.groupId===b).length||a.localeCompare(b))
        if(eligible.length){p.cells[s.id]=use('tr',eligible[0],'','使用厩舎内の余裕TR');changed=true}
      }
    }
  }
  return readStallPlan(p)
}
export function zoneIssues(p:StallPlan):string[]{
  const l=p.options.layout!,issues:string[]=[]
  for(const b of l.enabledBarns.filter(b=>b!=='S')){const count=stalls.filter(s=>s.barn===b&&p.cells[s.id]?.kind==='horse').length;if(count>l.normalHorseLimit)issues.push(`${b}厩舎：目安${l.normalHorseLimit}頭に対して${count}頭を配置しています。目安または配置を調整してください。`)}
  for(const g of p.groups){
    const a=groupAllocation(p,g),r=l.requests[g.id],c=r?stallRequestConditions(r,p.groups,g.id):null
    for(const b of a.barns){if(!l.enabledBarns.includes(b))issues.push(`${g.name}：予備・使用しない${b}厩舎に配置されています。`);if(zoneComponents(p,g.id,b).length>1)issues.push(`${g.name}：${b}厩舎の馬とTRが離れています。`)}
    if(c){
      issues.push(...c.issues.map(s=>`${g.name}：${s}`))
      if(c.barn&&(a.barns.length!==1||a.barns[0]!==c.barn))issues.push(`${g.name}：希望の${c.barn}厩舎にまとまっていません。`)
      const other=p.groups.find(x=>x.id===c.neighborId)
      if(other){const their=groupAllocation(p,other),same=a.barns.length===1&&their.barns.length===1&&a.barns[0]===their.barns[0],distance=zoneDistance(p,g.id,other.id)
        if(c.relation==='same'&&!same||c.relation==='adjacent'&&(!same||distance!==1)||c.relation==='near'&&distance>22||c.relation==='avoid'&&a.barns.some(b=>their.barns.includes(b)))issues.push(`${g.name}：${other.name}との位置関係（${{same:'同じ厩舎',adjacent:'隣',near:'近く',avoid:'別の厩舎'}[c.relation as 'same']}）を満たしていません。`)
      }
    }
  }
  return issues
}
