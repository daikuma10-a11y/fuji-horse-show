import { calcSettlement } from './settlement'
import { startEntries as originalEntries } from './mock-data'
import { players as sourcePlayers } from './autumn-data'
import { compareOrganizations } from './organization-order'
import { feeOverrideKey, type FeeOverride, type Prepayment } from './settlement-fee-overrides'
import { bankDetailsForEvent } from './event-payment-settings'
import { AUTUMN_EVENT_ID } from './supabase-rest'
import type { Organization, Player, Horse, Competition, StartEntry, AppRequest } from './types'
import type { ManualRecord } from './settlement-manual-records'
import type { PaymentInstruction } from './settlement-payment-instructions'
import type { SettlementReceipt } from './settlement-receipts'
import type { SettlementDocument, SettlementDocumentLine } from './settlement-document'
export type AccountData = { organizations: Organization[]; players: Player[]; horses: Horse[]; competitions: Competition[]; startEntries: StartEntry[]; requests: AppRequest[]; feeOverrides: FeeOverride[]; prepayments: Prepayment[]; manualRecords: ManualRecord[]; paymentInstructions: PaymentInstruction[]; receipts: SettlementReceipt[] }
const confirmedOrgAliases: Record<string, string> = {
  "org-2": "org-4",   // Horse'sNewStage → Horses' New Stage
  "org-6": "org-8",   // RIDING TEAM REGROUP → riding team Regroup
  "org-23": "org-17", // 乗馬クラブリバーサイドステーブル浜北 → 乗馬クラブ リバーサイドステーブル浜北
  "org-24": "org-25", // 八王子乗馬俱楽部 → 八王子乗馬倶楽部
}
const settlementOrgId = (id: string) => confirmedOrgAliases[id] ?? id
const eventBankDetails = bankDetailsForEvent(AUTUMN_EVENT_ID)

