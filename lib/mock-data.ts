import type {
  Competition,
  CompetitionDate,
  Horse,
  Organization,
  Player,
  StartEntry,
} from "./types"

export const COMPETITION_DATES: { value: CompetitionDate; label: string }[] = [
  { value: "2026-09-11", label: "2026年9月11日（金）" },
  { value: "2026-09-12", label: "2026年9月12日（土）" },
  { value: "2026-09-13", label: "2026年9月13日（日）" },
]

export const organizations: Organization[] = [
  { id: "org-1", name: "富士ライディングクラブ" },
  { id: "org-2", name: "御殿場乗馬倶楽部" },
  { id: "org-3", name: "山中湖ホースパーク" },
  { id: "org-4", name: "朝霧高原乗馬会" },
]

export const players: Player[] = [
  { id: "p-1", name: "佐藤 太郎", orgId: "org-1" },
  { id: "p-2", name: "鈴木 花子", orgId: "org-1" },
  { id: "p-3", name: "高橋 健一", orgId: "org-2" },
  { id: "p-4", name: "田中 美咲", orgId: "org-2" },
  { id: "p-5", name: "伊藤 大輔", orgId: "org-3" },
  { id: "p-6", name: "渡辺 由美", orgId: "org-3" },
  { id: "p-7", name: "山本 剛", orgId: "org-4" },
  { id: "p-8", name: "中村 彩", orgId: "org-4" },
]

export const horses: Horse[] = [
  { id: "h-1", name: "サンライズ", orgId: "org-1" },
  { id: "h-2", name: "フジノカゼ", orgId: "org-1" },
  { id: "h-3", name: "ゴテンバオー", orgId: "org-2" },
  { id: "h-4", name: "ミサキボシ", orgId: "org-2" },
  { id: "h-5", name: "ヤマナカマル", orgId: "org-3" },
  { id: "h-6", name: "ホワイトスノー", orgId: "org-3" },
  { id: "h-7", name: "アサギリヒメ", orgId: "org-4" },
  { id: "h-8", name: "タカハラボーイ", orgId: "org-4" },
]

// 競技（競技番号順に並べます）
export const competitions: Competition[] = [
  // 11月13日
  { id: "c-101", number: 1, date: "2026-11-13", name: "ビギナー障害飛越 60cm", official: false, entryFee: 4000 },
  { id: "c-102", number: 2, date: "2026-11-13", name: "小障害飛越 80cm", official: true, entryFee: 6000 },
  { id: "c-103", number: 3, date: "2026-11-13", name: "馬場馬術 第1課目", official: false, entryFee: 5000 },
  { id: "c-104", number: 4, date: "2026-11-13", name: "中障害飛越 100cm", official: true, entryFee: 8000 },
  // 11月14日
  { id: "c-201", number: 5, date: "2026-11-14", name: "馬場馬術 第2課目", official: true, entryFee: 7000 },
  { id: "c-202", number: 6, date: "2026-11-14", name: "小障害飛越 90cm", official: true, entryFee: 6500 },
  { id: "c-203", number: 7, date: "2026-11-14", name: "親子ペア競技", official: false, entryFee: 3500 },
  { id: "c-204", number: 8, date: "2026-11-14", name: "中障害飛越 110cm", official: true, entryFee: 9000 },
  { id: "c-205", number: 9, date: "2026-11-14", name: "レクリエーション競技", official: false, entryFee: 3000 },
  // 11月15日
  { id: "c-301", number: 10, date: "2026-11-15", name: "馬場馬術 セントジョージ賞典", official: true, entryFee: 10000 },
  { id: "c-302", number: 11, date: "2026-11-15", name: "大障害飛越 120cm", official: true, entryFee: 12000 },
  { id: "c-303", number: 12, date: "2026-11-15", name: "ファンライド競技", official: false, entryFee: 3000 },
]

// 出番表（初期エントリー）
export const startEntries: StartEntry[] = [
  // c-101 ビギナー障害飛越 60cm
  { id: "e-1", competitionId: "c-101", order: 1, playerId: "p-2", horseId: "h-2" },
  { id: "e-2", competitionId: "c-101", order: 2, playerId: "p-6", horseId: "h-6" },
  { id: "e-3", competitionId: "c-101", order: 3, playerId: "p-8", horseId: "h-8" },
  // c-102 小障害飛越 80cm（公認）
  { id: "e-4", competitionId: "c-102", order: 1, playerId: "p-1", horseId: "h-1" },
  { id: "e-5", competitionId: "c-102", order: 2, playerId: "p-3", horseId: "h-3" },
  { id: "e-6", competitionId: "c-102", order: 3, playerId: "p-5", horseId: "h-5" },
  { id: "e-7", competitionId: "c-102", order: 4, playerId: "p-7", horseId: "h-7" },
  // c-103 馬場馬術 第1課目
  { id: "e-8", competitionId: "c-103", order: 1, playerId: "p-4", horseId: "h-4" },
  { id: "e-9", competitionId: "c-103", order: 2, playerId: "p-2", horseId: "h-1" },
  // c-104 中障害飛越 100cm（公認）
  { id: "e-10", competitionId: "c-104", order: 1, playerId: "p-1", horseId: "h-2" },
  { id: "e-11", competitionId: "c-104", order: 2, playerId: "p-5", horseId: "h-6" },
  // c-201 馬場馬術 第2課目（公認）
  { id: "e-12", competitionId: "c-201", order: 1, playerId: "p-4", horseId: "h-4" },
  { id: "e-13", competitionId: "c-201", order: 2, playerId: "p-6", horseId: "h-5" },
  // c-202 小障害飛越 90cm（公認）
  { id: "e-14", competitionId: "c-202", order: 1, playerId: "p-3", horseId: "h-3" },
  { id: "e-15", competitionId: "c-202", order: 2, playerId: "p-7", horseId: "h-7" },
  { id: "e-16", competitionId: "c-202", order: 3, playerId: "p-1", horseId: "h-1" },
  // c-203 親子ペア競技
  { id: "e-17", competitionId: "c-203", order: 1, playerId: "p-2", horseId: "h-2" },
  // c-204 中障害飛越 110cm（公認）
  { id: "e-18", competitionId: "c-204", order: 1, playerId: "p-5", horseId: "h-5" },
  { id: "e-19", competitionId: "c-204", order: 2, playerId: "p-1", horseId: "h-2" },
  // c-205 レクリエーション競技
  { id: "e-20", competitionId: "c-205", order: 1, playerId: "p-8", horseId: "h-8" },
  { id: "e-21", competitionId: "c-205", order: 2, playerId: "p-6", horseId: "h-6" },
  // c-301 馬場馬術 セントジョージ賞典（公認）
  { id: "e-22", competitionId: "c-301", order: 1, playerId: "p-4", horseId: "h-4" },
  // c-302 大障害飛越 120cm（公認）
  { id: "e-23", competitionId: "c-302", order: 1, playerId: "p-1", horseId: "h-2" },
  { id: "e-24", competitionId: "c-302", order: 2, playerId: "p-5", horseId: "h-5" },
  // c-303 ファンライド競技
  { id: "e-25", competitionId: "c-303", order: 1, playerId: "p-7", horseId: "h-7" },
  { id: "e-26", competitionId: "c-303", order: 2, playerId: "p-8", horseId: "h-8" },
]
