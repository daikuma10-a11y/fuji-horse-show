import type {winterSettlementAccount} from './winter-settlement'
import {assertWinterEvent} from './winter-event'
export type WinterCheckoutAccount=ReturnType<typeof winterSettlementAccount>
export type WinterSettlementRecord={id:string;event_id:string;organization_key:string;account_version:string;payment_method:'bank_transfer'|'cash_at_venue'|'no_payment_due';confirmer_name:string;account:WinterCheckoutAccount;created_at:string}
export function validateWinterCheckoutAccount(value:unknown):WinterCheckoutAccount{
 if(!value||typeof value!=='object')throw new Error('精算内容を確認できません')
 const a=value as WinterCheckoutAccount
 assertWinterEvent(a.organization?.event_id)
 if(!a.organization?.id||!a.organization.name||!a.horseRegistration||!Array.isArray(a.lines)||!Array.isArray(a.warnings)||!Array.isArray(a.adjustments)||[a.normalTotal,a.horseRegistration.count,a.horseRegistration.unitFee,a.horseRegistration.total,a.initialTotal,a.extraTotal,a.adjustmentTotal,a.total,a.advancePaid,a.extraPaid,a.remaining].some(x=>!Number.isSafeInteger(x)))throw new Error('精算金額の形式を確認できません')
 if(a.horseRegistration.unitFee!==14000||a.horseRegistration.total!==a.horseRegistration.count*14000||a.initialTotal!==a.normalTotal+a.horseRegistration.total||a.total!==a.initialTotal+a.extraTotal+a.adjustmentTotal||a.remaining!==a.total-a.advancePaid-a.extraPaid)throw new Error('精算金額の合計を確認できません')
 return a
}
export function validateWinterSettlementRecord(value:unknown,orgId:string):WinterSettlementRecord{
 if(!value||typeof value!=='object')throw new Error('保存済みの精算内容を確認できません')
 const r=value as WinterSettlementRecord;assertWinterEvent(r.event_id)
 if(r.organization_key!==orgId||!r.id||!r.account_version||!['bank_transfer','cash_at_venue','no_payment_due'].includes(r.payment_method)||!r.confirmer_name||!Number.isFinite(new Date(r.created_at).getTime()))throw new Error('保存済みの精算内容が一致しません')
 const a=validateWinterCheckoutAccount(r.account);if(a.organization.id!==orgId)throw new Error('精算書の団体が一致しません')
 return r
}
