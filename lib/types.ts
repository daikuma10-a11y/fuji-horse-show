// Fuji Horse Show 受付システム 型定義
// 後から Supabase テーブルへそのまま対応できるようにフラットな構造にしています。

export type CompetitionDate = "2026-09-11" | "2026-09-12" | "2026-09-13"

/** 原本値を失わず、検索・並び替え・手入力履歴を分離して保持する共通項目 */
export interface MasterAuditFields {
  /** 原本に記載されていた値。未設定時は name と同一として扱う */
  sourceName?: string
  /** 五十音順・検索用の読み。取得不能なら未設定でよい */
  reading?: string
  /** 大会当日の手入力・修正で作られたデータ */
  manual?: boolean
  /** 自動判断せず本部確認が必要なデータ */
  needsReview?: boolean
  /** どの受領原本から来たかを追跡するID */
  sourceFileVersionId?: string
}

export interface Organization extends MasterAuditFields { id: string; name: string }
export interface Player extends MasterAuditFields { id: string; name: string; orgId: string }
export interface Horse extends MasterAuditFields { id: string; name: string; orgId: string }

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
  /** DB entry linked by the reflected request; absent before reflection. */
  officialEntryId?: string
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
