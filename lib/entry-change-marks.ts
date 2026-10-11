import type { AppRequest, StartEntry } from "./types"

type ChangeInfo = Pick<StartEntry, "adminChangeMark" | "adminChangeFields">
const fields = ["competition", "player", "horse", "op"] as const
const labels = { competition: "競技変更", player: "選手変更", horse: "馬変更", op: "OP区分変更" }

/** 正式出番のIDに履歴を結び付ける。出番順や人馬名をキーにしない。 */
export function collectEntryChangeMarks(requests: AppRequest[], entryIds: ReadonlySet<string>): Map<string, ChangeInfo> {
  const marks = new Map<string, ChangeInfo>()
  for (const request of requests) {
    const id = request.officialEntryId
    if (request.status !== "reflected" || !id || !entryIds.has(id) || request.type === "withdraw") continue
    const previous = marks.get(id)
    const merged = new Set([...(previous?.adminChangeFields ?? []), ...(request.change?.changedFields ?? [])])
    marks.set(id, {
      adminChangeMark: request.type === "add" || previous?.adminChangeMark === "added" ? "added" : "changed",
      adminChangeFields: fields.filter(field => merged.has(field)),
    })
  }
  return marks
}

export function entryChangeLabel(entry: ChangeInfo): string {
  const changes = fields.filter(field => entry.adminChangeFields?.includes(field)).map(field => labels[field])
  if (entry.adminChangeMark === "added") return ["追加", ...changes].join("・")
  return entry.adminChangeMark === "changed" ? changes.join("・") || "変更" : ""
}
