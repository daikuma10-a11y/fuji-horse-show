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
  /** 通常のエントリー料金（初期登録分） */
  normalEntry: number
  /** 追加料金（追加・棄権＋追加） */
  additional: number
  /** 変更料金 */
  change: number
  /** 競技変更による差額 */
  competitionDiff: number
  /** 請求合計（最終精算金額） */
  total: number
  /** 振込済み金額 */
  paid: number
  /** 未精算額（請求合計 − 振込済み） */
  unsettled: number
  /** 振込不足 */
  shortage: number
  /** 振込過多 */
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
    // 通常エントリー料金：初期登録の出番から算出
    const normalEntry = seedEntries
      .filter((e) => horseOrg(e.horseId) === org.id)
      .reduce((sum, e) => sum + compFee(e.competitionId), 0)

    let additional = 0
    let change = 0
    let competitionDiff = 0

    for (const req of requests) {
      if (req.orgId !== org.id || req.status !== "reflected") continue
      // 本部が出番表へ反映した申請だけを確定精算へ含める。
      additional += req.fee.addBase + req.fee.addEntry
      change += req.fee.changeBase
      competitionDiff += req.fee.competitionDiff
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
