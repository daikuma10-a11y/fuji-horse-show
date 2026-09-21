// Fuji Horse Show 受付システム 型定義
// 後から Supabase テーブルへそのまま対応できるようにフラットな構造にしています。

export type CompetitionDate = "2026-11-13" | "2026-11-14" | "2026-11-15"

export interface Organization {
  id: string
  name: string
}

export interface Player {
  id: string
  name: string
  orgId: string
}

export interface Horse {
  id: string
  name: string
  orgId: string
}

export interface Competition {
  id: string
  /** 競技番号（表示・並び順に使用） */
  number: number
  date: CompetitionDate
  name: string
  /** 公認競技かどうか */
  official: boolean
  /** 通常のエントリー料金（円） */
  entryFee: number
}

/** 出番表の1行 */
export interface StartEntry {
  id: string
  competitionId: string
  /** 出番順 */
  order: number
  playerId: string
  horseId: string
}

export type RequestType = "add" | "change" | "withdraw"

export type RequestStatus = "pending" | "reflected"

/** 追加申請の内容 */
export interface AddPayload {
  competitionId: string
  playerId: string
  horseId: string
  /** 要望（任意） */
  note: string
}

/** 変更申請の内容 */
export interface ChangePayload {
  /** 対象の出番表エントリー */
  entryId: string
  /** 変更前 */
  fromCompetitionId: string
  fromPlayerId: string
  fromHorseId: string
  /** 変更後 */
  toCompetitionId: string
  toPlayerId: string
  toHorseId: string
  /** 変更された項目数（1項目＝変更、2項目以上＝棄権＋追加扱い） */
  changedFields: Array<"competition" | "player" | "horse">
  /** 2項目以上のため棄権＋追加として扱うか */
  treatedAsWithdrawAdd: boolean
}

/** 棄権申請の内容 */
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
  /** 精算対象の所属団体 */
  orgId: string
  /** 料金内訳 */
  fee: FeeBreakdown
  add?: AddPayload
  change?: ChangePayload
  withdraw?: WithdrawPayload
}

/** 1申請あたりの料金内訳（円） */
export interface FeeBreakdown {
  /** 追加基本料金 3,000 */
  addBase: number
  /** 追加先競技のエントリー料金 */
  addEntry: number
  /** 変更基本料金 2,000 */
  changeBase: number
  /** 競技変更による差額（高くなった分のみ） */
  competitionDiff: number
  /** 合計 */
  total: number
}

/** 所属団体ごとの入金記録（大会本部が入力） */
export interface Payment {
  orgId: string
  /** 振込済み金額 */
  paid: number
}
