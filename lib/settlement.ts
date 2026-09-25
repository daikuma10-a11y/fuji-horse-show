import type {
  AppRequest,
  Competition,
  Horse,
  Organization,
  Payment,
  StartEntry,
} from "./types"

export interface OrgSettlement {
  orgId: string
  orgName: string
  /** 現在の正式出番表に載っているエントリー料金 */
  normalEntry: number
  /** 追加申請の手数料部分 */
  additional: number
  /** 変更料金 */
  change: number
  /** 競技変更による差額（現在の出番表料金に含まれるため通常は0） */
  competitionDiff: number
  total: number
  paid: number
  unsettled: number
  shortage: number
  excess: number
}

export function calcSettlement(params: {
  organizations: Organization[]
  seedEntries: StartEntry[]
  horses: Horse[]
  competitions: Competition[]
  requests: AppRequest[]
  payments: Payment[]
}): OrgSettlement[] {
  const { organizations, seedEntries, horses, competitions, requests, payments } = params
  const horseOrg = (id: string) => horses.find((h) => h.id === id)?.orgId
  const compFee = (id: string) => competitions.find((c) => c.id === id)?.entryFee ?? 0

  return organizations.map((org) => {
    // 正式出番表の現在状態から競技エントリー料金を算出する。
    // 棄権は0円扱いなので除外し、追加された出番の競技料金もここに含める。
    const normalEntry = seedEntries
      .filter((e) => !e.withdrawn && horseOrg(e.horseId) === org.id)
      .reduce((sum, e) => sum + compFee(e.competitionId), 0)

    let additional = 0
    let change = 0
    let competitionDiff = 0

    for (const req of requests) {
      if (req.orgId !== org.id || req.status !== "reflected") continue
      const brokenDownTotal = req.fee.addBase + req.fee.addEntry + req.fee.changeBase + req.fee.competitionDiff

      if (req.type === "add") {
        // 競技エントリー料は normalEntry に既に含まれるので、追加手数料だけ加算する。
        // 古いDB行で内訳が無い場合は、保存総額から現在の対象競技料金を引いて手数料を復元する。
        const entryFee = req.add ? compFee(req.add.competitionId) : 0
        additional += brokenDownTotal !== 0 ? req.fee.addBase : Math.max(0, req.fee.total - entryFee)
        continue
      }

      if (req.type === "change") {
        if (req.change?.treatedAsWithdrawAdd) {
          const entryFee = compFee(req.change.toCompetitionId)
          additional += brokenDownTotal !== 0 ? req.fee.addBase : Math.max(0, req.fee.total - entryFee)
        } else {
          // 現在の競技料金は normalEntry に反映済みなので、変更手数料のみ加算する。
          change += brokenDownTotal !== 0 ? req.fee.changeBase : req.fee.total
        }
      }
    }

    const total = normalEntry + additional + change + competitionDiff
    const paid = payments.find((p) => p.orgId === org.id)?.paid ?? 0
    const unsettled = total - paid

    return {
      orgId: org.id,
      orgName: org.name,
      normalEntry,
      additional,
      change,
      competitionDiff,
      total,
      paid,
      unsettled,
      shortage: Math.max(0, unsettled),
      excess: Math.max(0, -unsettled),
    }
  })
}
