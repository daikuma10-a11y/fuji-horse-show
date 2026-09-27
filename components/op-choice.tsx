"use client"

export function OpChoice({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return <fieldset className="mt-5 rounded-2xl border-2 border-border bg-card p-4">
    <legend className="px-2 text-xl font-bold">参加区分</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      {([false, true] as const).map(isOp => <label key={String(isOp)} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-lg font-bold ${value === isOp ? "border-primary bg-primary/10" : "border-border"}`}>
        <input type="radio" name="entry-op" checked={value === isOp} onChange={() => onChange(isOp)} className="size-5" />{isOp ? "OP参加" : "通常参加"}
      </label>)}
    </div>
    <p className="mt-3 text-base text-muted-foreground">OP参加は正式成績の対象外です。競技エントリー料金が通常より1,000円安くなります。</p>
  </fieldset>
}
