import preparation from "../config/winter-2026-preparation.json"

/** Winter専用。既存のAutumn受付を切り替える副作用を持たない。 */
export const WINTER_EVENT_ID = preparation.eventId
export const WINTER_EVENT_NAME = preparation.name
export const WINTER_BANK_DETAILS = preparation.bankDetails
export const WINTER_STARTS_PER_PAGE = 35
export const WINTER_DATES = ["2026-11-13", "2026-11-14", "2026-11-15"] as const
export const WINTER_DRESSAGE_VENUE = 'インドア競技場'

// Keep the original program arena for matching competitions to their timetable section.
export const winterTimetableSections = [
  {id: 'jump', label: '障害馬術 ～Jump～', programArena: '第1競技場', venue: '第1競技場', startListVenue: null, showInspection: true},
  {id: 'dressage', label: '馬場馬術 ～Dressage～', programArena: '第2競技場', venue: WINTER_DRESSAGE_VENUE, startListVenue: WINTER_DRESSAGE_VENUE, showInspection: false},
] as const

const timetableSectionsByNumber = new Map(preparation.competitions.map(competition => [
  competition.number,
  winterTimetableSections.find(section => section.programArena === competition.arena),
]))

export function winterTimetableSection(competitionNo: string) {
  return timetableSectionsByNumber.get(competitionNo)
}

// 公認種目の認定番号は、日別表示や出番順に関係なく大会プログラムの順で決まる。
const recognitionNumbers = new Map(preparation.competitions
  .filter(competition => competition.official)
  .map((competition, index) => [competition.number, index + 1]))

export function winterRecognitionNumber(competitionNo: string, official: boolean) {
  if (!official) return null
  const number = recognitionNumbers.get(competitionNo)
  if (number === undefined) throw new Error('公認競技の認定番号を確認してください：' + competitionNo)
  return number
}

const friendshipNumbers = new Set(preparation.competitions.filter(c=>c.name.startsWith('フレンドシップ')).map(c=>c.number))
export function winterFreeFriendshipChange(from: string | number | undefined, to: string | number | undefined) {
  return friendshipNumbers.has(String(from)) && friendshipNumbers.has(String(to))
}

export type WinterCompetition = {
  number: string; name: string; date: string; arena: string; official: boolean
  fee: number; opFee: number | null; memberFee: number | null; nonmemberFee: number | null
  instructorRequired: boolean
}
export type WinterFeeSelection = {
  membership?: "member" | "nonmember"
  isOp?: boolean
  instructorConfirmed?: boolean
}

export function winterStorageKey(purpose: string): string {
  if (!/^[a-z0-9-]+$/.test(purpose)) throw new Error("保存領域の名前が正しくありません")
  return `fhs:${WINTER_EVENT_ID}:${purpose}:v1`
}

/** 丸数字を数値化せず、原本の順番を維持する。 */
export function winterCompetition(number: string): WinterCompetition {
  const competition = preparation.competitions.find(row => row.number === number)
  if (!competition) throw new Error("Winterの競技番号が見つかりません")
  return competition
}

/** 未選択の会員区分や未確認の指導者資格を0円として扱わない。 */
export function winterEntryPrice(competition: WinterCompetition, selection: WinterFeeSelection): number {
  if (selection.isOp && (competition.official || competition.opFee == null)) {
    throw new Error("この競技のOP料金は設定されていません。本部に確認してください")
  }
  if (competition.instructorRequired && selection.instructorConfirmed !== true) {
    throw new Error("地域乗馬指導者資格の確認が必要です")
  }
  let price = competition.fee
  if (competition.memberFee != null || competition.nonmemberFee != null) {
    if (selection.membership !== "member" && selection.membership !== "nonmember") {
      throw new Error("会員・非会員の料金区分を選択してください")
    }
    const selected = selection.membership === "member" ? competition.memberFee : competition.nonmemberFee
    if (selected == null) throw new Error("選択された料金区分が未設定です")
    price = selected
  }
  if (selection.isOp) price = competition.opFee!
  if (!Number.isSafeInteger(price) || price <= 0) throw new Error("競技料金を確認してください")
  return price
}

export function assertWinterEvent(eventId: string): void {
  if (eventId !== WINTER_EVENT_ID) throw new Error("Winter以外の大会データは取り込めません")
}
