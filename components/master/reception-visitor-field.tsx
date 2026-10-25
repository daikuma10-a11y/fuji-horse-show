import type { ChangeEvent } from 'react'

export function ReceptionVisitorField({value, onChange, disabled}: {value: string; onChange: (value: string) => void; disabled: boolean}) {
  return <label className="block rounded-xl border-2 bg-white p-5 text-xl font-bold">
    受付に来た方のお名前
    <input required autoComplete="off" maxLength={100} value={value} disabled={disabled}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      className="mt-2 min-h-16 w-full rounded-xl border-2 p-3 text-xl disabled:bg-slate-100" />
    <span className="mt-2 block text-base font-normal">受付に来たご本人のお名前を入力してください。今回まとめて確定する申請すべてに記録します。</span>
  </label>
}
