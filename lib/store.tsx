"use client"

// 試作版のデータストア。
// 現状はブラウザ内メモリ（React state）で動作します。
// 後から Supabase に差し替える際は、この Provider 内の各関数を
// Supabase のクエリ／リアルタイム購読に置き換えるだけで済むように設計しています。

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import {
  competitions as seedCompetitions,
  horses as seedHorses,
  organizations as seedOrgs,
  players as seedPlayers,
  startEntries as seedStartEntries,
} from "./mock-data"
import type {
  AddPayload,
  AppRequest,
  ChangePayload,
  Competition,
  CompetitionDate,
  Horse,
  Organization,
  Payment,
  Player,
  StartEntry,
  WithdrawPayload,
} from "./types"

interface StoreValue {
  organizations: Organization[]
  players: Player[]
  horses: Horse[]
  competitions: Competition[]
  startEntries: StartEntry[]
  requests: AppRequest[]
  payments: Payment[]
  // 参照ヘルパー
  getCompetition: (id: string) => Competition | undefined
  getPlayer: (id: string) => Player | undefined
  getHorse: (id: string) => Horse | undefined
  getOrg: (id: string) => Organization | undefined
  competitionsByDate: (date: CompetitionDate) => Competition[]
  entriesByCompetition: (competitionId: string) => StartEntry[]
  // 申請
  submitAdd: (payload: AddPayload) => void
  submitChange: (payload: ChangePayload) => void
  submitWithdraw: (payload: WithdrawPayload) => void
  // 本部操作
  reflectRequest: (requestId: string) => void
  setPayment: (orgId: string, paid: number) => void
}

const StoreContext = createContext<StoreValue | null>(null)

