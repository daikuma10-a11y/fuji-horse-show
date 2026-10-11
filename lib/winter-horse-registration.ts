import {WINTER_EVENT_ID,assertWinterEvent} from './winter-event'
import {isWinterReceptionParticipant,type WinterHorseRow} from './winter-data'
/** Official Winter application, 申込集計書 C6, 2026-10-11 verified.
 * https://www.fujifarm.jp/data_files/view/517/mode:inline/2026Winter%E7%94%B3%E8%BE%BC%E6%9B%B8.xlsx
 * SHA256 04a60fd63f75f23d3eae5e19bfc37f950c14bba2bca34d93e563eba1f40e23a0
 * Per participating horse/owning club, never per start or rider affiliation.
 */
export const WINTER_HORSE_REGISTRATION_FEE=14000
export function winterHorseRegistration(horses:WinterHorseRow[],orgId:string){
 const selected=new Map<string,WinterHorseRow>()
 for(const horse of horses){
  assertWinterEvent(horse.event_id)
  if(horse.organization_id!==orgId||horse.is_participant===false||!isWinterReceptionParticipant(horse))continue
  const previous=selected.get(horse.id)
  if(previous&&(previous.name!==horse.name||previous.jef_registration_no!==horse.jef_registration_no))throw new Error('馬匹登録料の対象馬に一致しない重複があります')
  selected.set(horse.id,horse)
 }
 const registeredHorses=[...selected.values()]
 const total=registeredHorses.length*WINTER_HORSE_REGISTRATION_FEE
 if(!Number.isSafeInteger(total))throw new Error('馬匹登録料の合計を確認できません')
 return {eventId:WINTER_EVENT_ID,count:registeredHorses.length,unitFee:WINTER_HORSE_REGISTRATION_FEE,total,horses:registeredHorses}
}
