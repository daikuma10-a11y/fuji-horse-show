"use client"

import { useRef, useState } from "react"
import { verifyAdminSession, type AdminSession } from "@/lib/supabase-rest"
import type { WinterOrganizationRow } from "@/lib/winter-data"

export function WinterMasterRegistration({ session, organizations, onRegistered }: { session: AdminSession; organizations: WinterOrganizationRow[]; onRegistered: () => void }) {
  const [kind, setKind] = useState("organization")
  const [org, setOrg] = useState("")
  const [name, setName] = useState("")
  const [number, setNumber] = useState("")
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [message, setMessage] = useState("")
  const field = "mt-2 min-h-16 w-full rounded-xl border-2 border-slate-300 p-3 text-xl"
  async function register() {
    if (lock.current) return
    lock.current = true; setBusy(true); setMessage("")
    try {
      if (!name.trim()) throw new Error("名前を入力してください")
      if (kind !== 'organization' && !org) throw new Error("所属団体を選択してください")
      if (kind !== 'organization' && number.trim() && !checked) throw new Error("日馬連登録番号の確認にチェックしてください")
      const verified = await verifyAdminSession(session)
      const response = await fetch('https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/rpc/register_winter_reception_master', {
        method: 'POST', headers: { apikey: 'sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95', Authorization: `Bearer ${verified.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_kind: kind, p_name: name.trim(), p_organization_id: kind === 'organization' ? null : org, p_jef_number: kind === 'organization' ? null : number.trim() || null, p_jef_checked: checked }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || "登録できませんでした")
      if (typeof body !== 'string') throw new Error("登録結果を確認できません")
      setMessage(`${name.trim()} を登録しました`); setName(""); setNumber(""); setChecked(false); onRegistered()
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "登録できません") }
    finally { lock.current = false; setBusy(false) }
  }
  return <details className="rounded-xl border-2 border-slate-300 p-4">
    <summary className="min-h-12 cursor-pointer text-2xl font-bold">団体・選手・馬を登録（本部用）</summary>
    <p className="my-3 text-lg">先に団体、その後に選手と馬を登録してください。テスト用は名前に「テスト」と付けて区別してください。</p>
    <fieldset disabled={busy} className="space-y-4">
      <label className="block text-xl">登録するもの<select className={field} value={kind} onChange={e => { setKind(e.target.value); setName(""); setNumber(""); setChecked(false) }}><option value="organization">団体</option><option value="rider">選手</option><option value="horse">馬</option></select></label>
      {kind !== 'organization' && <label className="block text-xl">所属団体<select className={field} value={org} onChange={e => setOrg(e.target.value)}><option value="">団体を選択</option>{organizations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      <label className="block text-xl">名前<input className={field} maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
      {kind !== 'organization' && <><label className="block text-xl">日馬連登録番号（非公認のみの場合は空欄）<input className={field} maxLength={100} value={number} onChange={e => setNumber(e.target.value)} /></label><label className="flex min-h-16 items-center gap-3 text-xl"><input className="size-7" type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />日馬連の登録番号を確認しました</label></>}
      <button type="button" onClick={register} className="min-h-16 w-full rounded-xl bg-blue-800 p-4 text-2xl font-bold text-white">{busy ? "登録中…" : "登録する"}</button>
    </fieldset>
    {message && <p role="status" className="mt-4 break-all text-xl">{message}</p>}
  </details>
}
