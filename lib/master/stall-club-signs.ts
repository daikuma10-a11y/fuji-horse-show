import {barnIds, zoneComponents, type Stall, type StallPlan} from './stall-allocation'

export const bayWidth = 64, aisleWidth = 8, usualRowHeight = 47, gridTop = 105
const font = 14, lineHeight = 16, badgeSpace = 15
type SignLine = {text:string; width:number}
type ClubSign = {row:number; side:number; span:number; width:number; height:number; inset:number; lines:SignLine[]}
type Zone = {groupId:string; name:string; slots:Stall[]; sign:ClubSign}

// Use a short, recognizable part of the registered name, as on the paper plan.
// Clubs whose short names coincide keep their full names.
function mapNames(plan: StallPlan) {
  const shortNames = plan.groups.map(({name}) =>
    name.replace(/^(ライディングクラブ|乗馬クラブ)\s*/, '').replace(/(ライディングクラブ|馬事センター|クラブ)$/, '').trim() || name)
  return plan.groups.map(({name}, i) => shortNames.indexOf(shortNames[i]) === shortNames.lastIndexOf(shortNames[i]) ? shortNames[i] : name)
}

function textWidth(text: string) {
  return Array.from(text).reduce((w, c) => w + font * (c === ' ' ? 0.32 : /^[!-~]$/.test(c) ? 0.65 : 1), 0)
}

function wrapName(name: string, width: number) {
  const normalized = name.replace(/\s+/g, ' ').trim()
  const naturalWidth = textWidth(normalized)
  // Keep a name on one line when a little tightening avoids an isolated last character.
  if (naturalWidth <= width * 1.10) {
    return {shortened:false, lines:[{text:normalized, width:Math.min(naturalWidth, width)}]}
  }
  const rows: string[] = []
  let row = ''
  for (const c of Array.from(normalized)) {
    if (row && textWidth(row + c) > width) { rows.push(row.trimEnd()); row = '' }
    if (row || c !== ' ') row += c
  }
  if (row) rows.push(row)
  const shortened = rows.length > 3
  if (shortened) {
    rows.length = 3
    const last = Array.from(rows[2])
    while (last.length && textWidth(last.join('') + '…') > width) last.pop()
    rows[2] = last.join('') + '…'
  }
  return {shortened, lines:rows.map(text => ({text,width:textWidth(text)}))}
}

function placeSign(plan: StallPlan, slots: Stall[], name: string): ClubSign {
  const middle = slots.reduce((sum, s) => sum + s.row, 0) / slots.length
  let best: {sign:ClubSign; cost:number} | undefined
  for (const row of new Set(slots.map(slot => slot.row))) {
    const across = slots.filter(slot => slot.row === row).sort((a,b) => a.side - b.side)
    const choices = across.map(slot => [slot])
    if (across.length === 2) choices.push(across)
    for (const bays of choices) {
      const span = bays.length, available = span * bayWidth + (span - 1) * aisleWidth - 8
      const {shortened, lines} = wrapName(name, available - 10)
      const height = lines.length * lineHeight + 4
      const hasTR = bays.some(s => plan.cells[s.id].kind === 'tr')
      const inset = hasTR ? 36 : 16 // Below the TR text, or below the stall number.
      const growth = Math.max(0, inset + height + badgeSpace - usualRowHeight)
      // Prefer a complete name, then a compact row with the sign over horse bays.
      const cost = (shortened ? 1000 : 0) + growth + (hasTR ? 15 : 0) + lines.length * 3 + Math.abs(row - middle)
      if (!best || cost < best.cost) {
        best = {cost,sign:{row,side:bays[0].side,span,lines,height,inset,width:Math.max(...lines.map(l => l.width)) + 10}}
      }
    }
  }
  return best!.sign // zoneComponents only returns nonempty zones.
}

export function layoutClubSigns(plan: StallPlan) {
  const names = mapNames(plan), barns = new Map<string, Zone[]>()
  const heights = Array<number>(12).fill(usualRowHeight)
  for (const barn of barnIds) {
    const zones: Zone[] = []
    plan.groups.forEach((group,i) => {
      for (const slots of zoneComponents(plan,group.id,barn)) {
        const sign = placeSign(plan,slots,names[i])
        heights[sign.row] = Math.max(heights[sign.row], sign.inset + sign.height + badgeSpace)
        zones.push({groupId:group.id,name:group.name,slots,sign})
      }
    })
    barns.set(barn,zones)
  }
  // Keep facing bays and the same row in adjacent barns aligned when a narrow zone needs more space.
  const tops = [gridTop]
  heights.forEach(h => tops.push(tops[tops.length - 1] + h))
  return {barns,heights,tops,extraHeight:tops[12] - gridTop - 12 * usualRowHeight}
}

export function signBox(sign: ClubSign, barnX: number, rowTop: number, rowHeight: number) {
  const spanWidth = sign.span * bayWidth + (sign.span - 1) * aisleWidth
  const x = barnX + sign.side * (bayWidth + aisleWidth) + (spanWidth - sign.width) / 2
  const y = rowTop + sign.inset + (rowHeight - sign.inset - badgeSpace - sign.height) / 2
  return {x,y}
}