export function selfSettlementAccount(data: AccountData, selectedOrgId: string) {
  const { organizations, players, horses, competitions, startEntries, requests, feeOverrides, prepayments, manualRecords, paymentInstructions, receipts } = data
  const overrideFor = (type: 'normal' | 'add', id: string) => feeOverrides.find(row => feeOverrideKey(row.source_type, row.source_id) === feeOverrideKey(type, id))
  const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  const entryExists = (id: string) => startEntries.some((e) => e.id === id) || originalEntries.some((e) => e.id === id) || isUuid(id)
  const isResolvableRequest = (request: AppRequest) => {
    if (request.status !== "reflected") return false
    const orgExists = organizations.some((org) => org.id === request.orgId)
    if (!orgExists) return false
    if (request.add) {
      // Legacy requests can say "reflected" without ever creating an official
      // entry. Do not charge for an addition that cannot be linked to the
      // current official start list.
      return !!request.officialEntryId && startEntries.some((entry) => entry.id === request.officialEntryId)
        && competitions.some((c) => c.id === request.add!.competitionId) && players.some((p) => p.id === request.add!.playerId) && horses.some((h) => h.id === request.add!.horseId)
    }
    if (request.withdraw) {
      return entryExists(request.withdraw.entryId) && competitions.some((c) => c.id === request.withdraw!.competitionId) && horses.some((h) => h.id === request.withdraw!.horseId)
    }
    if (request.change) {
      return entryExists(request.change.entryId) && competitions.some((c) => c.id === request.change!.fromCompetitionId) && competitions.some((c) => c.id === request.change!.toCompetitionId) && horses.some((h) => h.id === request.change!.fromHorseId) && horses.some((h) => h.id === request.change!.toHorseId)
    }
    return false
  }

  const settlementRequests = requests.filter(isResolvableRequest)
  const excludedLegacyCount = requests.filter((request) => request.status === "reflected" && !isResolvableRequest(request)).length
  const rows = calcSettlement({
    organizations: organizations.filter((org) => !confirmedOrgAliases[org.id]),
    seedEntries: originalEntries,
    horses: horses.map((horse) => ({ ...horse, orgId: settlementOrgId(horse.orgId) })),
    competitions,
    requests: settlementRequests.map((request) => ({ ...request, orgId: settlementOrgId(request.orgId) })),
    payments: [],
    feeOverrides,
    manualRecords: manualRecords.map(record => ({ ...record, organization_key: settlementOrgId(record.organization_key) })),
  }).sort((a, b) => compareOrganizations(
    organizations.find(org => org.id === a.orgId) ?? { id: a.orgId, name: a.orgName },
    organizations.find(org => org.id === b.orgId) ?? { id: b.orgId, name: b.orgName },
  ))
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0)
  const receptionTotal = rows.reduce((sum, row) => sum + row.additional + row.change + row.competitionDiff, 0)
  const selected = rows.find((row) => row.orgId === selectedOrgId)
  const receiptRiderId = (id: string) => {
    const matches = players.filter(player => player.id === id || player.officialId === id)
    return matches.length === 1 ? matches[0].id : id
  }
  const playerName = (id: string) => {
    const direct = players.find((p) => p.id === id)?.name
    if (direct) return direct
    const source = sourcePlayers.find((p) => p.id === id)
    if (!source) return "選手不明"
    const normalize = (name: string) => name.normalize("NFKC").replace(/[\s　]+/g, "").toLocaleLowerCase("ja-JP")
    const canonical = players.filter((p) => p.orgId === source.orgId && normalize(p.name) === normalize(source.name))
    return canonical.length === 1 ? source.name : "選手不明"
  }
  const horseName = (id: string) => horses.find((h) => h.id === id)?.name ?? "馬匹不明"
  const competition = (id: string) => competitions.find((c) => c.id === id)
  const requestRiderName = (request: AppRequest) => {
    if (request.change?.toPlayerName) return request.change.toPlayerName
    if (request.add?.playerName) return request.add.playerName
    const riderId = request.add?.playerId ?? request.change?.toPlayerId ?? request.withdraw?.playerId ?? ""
    const direct = players.find((p) => p.id === riderId)?.name
    if (direct) return direct
    if (request.change) {
      const reflectedEntry = startEntries.find((entry) => entry.id === request.change!.entryId)
        ?? startEntries.find((entry) => entry.competitionId === request.change!.toCompetitionId && entry.horseId === request.change!.toHorseId)
      const reflectedPlayer = reflectedEntry ? players.find((p) => p.id === reflectedEntry.playerId)?.name : undefined
      if (reflectedPlayer) return reflectedPlayer
    }
    return "選手不明"
  }

  if (!selected) throw new Error('団体を確認できません')
    const paymentInstruction = paymentInstructions.find(row => row.organization_key === selected.orgId)
    const advance = prepayments.find(row => row.organization_key === selected.orgId)
    const manualDetails = manualRecords.filter(record => settlementOrgId(record.organization_key) === selected.orgId).sort((a, b) => (competition(a.competition_key)?.number ?? Infinity) - (competition(b.competition_key)?.number ?? Infinity))
    const orgReceipts = receipts.filter(row => settlementOrgId(row.organization_key) === selected.orgId)
    const paidItems = orgReceipts.flatMap(row => row.selected_items ?? [])
    const itemPaid = (key: string) => paidItems.filter(item => item.key === key).reduce((sum, item) => sum + item.amount, 0)
    const normalReceiptPaid = itemPaid('normal')
    const extraReceiptPaid = paidItems.filter(item => item.key !== 'normal').reduce((sum, item) => sum + item.amount, 0)
    const manualPaid = extraReceiptPaid + manualDetails.reduce((sum, record) => sum + record.paid_amount, 0)
    const due = selected.total - (advance?.paid_amount ?? 0) - normalReceiptPaid - manualPaid
    const normalDetails = originalEntries.filter((entry) => settlementOrgId(horses.find((h) => h.id === entry.horseId)?.orgId ?? "") === selected.orgId).map((entry) => ({ id: entry.id, riderId: entry.playerId, rider: playerName(entry.playerId), horse: horseName(entry.horseId), competition: competition(entry.competitionId) })).sort((a, b) => (a.competition?.number ?? Infinity) - (b.competition?.number ?? Infinity))
    const requestCompetitionNumber = (request: AppRequest) => competition(request.add?.competitionId ?? request.change?.toCompetitionId ?? request.withdraw?.competitionId ?? "")?.number ?? Infinity
    const requestDetails = settlementRequests.filter((request) => settlementOrgId(request.orgId) === selected.orgId).sort((a, b) => requestCompetitionNumber(a) - requestCompetitionNumber(b))
    const documentLines: SettlementDocumentLine[] = requestDetails.map(request => {
      const linked = manualDetails.find(record => record.request_id === request.id)
      const comp = competition(request.add?.competitionId ?? request.change?.toCompetitionId ?? request.withdraw?.competitionId ?? '')
      const change = request.change
      const compLabel = (id: string) => { const value = competition(id); return `競技${value?.number ?? '?'} ${value?.name ?? '要確認'}` }
      const changed = (before: string, after: string) => before === after ? after : `${before} → ${after}`
      const rider = change ? changed(playerName(change.fromPlayerId), requestRiderName(request)) : requestRiderName(request)
      const horse = change ? changed(horseName(change.fromHorseId), change.toHorseName || horseName(change.toHorseId)) : horseName(request.add?.horseId ?? request.withdraw?.horseId ?? '')
      const compText = change ? changed(compLabel(change.fromCompetitionId), compLabel(change.toCompetitionId)) : compLabel(request.add?.competitionId ?? request.withdraw?.competitionId ?? '')
      const opNote = change && !!change.fromIsOp !== !!change.toIsOp ? `参加区分：${change.fromIsOp ? 'OP' : '通常'} → ${change.toIsOp ? 'OP' : '通常'}` : ''
      const parts = request.fee.addBase + request.fee.addEntry + request.fee.changeBase + request.fee.competitionDiff
      const addCharge = request.type === 'add' || request.type === 'change' && request.change?.treatedAsWithdrawAdd
      const entryFee = addCharge ? overrideFor('add', request.id)?.corrected_fee ?? (parts ? request.fee.addEntry : request.fee.total) : 0
      const serviceFee = request.type === 'withdraw' ? 0 : addCharge ? (parts ? request.fee.addBase : 0) : parts ? request.fee.changeBase : request.fee.total
      const difference = addCharge || request.type === 'withdraw' ? 0 : request.fee.competitionDiff
      return { key: `request:${request.id}`, riderId: request.add?.playerId ?? request.change?.toPlayerId ?? request.withdraw?.playerId ?? '', receiptRider: requestRiderName(request), period: linked?.period === 'before_event' ? '締切後〜大会前' : '大会期間中', action: request.type === 'add' ? '追加' : request.type === 'change' ? '変更' : '棄権', competitionNumber: comp?.number, competition: compText, rider, horse, entryFee, serviceFee, difference, amount: entryFee + serviceFee + difference, paid: manualDetails.filter(record => record.request_id === request.id).reduce((sum, record) => sum + record.paid_amount, 0) + itemPaid(`request:${request.id}`), note: request.type === 'withdraw' ? '' : [opNote, linked?.details, addCharge && overrideFor('add',request.id) ? `運営修正：${overrideFor('add',request.id)!.reason}` : ''].filter(Boolean).join(' ／ ') }
    })
    for (const record of manualDetails.filter(record => !requestDetails.some(request => request.id === record.request_id))) {
      const comp = competition(record.competition_key), linked = requests.find(request => request.id === record.request_id)
      const charge = record.request_id === null && record.action_type !== 'withdraw' ? record.bill_amount : 0
      documentLines.push({ key: record.request_id ? `request:${record.request_id}` : `manual:${record.id}`, riderId: record.rider_key, receiptRider: playerName(record.rider_key), period: record.period === 'before_event' ? '締切後〜大会前' : '大会期間中', action: `${record.action_type === 'add' ? '追加' : record.action_type === 'change' ? '変更' : '棄権'}${linked?.status === 'cancelled' ? '取消済み' : record.request_id ? '未計上' : ''}`, competitionNumber: comp?.number, competition: `競技${comp?.number ?? '?'} ${comp?.name ?? '要確認'}`, rider: playerName(record.rider_key), horse: horseName(record.horse_key), entryFee: charge, serviceFee: 0, difference: 0, amount: charge, paid: record.paid_amount + itemPaid(record.request_id ? `request:${record.request_id}` : `manual:${record.id}`), note: record.action_type === 'withdraw' ? '' : [record.request_id === null ? '会場からの事後連絡・精算のみ（手数料込み）' : linked?.status === 'cancelled' ? '取消済み・入金記録は維持。返金・充当を確認' : '申請未反映のため請求未計上', record.details].filter(Boolean).join(' ／ ') })
    }
    documentLines.sort((a, b) => (a.competitionNumber ?? Number.MAX_SAFE_INTEGER) - (b.competitionNumber ?? Number.MAX_SAFE_INTEGER))
    const printDocument: SettlementDocument = { organization: selected.orgName, organizationKey: selected.orgId, issuedDate: new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }), normalTotal: selected.normalEntry, normalRemaining: Math.max(0, selected.normalEntry - (advance?.paid_amount ?? 0)), advancePaid: (advance?.paid_amount ?? 0) + normalReceiptPaid, advanceRecorded: !!advance || normalReceiptPaid > 0, extraTotal: selected.additional + selected.change + selected.competitionDiff, extraPaid: manualPaid, due, method: paymentInstruction?.payment_method === 'bank_transfer' ? '後日振込' : paymentInstruction?.payment_method === 'cash_at_venue' ? '当日現金' : '未設定', bankDetails: paymentInstruction?.payment_method === 'bank_transfer' ? eventBankDetails : '', lines: documentLines }


  const normalLines = normalDetails.map(item => ({ ...item, competition: `競技${item.competition?.number ?? '?'} ${item.competition?.name ?? '要確認'}`, amount: overrideFor('normal', item.id)?.corrected_fee ?? item.competition?.entryFee ?? 0 }))
  const warnings: string[] = []
  if (!printDocument.advanceRecorded && printDocument.normalTotal > 0) warnings.push('事前入金が未確認です。係員にご確認ください。')
  if (due < 0) warnings.push('過入金があります。返金・充当を係員にご確認ください。')
  if (requests.some(req => settlementOrgId(req.orgId) === selectedOrgId && req.status === 'pending')) warnings.push('未反映の申請があります。係員にご確認ください。')
  if (requests.some(req => settlementOrgId(req.orgId) === selectedOrgId && req.status === 'reflected' && !!req.officialEntryId && !isResolvableRequest(req))) warnings.push('正式な受付履歴と明細の照合に確認が必要です。係員にご確認ください。')
  if (documentLines.some(line => /不明|要確認/.test(line.rider + line.horse + line.competition))) warnings.push('明細の人馬・競技に確認が必要です。')
  return { document: printDocument, normalLines, warnings }
}
export function selfSettlementOrganizations(data: AccountData) { return data.organizations.filter(org => !confirmedOrgAliases[org.id]).sort(compareOrganizations).map(org => ({id: org.id, name: org.name})) }