let idCounter = 1000
function nextId(prefix: string) {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

import {
  calcAddFee,
  calcChangeFee,
  calcWithdrawAddFee,
  calcWithdrawFee,
} from "./fees"

export function StoreProvider({ children }: { children: ReactNode }) {
  const [organizations] = useState<Organization[]>(seedOrgs)
  const [players] = useState<Player[]>(seedPlayers)
  const [horses] = useState<Horse[]>(seedHorses)
  const [competitions] = useState<Competition[]>(seedCompetitions)
  const [startEntries, setStartEntries] = useState<StartEntry[]>(seedStartEntries)
  const [requests, setRequests] = useState<AppRequest[]>([])
  const [payments, setPayments] = useState<Payment[]>([])

  const getCompetition = useCallback(
    (id: string) => competitions.find((c) => c.id === id),
    [competitions],
  )
  const getPlayer = useCallback((id: string) => players.find((p) => p.id === id), [players])
  const getHorse = useCallback((id: string) => horses.find((h) => h.id === id), [horses])
  const getOrg = useCallback((id: string) => organizations.find((o) => o.id === id), [organizations])

  const competitionsByDate = useCallback(
    (date: CompetitionDate) =>
      competitions.filter((c) => c.date === date).sort((a, b) => a.number - b.number),
    [competitions],
  )

  const entriesByCompetition = useCallback(
    (competitionId: string) =>
      startEntries
        .filter((e) => e.competitionId === competitionId)
        .sort((a, b) => a.order - b.order),
    [startEntries],
  )

  const submitAdd = useCallback(
    (payload: AddPayload) => {
      const target = competitions.find((c) => c.id === payload.competitionId)
      const horse = horses.find((h) => h.id === payload.horseId)
      if (!target || !horse) return
      const req: AppRequest = {
        id: nextId("req"),
        type: "add",
        status: "pending",
        createdAt: new Date().toISOString(),
        orgId: horse.orgId,
        fee: calcAddFee(target),
        add: payload,
      }
      setRequests((prev) => [req, ...prev])
    },
    [competitions, horses],
  )

  const submitChange = useCallback(
    (payload: ChangePayload) => {
      const from = competitions.find((c) => c.id === payload.fromCompetitionId)
      const to = competitions.find((c) => c.id === payload.toCompetitionId)
      const horse = horses.find((h) => h.id === payload.toHorseId)
      if (!from || !to || !horse) return
      const fee = payload.treatedAsWithdrawAdd ? calcWithdrawAddFee(to) : calcChangeFee(from, to)
      const req: AppRequest = {
        id: nextId("req"),
        type: "change",
        status: "pending",
        createdAt: new Date().toISOString(),
        orgId: horse.orgId,
        fee,
        change: payload,
      }
      setRequests((prev) => [req, ...prev])
    },
    [competitions, horses],
  )

  const submitWithdraw = useCallback(
    (payload: WithdrawPayload) => {
      const horse = horses.find((h) => h.id === payload.horseId)
      if (!horse) return
      const req: AppRequest = {
        id: nextId("req"),
        type: "withdraw",
        status: "pending",
        createdAt: new Date().toISOString(),
        orgId: horse.orgId,
        fee: calcWithdrawFee(),
        withdraw: payload,
      }
      setRequests((prev) => [req, ...prev])
    },
    [horses],
  )

  // 本部：申請を出番表へ反映する
  const reflectRequest = useCallback(
    (requestId: string) => {
      setRequests((prevReqs) => {
        const req = prevReqs.find((r) => r.id === requestId)
        if (!req || req.status === "reflected") return prevReqs

        setStartEntries((prevEntries) => {
          let entries = [...prevEntries]

          if (req.type === "withdraw" && req.withdraw) {
            entries = entries.filter((e) => e.id !== req.withdraw!.entryId)
          }

          if (req.type === "add" && req.add) {
            entries = applyAdd(entries, req.add, seedCompetitionOfficial(req.add.competitionId))
          }

          if (req.type === "change" && req.change) {
            const ch = req.change
            if (ch.treatedAsWithdrawAdd) {
              // 棄権＋追加：元エントリーを削除し、新規追加
              entries = entries.filter((e) => e.id !== ch.entryId)
              entries = applyAdd(
                entries,
                { competitionId: ch.toCompetitionId, playerId: ch.toPlayerId, horseId: ch.toHorseId, note: "" },
                seedCompetitionOfficial(ch.toCompetitionId),
              )
            } else {
              // 1項目変更：該当エントリーを更新
              entries = entries.map((e) =>
                e.id === ch.entryId
                  ? {
                      ...e,
                      competitionId: ch.toCompetitionId,
                      playerId: ch.toPlayerId,
                      horseId: ch.toHorseId,
                    }
                  : e,
              )
            }
          }

          // 反映後は、影響を受けた競技を含め全競技の出番番号を
          // 現在の順序のまま 1, 2, 3... と連番に振り直す。
          // これにより追加・変更・棄権のどの操作でも欠番や重複番号を残さない。
          return renumberStartEntries(entries)
        })

        return prevReqs.map((r) => (r.id === requestId ? { ...r, status: "reflected" } : r))
      })
    },
    [],
  )


  // 競技ごとに現在の出番順を維持したまま、order を 1 から連番へ正規化する
  function renumberStartEntries(entries: StartEntry[]): StartEntry[] {
    const nextOrderByCompetition = new Map<string, Map<string, number>>()

    const competitionIds = Array.from(new Set(entries.map((e) => e.competitionId)))
    for (const competitionId of competitionIds) {
      const ordered = entries
        .filter((e) => e.competitionId === competitionId)
        .sort((a, b) => a.order - b.order)

      nextOrderByCompetition.set(
        competitionId,
        new Map(ordered.map((entry, index) => [entry.id, index + 1])),
      )
    }

    return entries.map((entry) => ({
      ...entry,
      order: nextOrderByCompetition.get(entry.competitionId)?.get(entry.id) ?? entry.order,
    }))
  }

  // 公認判定（反映時に上／下どちらへ追加するか決める）
  function seedCompetitionOfficial(competitionId: string) {
    return competitions.find((c) => c.id === competitionId)?.official ?? false
  }

  // 追加を出番表へ反映：公認は上側、非公認は後ろ側へ
  function applyAdd(entries: StartEntry[], add: AddPayload, official: boolean): StartEntry[] {
    const target = entries
      .filter((e) => e.competitionId === add.competitionId)
      .sort((a, b) => a.order - b.order)
    const newEntry: StartEntry = {
      id: nextId("e"),
      competitionId: add.competitionId,
      order: 0,
      playerId: add.playerId,
      horseId: add.horseId,
    }
    if (official) {
      // 上側に追加 → 既存を1つずつ後ろにずらす
      const shifted = entries.map((e) =>
        e.competitionId === add.competitionId ? { ...e, order: e.order + 1 } : e,
      )
      newEntry.order = 1
      return [...shifted, newEntry]
    }
    // 後ろ側に追加
    const maxOrder = target.length ? target[target.length - 1].order : 0
    newEntry.order = maxOrder + 1
    return [...entries, newEntry]
  }

  const setPayment = useCallback((orgId: string, paid: number) => {
    setPayments((prev) => {
      const exists = prev.find((p) => p.orgId === orgId)
      if (exists) return prev.map((p) => (p.orgId === orgId ? { ...p, paid } : p))
      return [...prev, { orgId, paid }]
    })
  }, [])

  const value = useMemo<StoreValue>(
    () => ({
      organizations,
      players,
      horses,
      competitions,
      startEntries,
      requests,
      payments,
      getCompetition,
      getPlayer,
      getHorse,
      getOrg,
      competitionsByDate,
      entriesByCompetition,
      submitAdd,
      submitChange,
      submitWithdraw,
      reflectRequest,
      setPayment,
    }),
    [
      organizations,
      players,
      horses,
      competitions,
      startEntries,
      requests,
      payments,
      getCompetition,
      getPlayer,
      getHorse,
      getOrg,
      competitionsByDate,
      entriesByCompetition,
      submitAdd,
      submitChange,
      submitWithdraw,
      reflectRequest,
      setPayment,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error("useStore は StoreProvider の内側で使用してください")
  return ctx
}
