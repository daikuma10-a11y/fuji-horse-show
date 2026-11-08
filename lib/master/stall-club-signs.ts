import {barnIds, zoneComponents, type Stall, type StallPlan} from './stall-allocation'

export const bayWidth = 64, rowHeight = 64, aisleWidth = 8
export const rowTop = (row: number) => 105 + row * rowHeight
// A signed bay has its number, TR and corner mark above this band.
const signTop = 23, bottomMargin = 1

type SignLine = {text:string; width:number}
type ClubSign = {
  row:number; side:number; span:number; width:number; height:number
  fontSize:number; lineHeight:number; lines:SignLine[]
}
type Zone = {groupId:string; name:string; slots:Stall[]; sign:ClubSign}

// Use a short, recognizable part of the registered name, as on the paper plan.
// Clubs whose short names coincide keep their full names.
function mapNames(plan: StallPlan) {
  const shortNames = plan.groups.map(({name}) =>
    name.replace(/^(ライディングクラブ|乗馬クラブ)\s*/, '').replace(/(ライディングクラブ|馬事センター|クラブ)$/, '').trim() || name)
  return plan.groups.map(({name}, i) => shortNames.indexOf(shortNames[i]) === shortNames.lastIndexOf(shortNames[i]) ? shortNames[i] : name)
}

function textWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((w, c) => w + fontSize * (c === ' ' ? 0.32 : /^[!-~]$/.test(c) ? 0.65 : 1), 0)
}

function wrapName(name: string, width: number, fontSize: number) {
  const normalized = name.replace(/\s+/g, ' ').trim()
  const naturalWidth = textWidth(normalized, fontSize)
  // Keep a name on one line when a little tightening avoids an isolated last character.
  if (naturalWidth <= width * 1.1) return [{text:normalized, width:Math.min(naturalWidth,width)}]
  const lines: string[] = []
  let row = ''
  for (const c of Array.from(normalized)) {
    if (row && textWidth(row + c, fontSize) > width) {
      lines.push(row.trimEnd())
      row = ''
    }
    if (row || c !== ' ') row += c
  }
  if (row) lines.push(row)
  return lines.map(text => ({text,width:textWidth(text,fontSize)}))
}

function fitText(name: string, width: number) {
  const regular = wrapName(name,width,14)
  if (regular.length <= 2) return {lines:regular, fontSize:14, lineHeight:16, shortened:false}
  const compact = wrapName(name,width,11)
  if (compact.length <= 3) return {lines:compact, fontSize:11, lineHeight:12, shortened:false}
  const last = Array.from(compact[2].text)
  while (last.length && textWidth(last.join('')+'…',11) > width) last.pop()
  const text = last.join('')+'…'
  return {lines:[...compact.slice(0,2),{text,width:textWidth(text,11)}], fontSize:11, lineHeight:12, shortened:true}
}

function placeSign(plan: StallPlan, slots: Stall[], name: string): ClubSign {
  const middle = slots.reduce((sum, s) => sum + s.row, 0) / slots.length
  let best: {sign:ClubSign; cost:number} | undefined
  for (const row of new Set(slots.map(slot => slot.row))) {
    const across = slots.filter(slot => slot.row === row).sort((a,b) => a.side - b.side)
    const choices = across.map(slot => [slot])
    if (across.length === 2) choices.push(across)
    for (const bays of choices) {
      const span = bays.length
      const available = span * bayWidth + (span - 1) * aisleWidth - 18
      const {lines,fontSize,lineHeight,shortened} = fitText(name,available)
      const hasTR = bays.some(s => plan.cells[s.id].kind === 'tr')
      const cost = (shortened ? 1000 : 0) + (14 - fontSize) * 10 + (hasTR ? 15 : 0) + lines.length * 3 + Math.abs(row - middle)
      if (!best || cost < best.cost) {
        const width = Math.max(...lines.map(l => l.width)) + 10
        const height = lines.length * lineHeight + 4
        best = {cost, sign:{row,side:bays[0].side,span,width,height,fontSize,lineHeight,lines}}
      }
    }
  }
  return best!.sign // zoneComponents only returns nonempty zones.
}

export function layoutClubSigns(plan: StallPlan) {
  const names = mapNames(plan), barns = new Map<string, Zone[]>()
  for (const barn of barnIds) {
    const zones: Zone[] = []
    plan.groups.forEach((group,i) => {
      for (const slots of zoneComponents(plan,group.id,barn)) {
        zones.push({groupId:group.id,name:group.name,slots,sign:placeSign(plan,slots,names[i])})
      }
    })
    barns.set(barn,zones)
  }
  return barns
}

export function signBox(sign: ClubSign, barnX: number) {
  const spanWidth = sign.span * bayWidth + (sign.span - 1) * aisleWidth
  const x = barnX + sign.side * (bayWidth + aisleWidth) + (spanWidth - sign.width) / 2
  const y = rowTop(sign.row) + signTop + (rowHeight - signTop - bottomMargin - sign.height) / 2
  return {x,y}
}
