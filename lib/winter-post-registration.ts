import {WinterInitialBatchFailure} from './winter-initial-entry'
import {reviewWinterSettlementOnly, saveWinterSettlementOnlyBatch} from './winter-settlement-only'
import {reviewSettlementChange, saveWinterSettlementActions, type WinterSettlementAction} from './winter-settlement-actions'
import {winterCompetitionLabel} from './winter-display-order'
import type {WinterAddInput} from './winter-reception'
import type {WinterChangeInput} from './winter-change'

export type WinterPostItem = {
  id: string
  summary: string
  billingOrg: string
  total: number
} & ({type:'add'; input:WinterAddInput} | {type:'change'; row:WinterSettlementAction})

function targetLabel(input:WinterAddInput) {
  return `${winterCompetitionLabel(input.competition)} ／ ${input.rider.name} ／ ${input.horse.name}${input.selection.isOp?'（OP）':''}`
}

export function postAddition(input:WinterAddInput):WinterPostItem {
  return {id:input.id, type:'add', input, summary:targetLabel(input), billingOrg:input.rider.organization_id,
    total:reviewWinterSettlementOnly([input]).total}
}

export function postChange(input:WinterChangeInput, reason:string):WinterPostItem {
  const row=reviewSettlementChange(input,reason)
  const before=[winterCompetitionLabel(input.from),`${input.original.start_order}番`,input.originalNames?.rider,input.originalNames?.horse].filter(Boolean).join(' ／ ')
  return {id:row.id, type:'change', row, summary:`${before} → ${targetLabel(input.target)}`, billingOrg:row.billingOrg, total:row.inputs.expectedTotal!}
}

/** Each existing RPC commits a batch atomically. Keep confirmed groups out of retries. */
export async function savePostItems(items:WinterPostItem[], token:string, onConfirmed:(ids:string[])=>void) {
  const adds=new Map<string,WinterAddInput[]>()
  const changes:WinterSettlementAction[]=[]
  for(const item of items) {
    if(item.type==='change') changes.push(item.row)
    else {
      const key=item.input.organization.id
      const group=adds.get(key)??[]
      group.push(item.input)
      adds.set(key,group)
    }
  }
  const completed:string[]=[]
  function confirmed(ids:string[]) {completed.push(...ids);onConfirmed(ids)}
  try {
    for(const inputs of adds.values()) confirmed(await saveWinterSettlementOnlyBatch(inputs,token))
    if(changes.length) {
      await saveWinterSettlementActions(changes,token)
      confirmed(changes.map(row=>row.id))
    }
  } catch(error) {
    throw new WinterInitialBatchFailure(error instanceof Error?error.message:'精算への保存を確認できません',completed,error instanceof WinterInitialBatchFailure&&error.uncertain)
  }
}
