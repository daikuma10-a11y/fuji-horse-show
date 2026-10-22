"use client"

import type { ReactNode } from 'react'

export type PreRegistrationSection = 'roster' | 'entries' | 'application' | 'overview'

export function MasterPreRegistration({ selected, onSelect, roster, entries, application, overview, children }: {
  selected: PreRegistrationSection
  onSelect: (section: PreRegistrationSection) => void
  roster: ReactNode
  entries: ReactNode
  application?: ReactNode
  overview?: ReactNode
  children?: ReactNode
}) {
  return <div className="space-y-5">
    <div className="space-y-3 rounded-xl border-2 border-blue-300 bg-blue-50 p-5 text-slate-900">
      <h2 className="text-3xl font-bold">事前登録</h2>
      <p className="text-lg">先に人馬の参加名簿を用意し、その後に出場する競技を登録します。</p>
      <div aria-label="事前登録の作業" className={`grid gap-3 ${overview ? 'sm:grid-cols-2' : application ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {([
          ['roster', '人馬の登録', '① 団体を選び、参加する選手・馬を登録'],
          ['entries', '出番表の登録', '② 選手・馬・競技を組み合わせて登録'],
          ...(application ? [['application', '申込書の読み込み', 'Excelから人馬・エントリー・金額を確認'] as const] : []),
          ...(overview ? [['overview', '団体別の登録内容', '登録済みの選手・馬・エントリーを一覧で確認'] as const] : []),
        ] as const).map(([id, label, description]) => <button key={id} type="button" aria-pressed={selected === id} aria-controls={`pre-registration-${id}`} onClick={() => onSelect(id)} className={`min-h-24 rounded-xl border-2 border-blue-800 p-4 text-left focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-800 ${selected === id ? 'bg-blue-800 text-white' : 'bg-white text-blue-900 hover:bg-blue-100'}`}>
          <span className="block text-2xl font-bold">{label}</span>
          <span className="mt-2 block text-base">{description}</span>
        </button>)}
      </div>
    </div>
    {/* Keep all forms mounted so moving between tasks preserves drafts. */}
    <section id="pre-registration-roster" aria-label="人馬の登録" hidden={selected !== 'roster'} className="space-y-5">{roster}</section>
    <section id="pre-registration-entries" aria-label="出番表の登録" hidden={selected !== 'entries'} className="space-y-5">{entries}</section>
    {application&&<section id="pre-registration-application" aria-label="申込書の読み込み" hidden={selected !== 'application'} className="space-y-5">{application}</section>}
    {overview&&<section id="pre-registration-overview" aria-label="団体別の登録内容" hidden={selected !== 'overview'} className="space-y-5">{overview}</section>}
    {children}
  </div>
}
