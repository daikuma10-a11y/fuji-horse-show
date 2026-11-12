"use client"

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { nextVendorPosition, readVendorLayout, vendorKinds, vendorLayoutFile, type Vendor, type VendorKind, type VendorPosition } from '@/lib/master/vendor-layout'
import { VendorMap } from './vendor-map'

const control = 'min-h-11 rounded-lg border-2 bg-background px-3 text-base'
const button = control + ' font-bold disabled:opacity-50'
type Props = { eventId: string; eventName: string; storageKey: string; venue: ReactNode; origin: VendorPosition }

export function MasterVendorLayout({ eventId, eventName, storageKey, venue, origin }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const current = useRef<Vendor[]>([])
  const base = useRef<string | null>(null)
  const damaged = useRef(false)
  const [ready, setReady] = useState(false)
  const [selected, setSelected] = useState('')
  const [editing, setEditing] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<VendorKind>('food')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const formLock = useRef(false)
  const chosen = vendors.find(v => v.id === selected)

  function show(next: Vendor[]) { current.current = next; setVendors(next) }
  useEffect(() => {
    function load() {
      try {
        const raw = localStorage.getItem(storageKey)
        base.current = raw
        const next = raw === null ? [] : readVendorLayout(raw, eventId)
        damaged.current = false
        show(next)
        setError('')
      } catch {
        damaged.current = true
        setError('端末の出店配置を読み込めません。保存してある配置ファイルを開いてください。')
      }
      setReady(true)
    }
    function changed(e: StorageEvent) {
      if (e.key === storageKey || e.key === null) { load(); setNotice('別の画面で更新された配置を読み直しました。') }
    }
    load()
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [eventId, storageKey])

  async function change(update: (rows: Vendor[]) => Vendor[], restore = false) {
    const write = () => {
      if (damaged.current && !restore) throw new Error('配置ファイルから復元してください。')
      const raw = localStorage.getItem(storageKey)
      if (raw !== base.current) {
        const fresh = raw === null ? [] : readVendorLayout(raw, eventId)
        base.current = raw
        show(fresh)
        throw new Error('別の画面の配置を読み直しました。変更したい位置や業者を確認し、もう一度操作してください。')
      }
      const next = update(current.current)
      const file = vendorLayoutFile(eventId, next)
      localStorage.setItem(storageKey, file)
      base.current = file
      damaged.current = false
      show(next)
      setError('')
      setNotice('この端末に保存しました。')
    }
    try {
      if (navigator.locks) await navigator.locks.request(storageKey, write)
      else write()
      return true
    } catch (e) {
      setNotice('')
      setError(e instanceof Error && e.name === 'Error' ? e.message : '端末に保存できませんでした。ブラウザーの保存領域を確認してください。')
      return false
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (formLock.current) return
    const value = name.trim()
    if (!value) { nameInput.current?.focus(); return }
    const id = editing || crypto.randomUUID()
    formLock.current = true
    const saved = await change(rows => {
      if (!editing) return [...rows, { id, name: value, kind, ...nextVendorPosition(rows, origin) }]
      if (!rows.some(v => v.id === id)) throw new Error('編集する業者が見つかりません。')
      return rows.map(v => v.id === id ? { ...v, name: value, kind } : v)
    })
    formLock.current = false
    if (saved) {
      setName(''); setEditing(''); setSelected(id)
    }
  }
  function startEditing() {
    if (!chosen) return
    setEditing(chosen.id); setName(chosen.name); setKind(chosen.kind); nameInput.current?.focus()
  }
  async function remove() {
    if (!chosen || !window.confirm(chosen.name + 'を出店配置図から削除しますか？')) return
    if (await change(rows => rows.filter(v => v.id !== chosen.id))) {
      setSelected('')
      if (editing === chosen.id) { setEditing(''); setName('') }
    }
  }
  function download() {
    const file = new Blob([vendorLayoutFile(eventId, current.current)], { type: 'application/json' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url; link.download = eventName + '-出店配置.json'; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function restore(file: File) {
    try {
      const rows = readVendorLayout(await file.text(), eventId)
      if ((current.current.length || damaged.current) && !window.confirm('現在の配置を、選んだファイルの内容に置き換えますか？')) return
      if (await change(() => rows, true)) { setSelected(''); setEditing(''); setName('') }
    } catch { setError('この大会の出店配置ファイルを読み込めませんでした。'); setNotice('') }
  }

  return <section className="space-y-3 rounded-xl border-2 bg-card p-4" aria-label="出店配置図">
    <h3 className="text-xl font-bold">出店配置図</h3>
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="grid flex-1 gap-1 font-bold">業者名
        <input ref={nameInput} className={control} required maxLength={50} value={name} onChange={e => setName(e.target.value)} />
      </label>
      <label className="grid gap-1 font-bold">出店区分
        <select className={control} value={kind} onChange={e => setKind(e.target.value as VendorKind)}>
          <option value="food">飲食</option><option value="tack">馬具</option>
        </select>
      </label>
      <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50" disabled={!ready || !name.trim()}>{editing ? '変更を保存' : '業者を追加'}</button>
      {editing && <button type="button" className={button} onClick={() => { setEditing(''); setName('') }}>編集をやめる</button>}
    </form>
    <div className="flex flex-wrap items-center gap-3">
      {Object.values(vendorKinds).map(k => <span key={k.label} className="inline-flex items-center gap-1.5 text-sm"><span className="inline-block h-4 w-4 rounded-sm border" style={{ background: k.fill, borderColor: k.stroke }} />{k.label}</span>)}
      {!!vendors.length && <>
        <select aria-label="配置する業者" className={control + ' max-w-full'} value={chosen?.id || ''} onChange={e => setSelected(e.target.value)}>
          <option value="">業者を選択</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}（{vendorKinds[v.kind].label}）</option>)}
        </select>
        <button type="button" className={button} disabled={!chosen} onClick={startEditing}>名前・区分を編集</button>
        <button type="button" className={button} disabled={!chosen} onClick={() => void remove()}>業者を削除</button>
      </>}
    </div>
    <VendorMap venue={venue} eventName={eventName} vendors={vendors} selected={chosen?.id || ''} onSelect={setSelected}
      onMove={(id, pos) => void change(rows => rows.map(v => v.id === id ? { ...v, ...pos } : v))} />
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={button} disabled={!ready || damaged.current} onClick={download}>配置ファイルを書き出す</button>
      <button type="button" className={button} disabled={!ready} onClick={() => picker.current?.click()}>配置ファイルを開く</button>
      <input type="file" accept=".json,application/json" hidden ref={picker} onChange={e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (file) void restore(file)
      }} />
    </div>
    <p className="text-sm text-muted-foreground">配置はこのブラウザーに自動保存されます。別の端末で編集する場合は配置ファイルを移してください。</p>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
