// Fuji Horse Show 受付システム 型定義
// 後から Supabase テーブルへそのまま対応できるようにフラットな構造にしています。

export type CompetitionDate = "2026-09-11" | "2026-09-12" | "2026-09-13"

export interface Organization { id: string; name: string }
export interface Player { id: string; name: string; orgId: string }
export interface Horse { id: string; name: string; orgId: string }

export interface Competition {
  id: string
  number: number
  date: CompetitionDate
  name: string
  official: boolean
  entryFee: number
}

/** 本部画面だけで表示する、受付反映による変更種別 */
export type EntryChangeMark = "added" | "changed"

/** 出番表の1行 */
export interface StartEntry {
  id: string
  competitionId: string
  order: number
  playerId: string
  horseId: string
  withdrawn?: boolean
  /** 追加・変更申請から反映されたことを本部出番表で識別するための印 */
  adminChangeMark?: EntryChangeMark
}

export type RequestType = "add" | "change" | "withdraw"
export type RequestStatus = "pending" | "reflected"

export interface AddPayload {
  competitionId: string
  playerId: string
  horseId: string
  note: string
}

export interface ChangePayload {
  entryId: string
  fromCompetitionId: string
  fromPlayerId: string
  fromHorseId: string
  toCompetitionId: string
  toPlayerId: string
  toHorseId: string
  changedFields: Array<"competition" | "player" | "horse">
  treatedAsWithdrawAdd: boolean
}

export interface WithdrawPayload {
  entryId: string
  competitionId: string
  playerId: string
  horseId: string
}

export interface AppRequest {
  id: string
  type: RequestType
  status: RequestStatus
  createdAt: string
  orgId: string
  fee: FeeBreakdown
  add?: AddPayload
  change?: ChangePayload
  withdraw?: WithdrawPayload
}

export interface FeeBreakdown {
  addBase: number
  addEntry: number
  changeBase: number
  competitionDiff: number
  total: number
}

export interface Payment { orgId: string; paid: number }
