/** Prefer the registered pronunciation; display spelling and identity break ties. */
const collator = new Intl.Collator('ja', { numeric: true })
export function kanaSortKey(text: string) {
  return text.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
}
type Member = {name:string; reading?:string|null; id?:string; pickerRank?:number}
export function compareRosterMembers(a:Member, b:Member) {
  const rankOrder = (a.pickerRank ?? Infinity) - (b.pickerRank ?? Infinity)
  return rankOrder || collator.compare(kanaSortKey(a.reading?.trim() || a.name), kanaSortKey(b.reading?.trim() || b.name))
    || collator.compare(a.name, b.name) || (a.id ?? '').localeCompare(b.id ?? '')
}
