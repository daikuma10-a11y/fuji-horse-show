import {readStallPlan, type StallPlan} from './stall-allocation'

export function stallPlanFile(eventId: string, expected: string | null, plan: StallPlan) {
  return JSON.stringify({type:'fhs-stall-plan',version:1,eventId,expected,plan:readStallPlan(plan)})
}

export function openStallPlanFile(text: string, eventId: string) {
  const file = JSON.parse(text)
  if (file?.type !== 'fhs-stall-plan' || file.version !== 1 || file.eventId !== eventId ||
      (file.expected !== null && (typeof file.expected !== 'string' || !/^[0-9a-f]{64}$/.test(file.expected)))) {
    throw new Error('この大会の厩舎割ファイルを選んでください。')
  }
  return {plan:readStallPlan(file.plan),expected:file.expected as string | null}
}
