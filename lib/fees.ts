import type { Competition, FeeBreakdown } from "./types"

export const ADD_BASE_FEE = 3000
export const CHANGE_BASE_FEE = 2000
export const OP_DISCOUNT = 1000

export function entryPrice(competition: Competition, isOp = false): number {
  if (isOp && competition.official) throw new Error("公認競技ではOP参加を選べません")
  return Math.max(0, competition.entryFee - (isOp ? OP_DISCOUNT : 0))
}

function emptyBreakdown(): FeeBreakdown {
  return { addBase: 0, addEntry: 0, changeBase: 0, competitionDiff: 0, total: 0 }
}

function withTotal(b: FeeBreakdown): FeeBreakdown {
  b.total = b.addBase + b.addEntry + b.changeBase + b.competitionDiff
  return b
}

/**
 * 追加の料金
 * 追加 = 3,000円 ＋ 追加先競技のエントリー料金
 */
export function calcAddFee(target: Competition, isOp = false): FeeBreakdown {
  const b = emptyBreakdown()
  b.addBase = ADD_BASE_FEE
  b.addEntry = entryPrice(target, isOp)
  return withTotal(b)
}

/**
 * 変更の料金
 * 変更 = 2,000円
 * 競技変更で新しい競技の料金が元の競技より高い場合は差額を追加。
 * 安くなっても返金しない（差額は0）。
 */
export function calcChangeFee(from: Competition, to: Competition, fromIsOp = false, toIsOp = false): FeeBreakdown {
  const b = emptyBreakdown()
  b.changeBase = CHANGE_BASE_FEE
  b.competitionDiff = Math.max(0, entryPrice(to, toIsOp) - entryPrice(from, fromIsOp))
  return withTotal(b)
}

/**
 * 2項目以上の変更＝棄権＋追加として扱う場合の料金
 * 棄権は料金なし、追加先競技で追加料金が発生。
 */
export function calcWithdrawAddFee(target: Competition, isOp = false): FeeBreakdown {
  return calcAddFee(target, isOp)
}

/** 棄権のみ（料金なし） */
export function calcWithdrawFee(): FeeBreakdown {
  return emptyBreakdown()
}

export function formatYen(amount: number): string {
  return "¥" + amount.toLocaleString("ja-JP")
}
