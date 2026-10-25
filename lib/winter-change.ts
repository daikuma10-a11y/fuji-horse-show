import {reviewWinterInitialEntry} from './winter-initial-entry'
import type { WinterEntryRow } from './winter-data'
import { reviewWinterAdd, winterRpc, type WinterAddInput } from './winter-reception'
import { assertWinterEvent, winterCompetition, winterEntryPrice, type WinterFeeSelection } from './winter-event'

export type WinterChangeInput = {
  original: WinterEntryRow
  from: WinterAddInput['competition']
  /** Existing entry fee category must be explicitly supplied, never guessed. */
  fromSelection: WinterFeeSelection
  target: WinterAddInput
}

/** Pure review only. The server must revalidate the original entry and prices at save. */
export function reviewWinterChange(input: WinterChangeInput, options:{allowCrossClub?:boolean;requireVisitor?:boolean}={}) {
  const { original, from, fromSelection, target } = input
  assertWinterEvent(original.event_id)
  assertWinterEvent(from.event_id)
  if (original.competition_id !== from.id) throw new Error('変更前の競技を確認してください')
  if (['wd', 'withdrawn'].includes(original.status.toLowerCase())) throw new Error('棄権済みの人馬は変更できません')
  if (!!fromSelection.isOp !== !!original.is_op) throw new Error('変更前の参加区分を確認してください')
  const changedFields: Array<'competition' | 'player' | 'horse' | 'op' | 'membership'> = []
  if (original.competition_id !== target.competition.id) changedFields.push('competition')
  if (original.rider_id !== target.rider.id) changedFields.push('player')
  if (original.horse_id !== target.horse.id) changedFields.push('horse')
  if (!!original.is_op !== !!target.selection.isOp) changedFields.push('op')
  if (from.id === target.competition.id && fromSelection.membership !== target.selection.membership && (from.member_fee !== null || from.nonmember_fee !== null)) changedFields.push('membership')
  if (!changedFields.length) throw new Error('変更する項目を選択してください')
  const oldPrice = winterEntryPrice({ ...winterCompetition(from.competition_no), official: from.official, fee: from.fee, opFee: from.op_fee, memberFee: from.member_fee, nonmemberFee: from.nonmember_fee }, fromSelection)
  if(options.allowCrossClub&&((options.requireVisitor!==false&&!target.visitorName.trim())||target.visitorName.trim().length>100))throw new Error('受付担当者名を入力してください')
  const next = options.allowCrossClub?reviewWinterInitialEntry(target):reviewWinterAdd(target,options)
  // Match Autumn: OP is not counted toward the two-item withdrawal + addition rule.
  const treatedAsWithdrawAdd = changedFields.filter(field => ['competition', 'player', 'horse'].includes(field)).length >= 2
  const addBase = treatedAsWithdrawAdd ? 3000 : 0
  const addEntry = treatedAsWithdrawAdd ? next.entryFee : 0
  const changeBase = treatedAsWithdrawAdd ? 0 : 2000
  const competitionDiff = treatedAsWithdrawAdd ? 0 : Math.max(0, next.entryFee - oldPrice)
  return { changedFields, treatedAsWithdrawAdd, fromEntryFee: oldPrice, toEntryFee: next.entryFee,
    fee: { addBase, addEntry, changeBase, competitionDiff, total: addBase + addEntry + changeBase + competitionDiff } }
}

export async function submitWinterChange(input: WinterChangeInput, token: string) {
  const review = reviewWinterChange(input)
  const { original, fromSelection, target } = input
  const args = {
    p_id: target.id, p_entry_id: original.entry_id,
    p_before: { competitionId: original.competition_id, riderId: original.rider_id, horseId: original.horse_id, isOp: !!original.is_op },
    p_competition_id: target.competition.id, p_rider_id: target.rider.id, p_horse_id: target.horse.id,
    p_visitor_name: target.visitorName.trim(), p_from_membership: fromSelection.membership ?? null,
    p_membership: target.selection.membership ?? null, p_is_op: !!target.selection.isOp,
    p_from_instructor: !!fromSelection.instructorConfirmed, p_instructor: !!target.selection.instructorConfirmed,
    p_expected_total: review.fee.total,
    ...(target.masterForm?{p_organization_id:target.organization.id,p_before_organization_id:original.organization_id??null}:{}),
  }
  const result=await winterRpc(target.masterForm?'submit_winter_master_change':'submit_winter_reception_change',target.masterForm?{p_args:args}:args,token)
  if (result !== target.id) throw new Error('保存結果を確認できません。同じ受付番号で再確認してください')
  return target.id
}
