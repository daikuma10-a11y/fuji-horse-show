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
  /** 大会申込時の通常エントリー料金。棄権しても返金しない */
  normalEntry: number
  /** 追加申請料金（追加手数料＋追加先競技料金） */
  additional: number
  /** 変更手数料 */
  change: number
  /** 高い競技へ変更した場合の差額 */
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
    // seedEntries は大会申込時の元エントリーを渡す。
    // 棄権は申込済み競技料金を返金せず、棄権申請自体の手数料が0円という扱い。
    const normalEntry = seedEntries
      .filter((e) => horseOrg(e.horseId) === org.id)
      .reduce((sum, e) => sum + compFee(e.competitionId), 0)

    let additional = 0
    let change = 0
    let competitionDiff = 0

    for (const req of requests) {
      if (req.orgId !== org.id || req.status !== "reflected") continue
      const brokenDownTotal = req.fee.addBase + req.fee.addEntry + req.fee.changeBase + req.fee.competitionDiff

      if (req.type === "add" || (req.type === "change" && req.change?.treatedAsWithdrawAdd)) {
        // 追加は3,000円＋追加先競技のエントリー料金。DBに内訳が残っていればそのまま使う。
        additional += brokenDownTotal !== 0 ? req.fee.addBase + req.fee.addEntry : req.fee.total
        continue
      }

      if (req.type === "change") {
        if (brokenDownTotal !== 0) {
          change += req.fee.changeBase
          competitionDiff += req.fee.competitionDiff
        } else {
          // 古いDB行で内訳が無い場合は保存済み総額を変更料金として保持する。
          change += req.fee.total
        }
      }
      // withdraw は0円。元の通常エントリー料金は normalEntry に残す。
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
